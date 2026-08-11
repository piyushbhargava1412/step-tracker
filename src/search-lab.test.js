import { describe, it, expect } from 'vitest';
import { isNearMiss, dayOfWeekIndex, dateBounds, computeComparisonDelta } from './search-lab.js';

describe('isNearMiss', () => {
  it('returns true when effectiveDistanceKm is exactly target * 0.90 (lower boundary inclusive)', () => {
    expect(isNearMiss(9, 10)).toBe(true);
  });

  it('returns true when effectiveDistanceKm is between 0.90*target and target', () => {
    expect(isNearMiss(9.5, 10)).toBe(true);
  });

  it('returns false when effectiveDistanceKm equals target (upper boundary exclusive)', () => {
    expect(isNearMiss(10, 10)).toBe(false);
  });

  it('returns false when effectiveDistanceKm is above target', () => {
    expect(isNearMiss(11, 10)).toBe(false);
  });

  it('returns false when effectiveDistanceKm is below 0.90*target', () => {
    expect(isNearMiss(8.9, 10)).toBe(false);
  });

  it('returns false when effectiveDistanceKm is non-finite (Infinity)', () => {
    expect(isNearMiss(Infinity, 10)).toBe(false);
  });

  it('returns false when effectiveDistanceKm is NaN', () => {
    expect(isNearMiss(NaN, 10)).toBe(false);
  });

  it('returns false when target is non-finite', () => {
    expect(isNearMiss(9, Infinity)).toBe(false);
  });

  it('returns false when target is zero', () => {
    expect(isNearMiss(0, 0)).toBe(false);
  });

  it('returns false when target is negative', () => {
    expect(isNearMiss(-1, -2)).toBe(false);
  });
});

describe('dayOfWeekIndex', () => {
  it('returns 0 for a known Monday (2026-08-10)', () => {
    expect(dayOfWeekIndex('2026-08-10')).toBe(0);
  });

  it('returns 6 for a known Sunday (2026-08-09)', () => {
    expect(dayOfWeekIndex('2026-08-09')).toBe(6);
  });

  it('returns 1 for a known Tuesday (2026-08-11)', () => {
    expect(dayOfWeekIndex('2026-08-11')).toBe(1);
  });

  it('returns 4 for a known Friday (2026-01-02)', () => {
    expect(dayOfWeekIndex('2026-01-02')).toBe(4);
  });
});

describe('dateBounds', () => {
  it('returns correct start and endExclusive for same-month range', () => {
    expect(dateBounds('2026-01-01', '2026-01-31')).toEqual({
      start: '2026-01-01',
      endExclusive: '2026-02-01',
    });
  });

  it('handles month rollover (Jan 31 → Feb 1)', () => {
    expect(dateBounds('2026-01-31', '2026-01-31')).toEqual({
      start: '2026-01-31',
      endExclusive: '2026-02-01',
    });
  });

  it('handles month and year rollover (Feb 28 → Mar 1)', () => {
    expect(dateBounds('2026-01-31', '2026-02-28')).toEqual({
      start: '2026-01-31',
      endExclusive: '2026-03-01',
    });
  });

  it('handles December → January year rollover', () => {
    expect(dateBounds('2025-12-01', '2025-12-31')).toEqual({
      start: '2025-12-01',
      endExclusive: '2026-01-01',
    });
  });
});

describe('computeComparisonDelta', () => {
  it('returns 10 for (100, 110) — positive delta', () => {
    expect(computeComparisonDelta(100, 110)).toBe(10);
  });

  it('returns -5 for (100, 95) — negative delta', () => {
    expect(computeComparisonDelta(100, 95)).toBe(-5);
  });

  it('returns 33.3 for (3, 4) — one-decimal rounding', () => {
    expect(computeComparisonDelta(3, 4)).toBe(33.3);
  });

  it('returns null when a === 0 (avoids Infinity)', () => {
    expect(computeComparisonDelta(0, 100)).toBeNull();
  });

  it('returns null when a is null', () => {
    expect(computeComparisonDelta(null, 100)).toBeNull();
  });

  it('returns null when b is null', () => {
    expect(computeComparisonDelta(100, null)).toBeNull();
  });

  it('returns null when both a and b are null', () => {
    expect(computeComparisonDelta(null, null)).toBeNull();
  });
});

