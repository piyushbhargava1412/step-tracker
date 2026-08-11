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

  describe('computeDayOfWeekSlump', () => {
    // 2026-08-10 = Monday (index 0), 2026-08-11 = Tuesday (1), ..., 2026-08-16 = Sunday (6)
    function makeMockDb({ earliest, records, goalHistory }) {
      return {
        daily_records: {
          orderBy: () => ({
            first: () => Promise.resolve(earliest ?? undefined),
          }),
          where: () => ({
            between: () => ({
              toArray: () => Promise.resolve(records ?? []),
            }),
          }),
        },
        goal_history: {
          toArray: () => Promise.resolve(goalHistory ?? []),
        },
      };
    }

    it('returns an array of exactly 7 elements', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const db = makeMockDb({ earliest: undefined });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.computeDayOfWeekSlump();
      expect(result).toHaveLength(7);
    });

    it('all 7 buckets empty when DB is empty', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const db = makeMockDb({ earliest: undefined });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.computeDayOfWeekSlump();
      expect(result).toHaveLength(7);
      for (const bucket of result) {
        expect(bucket).toEqual({ hitRate: null, avgSteps: null, totalDistanceKm: null, count: 0 });
      }
    });

    it('empty bucket shape: { hitRate: null, avgSteps: null, totalDistanceKm: null, count: 0 }', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      // Only Monday record — all other buckets should be empty
      const records = [
        { date: '2026-08-10', effective_distance_km: 10.0, steps: 12000 }, // Monday, MET
      ];
      const goalHistory = [{ effective_from: '2026-01-01', target_distance_km: 10 }];
      const db = makeMockDb({ earliest: { date: '2026-08-10' }, records, goalHistory });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.computeDayOfWeekSlump();
      // Tuesday through Sunday should be empty
      for (let i = 1; i <= 6; i++) {
        expect(result[i]).toEqual({ hitRate: null, avgSteps: null, totalDistanceKm: null, count: 0 });
      }
    });

    it('a record on a known Monday (2026-08-10) lands in result[0]', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const records = [
        { date: '2026-08-10', effective_distance_km: 10.0, steps: 12000 }, // Monday
      ];
      const goalHistory = [{ effective_from: '2026-01-01', target_distance_km: 10 }];
      const db = makeMockDb({ earliest: { date: '2026-08-10' }, records, goalHistory });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.computeDayOfWeekSlump();
      expect(result[0].count).toBe(1);
    });

    it('per-bucket hitRate matches hand-computed fixture', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      // Monday 2026-08-10: MET (10.0 >= 10), Monday 2026-08-17: MISSED (5.0 < 10)
      // hitRate = 1/2 = 50
      const records = [
        { date: '2026-08-10', effective_distance_km: 10.0, steps: 12000 }, // Monday, MET
        { date: '2026-08-17', effective_distance_km: 5.0,  steps: 6000 },  // Monday, MISSED
      ];
      const goalHistory = [{ effective_from: '2026-01-01', target_distance_km: 10 }];
      const db = makeMockDb({ earliest: { date: '2026-08-10' }, records, goalHistory });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.computeDayOfWeekSlump();
      expect(result[0].hitRate).toBe(50);
    });

    it('per-bucket avgSteps = Math.round(sumSteps / count)', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const records = [
        { date: '2026-08-10', effective_distance_km: 10.0, steps: 11000 }, // Monday
        { date: '2026-08-17', effective_distance_km: 5.0,  steps: 7000 },  // Monday
      ];
      const goalHistory = [{ effective_from: '2026-01-01', target_distance_km: 10 }];
      const db = makeMockDb({ earliest: { date: '2026-08-10' }, records, goalHistory });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.computeDayOfWeekSlump();
      // (11000+7000)/2 = 9000
      expect(result[0].avgSteps).toBe(9000);
    });

    it('per-bucket totalDistanceKm = sum of distances', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const records = [
        { date: '2026-08-10', effective_distance_km: 10.0, steps: 12000 }, // Monday
        { date: '2026-08-17', effective_distance_km: 7.5,  steps: 8000 },  // Monday
      ];
      const goalHistory = [{ effective_from: '2026-01-01', target_distance_km: 10 }];
      const db = makeMockDb({ earliest: { date: '2026-08-10' }, records, goalHistory });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.computeDayOfWeekSlump();
      expect(result[0].totalDistanceKm).toBeCloseTo(17.5, 5);
    });

    it('non-finite effective_distance_km contributes 0 to bucket total', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const records = [
        { date: '2026-08-10', effective_distance_km: NaN,      steps: 0 },  // Monday, non-finite
        { date: '2026-08-17', effective_distance_km: Infinity,  steps: 0 },  // Monday, non-finite
        { date: '2026-08-24', effective_distance_km: 8.0,       steps: 9000 }, // Monday, finite
      ];
      const goalHistory = [{ effective_from: '2026-01-01', target_distance_km: 10 }];
      const db = makeMockDb({ earliest: { date: '2026-08-10' }, records, goalHistory });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.computeDayOfWeekSlump();
      // totalDistanceKm should only count the finite value: 8.0
      expect(result[0].totalDistanceKm).toBeCloseTo(8.0, 5);
      expect(result[0].count).toBe(3);
    });

    it('Saturday (index 5) and Sunday (index 6) buckets correctly populated', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      // 2026-08-15 = Saturday, 2026-08-16 = Sunday
      const records = [
        { date: '2026-08-15', effective_distance_km: 10.0, steps: 12000 }, // Saturday
        { date: '2026-08-16', effective_distance_km: 8.0,  steps: 9000 },  // Sunday
      ];
      const goalHistory = [{ effective_from: '2026-01-01', target_distance_km: 10 }];
      const db = makeMockDb({ earliest: { date: '2026-08-15' }, records, goalHistory });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.computeDayOfWeekSlump();
      expect(result[5].count).toBe(1); // Saturday
      expect(result[6].count).toBe(1); // Sunday
    });

    it('hitRate respects per-date targets (goal change mid-range)', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      // Two Mondays: first uses target=10 (MET: 10.0), second uses target=5 (MISSED: 4.0)
      // hitRate = 1/2 = 50
      const records = [
        { date: '2026-08-10', effective_distance_km: 10.0, steps: 12000 }, // Monday, target=10, MET
        { date: '2026-08-17', effective_distance_km: 4.0,  steps: 5000 },  // Monday, target=5, MISSED
      ];
      const goalHistory = [
        { effective_from: '2026-01-01', target_distance_km: 10 },
        { effective_from: '2026-08-17', target_distance_km: 5 },
      ];
      const db = makeMockDb({ earliest: { date: '2026-08-10' }, records, goalHistory });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-08-17', target_distance_km: 5 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.computeDayOfWeekSlump();
      expect(result[0].hitRate).toBe(50);
    });
  });

  describe('comparePeriods', () => {
    // Mock DB that routes between() calls by range start date
    function makeMockDb({ goalHistory, rangeRecords }) {
      // rangeRecords: Map from startDate string to array of records
      return {
        daily_records: {
          orderBy: () => ({
            first: () => Promise.resolve(undefined),
          }),
          where: () => ({
            between: (start) => ({
              toArray: () => Promise.resolve((rangeRecords && rangeRecords[start]) ?? []),
            }),
          }),
        },
        goal_history: {
          toArray: () => Promise.resolve(goalHistory ?? []),
        },
      };
    }

    it('returns correct periodA and periodB aggregates for two non-overlapping ranges', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      // Period A: 2026-01-01 to 2026-01-03 — 3 records, target=10
      // Period B: 2026-02-01 to 2026-02-02 — 2 records, target=10
      const rangeRecords = {
        '2026-01-01': [
          { date: '2026-01-01', effective_distance_km: 10.0, steps: 10000 }, // MET
          { date: '2026-01-02', effective_distance_km: 8.0,  steps: 8000  }, // MISSED
          { date: '2026-01-03', effective_distance_km: 11.0, steps: 11000 }, // MET
        ],
        '2026-02-01': [
          { date: '2026-02-01', effective_distance_km: 10.0, steps: 10000 }, // MET
          { date: '2026-02-02', effective_distance_km: 10.5, steps: 10500 }, // MET
        ],
      };
      const goalHistory = [{ effective_from: '2026-01-01', target_distance_km: 10 }];
      const db = makeMockDb({ goalHistory, rangeRecords });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.comparePeriods(
        { startDate: '2026-01-01', endDate: '2026-01-03' },
        { startDate: '2026-02-01', endDate: '2026-02-02' },
      );
      // Period A: totalSteps=29000, totalDistanceKm=29.0, hitRate=Math.round(2/3*100)=67
      expect(result.periodA.totalSteps).toBe(29000);
      expect(result.periodA.totalDistanceKm).toBeCloseTo(29.0, 5);
      expect(result.periodA.hitRate).toBe(67);
      // Period B: totalSteps=20500, totalDistanceKm=20.5, hitRate=100
      expect(result.periodB.totalSteps).toBe(20500);
      expect(result.periodB.totalDistanceKm).toBeCloseTo(20.5, 5);
      expect(result.periodB.hitRate).toBe(100);
    });

    it('computes deltas via computeComparisonDelta for all three metrics', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const rangeRecords = {
        '2026-01-01': [
          { date: '2026-01-01', effective_distance_km: 10.0, steps: 10000 }, // MET
        ],
        '2026-02-01': [
          { date: '2026-02-01', effective_distance_km: 11.0, steps: 11000 }, // MET
        ],
      };
      const goalHistory = [{ effective_from: '2026-01-01', target_distance_km: 10 }];
      const db = makeMockDb({ goalHistory, rangeRecords });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.comparePeriods(
        { startDate: '2026-01-01', endDate: '2026-01-01' },
        { startDate: '2026-02-01', endDate: '2026-02-01' },
      );
      // totalSteps: 10000→11000 = 10%
      expect(result.deltas.totalSteps).toBe(10);
      // hitRate: 100→100 = 0%
      expect(result.deltas.hitRate).toBe(0);
      // totalDistanceKm: 10→11 = 10%
      expect(result.deltas.totalDistanceKm).toBe(10);
    });

    it('delta is null when period A total steps is 0', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const rangeRecords = {
        '2026-01-01': [
          { date: '2026-01-01', effective_distance_km: 5.0, steps: 0 }, // 0 steps
        ],
        '2026-02-01': [
          { date: '2026-02-01', effective_distance_km: 10.0, steps: 5000 },
        ],
      };
      const goalHistory = [{ effective_from: '2026-01-01', target_distance_km: 10 }];
      const db = makeMockDb({ goalHistory, rangeRecords });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.comparePeriods(
        { startDate: '2026-01-01', endDate: '2026-01-01' },
        { startDate: '2026-02-01', endDate: '2026-02-01' },
      );
      expect(result.deltas.totalSteps).toBeNull();
    });

    it('reversed range yields empty aggregate with null metrics without throwing', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const db = makeMockDb({ goalHistory: [], rangeRecords: {} });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.comparePeriods(
        { startDate: '2026-01-31', endDate: '2026-01-01' }, // reversed
        { startDate: '2026-02-01', endDate: '2026-02-28' },
      );
      expect(result.periodA.totalSteps).toBe(0);
      expect(result.periodA.hitRate).toBeNull();
      expect(result.periodA.totalDistanceKm).toBeNull();
    });

    it('empty range (no records in window) yields null metrics and null deltas', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const rangeRecords = { '2026-01-01': [], '2026-02-01': [] };
      const goalHistory = [{ effective_from: '2026-01-01', target_distance_km: 10 }];
      const db = makeMockDb({ goalHistory, rangeRecords });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.comparePeriods(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        { startDate: '2026-02-01', endDate: '2026-02-28' },
      );
      expect(result.periodA.hitRate).toBeNull();
      expect(result.periodA.totalSteps).toBe(0);
      expect(result.deltas.totalSteps).toBeNull();
      expect(result.deltas.hitRate).toBeNull();
    });

    it('return shape has { periodA, periodB, deltas: { totalSteps, totalDistanceKm, hitRate } }', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const rangeRecords = { '2026-01-01': [], '2026-02-01': [] };
      const db = makeMockDb({ goalHistory: [], rangeRecords });
      const goal = { getActiveGoal: () => ({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      const result = await lab.comparePeriods(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        { startDate: '2026-02-01', endDate: '2026-02-28' },
      );
      expect(result).toHaveProperty('periodA');
      expect(result).toHaveProperty('periodB');
      expect(result).toHaveProperty('deltas');
      expect(result.deltas).toHaveProperty('totalSteps');
      expect(result.deltas).toHaveProperty('totalDistanceKm');
      expect(result.deltas).toHaveProperty('hitRate');
    });

    it('only .between() queries used — orderBy not called for comparePeriods', async () => {
      const { createSearchLab } = await import('./search-lab.js');
      const orderBySpy = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(undefined) });
      const betweenSpy = vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
      const db = {
        daily_records: {
          orderBy: orderBySpy,
          where: () => ({ between: betweenSpy }),
        },
        goal_history: { toArray: vi.fn().mockResolvedValue([]) },
      };
      const goal = { getActiveGoal: vi.fn().mockResolvedValue({ effective_from: '2026-01-01', target_distance_km: 10 }) };
      const lab = createSearchLab(db, goal);
      await lab.comparePeriods(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        { startDate: '2026-02-01', endDate: '2026-02-28' },
      );
      expect(orderBySpy).not.toHaveBeenCalled();
      expect(betweenSpy).toHaveBeenCalledTimes(2);
    });
  });
