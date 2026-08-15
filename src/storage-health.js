/**
 * Protection-matrix logic combining Google Drive Cloud Auto-Sync state with the
 * browser's persisted-storage grant into a single #db-status badge.
 *
 * Kept separate from storage.js (the raw `navigator.storage` capability) since
 * this module's reason to change is the *combination rule* across two signals
 * (a Dexie-backed setting + a browser API), not the underlying browser API
 * itself. `PERSISTED_TEXT` is imported from storage.js so the "storage is
 * persisted, drive is off" copy stays a single source of truth.
 *
 * Protection matrix:
 *  - driveAutoSyncEnabled === true                       -> CLOUD_SYNCED_TEXT (safe: cloud-backed)
 *  - driveAutoSyncEnabled === false, persisted === true   -> PERSISTED_TEXT (safe: browser-protected)
 *  - driveAutoSyncEnabled === false, persisted === false  -> BACKUP_DISABLED_TEXT (unbacked up)
 *
 * Both async orchestration functions here are fail-open: every read is
 * individually guarded so one failing signal (a Dexie read, or
 * navigator.storage.persisted() rejecting) never blocks the other from still
 * producing a badge. Errors are logged via console.error('[storage-health]', err)
 * and never thrown.
 */

import { PERSISTED_TEXT } from './storage.js';

export const CLOUD_SYNCED_TEXT = '☁️ Cloud Synced';
export const BACKUP_DISABLED_TEXT = '⚠️ Backup Disabled';

/**
 * @param {{ driveAutoSyncEnabled: boolean, persisted: boolean }} state
 * @returns {boolean}
 */
export function isProtected({ driveAutoSyncEnabled, persisted }) {
  return driveAutoSyncEnabled === true || persisted === true;
}

/**
 * @param {{ driveAutoSyncEnabled: boolean, persisted: boolean }} state
 * @returns {string}
 */
export function computeBadgeText({ driveAutoSyncEnabled, persisted }) {
  if (driveAutoSyncEnabled) return CLOUD_SYNCED_TEXT;
  if (persisted) return PERSISTED_TEXT;
  return BACKUP_DISABLED_TEXT;
}

async function _readDriveAutoSyncEnabled(settings) {
  try {
    return (await settings?.getDriveBackupEnabled?.()) === true;
  } catch (err) {
    console.error('[storage-health]', err);
    return false;
  }
}

async function _readPersisted(nav) {
  try {
    if (typeof nav?.storage?.persisted !== 'function') return false;
    return (await nav.storage.persisted()) === true;
  } catch (err) {
    console.error('[storage-health]', err);
    return false;
  }
}

/**
 * Re-reads the current drive-auto-sync setting and persisted-storage grant,
 * then writes the combined badge text via reporter.db(...). Each read is
 * independently fail-open so a single failing signal still yields a correct
 * badge from the other.
 *
 * @param {{ db: (text: string) => void }} reporter
 * @param {{ getDriveBackupEnabled?: () => Promise<boolean> }|null} settings
 * @param {object} [nav=navigator]
 * @returns {Promise<void>}
 */
export async function refreshStorageProtectionBadge(reporter, settings, nav = navigator) {
  const [driveAutoSyncEnabled, persisted] = await Promise.all([
    _readDriveAutoSyncEnabled(settings),
    _readPersisted(nav),
  ]);
  reporter.db(computeBadgeText({ driveAutoSyncEnabled, persisted }));
}

/**
 * Silently requests persistent storage (no UI feedback, no modal — a plain
 * user-gesture-backed browser API call) then refreshes the header badge from
 * whatever the resulting state actually is. A persist() failure/rejection is
 * logged but never blocks the badge refresh.
 *
 * @param {{ db: (text: string) => void }} reporter
 * @param {{ getDriveBackupEnabled?: () => Promise<boolean> }|null} settings
 * @param {object} [nav=navigator]
 * @returns {Promise<void>}
 */
export async function requestSilentPersistAndRefreshBadge(reporter, settings, nav = navigator) {
  try {
    await nav?.storage?.persist?.();
  } catch (err) {
    console.error('[storage-health]', err);
  }
  await refreshStorageProtectionBadge(reporter, settings, nav);
}
