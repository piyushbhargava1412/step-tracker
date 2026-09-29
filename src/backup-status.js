/**
 * Today's backup pill (ST-027, Android app): hidden while the phone's Google
 * Drive backup is fine; an amber "Not backed up" light when it needs
 * attention. Tapping it opens Backup & restore.
 *
 * Needs attention: Google Drive not connected, automatic backup off, this
 * device never backed up, or its last backup older than 3 days. Never when
 * another device is the primary — that device does the backing up (ST-020).
 */
import { renderStatusPill, STATUS_WARN } from './status-light.js';

/** A backup older than this counts as stale. */
export const STALE_BACKUP_MS = 3 * 24 * 60 * 60 * 1000;

const LABEL = 'Not backed up';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object} state
 * @param {boolean} state.driveConnected
 * @param {boolean} state.autoBackupEnabled
 * @param {string|null} state.lastBackupAt   ISO time of this device's last upload
 * @param {boolean} state.anotherDeviceIsPrimary
 * @param {Date} state.now
 * @returns {{ level: string, label: string, detail: string }|null} null when fine
 */
export function computeBackupStatus({ driveConnected, autoBackupEnabled, lastBackupAt, anotherDeviceIsPrimary, now }) {
  if (anotherDeviceIsPrimary) return null;
  const attention = (detail) => ({ level: STATUS_WARN, label: LABEL, detail });

  if (!driveConnected) return attention('Google Drive is not connected');
  if (!autoBackupEnabled) return attention('Automatic backup is off');

  const lastMs = lastBackupAt ? new Date(lastBackupAt).getTime() : NaN;
  if (!Number.isFinite(lastMs)) return attention('This phone has not backed up to Google Drive yet');

  const age = now.getTime() - lastMs;
  if (age > STALE_BACKUP_MS) {
    const days = Math.floor(age / DAY_MS);
    return attention(`Last backup to Google Drive was ${days} days ago`);
  }
  return null;
}

/**
 * @param {object} deps
 * @param {Document} deps.doc
 * @param {{ getDriveBackupEnabled: Function, getLastDriveSync: Function }} deps.settings
 * @param {{ status: () => Promise<{ primary: object|null, isThisDevice: boolean }> }|null} deps.primaryDevice
 * @param {() => boolean} deps.isDriveConnected
 * @param {() => void} deps.onOpen   opens Backup & restore
 * @param {() => Date} [deps.now]
 * @returns {{ refresh: () => Promise<void> }}
 */
export function createBackupStatus({ doc, settings, primaryDevice, isDriveConnected, onOpen, now = () => new Date() }) {
  let bound = false;

  async function read(fn, fallback) {
    try {
      return await fn();
    } catch (err) {
      console.error('[backup-status]', err);
      return fallback;
    }
  }

  async function refresh() {
    const el = doc.getElementById('backup-status');
    if (!el) return;
    if (!bound) {
      el.addEventListener('click', () => onOpen());
      bound = true;
    }

    const [autoBackupEnabled, lastSync, primary] = await Promise.all([
      read(async () => (await settings.getDriveBackupEnabled()) !== false, true),
      read(() => settings.getLastDriveSync(), null),
      read(async () => (await primaryDevice?.status()) ?? { primary: null, isThisDevice: false }, { primary: null, isThisDevice: false }),
    ]);

    const status = computeBackupStatus({
      driveConnected: isDriveConnected(),
      autoBackupEnabled,
      lastBackupAt: lastSync?.at ?? null,
      anotherDeviceIsPrimary: Boolean(primary.primary) && !primary.isThisDevice,
      now: now(),
    });

    el.hidden = !status;
    if (status) renderStatusPill(doc, el, status);
  }

  return { refresh };
}
