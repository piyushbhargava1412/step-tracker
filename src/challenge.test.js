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

// ---------------------------------------------------------------------------
// computeChallengeMetrics — module-level pure export
// ---------------------------------------------------------------------------
import { computeChallengeMetrics } from './challenge.js';
import { _localDate, _addDaysUtc } from './date-utils.js';

describe('computeChallengeMetrics', () => {
  // Verify it is a module-level export, not closure-nested
  it('is a named module-level export (not closure-nested)', () => {
    expect(typeof computeChallengeMetrics).toBe('function');
  });

  // Helper: build a record
  function rec(date, steps) {
    return { date, effective_steps: steps };
  }

  // Fix "today" to a known date so tests are deterministic
  // We'll use vi.setSystemTime to freeze time
  beforeEach(() => {
    // Freeze to 2026-08-12 (a Wednesday)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // today = '2026-08-12', yesterday = '2026-08-11'

  describe('active challenge (end_date >= today)', () => {
    // Challenge: 2026-08-01 to 2026-08-31 (active, since end_date=2026-08-31 >= 2026-08-12)
    const challenge = {
      name: 'Team Sprint',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
    };

    it('returns the latest day (today-1) steps from records', () => {
      const records = [
        rec('2026-08-11', 9420),  // yesterday → latest day
        rec('2026-08-10', 8000),
        rec('2026-08-09', 7500),
      ];
      const m = computeChallengeMetrics(challenge, records);
      expect(m.latestDaySteps).toBe(9420);
    });

    it('returns 0 for latest day steps when no record on today-1', () => {
      const records = [
        rec('2026-08-10', 8000),
        rec('2026-08-09', 7500),
      ];
      const m = computeChallengeMetrics(challenge, records);
      expect(m.latestDaySteps).toBe(0);
    });

    it('computes cumulative total from start_date to yesterday (inclusive)', () => {
      // window: 2026-08-01 to 2026-08-11
      const records = [
        rec('2026-08-01', 5000),
        rec('2026-08-05', 6000),
        rec('2026-08-11', 9420),  // yesterday
        rec('2026-08-12', 3000),  // today — excluded from cumulative
        rec('2026-07-31', 1000),  // before start — excluded
      ];
      const m = computeChallengeMetrics(challenge, records);
      expect(m.cumulativeTotal).toBe(5000 + 6000 + 9420);
    });

    it('returns elapsed days = (yesterday - start_date) + 1 for active challenge', () => {
      // yesterday = 2026-08-11, start_date = 2026-08-01 → 10 + 1 = 11
      const m = computeChallengeMetrics(challenge, []);
      expect(m.elapsedDays).toBe(11);
    });

    it('returns total duration M = (end_date - start_date) + 1', () => {
      // end_date=2026-08-31, start_date=2026-08-01 → 30 + 1 = 31
      const m = computeChallengeMetrics(challenge, []);
      expect(m.totalDays).toBe(31);
    });

    it('computes average pace = cumulative / elapsed_days', () => {
      const records = [
        rec('2026-08-01', 5000),
        rec('2026-08-11', 9420),
      ];
      const m = computeChallengeMetrics(challenge, records);
      // cumulative = 14420, elapsed = 11
      expect(m.avgPace).toBeCloseTo(14420 / 11, 5);
    });

    it('flags completed = false for an active challenge', () => {
      const m = computeChallengeMetrics(challenge, []);
      expect(m.completed).toBe(false);
    });
  });

  describe('completed challenge (end_date < today)', () => {
    // Challenge ended in the past: 2026-07-01 to 2026-07-31
    const challenge = {
      name: 'July Sprint',
      start_date: '2026-07-01',
      end_date: '2026-07-31',
    };

    it('cumulative window is start_date to end_date (not yesterday)', () => {
      const records = [
        rec('2026-07-01', 4000),
        rec('2026-07-15', 8000),
        rec('2026-07-31', 12000),
        rec('2026-08-11', 5000),  // yesterday — excluded (outside window)
        rec('2026-06-30', 3000),  // before start — excluded
      ];
      const m = computeChallengeMetrics(challenge, records);
      expect(m.cumulativeTotal).toBe(4000 + 8000 + 12000);
    });

    it('elapsed days = full duration (end_date - start_date) + 1', () => {
      // end_date=2026-07-31, start_date=2026-07-01 → 30 + 1 = 31
      const m = computeChallengeMetrics(challenge, []);
      expect(m.elapsedDays).toBe(31);
    });

    it('latest day steps read from end_date when the challenge is completed', () => {
      // end_date = 2026-07-31 → the final day's steps ARE the latest day
      const records = [rec('2026-07-31', 12000)];
      const m = computeChallengeMetrics(challenge, records);
      expect(m.latestDaySteps).toBe(12000);
    });

    it('returns 0 for latest day steps when no record on end_date (completed)', () => {
      const records = [rec('2026-07-15', 8000)];
      const m = computeChallengeMetrics(challenge, records);
      expect(m.latestDaySteps).toBe(0);
    });

    it('flags completed = true', () => {
      const m = computeChallengeMetrics(challenge, []);
      expect(m.completed).toBe(true);
    });

    it('average pace = cumulative / elapsed_days for completed challenge', () => {
      const records = [
        rec('2026-07-01', 4000),
        rec('2026-07-31', 12000),
      ];
      const m = computeChallengeMetrics(challenge, records);
      // cumulative = 16000, elapsed = 31
      expect(m.avgPace).toBeCloseTo(16000 / 31, 5);
    });
  });

  describe('edge cases and guard paths', () => {
    it('empty records → all zeros', () => {
      const challenge = {
        start_date: '2026-08-01',
        end_date: '2026-08-31',
      };
      const m = computeChallengeMetrics(challenge, []);
      expect(m.latestDaySteps).toBe(0);
      expect(m.cumulativeTotal).toBe(0);
      expect(m.avgPace).toBe(0);
    });

    it('start_date > yesterday → elapsed = 0 and avgPace = 0 (divide-by-zero guard)', () => {
      // today = 2026-08-12, yesterday = 2026-08-11
      // start_date = 2026-08-12 (today) → start_date > yesterday
      const challenge = {
        start_date: '2026-08-12',
        end_date: '2026-08-31',
      };
      const records = [rec('2026-08-12', 5000)];
      const m = computeChallengeMetrics(challenge, records);
      expect(m.elapsedDays).toBe(0);
      expect(m.avgPace).toBe(0);
    });

    it('start_date === yesterday → elapsed = 1 (just started)', () => {
      // start_date = 2026-08-11 = yesterday
      const challenge = {
        start_date: '2026-08-11',
        end_date: '2026-08-31',
      };
      const records = [rec('2026-08-11', 8000)];
      const m = computeChallengeMetrics(challenge, records);
      expect(m.elapsedDays).toBe(1);
      expect(m.avgPace).toBeCloseTo(8000 / 1, 5);
    });

    it('single-day completed challenge: elapsed = 1, avgPace = cumulative', () => {
      // Challenge: 2026-07-15 to 2026-07-15 (completed)
      const challenge = {
        start_date: '2026-07-15',
        end_date: '2026-07-15',
      };
      const records = [rec('2026-07-15', 10000)];
      const m = computeChallengeMetrics(challenge, records);
      expect(m.elapsedDays).toBe(1);
      expect(m.cumulativeTotal).toBe(10000);
      expect(m.avgPace).toBeCloseTo(10000, 5);
      expect(m.totalDays).toBe(1);
    });

    it('missing latest day record → latestDaySteps = 0', () => {
      const challenge = {
        start_date: '2026-08-01',
        end_date: '2026-08-31',
      };
      const records = [rec('2026-08-10', 7000)];
      const m = computeChallengeMetrics(challenge, records);
      expect(m.latestDaySteps).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// formatChallengeUpdate — pure copy-text formatter (Task 3)
// ---------------------------------------------------------------------------
import { formatChallengeUpdate } from './challenge.js';

describe('formatChallengeUpdate', () => {
  it('is a named module-level export', () => {
    expect(typeof formatChallengeUpdate).toBe('function');
  });

  it('formats a representative update with all numbers locale-formatted', () => {
    const metrics = {
      latestDaySteps: 9420,
      cumulativeTotal: 84500,
      elapsedDays: 9,
      avgPace: 9388.888,
    };
    const result = formatChallengeUpdate(metrics, 'Team Sprint');
    const expected =
      '🚶 Team Sprint Update\n' +
      '📅 Latest Day: 9,420\n' +
      '📊 Cumulative Total: 84,500 steps (Day 9)\n' +
      '📈 Average Pace: 9,389 steps/day\n';
    expect(result).toBe(expected);
  });

  it('uses toLocaleString("en-US") for thousands grouping (9420 → "9,420")', () => {
    const metrics = { latestDaySteps: 9420, cumulativeTotal: 0, elapsedDays: 1, avgPace: 0 };
    const result = formatChallengeUpdate(metrics, 'X');
    expect(result).toContain('9,420');
  });

  it('uses toLocaleString("en-US") for cumulative (84500 → "84,500")', () => {
    const metrics = { latestDaySteps: 0, cumulativeTotal: 84500, elapsedDays: 1, avgPace: 0 };
    const result = formatChallengeUpdate(metrics, 'X');
    expect(result).toContain('84,500');
  });

  it('rounds avgPace to integer before formatting (9388.888 → 9,389)', () => {
    const metrics = { latestDaySteps: 0, cumulativeTotal: 0, elapsedDays: 1, avgPace: 9388.888 };
    const result = formatChallengeUpdate(metrics, 'X');
    expect(result).toContain('9,389');
  });

  it('rounds avgPace down when fractional part < 0.5 (1234.4 → 1,234)', () => {
    const metrics = { latestDaySteps: 0, cumulativeTotal: 0, elapsedDays: 1, avgPace: 1234.4 };
    const result = formatChallengeUpdate(metrics, 'X');
    expect(result).toContain('1,234 steps/day');
  });

  it('falls back to "Step Challenge" when name is null', () => {
    const metrics = { latestDaySteps: 0, cumulativeTotal: 0, elapsedDays: 1, avgPace: 0 };
    const result = formatChallengeUpdate(metrics, null);
    expect(result).toMatch(/^🚶 Step Challenge Update\n/);
  });

  it('falls back to "Step Challenge" when name is empty string', () => {
    const metrics = { latestDaySteps: 0, cumulativeTotal: 0, elapsedDays: 1, avgPace: 0 };
    const result = formatChallengeUpdate(metrics, '');
    expect(result).toMatch(/^🚶 Step Challenge Update\n/);
  });

  it('falls back to "Step Challenge" when name is undefined', () => {
    const metrics = { latestDaySteps: 0, cumulativeTotal: 0, elapsedDays: 1, avgPace: 0 };
    const result = formatChallengeUpdate(metrics);
    expect(result).toMatch(/^🚶 Step Challenge Update\n/);
  });

  it('uses the provided name when non-empty', () => {
    const metrics = { latestDaySteps: 0, cumulativeTotal: 0, elapsedDays: 1, avgPace: 0 };
    const result = formatChallengeUpdate(metrics, 'My Challenge');
    expect(result).toMatch(/^🚶 My Challenge Update\n/);
  });

  it('output has exactly one trailing newline', () => {
    const metrics = { latestDaySteps: 0, cumulativeTotal: 0, elapsedDays: 1, avgPace: 0 };
    const result = formatChallengeUpdate(metrics, 'X');
    expect(result.endsWith('\n')).toBe(true);
    expect(result.endsWith('\n\n')).toBe(false);
  });

  it('includes elapsedDays in (Day N) portion', () => {
    const metrics = { latestDaySteps: 0, cumulativeTotal: 0, elapsedDays: 42, avgPace: 0 };
    const result = formatChallengeUpdate(metrics, 'X');
    expect(result).toContain('(Day 42)');
  });

  it('output has exactly 4 lines (3 newlines internal + 1 trailing)', () => {
    const metrics = { latestDaySteps: 100, cumulativeTotal: 200, elapsedDays: 1, avgPace: 200 };
    const result = formatChallengeUpdate(metrics, 'X');
    const lines = result.split('\n');
    // 4 content lines + 1 empty string from trailing newline = 5 items
    expect(lines.length).toBe(5);
    expect(lines[4]).toBe('');
  });
});
