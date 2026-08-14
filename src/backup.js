/**
 * Backup engine — pure Dexie I/O, no DOM.
 * createBackup(db) factory: buildBackup() serialises the full Dexie state
 * into a versioned envelope; restoreBackup(parsed, { mode }) validates and
 * atomically upserts rows back. Module-level pure exports: blobToBase64,
 * base64ToBlob, _validateEnvelope, BACKUP_SCHEMA_VERSION, BACKUP_FILENAME_PREFIX.
 */

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_FILENAME_PREFIX = 'step-tracker-backup-';

/**
 * Size-cap guards against oversized payloads reaching IndexedDB.
 * MAX_BACKUP_RECORDS bounds the total number of rows; MAX_BACKUP_BYTES bounds
 * the serialised envelope size (relevant for large proof-image data URLs).
 */
export const MAX_BACKUP_RECORDS = 100_000;
export const MAX_BACKUP_BYTES = 16 * 1024 * 1024;

/**
 * Fixed byte overhead of the envelope wrapper (schema_version, exported_at keys)
 * added when measuring the serialised payload so the export guard stays
 * conservative relative to the full-envelope stringify used on import.
 */
const BACKUP_ENVELOPE_OVERHEAD_BYTES = 128;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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
 * Symmetric export guard: rejects a payload that exceeds the same caps enforced
 * by _validateEnvelope on import — before the full envelope is synchronously
 * JSON.stringify-ed. The cheap record-count check runs first (no serialisation
 * for the pathological multi-hundred-thousand-row case); the byte check then
 * measures the two tables in per-table chunks to bound peak memory and
 * main-thread blocking for multi-MB proof blobs.
 * @param {object[]} daily_records
 * @param {object[]} settings
 * @throws {RangeError}
 */
function assertBackupWithinLimits(daily_records, settings) {
  const rowCount = daily_records.length + settings.length;
  if (rowCount > MAX_BACKUP_RECORDS) {
    throw new RangeError(
      `Backup too large: ${rowCount} rows exceeds MAX_BACKUP_RECORDS (${MAX_BACKUP_RECORDS})`
    );
  }
  const serializedBytes =
    JSON.stringify(daily_records).length +
    JSON.stringify(settings).length +
    BACKUP_ENVELOPE_OVERHEAD_BYTES;
  if (serializedBytes > MAX_BACKUP_BYTES) {
    throw new RangeError(
      `Backup too large: serialised payload exceeds MAX_BACKUP_BYTES (${MAX_BACKUP_BYTES})`
    );
  }
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumeric(value) {
  return (
    isFiniteNumber(value) ||
    (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)))
  );
}

/**
 * Guards a single row object against prototype-pollution keys. Also validates
 * that the row is a plain (non-array, non-null) object. Read-only — never mutates.
 * @param {unknown} row
 * @param {string} label - 'daily_record' | 'settings'
 * @throws {TypeError}
 */
function assertNoPollutionKeys(row, label) {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    throw new TypeError(`Backup ${label} row must be an object`);
  }
  const hasPollutionKey = Object.keys(row).some((key) => PROTOTYPE_POLLUTION_KEYS.has(key));
  if (hasPollutionKey) {
    throw new TypeError(`Backup ${label} row contains a reserved prototype-pollution key`);
  }
}

/**
 * Validates a single daily_record row. Only `date` is strictly required; any
 * optional field is type-checked when present so restore stays tolerant of the
 * documented variants (override null / absent, missing distances, etc.).
 * @param {object} row
 * @throws {TypeError}
 */
function validateDailyRecord(row) {
  assertNoPollutionKeys(row, 'daily_record');
  if (typeof row.date !== 'string' || row.date === '' || !DATE_RE.test(row.date)) {
    throw new TypeError(`daily_record has invalid date: ${String(row.date)}`);
  }
  for (const field of ['original_steps', 'effective_steps']) {
    if (row[field] !== undefined && !isFiniteNumber(row[field])) {
      throw new TypeError(`daily_record ${field} must be a number`);
    }
  }
  for (const field of ['original_distance_km', 'effective_distance_km']) {
    if (row[field] !== undefined && !isNumeric(row[field])) {
      throw new TypeError(`daily_record ${field} must be numeric`);
    }
  }
  const override = row.override;
  if (override !== undefined && override !== null) {
    if (typeof override !== 'object' || Array.isArray(override)) {
      throw new TypeError('daily_record override must be an object or null');
    }
    if (override.effective_steps !== undefined && !isFiniteNumber(override.effective_steps)) {
      throw new TypeError('daily_record override.effective_steps must be a number');
    }
    if (override.reason !== undefined && typeof override.reason !== 'string') {
      throw new TypeError('daily_record override.reason must be a string');
    }
  }
  if (row.synced_at !== undefined && typeof row.synced_at !== 'string') {
    throw new TypeError('daily_record synced_at must be a string');
  }
}

