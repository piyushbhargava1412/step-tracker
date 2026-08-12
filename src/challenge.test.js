import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChallenge, ACTIVE_CHALLENGE_KEY } from './challenge.js';

// ---------------------------------------------------------------------------
// Constant tests
// ---------------------------------------------------------------------------
describe('ACTIVE_CHALLENGE_KEY', () => {
  it('equals "active_challenge"', () => {
    expect(ACTIVE_CHALLENGE_KEY).toBe('active_challenge');
  });
});

// ---------------------------------------------------------------------------
// createChallenge factory
// ---------------------------------------------------------------------------
describe('createChallenge', () => {
  let mockGet;
  let mockPut;
  let mockDb;

  beforeEach(() => {
    mockGet = vi.fn();
    mockPut = vi.fn().mockResolvedValue(undefined);
    mockDb = { settings: { get: mockGet, put: mockPut } };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // getActiveChallenge
  // -------------------------------------------------------------------------
  describe('getActiveChallenge', () => {
    it('returns stored row when it has valid start_date and end_date strings', async () => {
      const row = {
        key: 'active_challenge',
        name: 'Team Sprint',
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        created_at: '2026-08-01T00:00:00.000Z',
      };
      mockGet.mockResolvedValue(row);
      const challenge = createChallenge(mockDb);

      const result = await challenge.getActiveChallenge();

      expect(result).toEqual(row);
      expect(mockGet).toHaveBeenCalledWith(ACTIVE_CHALLENGE_KEY);
    });

    it('returns null when row is absent (undefined)', async () => {
      mockGet.mockResolvedValue(undefined);
      const challenge = createChallenge(mockDb);

      const result = await challenge.getActiveChallenge();

      expect(result).toBeNull();
    });

    it('returns null when row is corrupt (not an object)', async () => {
      mockGet.mockResolvedValue('invalid-data');
      const challenge = createChallenge(mockDb);

      const result = await challenge.getActiveChallenge();

      expect(result).toBeNull();
    });

    it('returns null when row is missing start_date', async () => {
      mockGet.mockResolvedValue({ key: 'active_challenge', end_date: '2026-08-31' });
      const challenge = createChallenge(mockDb);

      const result = await challenge.getActiveChallenge();

      expect(result).toBeNull();
    });

    it('returns null when row is missing end_date', async () => {
      mockGet.mockResolvedValue({ key: 'active_challenge', start_date: '2026-08-01' });
      const challenge = createChallenge(mockDb);

      const result = await challenge.getActiveChallenge();

      expect(result).toBeNull();
    });

    it('returns null when start_date is not a string', async () => {
      mockGet.mockResolvedValue({ key: 'active_challenge', start_date: 20260801, end_date: '2026-08-31' });
      const challenge = createChallenge(mockDb);

      const result = await challenge.getActiveChallenge();

      expect(result).toBeNull();
    });

    it('returns null when end_date is not a string', async () => {
      mockGet.mockResolvedValue({ key: 'active_challenge', start_date: '2026-08-01', end_date: 20260831 });
      const challenge = createChallenge(mockDb);

      const result = await challenge.getActiveChallenge();

      expect(result).toBeNull();
    });

    it('on DB read error: logs console.error("[challenge]", err) and returns null, never throws', async () => {
      const err = new Error('DB read error');
      mockGet.mockRejectedValue(err);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const challenge = createChallenge(mockDb);

      const result = await challenge.getActiveChallenge();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('[challenge]', err);
      expect(mockPut).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // setActiveChallenge
  // -------------------------------------------------------------------------
  describe('setActiveChallenge', () => {
    it('writes { key, name, start_date, end_date, created_at } on first save', async () => {
      mockGet.mockResolvedValue(undefined); // no existing row
      const challenge = createChallenge(mockDb);
      const before = Date.now();

      await challenge.setActiveChallenge({ name: 'Team Sprint', start_date: '2026-08-01', end_date: '2026-08-31' });

      expect(mockPut).toHaveBeenCalledTimes(1);
      const putArg = mockPut.mock.calls[0][0];
      expect(putArg.key).toBe(ACTIVE_CHALLENGE_KEY);
      expect(putArg.name).toBe('Team Sprint');
      expect(putArg.start_date).toBe('2026-08-01');
      expect(putArg.end_date).toBe('2026-08-31');
      // created_at is a fresh ISO timestamp
      expect(typeof putArg.created_at).toBe('string');
      expect(new Date(putArg.created_at).getTime()).toBeGreaterThanOrEqual(before);
    });

    it('preserves existing created_at on edit (when row already exists)', async () => {
      const existingRow = {
        key: 'active_challenge',
        name: 'Old Challenge',
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        created_at: '2026-07-01T10:00:00.000Z',
      };
      mockGet.mockResolvedValue(existingRow);
      const challenge = createChallenge(mockDb);

      await challenge.setActiveChallenge({ name: 'Updated Challenge', start_date: '2026-08-01', end_date: '2026-08-31' });

      const putArg = mockPut.mock.calls[0][0];
      expect(putArg.created_at).toBe('2026-07-01T10:00:00.000Z'); // preserved
      expect(putArg.name).toBe('Updated Challenge');
      expect(putArg.start_date).toBe('2026-08-01');
    });

    it('defaults name to null when not provided', async () => {
      mockGet.mockResolvedValue(undefined);
      const challenge = createChallenge(mockDb);

      await challenge.setActiveChallenge({ start_date: '2026-08-01', end_date: '2026-08-31' });

      const putArg = mockPut.mock.calls[0][0];
      expect(putArg.name).toBeNull();
    });

    it('throws RangeError when end_date < start_date (no write)', async () => {
      const challenge = createChallenge(mockDb);

      await expect(
        challenge.setActiveChallenge({ start_date: '2026-08-31', end_date: '2026-08-01' })
      ).rejects.toThrow(RangeError);

      expect(mockPut).not.toHaveBeenCalled();
    });

    it('throws RangeError even if a row exists — guard fires before any DB read for existing data', async () => {
      // RangeError guard must fire BEFORE the get — or at least before the put
      const challenge = createChallenge(mockDb);

      await expect(
        challenge.setActiveChallenge({ start_date: '2026-08-15', end_date: '2026-08-14' })
      ).rejects.toThrow(RangeError);

      expect(mockPut).not.toHaveBeenCalled();
    });

    it('same start_date and end_date (single-day challenge) is allowed', async () => {
      mockGet.mockResolvedValue(undefined);
      const challenge = createChallenge(mockDb);

      await expect(
        challenge.setActiveChallenge({ start_date: '2026-08-15', end_date: '2026-08-15' })
      ).resolves.toBeUndefined();

      expect(mockPut).toHaveBeenCalledTimes(1);
    });

    it('on DB write error: logs console.error("[challenge]", err) and swallows (fail-open, no rethrow)', async () => {
      mockGet.mockResolvedValue(undefined);
      const err = new Error('DB write error');
      mockPut.mockRejectedValue(err);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const challenge = createChallenge(mockDb);

      await expect(
        challenge.setActiveChallenge({ start_date: '2026-08-01', end_date: '2026-08-31' })
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith('[challenge]', err);
    });

    it('RangeError from guard still propagates (not swallowed by the DB error handler)', async () => {
      const challenge = createChallenge(mockDb);

      await expect(
        challenge.setActiveChallenge({ start_date: '2026-09-01', end_date: '2026-08-01' })
      ).rejects.toThrow(RangeError);
    });

    it('when the internal get-for-created_at rejects: still writes the row with a fresh created_at (fail-open on inner get)', async () => {
      // First call: get inside setActiveChallenge rejects; second call could be put
      // We simulate by making get always reject.
      mockGet.mockRejectedValue(new Error('inner get error'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const challenge = createChallenge(mockDb);

      await expect(
        challenge.setActiveChallenge({ start_date: '2026-08-01', end_date: '2026-08-31' })
      ).resolves.toBeUndefined();

      // put should still be called with a valid created_at
      expect(mockPut).toHaveBeenCalledTimes(1);
      const putArg = mockPut.mock.calls[0][0];
      expect(typeof putArg.created_at).toBe('string');
    });

  });

  // -------------------------------------------------------------------------
  // No-DOM contract
  // -------------------------------------------------------------------------
  describe('no-DOM contract', () => {
    it('challenge.js source contains no "document" or "window" references', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(import.meta.dirname, 'challenge.js'),
        'utf-8'
      );
      expect(src).not.toMatch(/\bdocument\b/);
      expect(src).not.toMatch(/\bwindow\b/);
    });
  });
});
