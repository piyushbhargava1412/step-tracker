import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeBackupStatus, createBackupStatus, STALE_BACKUP_MS } from './backup-status.js';
import { STATUS_WARN } from './status-light.js';

const NOW = new Date('2026-09-29T09:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const HEALTHY = {
  driveConnected: true,
  autoBackupEnabled: true,
  lastBackupAt: hoursAgo(2),
  anotherDeviceIsPrimary: false,
  now: NOW,
};

describe('ST-027: computeBackupStatus — when backup needs attention', () => {
  it('is fine (null) while Drive is connected, auto backup is on and the last backup is recent', () => {
    expect(computeBackupStatus(HEALTHY)).toBeNull();
  });

  it.each([
    [{ driveConnected: false }, 'Google Drive is not connected'],
    [{ autoBackupEnabled: false }, 'Automatic backup is off'],
    [{ lastBackupAt: null }, 'This phone has not backed up to Google Drive yet'],
  ])('%o → "Not backed up": %s', (change, detail) => {
    expect(computeBackupStatus({ ...HEALTHY, ...change })).toEqual({ level: STATUS_WARN, label: 'Not backed up', detail });
  });

  it('warns once the last backup is older than 3 days', () => {
    expect(STALE_BACKUP_MS).toBe(3 * 24 * 3_600_000);
    expect(computeBackupStatus({ ...HEALTHY, lastBackupAt: hoursAgo(71) })).toBeNull();
    expect(computeBackupStatus({ ...HEALTHY, lastBackupAt: hoursAgo(73) })).toEqual({
      level: STATUS_WARN,
      label: 'Not backed up',
      detail: 'Last backup to Google Drive was 3 days ago',
    });
  });

  it('an unreadable backup time counts as never backed up', () => {
    expect(computeBackupStatus({ ...HEALTHY, lastBackupAt: 'garbage' }).detail).toMatch(/not backed up .* yet/);
  });

  it('never warns when another device is the primary — it does the backing up', () => {
    expect(computeBackupStatus({ ...HEALTHY, anotherDeviceIsPrimary: true, autoBackupEnabled: false, lastBackupAt: null })).toBeNull();
  });

  it('Drive not connected outranks the other reasons', () => {
    expect(computeBackupStatus({ ...HEALTHY, driveConnected: false, autoBackupEnabled: false }).detail).toBe('Google Drive is not connected');
  });
});

describe('ST-027: createBackupStatus — the #backup-status pill', () => {
  let doc;
  let settings;
  let primaryDevice;
  let driveConnected;
  let onOpen;

  const pill = () => doc.getElementById('backup-status');
  const make = () => createBackupStatus({
    doc,
    settings,
    primaryDevice,
    isDriveConnected: () => driveConnected,
    onOpen,
    now: () => NOW,
  });

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('t');
    doc.body.innerHTML = '<button id="backup-status" class="status-pill" type="button" hidden></button>';
    settings = {
      getDriveBackupEnabled: vi.fn().mockResolvedValue(true),
      getLastDriveSync: vi.fn().mockResolvedValue({ at: hoursAgo(1), bytes: 100 }),
    };
    primaryDevice = { status: vi.fn().mockResolvedValue({ primary: null, isThisDevice: false }) };
    driveConnected = true;
    onOpen = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('stays hidden while backup is fine', async () => {
    await make().refresh();
    expect(pill().hidden).toBe(true);
  });

  it('shows an amber "Not backed up" light with the reason when it needs attention', async () => {
    settings.getDriveBackupEnabled.mockResolvedValue(false);
    await make().refresh();
    expect(pill().hidden).toBe(false);
    expect(pill().querySelector('.status-light--warn')).not.toBeNull();
    expect(pill().textContent).toBe('Not backed up');
    expect(pill().title).toBe('Automatic backup is off');
  });

  it('hides again once the problem is fixed', async () => {
    const status = make();
    driveConnected = false;
    await status.refresh();
    expect(pill().hidden).toBe(false);
    driveConnected = true;
    await status.refresh();
    expect(pill().hidden).toBe(true);
  });

  it('respects another primary device', async () => {
    primaryDevice.status.mockResolvedValue({ primary: { id: 'other' }, isThisDevice: false });
    settings.getLastDriveSync.mockResolvedValue(null);
    await make().refresh();
    expect(pill().hidden).toBe(true);
  });

  it('tapping it opens Backup & restore — bound once however often it refreshes', async () => {
    driveConnected = false;
    const status = make();
    await status.refresh();
    await status.refresh();
    pill().click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('failed reads fail open to the safe defaults (auto backup on, never backed up)', async () => {
    settings.getDriveBackupEnabled.mockRejectedValue(new Error('db'));
    settings.getLastDriveSync.mockRejectedValue(new Error('db'));
    primaryDevice.status.mockRejectedValue(new Error('db'));
    await expect(make().refresh()).resolves.toBeUndefined();
    expect(pill().title).toBe('This phone has not backed up to Google Drive yet');
    expect(console.error).toHaveBeenCalled();
  });

  it('tolerates a missing pill', async () => {
    doc.body.innerHTML = '';
    await expect(make().refresh()).resolves.toBeUndefined();
  });
});
