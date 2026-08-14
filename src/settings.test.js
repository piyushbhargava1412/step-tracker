import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSettings,
  SYNC_ANCHOR_KEY,
  DEFAULT_SYNC_ANCHOR,
  DRIVE_BACKUP_ENABLED_KEY,
  DEFAULT_DRIVE_BACKUP_ENABLED,
  LAST_LOCAL_EXPORT_KEY,
  LAST_DRIVE_SYNC_KEY,
} from './settings.js';

describe('constants', () => {
  it('exports SYNC_ANCHOR_KEY = sync_anchor_date', () => {
    expect(SYNC_ANCHOR_KEY).toBe('sync_anchor_date');
  });

  it('exports DEFAULT_SYNC_ANCHOR = 2018-01-01', () => {
    expect(DEFAULT_SYNC_ANCHOR).toBe('2018-01-01');
  });
});

describe('createSettings', () => {
  let db;
  let settings;

  beforeEach(() => {
    db = {
      settings: {
        get: vi.fn(),
        put: vi.fn(),
      },
    };
    settings = createSettings(db);
  });

  describe('getSyncAnchorDate', () => {
    it('returns stored value when row exists', async () => {
      db.settings.get.mockResolvedValue({ key: SYNC_ANCHOR_KEY, value: '2022-06-15' });
      const result = await settings.getSyncAnchorDate();
      expect(result).toBe('2022-06-15');
      expect(db.settings.get).toHaveBeenCalledWith(SYNC_ANCHOR_KEY);
    });

    it('returns DEFAULT_SYNC_ANCHOR when row is absent (undefined)', async () => {
      db.settings.get.mockResolvedValue(undefined);
      const result = await settings.getSyncAnchorDate();
      expect(result).toBe(DEFAULT_SYNC_ANCHOR);
    });

    it('returns DEFAULT_SYNC_ANCHOR when row exists but value is empty string', async () => {
      db.settings.get.mockResolvedValue({ key: SYNC_ANCHOR_KEY, value: '' });
      const result = await settings.getSyncAnchorDate();
      expect(result).toBe(DEFAULT_SYNC_ANCHOR);
    });

    it('returns DEFAULT_SYNC_ANCHOR when row exists but value is null', async () => {
      db.settings.get.mockResolvedValue({ key: SYNC_ANCHOR_KEY, value: null });
      const result = await settings.getSyncAnchorDate();
      expect(result).toBe(DEFAULT_SYNC_ANCHOR);
    });

    it('returns DEFAULT_SYNC_ANCHOR and logs error when db.get throws', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      db.settings.get.mockRejectedValue(new Error('DB read failed'));
      const result = await settings.getSyncAnchorDate();
      expect(result).toBe(DEFAULT_SYNC_ANCHOR);
      expect(consoleError).toHaveBeenCalledWith('[settings]', expect.any(Error));
      consoleError.mockRestore();
    });
  });

  describe('setSyncAnchorDate', () => {
    it('writes row with key, value, and updated_at for a valid date', async () => {
      db.settings.put.mockResolvedValue(undefined);
      await settings.setSyncAnchorDate('2023-03-15');
      expect(db.settings.put).toHaveBeenCalledWith(
        expect.objectContaining({
          key: SYNC_ANCHOR_KEY,
          value: '2023-03-15',
          updated_at: expect.any(String),
        })
      );
    });

    it('updated_at is a valid ISO string', async () => {
      db.settings.put.mockResolvedValue(undefined);
      await settings.setSyncAnchorDate('2020-01-01');
      const call = db.settings.put.mock.calls[0][0];
      expect(() => new Date(call.updated_at).toISOString()).not.toThrow();
    });

    it('throws TypeError for a non-date string before any DB write', async () => {
      await expect(settings.setSyncAnchorDate('not-a-date')).rejects.toThrow(TypeError);
      expect(db.settings.put).not.toHaveBeenCalled();
    });

    it('throws TypeError for empty string before any DB write', async () => {
      await expect(settings.setSyncAnchorDate('')).rejects.toThrow(TypeError);
      expect(db.settings.put).not.toHaveBeenCalled();
    });

    it('throws TypeError for null before any DB write', async () => {
      await expect(settings.setSyncAnchorDate(null)).rejects.toThrow(TypeError);
      expect(db.settings.put).not.toHaveBeenCalled();
    });

    it('throws TypeError for invalid calendar date (2023-02-30) before any DB write', async () => {
      await expect(settings.setSyncAnchorDate('2023-02-30')).rejects.toThrow(TypeError);
      expect(db.settings.put).not.toHaveBeenCalled();
    });

    it('throws TypeError for correct format but invalid month (2023-13-01) before any DB write', async () => {
      await expect(settings.setSyncAnchorDate('2023-13-01')).rejects.toThrow(TypeError);
      expect(db.settings.put).not.toHaveBeenCalled();
    });

    it('accepts a date earlier than 2018 without clamping', async () => {
      db.settings.put.mockResolvedValue(undefined);
      await settings.setSyncAnchorDate('2015-06-01');
      expect(db.settings.put).toHaveBeenCalledWith(
        expect.objectContaining({ value: '2015-06-01' })
      );
    });
  });
});

