import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSettings, SYNC_ANCHOR_KEY, DEFAULT_SYNC_ANCHOR } from './settings.js';

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