/**
 * Validates a single settings row. Read-only — never mutates.
 * @param {object} row
 * @throws {TypeError}
 */
function validateSettings(request) {
  assertNoPollutionKeys(request, 'settings');
}

/**
 * Pure envelope validator. Throws TypeError on any structural failure so callers
 * can catch early before any Dexie write. Validates every daily_records and
 * settings element (prototype-pollution keys, per-field types, size caps).
 * Never mutates incoming rows — restore writes them verbatim.
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
  const rowCount = parsed.daily_records.length + parsed.settings.length;
  if (rowCount > MAX_BACKUP_RECORDS) {
    throw new TypeError(
      `Backup too large: ${rowCount} rows exceeds MAX_BACKUP_RECORDS (${MAX_BACKUP_RECORDS})`
    );
  }
  if (JSON.stringify(parsed).length > MAX_BACKUP_BYTES) {
    throw new TypeError(
      `Backup too large: serialised envelope exceeds MAX_BACKUP_BYTES (${MAX_BACKUP_BYTES})`
    );
  }
  parsed.daily_records.forEach(validateDailyRecord);
  parsed.settings.forEach(validateSettings);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates the backup engine bound to the injected Dexie db.
 * Never imports Dexie directly — uses only the injected db.
 *
 * @param {object} db - injected Dexie instance
 * @returns {{ buildBackup: Function, restoreBackup: Function }}
 */
export function createBackup(db) {
  // Session-level dirty state (Task 28): the signature of the last state that
  // was successfully pushed to Drive. null means "nothing pushed yet this
  // session" — treated as always dirty so the first sync always uploads.
  let lastPushedSignature = null;

  /**
   * Cheap change-detector signature of the daily_records store: record count
   * plus the newest row's synced_at. Uses two indexed reads only (count() and
   * orderBy('date').last()) — never a full table scan or serialisation. The
   * signature only needs to flip whenever a fresh upload would actually differ.
   *
   * @returns {Promise<string>}  `${count}:${newestRow.synced_at ?? ''}`
   */
  async function computeSignature() {
    const [count, latest] = await Promise.all([
      db.daily_records.count(),
      db.daily_records.orderBy('date').last(),
    ]);
    return `${count}:${latest?.synced_at ?? ''}`;
  }

  /**
   * Whether the store has changed since the last successful push. Fails OPEN:
   * if the signature cannot be computed (read error), it reports dirty so the
   * caller errs toward uploading rather than silently skipping a backup.
   *
   * @returns {Promise<boolean>}
   */
  async function hasUnpushedChanges() {
    try {
      return (await computeSignature()) !== lastPushedSignature;
    } catch (err) {
      console.error('[backup]', err);
      return true;
    }
  }

  /**
   * Record the current store state as the last successfully pushed state.
   * Only meaningful after a push succeeded; the caller must not invoke this on
   * a failed push, or the failure would be masked as already backed up. A
   * signature read failure is logged and swallowed — the worst outcome is one
   * redundant upload on the next sync, never data loss.
   *
   * @returns {Promise<void>}
   */
  async function markPushed() {
    try {
      lastPushedSignature = await computeSignature();
    } catch (err) {
      console.error('[backup]', err);
    }
  }

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
      assertBackupWithinLimits(daily_records, settings);
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

  /**
   * Validates a backup envelope and restores all rows into Dexie using a single
   * atomic 'rw' transaction. A mid-restore failure causes a full rollback so the
   * store is never left in a partially-applied state.
   *
   * Rows are written verbatim — original_* fields are never mutated.
   *
   * @param {object} parsed - the parsed JSON backup envelope
   * @param {{ mode?: string }} [_options] - reserved; not used in v1
   * @returns {Promise<void>}
   * @throws {TypeError} if the envelope fails validation (no Dexie write occurs)
   */
  async function restoreBackup(parsed, _options = {}) {
    // Fail-fast: validate before touching Dexie.
    _validateEnvelope(parsed);

    try {
      await db.transaction('rw', db.daily_records, db.settings, async () => {
        await db.daily_records.bulkPut(parsed.daily_records);
        await db.settings.bulkPut(parsed.settings);
      });
    } catch (err) {
      console.error('[backup]', err);
      throw err;
    }
  }

  return { buildBackup, restoreBackup, computeSignature, hasUnpushedChanges, markPushed };
}
