/**
 * Read-only web viewer (ST-023): the browser shows the latest snapshot the
 * Android app backed up to Google Drive.
 *
 * `refresh()` downloads the snapshot (Drive reads only — the viewer is given
 * nothing but `pull`) and replaces the cache database's `daily_records` and
 * `settings` inside the read-only backstop's `writeSnapshot`, then records the
 * snapshot's export time. It stands in for the step sync in the sync trigger,
 * so connecting, relaunching, resuming and ↻ all refresh it.
 *
 * Fail-open: refresh() never throws; a failed or empty download keeps what the
 * viewer already showed.
 */
import { formatSnapshotTime } from './viewer-ui.js';

/** Settings row holding the shown snapshot's `exported_at`. */
export const SNAPSHOT_AT_KEY = 'viewer_snapshot_at';

export const NOT_CONNECTED_MESSAGE = '🔑 Connect your Google Account to see your step data';
export const NO_BACKUP_MESSAGE =
  'ℹ️ No Walkaholic backup on your Google Drive yet — in the Android app, open Settings › Backup & restore and connect Google Drive';
export const LOAD_FAILED_MESSAGE = "❌ Couldn't load your data from Google Drive — check your connection and try again";

/**
 * @param {object} deps
 * @param {object} deps.db  Dexie database (the viewer cache).
 * @param {(fn: () => Promise<void>) => Promise<void>} deps.writeSnapshot  From read-only.js.
 * @param {{ pull: () => Promise<object|null|undefined> }} deps.driveSync  Read-only Drive access.
 * @param {() => boolean} deps.isConnected  Whether a Google token is available.
 * @param {{ sync: (text: string) => void }} deps.reporter
 * @returns {{ refresh: () => Promise<boolean>, canRefresh: () => boolean, snapshotTime: () => Promise<string|null> }}
 */
export function createViewer({ db, writeSnapshot, driveSync, isConnected, reporter }) {
  /** @returns {Promise<boolean>} whether a snapshot was loaded */
  async function refresh() {
    if (!isConnected()) {
      reporter.sync(NOT_CONNECTED_MESSAGE);
      return false;
    }

    try {
      const snapshot = await driveSync.pull();
      if (!snapshot) {
        reporter.sync(NO_BACKUP_MESSAGE);
        return false;
      }

      await writeSnapshot(async () => {
        await db.daily_records.clear();
        await db.settings.clear();
        await db.daily_records.bulkPut(snapshot.daily_records);
        await db.settings.bulkPut(snapshot.settings);
        await db.settings.put({ key: SNAPSHOT_AT_KEY, value: snapshot.exported_at });
      });
      reporter.sync(`✅ Showing your data as of ${formatSnapshotTime(snapshot.exported_at)}`);
      return true;
    } catch (err) {
      console.error('[viewer]', err);
      reporter.sync(LOAD_FAILED_MESSAGE);
      return false;
    }
  }

  function canRefresh() {
    return isConnected();
  }

  /** @returns {Promise<string|null>} the shown snapshot's export time */
  async function snapshotTime() {
    try {
      return (await db.settings.get(SNAPSHOT_AT_KEY))?.value ?? null;
    } catch (err) {
      console.error('[viewer]', err);
      return null;
    }
  }

  return { refresh, canRefresh, snapshotTime };
}
