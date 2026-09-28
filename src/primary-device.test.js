import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrimaryDevice, DEVICE_ID_KEY } from './primary-device.js';

const APP = { id: 'dev-app', label: 'Android app', since: '2026-09-28T12:00:00.000Z' };

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((k) => (values.has(k) ? values.get(k) : null)),
    setItem: vi.fn((k, v) => values.set(k, String(v))),
  };
}

describe('ST-020: createPrimaryDevice', () => {
  let settings;
  let driveSync;
  let storage;

  beforeEach(() => {
    let stored = null;
    settings = {
      getPrimaryDevice: vi.fn(async () => stored),
      setPrimaryDevice: vi.fn(async (value) => { stored = value; }),
    };
    driveSync = { readPrimaryDevice: vi.fn().mockResolvedValue(null) };
    storage = makeStorage();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const make = (overrides = {}) =>
    createPrimaryDevice({ settings, driveSync, storage, label: 'Browser', ...overrides });

  // ── identity ──────────────────────────────────────────────────────────────

  it('creates a random device id once and keeps it in local storage', () => {
    const first = make();
    expect(first.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage.setItem).toHaveBeenCalledWith(DEVICE_ID_KEY, first.deviceId);
    expect(make().deviceId).toBe(first.deviceId);
    expect(DEVICE_ID_KEY).toBe('device_id');
  });

  it('still works (per session) when local storage is unavailable', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(make({ storage: broken }).deviceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  // ── otherPrimary(): automatic uploads ─────────────────────────────────────

  it('allows automatic uploads when no device is primary anywhere', async () => {
    await expect(make().otherPrimary()).resolves.toBeNull();
  });

  it('blocks when Drive says another device is primary, and remembers it locally', async () => {
    driveSync.readPrimaryDevice.mockResolvedValue(APP);
    const device = make();

    await expect(device.otherPrimary()).resolves.toEqual(APP);

    expect(settings.setPrimaryDevice).toHaveBeenCalledWith(APP);
  });

  it('allows the primary device itself', async () => {
    const device = make();
    driveSync.readPrimaryDevice.mockResolvedValue({ ...APP, id: device.deviceId });
    await expect(device.otherPrimary()).resolves.toBeNull();
  });

  it('does not rewrite the local record when Drive agrees with it', async () => {
    await settings.setPrimaryDevice(APP);
    settings.setPrimaryDevice.mockClear();
    driveSync.readPrimaryDevice.mockResolvedValue({ ...APP });

    await make().otherPrimary();

    expect(settings.setPrimaryDevice).not.toHaveBeenCalled();
  });

  it('falls back to the locally known primary when Drive has none recorded', async () => {
    await settings.setPrimaryDevice(APP);
    await expect(make().otherPrimary()).resolves.toEqual(APP);
  });

  it('fails closed when Drive cannot be asked: treated as blocked, never guessed', async () => {
    driveSync.readPrimaryDevice.mockRejectedValue(new Error('offline'));
    await expect(make().otherPrimary()).resolves.toEqual({ id: null, label: 'another device', since: null });
  });

  it('localOnly skips Drive entirely (for a quick UI answer)', async () => {
    await settings.setPrimaryDevice(APP);
    await expect(make().otherPrimary({ localOnly: true })).resolves.toEqual(APP);
    expect(driveSync.readPrimaryDevice).not.toHaveBeenCalled();
  });

  // ── status / makeThisPrimary ──────────────────────────────────────────────

  it('status() reports whether this device is the recorded primary', async () => {
    const device = make({ label: 'Android app' });
    await expect(device.status()).resolves.toEqual({ primary: null, isThisDevice: false });
    await device.makeThisPrimary(new Date('2026-09-28T12:00:00.000Z'));
    await expect(device.status()).resolves.toEqual({
      primary: { id: device.deviceId, label: 'Android app', since: '2026-09-28T12:00:00.000Z' },
      isThisDevice: true,
    });
  });

  it('fails fast without settings or Drive', () => {
    expect(() => createPrimaryDevice({ settings: null, driveSync, storage, label: 'x' })).toThrow(TypeError);
    expect(() => createPrimaryDevice({ settings, driveSync: {}, storage, label: 'x' })).toThrow(TypeError);
  });
});