describe('countRecordsBefore', () => {
  let db;
  let settings;

  beforeEach(() => {
    db = {
      settings: { get: vi.fn(), put: vi.fn() },
      daily_records: {
        where: vi.fn(),
      },
    };
    settings = createSettings(db);
  });

  it('returns count of daily_records strictly before the given date', async () => {
    const chain = { below: vi.fn().mockReturnThis(), count: vi.fn().mockResolvedValue(5) };
    db.daily_records.where.mockReturnValue(chain);
    const result = await settings.countRecordsBefore('2023-06-01');
    expect(db.daily_records.where).toHaveBeenCalledWith('date');
    expect(chain.below).toHaveBeenCalledWith('2023-06-01');
    expect(result).toBe(5);
  });

  it('excludes the boundary date (records on the date are not counted)', async () => {
    const chain = { below: vi.fn().mockReturnThis(), count: vi.fn().mockResolvedValue(3) };
    db.daily_records.where.mockReturnValue(chain);
    await settings.countRecordsBefore('2023-01-15');
    expect(chain.below).toHaveBeenCalledWith('2023-01-15');
  });

  it('throws TypeError for an invalid date before any query', async () => {
    await expect(settings.countRecordsBefore('not-a-date')).rejects.toThrow(TypeError);
    expect(db.daily_records.where).not.toHaveBeenCalled();
  });

  it('throws TypeError for null before any query', async () => {
    await expect(settings.countRecordsBefore(null)).rejects.toThrow(TypeError);
    expect(db.daily_records.where).not.toHaveBeenCalled();
  });
});

describe('countAllRecords', () => {
  let db;
  let settings;

  beforeEach(() => {
    db = {
      settings: { get: vi.fn(), put: vi.fn() },
      daily_records: {
        where: vi.fn(),
        count: vi.fn().mockResolvedValue(17),
      },
    };
    settings = createSettings(db);
  });

  it('returns the total number of daily_records', async () => {
    const result = await settings.countAllRecords();
    expect(db.daily_records.count).toHaveBeenCalledTimes(1);
    expect(result).toBe(17);
  });

  it('re-throws errors instead of swallowing them', async () => {
    db.daily_records.count.mockRejectedValue(new Error('count failed'));
    await expect(settings.countAllRecords()).rejects.toThrow('count failed');
  });
});

