import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CLOUD_SYNCED_TEXT,
  BACKUP_DISABLED_TEXT,
  isProtected,
  computeBadgeText,
  refreshStorageProtectionBadge,
  requestSilentPersistAndRefreshBadge,
} from './storage-health.js';
import { PERSISTED_TEXT } from './storage.js';

function makeReporter() {
  return { db: vi.fn() };
}

function makeSettings(driveAutoSyncEnabled) {
  return { getDriveBackupEnabled: vi.fn().mockResolvedValue(driveAutoSyncEnabled) };
}

function makeNav(persisted) {
  return { storage: { persisted: vi.fn().mockResolvedValue(persisted), persist: vi.fn().mockResolvedValue(true) } };
}

afterEach(() => vi.restoreAllMocks());

describe('isProtected', () => {
  it('drive auto-sync ON + persisted ON -> true', () => {
    expect(isProtected({ driveAutoSyncEnabled: true, persisted: true })).toBe(true);
  });

  it('drive auto-sync ON + persisted OFF -> true', () => {
    expect(isProtected({ driveAutoSyncEnabled: true, persisted: false })).toBe(true);
  });

  it('drive auto-sync OFF + persisted ON -> true', () => {
    expect(isProtected({ driveAutoSyncEnabled: false, persisted: true })).toBe(true);
  });

  it('drive auto-sync OFF + persisted OFF -> false', () => {
    expect(isProtected({ driveAutoSyncEnabled: false, persisted: false })).toBe(false);
  });
});

describe('computeBadgeText', () => {
  it('drive auto-sync ON + persisted ON -> Cloud Synced', () => {
    expect(computeBadgeText({ driveAutoSyncEnabled: true, persisted: true })).toBe(CLOUD_SYNCED_TEXT);
  });

  it('drive auto-sync ON + persisted OFF -> Cloud Synced (drive coverage alone is enough)', () => {
    expect(computeBadgeText({ driveAutoSyncEnabled: true, persisted: false })).toBe(CLOUD_SYNCED_TEXT);
  });

  it('drive auto-sync OFF + persisted ON -> Storage Safe', () => {
    expect(computeBadgeText({ driveAutoSyncEnabled: false, persisted: true })).toBe(PERSISTED_TEXT);
  });

  it('drive auto-sync OFF + persisted OFF -> Backup Disabled', () => {
    expect(computeBadgeText({ driveAutoSyncEnabled: false, persisted: false })).toBe(BACKUP_DISABLED_TEXT);
  });
});

describe('refreshStorageProtectionBadge', () => {
  it('reads settings + nav.storage.persisted() and writes the combined badge text', async () => {
    const reporter = makeReporter();
    const settings = makeSettings(true);
    const nav = makeNav(false);

    await refreshStorageProtectionBadge(reporter, settings, nav);

    expect(settings.getDriveBackupEnabled).toHaveBeenCalledTimes(1);
    expect(nav.storage.persisted).toHaveBeenCalledTimes(1);
    expect(reporter.db).toHaveBeenCalledWith(CLOUD_SYNCED_TEXT);
  });

  it('drive off + persisted true -> Storage Safe', async () => {
    const reporter = makeReporter();
    await refreshStorageProtectionBadge(reporter, makeSettings(false), makeNav(true));
    expect(reporter.db).toHaveBeenCalledWith(PERSISTED_TEXT);
  });

  it('drive off + persisted false -> Backup Disabled', async () => {
    const reporter = makeReporter();
    await refreshStorageProtectionBadge(reporter, makeSettings(false), makeNav(false));
    expect(reporter.db).toHaveBeenCalledWith(BACKUP_DISABLED_TEXT);
  });

  it('settings.getDriveBackupEnabled() rejecting is caught, logged, and still writes a badge (treated as disabled)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reporter = makeReporter();
    const settings = { getDriveBackupEnabled: vi.fn().mockRejectedValue(new Error('boom')) };
    const nav = makeNav(true);

    await expect(refreshStorageProtectionBadge(reporter, settings, nav)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith('[storage-health]', expect.any(Error));
    expect(reporter.db).toHaveBeenCalledWith(PERSISTED_TEXT);
  });

  it('nav.storage.persisted() rejecting is caught, logged, and still writes a badge (treated as not persisted)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reporter = makeReporter();
    const settings = makeSettings(false);
    const nav = { storage: { persisted: vi.fn().mockRejectedValue(new Error('boom')) } };

    await refreshStorageProtectionBadge(reporter, settings, nav);

    expect(consoleSpy).toHaveBeenCalledWith('[storage-health]', expect.any(Error));
    expect(reporter.db).toHaveBeenCalledWith(BACKUP_DISABLED_TEXT);
  });

  it('nav.storage.persisted missing entirely defaults to not-persisted without throwing', async () => {
    const reporter = makeReporter();
    const settings = makeSettings(true);

    await expect(refreshStorageProtectionBadge(reporter, settings, {})).resolves.toBeUndefined();

    expect(reporter.db).toHaveBeenCalledWith(CLOUD_SYNCED_TEXT);
  });

  it('missing settings collaborator defaults drive-auto-sync to disabled', async () => {
    const reporter = makeReporter();
    await refreshStorageProtectionBadge(reporter, null, makeNav(false));
    expect(reporter.db).toHaveBeenCalledWith(BACKUP_DISABLED_TEXT);
  });
});

describe('requestSilentPersistAndRefreshBadge', () => {
  it('calls nav.storage.persist() then refreshes the badge from current state', async () => {
    const reporter = makeReporter();
    const settings = makeSettings(false);
    const nav = makeNav(true);

    await requestSilentPersistAndRefreshBadge(reporter, settings, nav);

    expect(nav.storage.persist).toHaveBeenCalledTimes(1);
    expect(reporter.db).toHaveBeenCalledWith(PERSISTED_TEXT);
  });

  it('nav.storage.persist() rejecting is caught, logged, and the badge is still refreshed', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reporter = makeReporter();
    const settings = makeSettings(false);
    const nav = {
      storage: {
        persist: vi.fn().mockRejectedValue(new Error('denied')),
        persisted: vi.fn().mockResolvedValue(false),
      },
    };

    await requestSilentPersistAndRefreshBadge(reporter, settings, nav);

    expect(consoleSpy).toHaveBeenCalledWith('[storage-health]', expect.any(Error));
    expect(reporter.db).toHaveBeenCalledWith(BACKUP_DISABLED_TEXT);
  });

  it('nav.storage.persist missing entirely never throws and still refreshes the badge', async () => {
    const reporter = makeReporter();
    const settings = makeSettings(true);

    await expect(
      requestSilentPersistAndRefreshBadge(reporter, settings, {})
    ).resolves.toBeUndefined();

    expect(reporter.db).toHaveBeenCalledWith(CLOUD_SYNCED_TEXT);
  });
});
