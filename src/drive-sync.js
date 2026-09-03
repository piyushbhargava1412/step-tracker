/**
 * Google Drive AppData gateway — sole file that talks to the Drive v3 REST API.
 */

export const DRIVE_APPDATA_FILE_NAME = 'step_tracker_backup.json';
export const DRIVE_API_BASE_URL = 'https://www.googleapis.com';

export const DRIVE_PUSH_SKIPPED = Object.freeze({ skipped: true });

const DRIVE_FILES_URL = `${DRIVE_API_BASE_URL}/drive/v3/files`;
const DRIVE_UPLOAD_URL = `${DRIVE_API_BASE_URL}/upload/drive/v3/files`;

const MAX_BOUNDARY_ATTEMPTS = 5;

function generateBoundary() {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === 'function') {
    return `drive_sync_${cryptoObj.randomUUID()}`;
  }
  let hex = '';
  for (let i = 0; i < 32; i += 1) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return `drive_sync_${hex}`;
}

function buildBody(boundary, metadata, data) {
  return (
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${data}\r\n` +
      `--${boundary}--`
  );
}

function boundaryLeaksIntoBody(body, boundary) {
  return body.split(`--${boundary}`).length !== 4;
}

function buildMultipartBody(metadata, data) {
  let boundary = generateBoundary();
  let body = buildBody(boundary, metadata, data);
  for (let attempt = 0; attempt < MAX_BOUNDARY_ATTEMPTS && boundaryLeaksIntoBody(body, boundary); attempt += 1) {
    boundary = generateBoundary();
    body = buildBody(boundary, metadata, data);
  }
  return { boundary, body };
}

export function createDriveSync({ getAccessToken, reporter, fetchFn, validator = () => {} }) {
  let cachedFileId = null;

  async function find() {
    const token = getAccessToken();
    if (!token) {
      reporter.auth('ℹ️ Google Account not connected — Drive sync unavailable');
      return;
    }

    // FIX 1: Added orderBy=modifiedTime desc to guarantee we always get the newest file first
    const url =
        `${DRIVE_FILES_URL}?spaces=appDataFolder` +
        `&fields=files(id,name,modifiedTime)` +
        `&q=name%3D%27${encodeURIComponent(DRIVE_APPDATA_FILE_NAME)}%27` +
        `&orderBy=modifiedTime%20desc`;

    try {
      const resp = await fetchFn(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        const err = new Error(`Drive find failed: HTTP ${resp.status}`);
        console.error('[drive-sync]', err);
        return null;
      }

      const data = await resp.json();
      const files = data?.files ?? [];
      const fileId = files.length > 0 ? files[0].id : null;
      cachedFileId = fileId;
      return fileId;
    } catch (err) {
      console.error('[drive-sync]', err);
      return null;
    }
  }

  async function upload(token, fileId, data) {
    // FIX 2: Conditionally include parents for POST (create), but exclude for PATCH (update)
    const metadataObj = { name: DRIVE_APPDATA_FILE_NAME };
    if (!fileId) {
      metadataObj.parents = ['appDataFolder'];
    }

    const metadata = JSON.stringify(metadataObj);
    const { boundary, body } = buildMultipartBody(metadata, data);

    const url = fileId
        ? `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=multipart`
        : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
    const method = fileId ? 'PATCH' : 'POST';

    return fetchFn(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
  }

  async function push(envelope, { silent = false } = {}) {
    const token = getAccessToken();
    if (!token) {
      if (!silent) {
        reporter.auth('ℹ️ Google Account not connected — Drive sync unavailable');
      }
      return DRIVE_PUSH_SKIPPED;
    }

    const data = JSON.stringify(envelope);

    let resp;
    try {
      let fileId = cachedFileId;
      const usedCachedId = cachedFileId !== null;
      if (!usedCachedId) {
        fileId = await find();
      }

      resp = await upload(token, fileId, data);

      if (usedCachedId && fileId !== null && resp.status === 404) {
        console.error(
            '[drive-sync]',
            new Error(`Drive push failed: HTTP ${resp.status}`)
        );
        cachedFileId = null;
        const relocatedId = await find();
        resp = await upload(token, relocatedId, data);
      }
    } catch (err) {
      console.error('[drive-sync]', err);
      if (!silent) {
        reporter.db('❌ Drive backup failed (network error)');
      }
      throw err;
    }

    if (!resp.ok) {
      console.error(
          '[drive-sync]',
          new Error(`Drive push failed: HTTP ${resp.status}`)
      );
      if (!silent) {
        reporter.db('❌ Drive backup failed — will retry');
      }
      throw new Error('Drive push failed');
    }
  }

  function runEnvelopeValidator(parsed) {
    try {
      validator(parsed);
      return parsed;
    } catch (err) {
      console.error('[drive-sync]', err);
      reporter.db('❌ Drive backup file rejected (invalid payload)');
      throw err;
    }
  }

  async function pull() {
    const token = getAccessToken();
    if (!token) {
      reporter.auth('ℹ️ Google Account not connected — Drive sync unavailable');
      return;
    }

    let parsed;
    try {
      // Force fresh lookup on pull to avoid stale in-memory cachedFileId
      const fileId = await find();
      if (!fileId) {
        return null;
      }

      const url = `${DRIVE_FILES_URL}/${fileId}?alt=media`;
      const resp = await fetchFn(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        const err = new Error(`Drive pull failed: HTTP ${resp.status}`);
        console.error('[drive-sync]', err);
        return null;
      }

      parsed = await resp.json();
    } catch (err) {
      console.error('[drive-sync]', err);
      return null;
    }

    return runEnvelopeValidator(parsed);
  }

  return { find, push, pull };
}