describe('pruneRecordsBefore', () => {
  let db;
  let settings;

  beforeEach(() => {
    db = {
      settings: { get: vi.fn(), put: vi.fn() },
      daily_records: {
        where: vi.fn(),
      },
    };
    settings = createSettings(db);
  });

  it('deletes only records strictly before the given date', async () => {
    const chain = { below: vi.fn().mockReturnThis(), delete: vi.fn().mockResolvedValue(2) };
    db.daily_records.where.mockReturnValue(chain);
    await settings.pruneRecordsBefore('2023-06-01');
    expect(db.daily_records.where).toHaveBeenCalledWith('date');
    expect(chain.below).toHaveBeenCalledWith('2023-06-01');
    expect(chain.delete).toHaveBeenCalled();
  });

  it('re-throws errors instead of swallowing them', async () => {
    const chain = { below: vi.fn().mockReturnThis(), delete: vi.fn().mockRejectedValue(new Error('DB error')) };
    db.daily_records.where.mockReturnValue(chain);
    await expect(settings.pruneRecordsBefore('2023-06-01')).rejects.toThrow('DB error');
  });

  it('throws TypeError for invalid date before any delete', async () => {
    await expect(settings.pruneRecordsBefore('bad-date')).rejects.toThrow(TypeError);
    expect(db.daily_records.where).not.toHaveBeenCalled();
  });

  it('throws TypeError for empty string before any delete', async () => {
    await expect(settings.pruneRecordsBefore('')).rejects.toThrow(TypeError);
    expect(db.daily_records.where).not.toHaveBeenCalled();
  });
});

// ── Task 27: drive_backup_enabled opt-out setting ───────────────────────────

describe('constants (Task 27)', () => {
  it('exports DRIVE_BACKUP_ENABLED_KEY = drive_backup_enabled', () => {
    expect(DRIVE_BACKUP_ENABLED_KEY).toBe('drive_backup_enabled');
  });

  it('exports DEFAULT_DRIVE_BACKUP_ENABLED = true (enabled by default)', () => {
    expect(DEFAULT_DRIVE_BACKUP_ENABLED).toBe(true);
  });
});

describe('getDriveBackupEnabled (Task 27)', () => {
  let db;
  let settings;

  beforeEach(() => {
    db = { settings: { get: vi.fn(), put: vi.fn() } };
    settings = createSettings(db);
  });

  it('returns DEFAULT_DRIVE_BACKUP_ENABLED (true) when no row exists', async () => {
    db.settings.get.mockResolvedValue(undefined);
    const result = await settings.getDriveBackupEnabled();
    expect(result).toBe(true);
    expect(db.settings.get).toHaveBeenCalledWith(DRIVE_BACKUP_ENABLED_KEY);
  });

  it('returns true when the stored value is true', async () => {
    db.settings.get.mockResolvedValue({ key: DRIVE_BACKUP_ENABLED_KEY, value: true });
    const result = await settings.getDriveBackupEnabled();
    expect(result).toBe(true);
  });

  it('returns false when the stored value is false', async () => {
    db.settings.get.mockResolvedValue({ key: DRIVE_BACKUP_ENABLED_KEY, value: false });
    const result = await settings.getDriveBackupEnabled();
    expect(result).toBe(false);
  });

  it('fails open to enabled (true) and logs when the read throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.settings.get.mockRejectedValue(new Error('DB read failed'));
    const result = await settings.getDriveBackupEnabled();
    expect(result).toBe(true);
    expect(consoleError).toHaveBeenCalledWith('[settings]', expect.any(Error));
    consoleError.mockRestore();
  });
});

