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
