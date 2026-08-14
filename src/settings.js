export const SYNC_ANCHOR_KEY = 'sync_anchor_date';
export const DEFAULT_SYNC_ANCHOR = '2018-01-01';

/** Key gating the post-sync background Drive auto-upload (Task 27). */
export const DRIVE_BACKUP_ENABLED_KEY = 'drive_backup_enabled';

/** Auto-upload is enabled by default; only an explicit `false` disables it. */
export const DEFAULT_DRIVE_BACKUP_ENABLED = true;

/** Key recording the ISO timestamp of the last successful local JSON export. */
export const LAST_LOCAL_EXPORT_KEY = 'last_local_export_at';

/** Key recording `{ at, bytes }` of the last successful Drive push. */
export const LAST_DRIVE_SYNC_KEY = 'last_drive_sync';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function isFiniteNumberValue(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function assertValidDate(date, context) {
  if (!isValidDate(date)) {
    throw new TypeError(`Invalid date for ${context}: ${date}. Expected strict YYYY-MM-DD.`);
  }
}

export function createSettings(db) {
  async function getSyncAnchorDate() {
    try {
      const row = await db.settings.get(SYNC_ANCHOR_KEY);
      if (row == null || !row.value) return DEFAULT_SYNC_ANCHOR;
      return row.value;
    } catch (err) {
      console.error('[settings]', err);
      return DEFAULT_SYNC_ANCHOR;
    }
  }

  async function setSyncAnchorDate(date) {
    assertValidDate(date, 'setSyncAnchorDate');
    await db.settings.put({ key: SYNC_ANCHOR_KEY, value: date, updated_at: new Date().toISOString() });
  }

  /**
   * Read whether the post-sync background Drive auto-upload is enabled.
   * Defaults to enabled; only a persisted boolean `false` disables it. Fails
   * open to enabled (true) on a read error so a corrupt settings read can
   * never silently turn off backups a user still expects (Task 27).
   *
   * @returns {Promise<boolean>}
   */
  async function getDriveBackupEnabled() {
    try {
      const row = await db.settings.get(DRIVE_BACKUP_ENABLED_KEY);
      if (row == null) return DEFAULT_DRIVE_BACKUP_ENABLED;
      return row.value !== false;
    } catch (err) {
      console.error('[settings]', err);
      return DEFAULT_DRIVE_BACKUP_ENABLED;
    }
  }

  /**
   * Persist the opt-out toggle for the post-sync background Drive auto-upload.
   * Only boolean values are accepted — anything else fails fast before a write.
   *
   * @param {boolean} enabled
   * @returns {Promise<void>}
   * @throws {TypeError} When `enabled` is not a boolean.
   */
  async function setDriveBackupEnabled(enabled) {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('[settings] setDriveBackupEnabled requires a boolean');
    }
    await db.settings.put({
      key: DRIVE_BACKUP_ENABLED_KEY,
      value: enabled,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Read the ISO timestamp of the last successful local JSON export.
   * Fails open to null (renders as "Never") on a read error.
   *
   * @returns {Promise<string|null>}
   */
  async function getLastLocalExport() {
    try {
      const row = await db.settings.get(LAST_LOCAL_EXPORT_KEY);
      return row?.value ?? null;
    } catch (err) {
      console.error('[settings]', err);
      return null;
    }
  }

  /**
   * Persist the ISO timestamp of a just-completed local JSON export.
   *
   * @param {string} at - ISO 8601 timestamp.
   * @returns {Promise<void>}
   * @throws {TypeError} When `at` is not a non-empty string.
   */
  async function setLastLocalExport(at) {
    if (typeof at !== 'string' || at === '') {
      throw new TypeError('[settings] setLastLocalExport requires a non-empty ISO string');
    }
    await db.settings.put({ key: LAST_LOCAL_EXPORT_KEY, value: at, updated_at: at });
  }

  /**
   * Read the `{ at, bytes }` record of the last successful Drive push.
   * Fails open to null (renders as "No cloud backup found") on a read error.
   *
   * @returns {Promise<{ at: string, bytes: number }|null>}
   */
  async function getLastDriveSync() {
    try {
      const row = await db.settings.get(LAST_DRIVE_SYNC_KEY);
      return row?.value ?? null;
    } catch (err) {
      console.error('[settings]', err);
      return null;
    }
  }

  /**
   * Persist the `{ at, bytes }` record of a just-completed Drive push.
   *
   * @param {{ at: string, bytes: number }} entry
   * @returns {Promise<void>}
   * @throws {TypeError} When `entry` is not shaped as `{ at: string, bytes: number }`.
   */
  async function setLastDriveSync(entry) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof entry.at !== 'string' ||
      entry.at === '' ||
      !isFiniteNumberValue(entry.bytes)
    ) {
      throw new TypeError('[settings] setLastDriveSync requires { at: string, bytes: number }');
    }
    await db.settings.put({
      key: LAST_DRIVE_SYNC_KEY,
      value: { at: entry.at, bytes: entry.bytes },
      updated_at: entry.at,
    });
  }

  async function countRecordsBefore(date) {
    assertValidDate(date, 'countRecordsBefore');
    return db.daily_records.where('date').below(date).count();
  }

  async function countAllRecords() {
    return db.daily_records.count();
  }

  async function pruneRecordsBefore(date) {
    assertValidDate(date, 'pruneRecordsBefore');
    try {
      await db.daily_records.where('date').below(date).delete();
    } catch (err) {
      console.error('[settings]', err);
      throw err;
    }
  }


  async function wipeDatabase() {
    try {
      await db.daily_records.clear();
    } catch (err) {
      console.error('[settings]', err);
      throw err;
    }
    try {
      await db.settings.delete('initial_backfill_complete');
    } catch (err) {
      console.error('[settings]', err);
      throw err;
    }
    try {
      await setSyncAnchorDate(DEFAULT_SYNC_ANCHOR);
    } catch (err) {
      console.error('[settings]', err);
      throw err;
    }
  }

  return {
    getSyncAnchorDate,
    setSyncAnchorDate,
    countRecordsBefore,
    countAllRecords,
    pruneRecordsBefore,
    wipeDatabase,
    getDriveBackupEnabled,
    setDriveBackupEnabled,
    getLastLocalExport,
    setLastLocalExport,
    getLastDriveSync,
    setLastDriveSync,
  };
}
