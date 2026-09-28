/**
 * Primary device (ST-020).
 *
 * Drive holds one backup file and every upload replaces it (last writer
 * wins). Once the Android app backs up to Drive, a browser that keeps syncing
 * from Google Fit would overwrite the app's backup. So exactly one
 * installation is the *primary device*: only it uploads automatically, and
 * any other installation asks before a manual upload.
 *
 * The primary is recorded as a settings row (so it travels inside every
 * backup) and mirrored onto the Drive file's metadata by drive-sync.js (so
 * any installation can check it without downloading the backup).
 *
 * Factory: createPrimaryDevice({ settings, driveSync, storage, label })
 */

/** localStorage key holding this installation's random id. */
export const DEVICE_ID_KEY = 'device_id';

/** Returned when Drive could not be asked: block rather than guess. */
const UNKNOWN_PRIMARY = Object.freeze({ id: null, label: 'another device', since: null });

function randomId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

/**
 * A per-installation id: a random value kept in localStorage — not a
 * hardware identifier. A new browser profile, cleared site data or a
 * reinstalled app is a new device and must be made primary explicitly.
 */
function loadDeviceId(storage) {
  try {
    const existing = storage?.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = randomId();
    storage?.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch (err) {
    console.error('[primary-device] device id not persisted; using a per-session id', err);
    return randomId();
  }
}

const samePrimary = (a, b) => a?.id === b?.id && a?.label === b?.label && a?.since === b?.since;

/**
 * @param {object} deps
 * @param {object} deps.settings   getPrimaryDevice() / setPrimaryDevice(value)
 * @param {object} deps.driveSync  readPrimaryDevice()
 * @param {Storage} [deps.storage] localStorage
 * @param {string} deps.label      Human name for this installation ("Android app").
 */
export function createPrimaryDevice({ settings, driveSync, storage, label }) {
  if (typeof settings?.getPrimaryDevice !== 'function' || typeof settings?.setPrimaryDevice !== 'function') {
    throw new TypeError('[primary-device] settings with get/setPrimaryDevice() are required');
  }
  if (typeof driveSync?.readPrimaryDevice !== 'function') {
    throw new TypeError('[primary-device] driveSync.readPrimaryDevice() is required');
  }

  const deviceId = loadDeviceId(storage);

  /**
   * The primary device if it is *another* installation, else null (this
   * device is primary, or none is). Asks Drive first — the authoritative,
   * shared answer — and remembers what it learns; when Drive cannot be
   * asked it returns a placeholder primary (fail closed), because uploading
   * blind could overwrite the real primary's backup.
   *
   * @param {{ localOnly?: boolean }} [options]  localOnly: skip Drive.
   */
  async function otherPrimary({ localOnly = false } = {}) {
    let primary = await settings.getPrimaryDevice();
    if (!localOnly) {
      try {
        const remote = await driveSync.readPrimaryDevice();
        if (remote) {
          if (!samePrimary(remote, primary)) await settings.setPrimaryDevice(remote);
          primary = remote;
        }
      } catch (err) {
        console.error('[primary-device] could not read the primary device from Drive', err);
        return UNKNOWN_PRIMARY;
      }
    }
    return primary && primary.id !== deviceId ? primary : null;
  }

  /** The locally recorded primary and whether it is this installation. */
  async function status() {
    const primary = await settings.getPrimaryDevice();
    return { primary, isThisDevice: primary?.id === deviceId };
  }

  /** Record this installation as the primary device. */
  async function makeThisPrimary(now = new Date()) {
    const primary = { id: deviceId, label, since: now.toISOString() };
    await settings.setPrimaryDevice(primary);
    return primary;
  }

  return { deviceId, label, otherPrimary, status, makeThisPrimary };
}