describe('createSearchLab', () => {
  describe('findNearMisses', () => {
    function makeMockDb({ earliest, records, goalHistory }) {
      const firstResult = earliest ?? undefined;
      const betweenResult = records ?? [];
      const goalHistoryResult = goalHistory ?? [];

      return {
        daily_records: {
          orderBy: () => ({
            first: () => Promise.resolve(firstResult),
          }),
          where: () => ({
            between: () => ({
              toArray: () => Promise.resolve(betweenResult),
            }),
          }),
        },
        goal_history: {
          toArray: () => Promise.resolve(goalHistoryResult),
        },
      };
    }

    it('returns [] when DB is empty (earliest record is undefined)', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const db = makeMockDb({ earliest: undefined });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      expect(await lab.findNearMisses()).toEqual([]);
    });

    it('returns only near-miss days from mixed records', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      // target = 10 km, near-miss = [9, 10)
      const records = [
        { date: '2026-01-01', effective_distance_km: 5.0 },   // MISSED
        { date: '2026-01-02', effective_distance_km: 9.2 },   // NEAR-MISS
        { date: '2026-01-03', effective_distance_km: 10.0 },  // MET (excluded)
        { date: '2026-01-04', effective_distance_km: 9.5 },   // NEAR-MISS
        { date: '2026-01-05', effective_distance_km: 11.0 },  // EXCEEDED (excluded)
      ];
      const db = makeMockDb({
        earliest: { date: '2026-01-01' },
        records,
        goalHistory: [{ effective_from: '2026-01-01', target_distance_km: 10 }],
      });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.findNearMisses();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ date: '2026-01-02', effectiveDistanceKm: 9.2, target: 10 });
      expect(result[1]).toEqual({ date: '2026-01-04', effectiveDistanceKm: 9.5, target: 10 });
    });

    it('returns results sorted ascending by date', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const records = [
        { date: '2026-01-10', effective_distance_km: 9.1 },
        { date: '2026-01-05', effective_distance_km: 9.3 },
        { date: '2026-01-15', effective_distance_km: 9.2 },
      ];
      const db = makeMockDb({
        earliest: { date: '2026-01-05' },
        records,
        goalHistory: [{ effective_from: '2026-01-01', target_distance_km: 10 }],
      });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.findNearMisses();
      expect(result.map(r => r.date)).toEqual(['2026-01-05', '2026-01-10', '2026-01-15']);
    });

    it('each result item has { date, effectiveDistanceKm, target } shape', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const records = [{ date: '2026-01-02', effective_distance_km: 9.5 }];
      const db = makeMockDb({
        earliest: { date: '2026-01-01' },
        records,
        goalHistory: [{ effective_from: '2026-01-01', target_distance_km: 10 }],
      });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const [item] = await lab.findNearMisses();
      expect(item).toHaveProperty('date');
      expect(item).toHaveProperty('effectiveDistanceKm');
      expect(item).toHaveProperty('target');
    });

    it('honors per-date goal history when goal changes mid-range', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      // Before change: target = 10; after change: target = 5
      const records = [
        { date: '2026-01-05', effective_distance_km: 9.1 },  // near-miss vs target=10
        { date: '2026-02-05', effective_distance_km: 4.6 },  // near-miss vs target=5
        { date: '2026-02-06', effective_distance_km: 9.1 },  // above target=5 → EXCEEDED, excluded
      ];
      const goalHistory = [
        { effective_from: '2026-01-01', target_distance_km: 10 },
        { effective_from: '2026-02-01', target_distance_km: 5 },
      ];
      const db = makeMockDb({
        earliest: { date: '2026-01-01' },
        records,
        goalHistory,
      });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-02-01', target_distance_km: 5 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.findNearMisses();
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ date: '2026-01-05', target: 10 });
      expect(result[1]).toMatchObject({ date: '2026-02-05', target: 5 });
    });

    it('returns [] when no records qualify as near-miss', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const records = [
        { date: '2026-01-01', effective_distance_km: 5 },   // MISSED
        { date: '2026-01-02', effective_distance_km: 10 },  // MET
      ];
      const db = makeMockDb({
        earliest: { date: '2026-01-01' },
        records,
        goalHistory: [{ effective_from: '2026-01-01', target_distance_km: 10 }],
      });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      expect(await lab.findNearMisses()).toEqual([]);
    });
  });
});
