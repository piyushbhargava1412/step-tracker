/**
 * Google Drive AppData gateway — sole file that talks to the Drive v3 REST API.
 */

import { PRIMARY_DEVICE_KEY, isValidPrimaryDevice } from './settings.js';

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

/**
 * The primary device recorded in a backup envelope's settings, as Drive
 * appProperties (string key/values), or undefined when none is recorded.
 * Mirroring it onto the file lets any writer check who is primary with a
 * metadata-only request, without downloading the backup.
 */
function primaryAppProperties(envelope) {
  const primary = envelope?.settings?.find?.((row) => row?.key === PRIMARY_DEVICE_KEY)?.value;
  if (!isValidPrimaryDevice(primary)) return undefined;
  return {
    primaryDeviceId: primary.id,
    primaryDeviceLabel: primary.label,
    primarySince: primary.since,
  };
}

function primaryFromAppProperties(properties) {
  const primary = {
    id: properties?.primaryDeviceId,
    label: properties?.primaryDeviceLabel,
    since: properties?.primarySince,
  };
  return isValidPrimaryDevice(primary) ? primary : null;
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

/**
 * `getAccessToken` is called before every request and may return the token or a
 * promise of it (the Android app renews its token through Play services — ST-026).
 */
export function createDriveSync({ getAccessToken, reporter, fetchFn, validator = () => {} }) {
  let cachedFileId = null;

  async function find() {
    const token = await getAccessToken();
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

  async function upload(token, fileId, data, appProperties) {
    // FIX 2: Conditionally include parents for POST (create), but exclude for PATCH (update)
    const metadataObj = { name: DRIVE_APPDATA_FILE_NAME };
    if (!fileId) {
      metadataObj.parents = ['appDataFolder'];
    }
    if (appProperties) {
      metadataObj.appProperties = appProperties;
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
    const token = await getAccessToken();
    if (!token) {
      if (!silent) {
        reporter.auth('ℹ️ Google Account not connected — Drive sync unavailable');
      }
      return DRIVE_PUSH_SKIPPED;
    }

    const data = JSON.stringify(envelope);
    const appProperties = primaryAppProperties(envelope);

    let resp;
    try {
      let fileId = cachedFileId;
      const usedCachedId = cachedFileId !== null;
      if (!usedCachedId) {
        fileId = await find();
      }

      resp = await upload(token, fileId, data, appProperties);

      if (usedCachedId && fileId !== null && resp.status === 404) {
        console.error(
            '[drive-sync]',
            new Error(`Drive push failed: HTTP ${resp.status}`)
        );
        cachedFileId = null;
        const relocatedId = await find();
        resp = await upload(token, relocatedId, data, appProperties);
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

  /**
   * Download the latest backup envelope. `silent` mirrors push(): a background
   * attempt (the pre-sync empty-DB recovery) must not write "Drive
   * unavailable" into the connection status when there is no Google token.
   */
  async function pull({ silent = false } = {}) {
    const token = await getAccessToken();
    if (!token) {
      if (!silent) {
        reporter.auth('ℹ️ Google Account not connected — Drive sync unavailable');
      }
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

  /**
   * Which installation is the primary device, per the newest backup file's
   * metadata (null when there is no backup or none is recorded). Throws when
   * Drive cannot be asked — no token, HTTP error, network error — so a caller
   * deciding whether it may overwrite the backup never guesses.
   *
   * @returns {Promise<{ id: string, label: string, since: string }|null>}
   */
  async function readPrimaryDevice() {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('[drive-sync] Google Account not connected');
    }
    const url =
        `${DRIVE_FILES_URL}?spaces=appDataFolder` +
        `&fields=${encodeURIComponent('files(id,appProperties)')}` +
        `&q=name%3D%27${encodeURIComponent(DRIVE_APPDATA_FILE_NAME)}%27` +
        `&orderBy=modifiedTime%20desc`;
    const resp = await fetchFn(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      throw new Error(`[drive-sync] Drive metadata read failed: HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return primaryFromAppProperties(data?.files?.[0]?.appProperties);
  }

  return { find, push, pull, readPrimaryDevice };
}