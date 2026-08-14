/**
 * Backup engine — pure Dexie I/O, no DOM.
 * createBackup(db) factory: buildBackup() serialises the full Dexie state
 * into a versioned envelope. Module-level pure exports: blobToBase64,
 * base64ToBlob, _validateEnvelope, BACKUP_SCHEMA_VERSION, BACKUP_FILENAME_PREFIX.
 */

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_FILENAME_PREFIX = 'step-tracker-backup-';

// ─── Pure helpers (module-level, independently testable) ─────────────────────

/**
 * Converts a Blob to a data: URL string.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Converts a data: URL string back to a Blob.
 * @param {string} dataUrl
 * @returns {Blob}
 */
export function base64ToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : '';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Pure envelope validator. Throws TypeError on any structural failure so callers
 * can catch early before any Dexie write.
 * @param {unknown} parsed
 * @throws {TypeError}
 */
export function _validateEnvelope(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new TypeError('Backup envelope must be an object');
  }
  if (parsed.schema_version === undefined || parsed.schema_version === null) {
    throw new TypeError('Backup envelope missing schema_version');
  }
  if (parsed.schema_version !== BACKUP_SCHEMA_VERSION) {
    throw new TypeError(
      `Unsupported backup schema_version: ${parsed.schema_version}. Expected ${BACKUP_SCHEMA_VERSION}.`
    );
  }
  if (!Array.isArray(parsed.daily_records)) {
    throw new TypeError('Backup envelope daily_records must be an array');
  }
  if (!Array.isArray(parsed.settings)) {
    throw new TypeError('Backup envelope settings must be an array');
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates the backup engine bound to the injected Dexie db.
 * Never imports Dexie directly — uses only the injected db.
 *
 * @param {object} db - injected Dexie instance
 * @returns {{ buildBackup: Function }}
 */
export function createBackup(db) {
  /**
   * Reads all daily_records and settings rows from Dexie and returns a
   * versioned backup envelope. Records are serialised verbatim (full-fidelity,
   * no field reduction). exported_at is an ISO 8601 string.
   *
   * @returns {Promise<{
   *   schema_version: number,
   *   exported_at: string,
   *   daily_records: object[],
   *   settings: object[]
   * }>}
   */
  async function buildBackup() {
    try {
      const [daily_records, settings] = await Promise.all([
        db.daily_records.toArray(),
        db.settings.toArray(),
      ]);
      return {
        schema_version: BACKUP_SCHEMA_VERSION,
        exported_at: new Date().toISOString(),
        daily_records,
        settings,
      };
    } catch (err) {
      console.error('[backup]', err);
      throw err;
    }
  }

  return { buildBackup };
}