describe('setDriveBackupEnabled (Task 27)', () => {
  let db;
  let settings;

  beforeEach(() => {
    db = { settings: { get: vi.fn(), put: vi.fn() } };
    settings = createSettings(db);
  });

  it('round-trips true through the settings store with key, value and updated_at', async () => {
    db.settings.put.mockResolvedValue(undefined);
    await settings.setDriveBackupEnabled(true);
    expect(db.settings.put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: DRIVE_BACKUP_ENABLED_KEY,
        value: true,
        updated_at: expect.any(String),
      })
    );
  });

  it('round-trips false through the settings store with key, value and updated_at', async () => {
    db.settings.put.mockResolvedValue(undefined);
    await settings.setDriveBackupEnabled(false);
    expect(db.settings.put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: DRIVE_BACKUP_ENABLED_KEY,
        value: false,
        updated_at: expect.any(String),
      })
    );
  });

  it('throws TypeError for a non-boolean value before any DB write', async () => {
    await expect(settings.setDriveBackupEnabled('yes')).rejects.toThrow(TypeError);
    expect(db.settings.put).not.toHaveBeenCalled();
  });

  it('updated_at is a valid ISO string', async () => {
    db.settings.put.mockResolvedValue(undefined);
    await settings.setDriveBackupEnabled(false);
    const call = db.settings.put.mock.calls[0][0];
    expect(() => new Date(call.updated_at).toISOString()).not.toThrow();
  });
});

// ── Backup & Restore metadata (last local export / last Drive sync) ────────

describe('constants (backup metadata)', () => {
  it('exports LAST_LOCAL_EXPORT_KEY = last_local_export_at', () => {
    expect(LAST_LOCAL_EXPORT_KEY).toBe('last_local_export_at');
  });

  it('exports LAST_DRIVE_SYNC_KEY = last_drive_sync', () => {
    expect(LAST_DRIVE_SYNC_KEY).toBe('last_drive_sync');
  });
});

describe('getLastLocalExport / setLastLocalExport', () => {
  let db;
  let settings;

  beforeEach(() => {
    db = { settings: { get: vi.fn(), put: vi.fn() } };
    settings = createSettings(db);
  });

  it('returns null when no row exists', async () => {
    db.settings.get.mockResolvedValue(undefined);
    const result = await settings.getLastLocalExport();
    expect(result).toBeNull();
    expect(db.settings.get).toHaveBeenCalledWith(LAST_LOCAL_EXPORT_KEY);
  });

  it('returns the stored ISO timestamp when a row exists', async () => {
    db.settings.get.mockResolvedValue({ key: LAST_LOCAL_EXPORT_KEY, value: '2026-08-14T10:00:00.000Z' });
    const result = await settings.getLastLocalExport();
    expect(result).toBe('2026-08-14T10:00:00.000Z');
  });

  it('fails open to null and logs when the read throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.settings.get.mockRejectedValue(new Error('DB read failed'));
    const result = await settings.getLastLocalExport();
    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('[settings]', expect.any(Error));
    consoleError.mockRestore();
  });

  it('setLastLocalExport writes key, value, and updated_at', async () => {
    db.settings.put.mockResolvedValue(undefined);
    await settings.setLastLocalExport('2026-08-14T10:00:00.000Z');
    expect(db.settings.put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: LAST_LOCAL_EXPORT_KEY,
        value: '2026-08-14T10:00:00.000Z',
        updated_at: '2026-08-14T10:00:00.000Z',
      })
    );
  });

  it('setLastLocalExport throws TypeError for an empty string before any DB write', async () => {
    await expect(settings.setLastLocalExport('')).rejects.toThrow(TypeError);
    expect(db.settings.put).not.toHaveBeenCalled();
  });

  it('setLastLocalExport throws TypeError for a non-string before any DB write', async () => {
    await expect(settings.setLastLocalExport(null)).rejects.toThrow(TypeError);
    expect(db.settings.put).not.toHaveBeenCalled();
  });
});

