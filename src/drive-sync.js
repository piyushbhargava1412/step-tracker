/**
 * Google Drive AppData gateway — sole file that talks to the Drive v3 REST API.
 *
 * createDriveSync({ getAccessToken, reporter, fetchFn })
 *   find()           → string | null    file ID if the backup exists, else null
 *   push(envelope)   → void             create (POST) or update (PATCH) the backup
 *   pull()           → object | null    parsed envelope, or null if not found
 *
 * All methods:
 *  - Guard on getAccessToken() === null: reporter.auth(...), return, never throw.
 *  - Catch every network error or non-2xx: console.error('[drive-sync]', err),
 *    optionally reporter.db(...), resolve (never reject).
 *  - Use only injected fetchFn — no bare fetch calls; no global references.
 */

export const DRIVE_APPDATA_FILE_NAME = 'step_tracker_backup.json';
export const DRIVE_API_BASE_URL = 'https://www.googleapis.com';

const DRIVE_FILES_URL = `${DRIVE_API_BASE_URL}/drive/v3/files`;
const DRIVE_UPLOAD_URL = `${DRIVE_API_BASE_URL}/upload/drive/v3/files`;

/**
 * @param {{ getAccessToken: () => string|null, reporter: object, fetchFn: Function }} deps
 */
export function createDriveSync({ getAccessToken, reporter, fetchFn }) {
  /**
   * Returns the Drive file ID for the backup file, or null if none exists.
   * Returns undefined (and notifies reporter) if there is no access token.
   * @returns {Promise<string|null|undefined>}
   */
  async function find() {
    const token = getAccessToken();
    if (!token) {
      reporter.auth('ℹ️ Google Account not connected — Drive sync unavailable');
      return;
    }

    const url =
      `${DRIVE_FILES_URL}?spaces=appDataFolder` +
      `&fields=files(id,name)` +
      `&q=name%3D%27${encodeURIComponent(DRIVE_APPDATA_FILE_NAME)}%27`;

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
      return files.length > 0 ? files[0].id : null;
    } catch (err) {
      console.error('[drive-sync]', err);
      return null;
    }
  }

  /**
   * Creates or updates the backup file in appDataFolder.
   * Uses multipart upload: metadata + JSON body.
   * @param {object} envelope  The backup envelope produced by backup.buildBackup()
   * @returns {Promise<void>}
   */
  async function push(envelope) {
    const token = getAccessToken();
    if (!token) {
      reporter.auth('ℹ️ Google Account not connected — Drive sync unavailable');
      return;
    }

    try {
      const existingId = await find();
      const boundary = 'drive_sync_boundary_xyz';
      const metadata = JSON.stringify({
        name: DRIVE_APPDATA_FILE_NAME,
        parents: ['appDataFolder'],
      });
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${JSON.stringify(envelope)}\r\n` +
        `--${boundary}--`;

      const url = existingId
        ? `${DRIVE_UPLOAD_URL}/${existingId}?uploadType=multipart`
        : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
      const method = existingId ? 'PATCH' : 'POST';

      const resp = await fetchFn(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      if (!resp.ok) {
        const err = new Error(`Drive push failed: HTTP ${resp.status}`);
        console.error('[drive-sync]', err);
        reporter.db(`❌ Drive backup failed (HTTP ${resp.status})`);
      }
    } catch (err) {
      console.error('[drive-sync]', err);
      reporter.db('❌ Drive backup failed (network error)');
    }
  }

  /**
   * Fetches and parses the backup envelope from Drive.
   * Returns null if no backup file exists.
   * Returns undefined (and notifies reporter) if there is no access token.
   * @returns {Promise<object|null|undefined>}
   */
  async function pull() {
    const token = getAccessToken();
    if (!token) {
      reporter.auth('ℹ️ Google Account not connected — Drive sync unavailable');
      return;
    }

    try {
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

      return await resp.json();
    } catch (err) {
      console.error('[drive-sync]', err);
      return null;
    }
  }

  return { find, push, pull };
}
