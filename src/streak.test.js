/**
 * Tests for src/streak.js — pure streak computation.
 * Inline fixture builders only (no factory library), mirroring progress.test.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  TIER_STEP_THRESHOLDS,
  HALL_OF_FAME_SIZE,
  ALLOWANCE_WINDOW_95,
  ALLOWANCE_WINDOW_90,
  _sortByDate,
  _isValidRecord,
  computeTierStreaks,
  computeHallOfFame,
  computeLifetimeCompliance,
  computeToleranceStreaks,
  createStreak,
} from './streak.js';
import * as streakModule from './streak.js';
import { DEFAULT_STEP_GOAL, STEP_GOAL_OPTIONS } from './goal.js';

const streakSource = fs.readFileSync(path.resolve(__dirname, 'streak.js'), 'utf8');
const streakUiSource = fs.readFileSync(path.resolve(__dirname, 'streak-ui.js'), 'utf8');

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Fixture builders (test-local, independent of the implementation under test)
// ---------------------------------------------------------------------------

/** Independent UTC-based date shift used to build fixtures. */
function shiftDate(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + delta * 86400000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Builds `days` consecutive daily_records starting at `startDate`, each at `steps`. */
function buildPeriod(startDate, days, steps) {
  return Array.from({ length: days }, (_, i) => ({
    date: shiftDate(startDate, i),
    effective_steps: steps,
  }));
}
// ---------------------------------------------------------------------------
// _sortByDate
// ---------------------------------------------------------------------------
describe('_sortByDate', () => {
  it('returns records ascending by date', () => {
    const input = [{ date: '2026-01-03' }, { date: '2026-01-01' }, { date: '2026-01-02' }];
    expect(_sortByDate(input).map((r) => r.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
  });

  it('is stable for equal dates — insertion order preserved', () => {
    const input = [
      { date: '2026-01-02', effective_distance_km: 1 },
      { date: '2026-01-01' },
      { date: '2026-01-02', effective_distance_km: 2 },
    ];
    const sorted = _sortByDate(input);
    expect(sorted.map((r) => r.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-02']);
    expect(sorted[1].effective_distance_km).toBe(1);
    expect(sorted[2].effective_distance_km).toBe(2);
  });

  it('does not mutate the original array', () => {
    const input = [{ date: '2026-01-03' }, { date: '2026-01-01' }];
    const snapshot = input.map((r) => r.date);
    _sortByDate(input);
    expect(input.map((r) => r.date)).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// TIER_STEP_THRESHOLDS — single source of truth with STEP_GOAL_OPTIONS
// ---------------------------------------------------------------------------
describe('TIER_STEP_THRESHOLDS', () => {
  it('is structurally equal to STEP_GOAL_OPTIONS (single source of truth)', () => {
    expect(TIER_STEP_THRESHOLDS).toEqual(STEP_GOAL_OPTIONS);
    expect(TIER_STEP_THRESHOLDS).toEqual([5000, 7500, 10000, 15000]);
  });

  it('is the same array reference as STEP_GOAL_OPTIONS (guards against reference drift)', () => {
    expect(TIER_STEP_THRESHOLDS).toBe(STEP_GOAL_OPTIONS);
  });
});

// ---------------------------------------------------------------------------
// TIER_THRESHOLDS identifier fully removed (grep-verifiable, SF-4b)
// ---------------------------------------------------------------------------
describe('TIER_THRESHOLDS identifier removal', () => {
  it('src/streak.js no longer exports or references TIER_THRESHOLDS', () => {
    expect(streakSource).not.toMatch(/\bTIER_THRESHOLDS\b/);
  });

  it('src/streak-ui.js no longer imports or references TIER_THRESHOLDS', () => {
    expect(streakUiSource).not.toMatch(/\bTIER_THRESHOLDS\b/);
  });
});

// ---------------------------------------------------------------------------
// computeTierStreaks — AC Scenario 3 (varying step counts per tier)
// ---------------------------------------------------------------------------
describe('computeTierStreaks — AC Scenario 3 (varying step counts per tier)', () => {
  const TODAY = '2026-08-10';

  /**
   * Fixture (steps chosen so active differs per tier, mirroring the km-era
   * fixture's shape one-for-one across the new [5000, 7500, 10000, 15000]
   * ladder):
   *   2026-08-06: 11000 steps — passes 5000, 7500, 10000 (fails 15000)
   *   2026-08-07:  6000 steps — passes 5000                (fails 7500, 10000, 15000)
   *   2026-08-08: 16000 steps — passes all
   *   2026-08-09: 12000 steps — passes 5000, 7500, 10000 (fails 15000)
   *   2026-08-10:  8000 steps — passes 5000, 7500         (fails 10000, 15000)
   *
   * Expected active (backward from today):
   *    5000: 8000≥5000, 12000≥5000, 16000≥5000, 6000≥5000, 11000≥5000 → 5
   *    7500: 8000≥7500, 12000≥7500, 16000≥7500, 6000<7500→stop → 3
   *   10000: 8000<10000→skip today, 12000≥10000, 16000≥10000, 6000<10000→stop → 2
   *   15000: 8000<15000→skip today, 12000<15000→stop → 0
   *
   * Expected best (full history scan):
   *    5000: 11000,6000,16000,12000,8000 all≥5000 consecutively → 5
   *    7500: 11000≥7500(1), 6000<7500(0), 16000≥7500(1), 12000≥7500(2), 8000≥7500(3) → 3
   *   10000: 11000≥10000(1), 6000<10000(0), 16000≥10000(1), 12000≥10000(2), 8000<10000(0) → 2
   *   15000: 11000<15000(0), 6000<15000(0), 16000≥15000(1), 12000<15000(0), 8000<15000(0) → 1
   */
  const RECORDS = [
    { date: '2026-08-06', effective_steps: 11000 },
    { date: '2026-08-07', effective_steps: 6000 },
    { date: '2026-08-08', effective_steps: 16000 },
    { date: '2026-08-09', effective_steps: 12000 },
    { date: '2026-08-10', effective_steps: 8000 },
  ];

  it('returns four entries in TIER_STEP_THRESHOLDS order each with { threshold, active, best }', () => {
    const result = computeTierStreaks(RECORDS, TODAY);
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.threshold)).toEqual([5000, 7500, 10000, 15000]);
    result.forEach((entry) => {
      expect(entry).toHaveProperty('threshold');
      expect(entry).toHaveProperty('active');
      expect(entry).toHaveProperty('best');
    });
  });

  it('active streak for 5000-step threshold = 5 (all five days pass)', () => {
    const result = computeTierStreaks(RECORDS, TODAY);
    expect(result[0]).toEqual({ threshold: 5000, active: 5, best: 5 });
  });

  it('active streak for 7500-step threshold = 3 (past 6000-step day terminates)', () => {
    const result = computeTierStreaks(RECORDS, TODAY);
    expect(result[1]).toEqual({ threshold: 7500, active: 3, best: 3 });
  });

  it('active streak for 10000-step threshold = 2 (today skipped; past 6000-step day terminates)', () => {
    const result = computeTierStreaks(RECORDS, TODAY);
    expect(result[2]).toEqual({ threshold: 10000, active: 2, best: 2 });
  });

  it('active streak for 15000-step threshold = 0; best = 1 (only the 16000-step day qualifies)', () => {
    const result = computeTierStreaks(RECORDS, TODAY);
    expect(result[3]).toEqual({ threshold: 15000, active: 0, best: 1 });
  });
});

// ---------------------------------------------------------------------------
// computeTierStreaks — today skip rules (SF-9)
// ---------------------------------------------------------------------------
describe('computeTierStreaks — today skip rules (SF-9)', () => {
  const TODAY = '2026-08-10';

  it('today below threshold → skip today, active count preserved from yesterday', () => {
    // 08-09 and 08-08 both pass (>= 7500); 08-10 below
    const records = [
      { date: '2026-08-08', effective_steps: 8000 },
      { date: '2026-08-09', effective_steps: 8000 },
      { date: '2026-08-10', effective_steps: 3000 }, // below 7500
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier = result.find((r) => r.threshold === 7500);
    expect(tier.active).toBe(2); // only 08-09 and 08-08
  });

  it("today's record missing → skip today, active count preserved from yesterday", () => {
    // 08-09 and 08-08 pass; today (08-10) absent
    const records = [
      { date: '2026-08-08', effective_steps: 8000 },
      { date: '2026-08-09', effective_steps: 8000 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier = result.find((r) => r.threshold === 7500);
    expect(tier.active).toBe(2);
  });

  it('today at/above threshold → counted in active streak (SF-8 >=)', () => {
    // today passes exactly at threshold (boundary)
    const records = [
      { date: '2026-08-09', effective_steps: 7500 },
      { date: '2026-08-10', effective_steps: 7500 }, // exact
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier = result.find((r) => r.threshold === 7500);
    expect(tier.active).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// computeTierStreaks — active streak termination rules
// ---------------------------------------------------------------------------
describe('computeTierStreaks — active streak termination', () => {
  const TODAY = '2026-08-10';

  it('past failing day terminates the active streak', () => {
    // 08-10 & 08-09 pass (>= 7500); 08-08 fails (3000 < 7500); 08-07 passes but unreachable
    const records = [
      { date: '2026-08-07', effective_steps: 9000 },
      { date: '2026-08-08', effective_steps: 3000 }, // fails
      { date: '2026-08-09', effective_steps: 8000 },
      { date: '2026-08-10', effective_steps: 8000 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier = result.find((r) => r.threshold === 7500);
    expect(tier.active).toBe(2); // only 08-10 and 08-09
  });

  it('past missing day terminates the active streak (SF-2 semantics)', () => {
    // 08-10 & 08-09 pass; 08-08 missing; 08-07 exists but unreachable
    const records = [
      { date: '2026-08-07', effective_steps: 8000 },
      // 2026-08-08 missing
      { date: '2026-08-09', effective_steps: 8000 },
      { date: '2026-08-10', effective_steps: 8000 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier = result.find((r) => r.threshold === 7500);
    expect(tier.active).toBe(2); // only 08-10 and 08-09
  });
});

// ---------------------------------------------------------------------------
// computeTierStreaks — best-ever
// ---------------------------------------------------------------------------
describe('computeTierStreaks — best-ever', () => {
  const TODAY = '2026-08-10';

  it('best-ever spans a historical run that ended before today', () => {
    /**
     * Fixture for threshold 15000:
     *   2026-07-01 .. 2026-07-05: 16000 steps each (5-day run, ends before today)
     *   2026-07-06: 1000 steps (fails — breaks best run)
     *   gap: 2026-07-07 .. 2026-08-08 missing
     *   2026-08-09: 16000 steps (active run of 1 day; today missing)
     */
    const records = [
      { date: '2026-07-01', effective_steps: 16000 },
      { date: '2026-07-02', effective_steps: 16000 },
      { date: '2026-07-03', effective_steps: 16000 },
      { date: '2026-07-04', effective_steps: 16000 },
      { date: '2026-07-05', effective_steps: 16000 },
      { date: '2026-07-06', effective_steps: 1000 },
      { date: '2026-08-09', effective_steps: 16000 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier = result.find((r) => r.threshold === 15000);
    expect(tier.active).toBe(1); // only 08-09 (today missing → skipped; 08-08 missing → terminate)
    expect(tier.best).toBe(5);  // the historical run in July
  });

  it('single passing day yields best = 1', () => {
    const records = [
      { date: '2026-08-09', effective_steps: 16000 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier = result.find((r) => r.threshold === 15000);
    expect(tier.best).toBe(1);
  });

  it('a calendar gap resets the best run (non-consecutive dates only count as separate runs)', () => {
    // Three separate single days for threshold 10000
    const records = [
      { date: '2026-08-05', effective_steps: 12000 },
      { date: '2026-08-07', effective_steps: 12000 }, // gap at 08-06
      { date: '2026-08-09', effective_steps: 12000 }, // gap at 08-08
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier = result.find((r) => r.threshold === 10000);
    expect(tier.best).toBe(1); // non-consecutive — each is its own run of 1
  });

  it('all days pass every tier — active and best equal record length', () => {
    // 5 consecutive days all at 16000 steps (passes all four thresholds)
    const records = [
      { date: '2026-08-06', effective_steps: 16000 },
      { date: '2026-08-07', effective_steps: 16000 },
      { date: '2026-08-08', effective_steps: 16000 },
      { date: '2026-08-09', effective_steps: 16000 },
      { date: '2026-08-10', effective_steps: 16000 },
    ];
    const result = computeTierStreaks(records, TODAY);
    result.forEach(({ active, best }) => {
      expect(active).toBe(5);
      expect(best).toBe(5);
    });
  });
});

// ---------------------------------------------------------------------------
// computeTierStreaks — zero-state and guards
// ---------------------------------------------------------------------------
describe('computeTierStreaks — zero-state and guards', () => {
  const TODAY = '2026-08-10';

  it('empty records → all { active: 0, best: 0 } (SF-12)', () => {
    const result = computeTierStreaks([], TODAY);
    expect(result).toHaveLength(4);
    result.forEach(({ active, best }) => {
      expect(active).toBe(0);
      expect(best).toBe(0);
    });
  });

  it('null/undefined records → all zero (guard)', () => {
    expect(computeTierStreaks(null, TODAY)).toHaveLength(4);
    computeTierStreaks(null, TODAY).forEach(({ active, best }) => {
      expect(active).toBe(0);
      expect(best).toBe(0);
    });
  });

  it('non-finite effective_steps is treated as 0 for every tier — no exception (SF-13)', () => {
    const records = [
      { date: '2026-08-09', effective_steps: NaN },
      { date: '2026-08-10', effective_steps: Infinity },
    ];
    expect(() => computeTierStreaks(records, TODAY)).not.toThrow();
    const result = computeTierStreaks(records, TODAY);
    // All step counts are non-finite → treated as 0 → fail every tier
    result.forEach(({ active, best }) => {
      expect(active).toBe(0);
      expect(best).toBe(0);
    });
  });

  it('boundary-exact day (steps === threshold) passes (SF-8 >=)', () => {
    // Record exactly at 10000 steps; today is yesterday (not today) so no skip rule
    const records = [
      { date: '2026-08-09', effective_steps: 10000 },
      { date: '2026-08-10', effective_steps: 10000 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier = result.find((r) => r.threshold === 10000);
    expect(tier.active).toBe(2); // both days at exactly 10000 pass
    expect(tier.best).toBe(2);
  });

  it('records with corrupt/absent date keys are ignored (guard)', () => {
    const records = [
      null,
      { effective_steps: 16000 }, // no date
      { date: '', effective_steps: 16000 }, // empty date
      { date: '2026-08-09', effective_steps: 16000 },
    ];
    const result = computeTierStreaks(records, TODAY);
    // Only the valid record counts
    const tier = result.find((r) => r.threshold === 15000);
    expect(tier.active).toBe(1);
    expect(tier.best).toBe(1);
  });

  it('invalid today string → all zero (guard)', () => {
    const records = [
      { date: '2026-08-09', effective_steps: 16000 },
    ];
    expect(computeTierStreaks(records, '')).toHaveLength(4);
    computeTierStreaks(records, '').forEach(({ active, best }) => {
      expect(active).toBe(0);
      expect(best).toBe(0);
    });
    computeTierStreaks(records, null).forEach(({ active, best }) => {
      expect(active).toBe(0);
      expect(best).toBe(0);
    });
  });

  it('all records with corrupt/absent dates → usable empty → all zero (guard, line 197)', () => {
    // Every record fails _isValidRecord → usable.length === 0 → ZERO_STATE returned
    const records = [
      null,
      { effective_steps: 16000 },       // missing date
      { date: 42, effective_steps: 16000 }, // numeric date
      { date: '', effective_steps: 16000 },  // empty date
    ];
    const result = computeTierStreaks(records, TODAY);
    expect(result).toHaveLength(4);
    result.forEach(({ active, best }) => {
      expect(active).toBe(0);
      expect(best).toBe(0);
    });
  });

  // Task 23: fresh-object contract — ZERO_TIER_STREAKS must not be shared
  it('returns distinct array references on successive guard-path calls (Task 23)', () => {
    const r1 = computeTierStreaks([], '2026-08-10');
    const r2 = computeTierStreaks([], '2026-08-10');
    expect(r1).not.toBe(r2);
    expect(r1[0]).not.toBe(r2[0]);
  });

  it('mutating a returned guard-path entry does not corrupt a subsequent call (Task 23)', () => {
    const r1 = computeTierStreaks([], '2026-08-10');
    r1[0].active = 999;
    const r2 = computeTierStreaks([], '2026-08-10');
    expect(r2[0].active).toBe(0);
  });

  it('returns distinct array references on successive null-records guard calls (Task 23)', () => {
    const r1 = computeTierStreaks(null, '2026-08-10');
    const r2 = computeTierStreaks(null, '2026-08-10');
    expect(r1).not.toBe(r2);
    expect(r1[0]).not.toBe(r2[0]);
  });

  it('returns distinct array references on empty-usable guard path (Task 23)', () => {
    // All invalid records → _computeTierStreaksPrepared returns ZERO on usable.length === 0
    const badRecords = [null, { effective_steps: 5000 }];
    const r1 = computeTierStreaks(badRecords, '2026-08-10');
    const r2 = computeTierStreaks(badRecords, '2026-08-10');
    expect(r1).not.toBe(r2);
    expect(r1[0]).not.toBe(r2[0]);
  });

  it('mutating entry from empty-usable path does not corrupt subsequent call (Task 23)', () => {
    const badRecords = [null, { effective_steps: 5000 }];
    const r1 = computeTierStreaks(badRecords, '2026-08-10');
    r1[0].best = 42;
    const r2 = computeTierStreaks(badRecords, '2026-08-10');
    expect(r2[0].best).toBe(0);
  });

});

// ---------------------------------------------------------------------------
// computeHallOfFame(records, stepGoal) — re-based on the single active step goal
// (SF-4c). Strict 100% only; the current goal is applied to every historical day.
// ---------------------------------------------------------------------------
describe('computeHallOfFame — re-basing on the scalar step goal (SF-3/SF-4c)', () => {
  // One record set, two lenses:
  //   2026-01-01 .. 2026-01-05  16000 steps  (passes 5000 and 15000)
  //   2026-01-06 .. 2026-01-15   8000 steps  (passes 5000, fails 15000)
  //   2026-01-16 .. 2026-01-20  16000 steps  (passes 5000 and 15000)
  const RECORDS = [
    ...buildPeriod('2026-01-01', 5, 16000),
    ...buildPeriod('2026-01-06', 10, 8000),
    ...buildPeriod('2026-01-16', 5, 16000),
  ];

  it('at stepGoal 5000 the whole span is a single 20-day period', () => {
    expect(computeHallOfFame(RECORDS, 5000)).toEqual([
      { startDate: '2026-01-01', endDate: '2026-01-20', days: 20 },
    ]);
  });

  it('at stepGoal 15000 the same records yield two 5-day periods, most recent first', () => {
    expect(computeHallOfFame(RECORDS, 15000)).toEqual([
      { startDate: '2026-01-16', endDate: '2026-01-20', days: 5 },
      { startDate: '2026-01-01', endDate: '2026-01-05', days: 5 },
    ]);
  });

  it('the identical record set produces different podiums per goal', () => {
    expect(computeHallOfFame(RECORDS, 5000)).not.toEqual(computeHallOfFame(RECORDS, 15000));
  });

  it('boundary-exact steps pass the day (>= not >)', () => {
    expect(computeHallOfFame(buildPeriod('2026-01-01', 3, 10000), 10000)).toEqual([
      { startDate: '2026-01-01', endDate: '2026-01-03', days: 3 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// computeHallOfFame — period boundaries and ranking
// ---------------------------------------------------------------------------
describe('computeHallOfFame — period boundaries and ranking', () => {
  it('a calendar gap closes the open period (SF-5)', () => {
    const records = [
      ...buildPeriod('2026-01-01', 3, 12000),
      // 2026-01-04 missing → calendar gap
      ...buildPeriod('2026-01-05', 2, 12000),
    ];
    expect(computeHallOfFame(records, 10000)).toEqual([
      { startDate: '2026-01-01', endDate: '2026-01-03', days: 3 },
      { startDate: '2026-01-05', endDate: '2026-01-06', days: 2 },
    ]);
  });

  it('a failing day closes the open period', () => {
    const records = [
      { date: '2026-01-01', effective_steps: 12000 },
      { date: '2026-01-02', effective_steps: 4000 }, // fails
      { date: '2026-01-03', effective_steps: 12000 },
    ];
    expect(computeHallOfFame(records, 10000)).toEqual([
      { startDate: '2026-01-03', endDate: '2026-01-03', days: 1 },
      { startDate: '2026-01-01', endDate: '2026-01-01', days: 1 },
    ]);
  });

  it('ties on days rank the later startDate first (recency tie-break)', () => {
    const records = [
      ...buildPeriod('2026-01-01', 10, 12000), // ends 2026-01-10; gap at 2026-01-11
      ...buildPeriod('2026-01-12', 10, 12000), // ends 2026-01-21 (more recent)
    ];
    expect(computeHallOfFame(records, 10000)).toEqual([
      { startDate: '2026-01-12', endDate: '2026-01-21', days: 10 },
      { startDate: '2026-01-01', endDate: '2026-01-10', days: 10 },
    ]);
  });

  it('three equal-length periods rank purely by recency', () => {
    const records = [
      ...buildPeriod('2026-01-01', 5, 12000), // gap at 2026-01-06
      ...buildPeriod('2026-01-07', 5, 12000), // gap at 2026-01-12
      ...buildPeriod('2026-01-13', 5, 12000),
    ];
    expect(computeHallOfFame(records, 10000).map((p) => p.startDate)).toEqual([
      '2026-01-13',
      '2026-01-07',
      '2026-01-01',
    ]);
  });

  it('returns at most HALL_OF_FAME_SIZE (3) entries, longest first', () => {
    const records = [
      ...buildPeriod('2026-01-01', 30, 12000), // gap at 2026-01-31
      ...buildPeriod('2026-02-01', 20, 12000), // gap at 2026-02-21
      ...buildPeriod('2026-02-22', 10, 12000), // gap at 2026-03-04
      ...buildPeriod('2026-03-05', 5, 12000),
    ];
    const result = computeHallOfFame(records, 10000);
    expect(HALL_OF_FAME_SIZE).toBe(3);
    expect(result).toHaveLength(HALL_OF_FAME_SIZE);
    expect(result.map((p) => p.days)).toEqual([30, 20, 10]);
    expect(result[0]).toEqual({ startDate: '2026-01-01', endDate: '2026-01-30', days: 30 });
    expect(result.find((p) => p.days === 5)).toBeUndefined();
  });

  it('fewer than HALL_OF_FAME_SIZE periods → returns all available (no padding)', () => {
    const records = [
      ...buildPeriod('2026-01-01', 5, 12000),
      // gap at 2026-01-06
      ...buildPeriod('2026-01-07', 3, 12000),
    ];
    expect(computeHallOfFame(records, 10000)).toHaveLength(2);
  });

  it('no in-progress exemption — today fails on its own record (SF-4c)', () => {
    const records = [
      ...buildPeriod('2026-08-07', 3, 12000),
      { date: '2026-08-10', effective_steps: 1200 }, // today, fails
    ];
    expect(computeHallOfFame(records, 10000)).toEqual([
      { startDate: '2026-08-07', endDate: '2026-08-09', days: 3 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// computeHallOfFame — guards and fail-open
// ---------------------------------------------------------------------------
describe('computeHallOfFame — guards and fail-open', () => {
  it('empty records → []', () => {
    expect(computeHallOfFame([], 10000)).toEqual([]);
  });

  it('null/undefined records → [] (guard)', () => {
    expect(computeHallOfFame(null, 10000)).toEqual([]);
    expect(computeHallOfFame(undefined, 10000)).toEqual([]);
  });

  it('no qualifying period (every day below goal) → []', () => {
    expect(computeHallOfFame(buildPeriod('2026-01-01', 4, 4000), 10000)).toEqual([]);
  });

  it('records with corrupt/absent date keys are ignored before evaluation', () => {
    const records = [
      null,
      { effective_steps: 12000 }, // no date
      { date: '', effective_steps: 12000 }, // empty date
      { date: '2026-01-01', effective_steps: 12000 }, // valid
    ];
    expect(computeHallOfFame(records, 10000)).toEqual([
      { startDate: '2026-01-01', endDate: '2026-01-01', days: 1 },
    ]);
  });

  it('non-finite effective_steps reads as 0 and fails the day (SF-13)', () => {
    const records = [
      { date: '2026-01-01', effective_steps: 12000 },
      { date: '2026-01-02', effective_steps: NaN },
      { date: '2026-01-03', effective_steps: 12000 },
    ];
    expect(() => computeHallOfFame(records, 10000)).not.toThrow();
    expect(computeHallOfFame(records, 10000).every((p) => p.days === 1)).toBe(true);
  });

  it('non-finite stepGoal falls open to DEFAULT_STEP_GOAL (10000)', () => {
    const records = [
      { date: '2026-01-01', effective_steps: 12000 },
      { date: '2026-01-02', effective_steps: 8000 },
      { date: '2026-01-03', effective_steps: 12000 },
    ];
    const expected = computeHallOfFame(records, DEFAULT_STEP_GOAL);
    expect(DEFAULT_STEP_GOAL).toBe(10000);
    expect(expected).toEqual([
      { startDate: '2026-01-03', endDate: '2026-01-03', days: 1 },
      { startDate: '2026-01-01', endDate: '2026-01-01', days: 1 },
    ]);
    expect(computeHallOfFame(records, NaN)).toEqual(expected);
    expect(computeHallOfFame(records, undefined)).toEqual(expected);
    expect(computeHallOfFame(records, Infinity)).toEqual(expected);
  });

  it('non-positive stepGoal falls open to DEFAULT_STEP_GOAL', () => {
    const records = [
      { date: '2026-01-01', effective_steps: 12000 },
      { date: '2026-01-02', effective_steps: 8000 },
    ];
    const expected = computeHallOfFame(records, DEFAULT_STEP_GOAL);
    expect(computeHallOfFame(records, 0)).toEqual(expected);
    expect(computeHallOfFame(records, -5000)).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// computeLifetimeCompliance(records, stepGoal) — SF-4d
// ---------------------------------------------------------------------------
describe('computeLifetimeCompliance — shape and re-basing', () => {
  it('returns exactly { metDays, totalDays, pct }', () => {
    const result = computeLifetimeCompliance(
      [
        { date: '2026-01-01', effective_steps: 12000 },
        { date: '2026-01-02', effective_steps: 8000 },
      ],
      10000,
    );
    expect(Object.keys(result).sort()).toEqual(['metDays', 'pct', 'totalDays']);
    expect(result).toStrictEqual({ metDays: 1, totalDays: 2, pct: 50 });
  });

  it('AC Scenario 4 — 40 of 100 days at the active goal', () => {
    const records = [
      ...buildPeriod('2026-01-01', 40, 10000), // exactly at goal
      ...buildPeriod('2026-02-10', 60, 5000), // below goal
    ];
    expect(computeLifetimeCompliance(records, 10000)).toStrictEqual({
      metDays: 40,
      totalDays: 100,
      pct: 40,
    });
  });

  it('the same record set re-bases on the goal', () => {
    const records = [
      ...buildPeriod('2026-01-01', 4, 12000),
      ...buildPeriod('2026-01-05', 6, 6000),
    ];
    expect(computeLifetimeCompliance(records, 10000)).toStrictEqual({
      metDays: 4,
      totalDays: 10,
      pct: 40,
    });
    expect(computeLifetimeCompliance(records, 5000)).toStrictEqual({
      metDays: 10,
      totalDays: 10,
      pct: 100,
    });
  });

  it('pct is not rounded (1 of 3 days → 33.33…)', () => {
    const records = [
      { date: '2026-01-01', effective_steps: 12000 },
      { date: '2026-01-02', effective_steps: 5000 },
      { date: '2026-01-03', effective_steps: 5000 },
    ];
    expect(computeLifetimeCompliance(records, 10000).pct).toBeCloseTo(33.333, 2);
  });
});

describe('computeLifetimeCompliance — guards (SF-13, division-by-zero)', () => {
  it('empty records → pct is 0, never NaN', () => {
    const result = computeLifetimeCompliance([], 10000);
    expect(result).toStrictEqual({ metDays: 0, totalDays: 0, pct: 0 });
    expect(Number.isNaN(result.pct)).toBe(false);
    expect(Number.isFinite(result.pct)).toBe(true);
  });

  it('null/undefined records → { metDays: 0, totalDays: 0, pct: 0 } (guard)', () => {
    expect(computeLifetimeCompliance(null, 10000)).toStrictEqual({ metDays: 0, totalDays: 0, pct: 0 });
    expect(computeLifetimeCompliance(undefined, 10000)).toStrictEqual({ metDays: 0, totalDays: 0, pct: 0 });
  });

  it('non-finite effective_steps never counts as met but still counts in totalDays', () => {
    const records = [
      { date: '2026-01-01', effective_steps: NaN },
      { date: '2026-01-02', effective_steps: Infinity },
      { date: '2026-01-03', effective_steps: undefined },
      { date: '2026-01-04', effective_steps: 12000 },
    ];
    expect(computeLifetimeCompliance(records, 10000)).toStrictEqual({
      metDays: 1,
      totalDays: 4,
      pct: 25,
    });
  });

  it('null entries count in totalDays but never as met', () => {
    const records = [null, { date: '2026-01-02', effective_steps: 12000 }];
    expect(computeLifetimeCompliance(records, 10000)).toStrictEqual({
      metDays: 1,
      totalDays: 2,
      pct: 50,
    });
  });

  it('non-finite or non-positive stepGoal falls open to DEFAULT_STEP_GOAL', () => {
    const records = [
      { date: '2026-01-01', effective_steps: 12000 },
      { date: '2026-01-02', effective_steps: 8000 },
    ];
    const expected = computeLifetimeCompliance(records, DEFAULT_STEP_GOAL);
    expect(expected).toStrictEqual({ metDays: 1, totalDays: 2, pct: 50 });
    expect(computeLifetimeCompliance(records, NaN)).toStrictEqual(expected);
    expect(computeLifetimeCompliance(records, 0)).toStrictEqual(expected);
    expect(computeLifetimeCompliance(records, -1)).toStrictEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// createStreak(db, goal) — data orchestration on the step lens
// ---------------------------------------------------------------------------
describe('createStreak(db, goal) — data orchestration', () => {
  const NOW = '2026-08-10';

  function makeMockDb(records = []) {
    return {
      daily_records: { toArray: vi.fn().mockResolvedValue(records) },
      // Present but must never be touched — the legacy read path is gone (SF-4a).
      goal_history: { toArray: vi.fn().mockResolvedValue([]) },
      settings: { get: vi.fn().mockResolvedValue(null) },
    };
  }

  function makeMockGoal(stepGoal = DEFAULT_STEP_GOAL) {
    return { getActiveStepGoal: vi.fn().mockResolvedValue(stepGoal) };
  }

  beforeEach(() => {
    // Pin _localDate() to NOW so filtering and compute are deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads daily_records.toArray() and goal.getActiveStepGoal() exactly once each', async () => {
    const db = makeMockDb();
    const goal = makeMockGoal();
    await createStreak(db, goal).compute();
    expect(db.daily_records.toArray).toHaveBeenCalledTimes(1);
    expect(goal.getActiveStepGoal).toHaveBeenCalledTimes(1);
  });

  it('never calls db.goal_history.toArray() and never calls db.settings.get("active_goal")', async () => {
    const db = makeMockDb([{ date: '2026-08-09', effective_steps: 12000 }]);
    const goal = makeMockGoal(10000);
    await createStreak(db, goal).compute();
    expect(db.goal_history.toArray).not.toHaveBeenCalled();
    expect(db.settings.get).not.toHaveBeenCalled();
  });

  it('compute() resolves the exact 5-key payload', async () => {
    const db = makeMockDb();
    const goal = makeMockGoal();
    const result = await createStreak(db, goal).compute();
    expect(Object.keys(result).sort()).toEqual(
      ['activeStepGoal', 'hallOfFame', 'lifetime', 'tiers', 'tolerance'].sort(),
    );
  });

  it('tolerance matches a direct computeToleranceStreaks call on the same fixture', async () => {
    const records = buildPeriod(shiftDate(NOW, -11), 12, 12000); // NOW-11 .. NOW
    const db = makeMockDb(records);
    const goal = makeMockGoal(7500);
    const result = await createStreak(db, goal).compute();
    expect(result.tolerance).toStrictEqual(computeToleranceStreaks(records, 7500, NOW));
    expect(result.tolerance).toStrictEqual({ actual: 12, allowance95: 12, allowance90: 12 });
  });

  it('tiers, hallOfFame and lifetime match direct calls on the same fixture', async () => {
    const records = buildPeriod(shiftDate(NOW, -5), 6, 12000);
    const db = makeMockDb(records);
    const goal = makeMockGoal(10000);
    const result = await createStreak(db, goal).compute();
    expect(result.tiers).toStrictEqual(computeTierStreaks(records, NOW));
    expect(result.hallOfFame).toStrictEqual(computeHallOfFame(records, 10000));
    expect(result.lifetime).toStrictEqual(computeLifetimeCompliance(records, 10000));
  });

  it('activeStepGoal echoes the goal collaborator value', async () => {
    const db = makeMockDb();
    const result = await createStreak(db, makeMockGoal(15000)).compute();
    expect(result.activeStepGoal).toBe(15000);
  });

  it('a corrupt collaborator goal falls open to DEFAULT_STEP_GOAL for both the label and the math', async () => {
    const db = makeMockDb([{ date: '2026-08-09', effective_steps: 12000 }]);
    const result = await createStreak(db, makeMockGoal(NaN)).compute();
    expect(result.activeStepGoal).toBe(DEFAULT_STEP_GOAL);
    expect(result.lifetime).toStrictEqual(
      computeLifetimeCompliance([{ date: '2026-08-09', effective_steps: 12000 }], DEFAULT_STEP_GOAL),
    );
  });

  it('zero-state DB → zero tolerance, zero tiers, empty hallOfFame, zero lifetime', async () => {
    const db = makeMockDb([]);
    const result = await createStreak(db, makeMockGoal()).compute();
    expect(result.tolerance).toStrictEqual({ actual: 0, allowance95: 0, allowance90: 0 });
    expect(result.hallOfFame).toEqual([]);
    expect(result.lifetime).toStrictEqual({ metDays: 0, totalDays: 0, pct: 0 });
    expect(result.tiers).toHaveLength(STEP_GOAL_OPTIONS.length);
    result.tiers.forEach(({ active, best }) => {
      expect(active).toBe(0);
      expect(best).toBe(0);
    });
  });

  it('future-dated records (date > today) are filtered out before compute (clock skew)', async () => {
    const db = makeMockDb([
      { date: '2026-08-09', effective_steps: 12000 },
      { date: '2026-08-11', effective_steps: 12000 }, // future
    ]);
    const result = await createStreak(db, makeMockGoal(10000)).compute();
    expect(result.lifetime.totalDays).toBe(1);
  });

  it('today-dated record (date === today) is kept, not filtered', async () => {
    const db = makeMockDb([{ date: NOW, effective_steps: 12000 }]);
    const result = await createStreak(db, makeMockGoal(10000)).compute();
    expect(result.lifetime.totalDays).toBe(1);
    expect(result.tolerance.actual).toBe(1);
  });

  it('non-array daily_records payload → zero-state payload (guard)', async () => {
    const db = makeMockDb(null);
    const result = await createStreak(db, makeMockGoal()).compute();
    expect(result.lifetime).toStrictEqual({ metDays: 0, totalDays: 0, pct: 0 });
    expect(result.hallOfFame).toEqual([]);
  });

  it('daily_records.toArray() rejecting → compute() rejects (never swallowed)', async () => {
    const db = makeMockDb();
    db.daily_records.toArray = vi.fn().mockRejectedValue(new Error('DB read failed'));
    await expect(createStreak(db, makeMockGoal()).compute()).rejects.toThrow('DB read failed');
  });

  it('goal.getActiveStepGoal() rejecting → compute() rejects (never swallowed)', async () => {
    const goal = { getActiveStepGoal: vi.fn().mockRejectedValue(new Error('Goal read failed')) };
    await expect(createStreak(makeMockDb(), goal).compute()).rejects.toThrow('Goal read failed');
  });

  // ── effective_* field regression (ST-006 Task 7, step lens) ─────────────
  it('classifies a day using effective_steps, not original_steps', async () => {
    const db = makeMockDb([
      {
        date: '2026-08-09',
        original_steps: 1000, // below goal on original
        effective_steps: 12000, // above goal on effective
        is_overridden: true,
      },
    ]);
    const result = await createStreak(db, makeMockGoal(10000)).compute();
    expect(result.tolerance.actual).toBe(1);
  });

  it('Missed→Met override via effective_steps extends the actual streak', async () => {
    const db = makeMockDb([
      { date: '2026-08-08', original_steps: 12000, effective_steps: 12000, is_overridden: false },
      { date: '2026-08-09', original_steps: 800, effective_steps: 11000, is_overridden: true },
    ]);
    const result = await createStreak(db, makeMockGoal(10000)).compute();
    expect(result.tolerance.actual).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Legacy surface removal (SF-4a) — grep- and namespace-verifiable
// ---------------------------------------------------------------------------
describe('streak.js legacy surface removal (SF-4a/SF-4d)', () => {
  it('does not export computeUnifiedStreak', () => {
    expect(Object.keys(streakModule)).not.toContain('computeUnifiedStreak');
    expect(streakModule.computeUnifiedStreak).toBeUndefined();
  });

  it('does not re-export resolveGoalForDate', () => {
    expect(Object.keys(streakModule)).not.toContain('resolveGoalForDate');
    expect(streakModule.resolveGoalForDate).toBeUndefined();
  });

  it('does not export computeLifetime10k or LIFETIME_STEP_THRESHOLD', () => {
    expect(Object.keys(streakModule)).not.toContain('computeLifetime10k');
    expect(Object.keys(streakModule)).not.toContain('LIFETIME_STEP_THRESHOLD');
  });

  it('src/streak.js source no longer references the removed identifiers', () => {
    expect(streakSource).not.toMatch(/\bcomputeUnifiedStreak\b/);
    expect(streakSource).not.toMatch(/\bresolveGoalForDate\b/);
    expect(streakSource).not.toMatch(/\bcomputeLifetime10k\b/);
    expect(streakSource).not.toMatch(/\bLIFETIME_STEP_THRESHOLD\b/);
  });

  it('src/streak.js no longer imports from goal-history.js (SF-3)', () => {
    expect(streakSource).not.toMatch(/goal-history\.js/);
    expect(streakSource).not.toMatch(/\bbuildEffectiveGoalHistory\b/);
    expect(streakSource).not.toMatch(/\b_prepareGoalHistory\b/);
  });

  it('src/streak.js carries no effective-from / date-scoped goal resolution (SF-3)', () => {
    expect(streakSource).not.toMatch(/\beffective_from\b/);
  });
});
// ---------------------------------------------------------------------------
// computeToleranceStreaks — 3-metric backward tolerance engine (SF-5/6/7)
// ---------------------------------------------------------------------------

const TODAY = '2026-08-12';
const STEP_GOAL = 10000;
const ZERO_SHAPE = { actual: 0, allowance95: 0, allowance90: 0 };

/**
 * Builds `count` consecutive daily_records ending at `today` (inclusive).
 * Index 0 is `today` (depth d = 1), index i is `today - i` (depth d = i + 1).
 */
function makeRecords(today, count, steps) {
  const records = [];
  for (let i = 0; i < count; i += 1) {
    records.push({ date: shiftDate(today, -i), effective_steps: steps });
  }
  return records;
}

/** AC Scenario 2 fixture: 39 dense days, the 20th day back scoring 4,000 steps. */
function acScenario2() {
  const records = makeRecords(TODAY, 39, 12000);
  records[19] = { date: shiftDate(TODAY, -19), effective_steps: 4000 };
  return records;
}

describe('computeToleranceStreaks — constants', () => {
  it('exposes the allowance windows as UPPER_SNAKE_CASE constants', () => {
    expect(ALLOWANCE_WINDOW_95).toBe(20);
    expect(ALLOWANCE_WINDOW_90).toBe(10);
  });
});

describe('computeToleranceStreaks — AC Scenario 2', () => {
  it('39 dense days with a single shortfall at depth 20 → 19 / 39 / 39', () => {
    expect(computeToleranceStreaks(acScenario2(), STEP_GOAL, TODAY)).toStrictEqual({
      actual: 19,
      allowance95: 39,
      allowance90: 39,
    });
  });

  it('never grows past the earliest record date (earliestRecordDate lower bound)', () => {
    const result = computeToleranceStreaks(acScenario2(), STEP_GOAL, TODAY);
    // Without the lower bound the allowance engines would keep walking into
    // pre-history and inflate beyond the 39 days of data that exist.
    expect(result.allowance95).toBeLessThanOrEqual(39);
    expect(result.allowance90).toBeLessThanOrEqual(39);
    expect(result.actual).toBeLessThanOrEqual(39);
  });
});

describe('computeToleranceStreaks — SF-6 today anchor', () => {
  it('counts today when a record exists and meets the goal', () => {
    const records = makeRecords(TODAY, 10, 12000);
    expect(computeToleranceStreaks(records, STEP_GOAL, TODAY)).toStrictEqual({
      actual: 10,
      allowance95: 10,
      allowance90: 10,
    });
  });

  it('anchors at yesterday when today has no record, charging no miss for today', () => {
    // 10 records covering yesterday back through today-10; today absent.
    const records = makeRecords(shiftDate(TODAY, -1), 10, 12000);
    expect(computeToleranceStreaks(records, STEP_GOAL, TODAY)).toStrictEqual({
      actual: 10,
      allowance95: 10,
      allowance90: 10,
    });
  });

  it('anchors at yesterday when today is present but below goal, charging no miss', () => {
    const records = makeRecords(shiftDate(TODAY, -1), 10, 12000);
    records.push({ date: TODAY, effective_steps: 5000 }); // in-progress, below goal
    expect(computeToleranceStreaks(records, STEP_GOAL, TODAY)).toStrictEqual({
      actual: 10,
      allowance95: 10,
      allowance90: 10,
    });
  });
});

describe('computeToleranceStreaks — SF-5 missing / corrupt past days', () => {
  it('a missing past day terminates actual but is absorbed by both allowance engines', () => {
    const records = makeRecords(TODAY, 39, 12000);
    records.splice(19, 1); // remove the 20th day back entirely (calendar gap)
    expect(computeToleranceStreaks(records, STEP_GOAL, TODAY)).toStrictEqual({
      actual: 19,
      allowance95: 39,
      allowance90: 39,
    });
  });

  it('a present record with non-finite effective_steps behaves like a missing day', () => {
    const withNaN = makeRecords(TODAY, 39, 12000);
    withNaN[19] = { date: shiftDate(TODAY, -19), effective_steps: NaN };

    const missing = makeRecords(TODAY, 39, 12000);
    missing.splice(19, 1);

    expect(computeToleranceStreaks(withNaN, STEP_GOAL, TODAY)).toStrictEqual(
      computeToleranceStreaks(missing, STEP_GOAL, TODAY),
    );
    expect(computeToleranceStreaks(withNaN, STEP_GOAL, TODAY)).toStrictEqual({
      actual: 19,
      allowance95: 39,
      allowance90: 39,
    });
  });
});

describe('computeToleranceStreaks — SF-7 future-dated records', () => {
  it('ignores records dated after today', () => {
    const clean = makeRecords(TODAY, 10, 12000);
    const polluted = [
      ...makeRecords(TODAY, 10, 12000),
      { date: shiftDate(TODAY, 1), effective_steps: 99999 },
      { date: shiftDate(TODAY, 5), effective_steps: 99999 },
    ];
    expect(computeToleranceStreaks(polluted, STEP_GOAL, TODAY)).toStrictEqual(
      computeToleranceStreaks(clean, STEP_GOAL, TODAY),
    );
    expect(computeToleranceStreaks(polluted, STEP_GOAL, TODAY)).toStrictEqual({
      actual: 10,
      allowance95: 10,
      allowance90: 10,
    });
  });

  it('returns the zero shape when every record is future-dated', () => {
    const records = [{ date: shiftDate(TODAY, 1), effective_steps: 99999 }];
    expect(computeToleranceStreaks(records, STEP_GOAL, TODAY)).toStrictEqual(ZERO_SHAPE);
  });
});

describe('computeToleranceStreaks — allowance exhaustion', () => {
  it('freezes allowance95 at the last qualifying depth while allowance90 continues', () => {
    // Misses at depth 20 and depth 25 across 39 dense days.
    const records = makeRecords(TODAY, 39, 12000);
    records[19] = { date: shiftDate(TODAY, -19), effective_steps: 4000 };
    records[24] = { date: shiftDate(TODAY, -24), effective_steps: 4000 };

    // 95%: d=20 → m=1 <= floor(20/20)=1 (ok, last_valid=20…24);
    //      d=25 → m=2 > floor(25/20)=1 → frozen at 24.
    // 90%: d=25 → m=2 <= floor(25/10)=2 → continues to 39.
    expect(computeToleranceStreaks(records, STEP_GOAL, TODAY)).toStrictEqual({
      actual: 19,
      allowance95: 24,
      allowance90: 39,
    });
  });

  it('a miss shallower than the allowance window freezes every allowance engine', () => {
    const records = makeRecords(TODAY, 10, 12000);
    records[4] = { date: shiftDate(TODAY, -4), effective_steps: 100 }; // depth 5
    // floor(5/20) = 0 and floor(5/10) = 0 → no allowance available yet.
    expect(computeToleranceStreaks(records, STEP_GOAL, TODAY)).toStrictEqual({
      actual: 4,
      allowance95: 4,
      allowance90: 4,
    });
  });
});

describe('computeToleranceStreaks — guard clauses', () => {
  it('returns the zero shape for an empty record array', () => {
    expect(computeToleranceStreaks([], STEP_GOAL, TODAY)).toStrictEqual(ZERO_SHAPE);
  });

  it('returns the zero shape for null / non-array records', () => {
    expect(computeToleranceStreaks(null, STEP_GOAL, TODAY)).toStrictEqual(ZERO_SHAPE);
    expect(computeToleranceStreaks(undefined, STEP_GOAL, TODAY)).toStrictEqual(ZERO_SHAPE);
    expect(computeToleranceStreaks({}, STEP_GOAL, TODAY)).toStrictEqual(ZERO_SHAPE);
  });

  it('returns the zero shape for an empty or non-string today', () => {
    const records = makeRecords(TODAY, 10, 12000);
    expect(computeToleranceStreaks(records, STEP_GOAL, '')).toStrictEqual(ZERO_SHAPE);
    expect(computeToleranceStreaks(records, STEP_GOAL, undefined)).toStrictEqual(ZERO_SHAPE);
    expect(computeToleranceStreaks(records, STEP_GOAL, 20260812)).toStrictEqual(ZERO_SHAPE);
  });

  it('fails open to DEFAULT_STEP_GOAL for a non-positive or non-finite stepGoal', () => {
    const above = makeRecords(TODAY, 5, DEFAULT_STEP_GOAL + 2000);
    const below = makeRecords(TODAY, 5, DEFAULT_STEP_GOAL - 2000);

    for (const badGoal of [0, -1, NaN, Infinity, null, undefined, '10000']) {
      expect(computeToleranceStreaks(above, badGoal, TODAY)).toStrictEqual({
        actual: 5,
        allowance95: 5,
        allowance90: 5,
      });
      // Proves DEFAULT_STEP_GOAL was applied — a goal of 0 would pass every day.
      expect(computeToleranceStreaks(below, badGoal, TODAY)).toStrictEqual(ZERO_SHAPE);
    }
  });

  it('skips unusable rows without throwing', () => {
    const records = [
      null,
      { effective_steps: 12000 },
      { date: '', effective_steps: 12000 },
      ...makeRecords(TODAY, 3, 12000),
    ];
    expect(computeToleranceStreaks(records, STEP_GOAL, TODAY)).toStrictEqual({
      actual: 3,
      allowance95: 3,
      allowance90: 3,
    });
  });
});

describe('_isValidRecord', () => {
  it('accepts a row with a non-empty string date', () => {
    expect(_isValidRecord({ date: '2026-08-12' })).toBe(true);
  });

  it('rejects null, non-objects, missing dates and empty dates', () => {
    expect(_isValidRecord(null)).toBe(false);
    expect(_isValidRecord(undefined)).toBe(false);
    expect(_isValidRecord('2026-08-12')).toBe(false);
    expect(_isValidRecord({})).toBe(false);
    expect(_isValidRecord({ date: '' })).toBe(false);
    expect(_isValidRecord({ date: 20260812 })).toBe(false);
  });
});