describe('getLastDriveSync / setLastDriveSync', () => {
  let db;
  let settings;

  beforeEach(() => {
    db = { settings: { get: vi.fn(), put: vi.fn() } };
    settings = createSettings(db);
  });

  it('returns null when no row exists', async () => {
    db.settings.get.mockResolvedValue(undefined);
    const result = await settings.getLastDriveSync();
    expect(result).toBeNull();
    expect(db.settings.get).toHaveBeenCalledWith(LAST_DRIVE_SYNC_KEY);
  });

  it('returns the stored { at, bytes } record when a row exists', async () => {
    db.settings.get.mockResolvedValue({
      key: LAST_DRIVE_SYNC_KEY,
      value: { at: '2026-08-14T18:30:00.000Z', bytes: 245_760 },
    });
    const result = await settings.getLastDriveSync();
    expect(result).toEqual({ at: '2026-08-14T18:30:00.000Z', bytes: 245_760 });
  });

  it('fails open to null and logs when the read throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.settings.get.mockRejectedValue(new Error('DB read failed'));
    const result = await settings.getLastDriveSync();
    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('[settings]', expect.any(Error));
    consoleError.mockRestore();
  });

  it('setLastDriveSync writes key, value, and updated_at', async () => {
    db.settings.put.mockResolvedValue(undefined);
    await settings.setLastDriveSync({ at: '2026-08-14T18:30:00.000Z', bytes: 245_760 });
    expect(db.settings.put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: LAST_DRIVE_SYNC_KEY,
        value: { at: '2026-08-14T18:30:00.000Z', bytes: 245_760 },
        updated_at: '2026-08-14T18:30:00.000Z',
      })
    );
  });

  it('setLastDriveSync throws TypeError when bytes is missing', async () => {
    await expect(settings.setLastDriveSync({ at: '2026-08-14T18:30:00.000Z' })).rejects.toThrow(TypeError);
    expect(db.settings.put).not.toHaveBeenCalled();
  });

  it('setLastDriveSync throws TypeError when at is missing', async () => {
    await expect(settings.setLastDriveSync({ bytes: 100 })).rejects.toThrow(TypeError);
    expect(db.settings.put).not.toHaveBeenCalled();
  });

  it('setLastDriveSync throws TypeError for null', async () => {
    await expect(settings.setLastDriveSync(null)).rejects.toThrow(TypeError);
    expect(db.settings.put).not.toHaveBeenCalled();
  });
});

describe('wipeDatabase', () => {
  let db;
  let settings;
  const callOrder = [];

  beforeEach(() => {
    callOrder.length = 0;
    db = {
      settings: {
        get: vi.fn(),
        put: vi.fn().mockImplementation(() => { callOrder.push('put'); return Promise.resolve(); }),
        delete: vi.fn().mockImplementation(() => { callOrder.push('delete'); return Promise.resolve(); }),
      },
      daily_records: {
        clear: vi.fn().mockImplementation(() => { callOrder.push('clear'); return Promise.resolve(); }),
        where: vi.fn(),
      },
    };
    settings = createSettings(db);
  });

  it('calls the three operations in order: clear → delete → setSyncAnchorDate', async () => {
    await settings.wipeDatabase();
    expect(callOrder).toEqual(['clear', 'delete', 'put']);
  });

  it('clears daily_records', async () => {
    await settings.wipeDatabase();
    expect(db.daily_records.clear).toHaveBeenCalledTimes(1);
  });

  it('deletes initial_backfill_complete from settings', async () => {
    await settings.wipeDatabase();
    expect(db.settings.delete).toHaveBeenCalledWith('initial_backfill_complete');
  });

  it('resets anchor to 2018-01-01 via setSyncAnchorDate', async () => {
    await settings.wipeDatabase();
    expect(db.settings.put).toHaveBeenCalledWith(
      expect.objectContaining({ key: SYNC_ANCHOR_KEY, value: '2018-01-01' })
    );
  });

  it('re-throws when daily_records.clear fails', async () => {
    db.daily_records.clear.mockRejectedValue(new Error('clear failed'));
    await expect(settings.wipeDatabase()).rejects.toThrow('clear failed');
  });

  it('re-throws when settings.delete fails', async () => {
    db.settings.delete.mockRejectedValue(new Error('delete failed'));
    await expect(settings.wipeDatabase()).rejects.toThrow('delete failed');
  });

  it('re-throws when setSyncAnchorDate fails (db.settings.put throws)', async () => {
    db.settings.put.mockRejectedValue(new Error('put failed'));
    await expect(settings.wipeDatabase()).rejects.toThrow('put failed');
  });
});
