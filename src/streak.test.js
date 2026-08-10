/**
 * Tests for src/streak.js — pure streak computation.
 * Inline fixture builders only (no factory library), mirroring progress.test.js.
 */

import {
  TIER_THRESHOLDS,
  LIFETIME_STEP_THRESHOLD,
  HALL_OF_FAME_SIZE,
  _addDaysUtc,
  _sortByDate,
  resolveGoalForDate,
  computeUnifiedStreak,
  computeTierStreaks,
} from './streak.js';
import { DEFAULT_GOAL_KM } from './goal.js';

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

/** Builds `count` consecutive daily_records ending `endOffset` days before `today`. */
function buildRecords(today, count, km, endOffset = 1) {
  const records = [];
  for (let i = 0; i < count; i += 1) {
    records.push({
      date: shiftDate(today, -(endOffset + i)),
      effective_steps: Math.round(km * 1312.33),
      effective_distance_km: km,
    });
  }
  return records;
}

/** Builds a goal_history row. */
function goalRow(effective_from, km) {
  return {
    effective_from,
    target_distance_km: km,
    target_steps: Math.round(km * 1312.33),
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe('streak constants', () => {
  it('TIER_THRESHOLDS deep-equals [1.0, 3.0, 5.0, 10.0]', () => {
    expect(TIER_THRESHOLDS).toEqual([1.0, 3.0, 5.0, 10.0]);
  });

  it('LIFETIME_STEP_THRESHOLD is 10000', () => {
    expect(LIFETIME_STEP_THRESHOLD).toBe(10_000);
  });

  it('HALL_OF_FAME_SIZE is 3', () => {
    expect(HALL_OF_FAME_SIZE).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// _addDaysUtc
// ---------------------------------------------------------------------------
describe('_addDaysUtc', () => {
  it('crosses a leap-year month boundary backwards (2024-03-01 − 1 → 2024-02-29)', () => {
    expect(_addDaysUtc('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('crosses a non-leap-year month boundary backwards (2023-03-01 − 1 → 2023-02-28)', () => {
    expect(_addDaysUtc('2023-03-01', -1)).toBe('2023-02-28');
  });

  it('crosses a year boundary backwards (2024-01-01 − 1 → 2023-12-31)', () => {
    expect(_addDaysUtc('2024-01-01', -1)).toBe('2023-12-31');
  });

  it('crosses a year boundary forwards (2023-12-31 + 1 → 2024-01-01)', () => {
    expect(_addDaysUtc('2023-12-31', 1)).toBe('2024-01-01');
  });

  it('zero-pads single-digit month and day', () => {
    expect(_addDaysUtc('2024-02-10', -1)).toBe('2024-02-09');
    expect(_addDaysUtc('2024-01-10', 0)).toBe('2024-01-10');
    expect(_addDaysUtc('2024-01-10', -1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is timezone-safe across DST transitions (component parsing + Date.UTC)', () => {
    // US DST start (2024-03-10) and end (2024-11-03): a local-time based
    // implementation would skip or repeat a day here.
    expect(_addDaysUtc('2024-03-10', -1)).toBe('2024-03-09');
    expect(_addDaysUtc('2024-03-10', 1)).toBe('2024-03-11');
    expect(_addDaysUtc('2024-11-03', -1)).toBe('2024-11-02');
    expect(_addDaysUtc('2024-11-03', 1)).toBe('2024-11-04');
  });

  it('matches an independent Date.UTC computation for a long backwards walk', () => {
    let d = '2024-03-05';
    for (let i = 1; i <= 400; i += 1) {
      d = _addDaysUtc(d, -1);
      expect(d).toBe(shiftDate('2024-03-05', -i));
    }
  });
});

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
// resolveGoalForDate
// ---------------------------------------------------------------------------
describe('resolveGoalForDate', () => {
  it('returns the latest entry with effective_from <= date', () => {
    const history = [goalRow('2026-01-01', 3.0), goalRow('2026-02-01', 5.0)];
    expect(resolveGoalForDate(history, '2026-01-15')).toBe(3.0);
    expect(resolveGoalForDate(history, '2026-02-01')).toBe(5.0);
    expect(resolveGoalForDate(history, '2026-03-10')).toBe(5.0);
  });

  it('sorts unsorted goalHistory internally', () => {
    const history = [goalRow('2026-03-01', 10.0), goalRow('2026-01-01', 3.0), goalRow('2026-02-01', 5.0)];
    expect(resolveGoalForDate(history, '2026-02-15')).toBe(5.0);
    expect(resolveGoalForDate(history, '2026-12-31')).toBe(10.0);
  });

  it('dates before the earliest entry resolve to the earliest entry (seed baseline, SF-1)', () => {
    const history = [goalRow('2026-05-01', 5.0), goalRow('2026-06-01', 10.0)];
    expect(resolveGoalForDate(history, '2026-01-01')).toBe(5.0);
  });

  it('same-day overwrite: the later entry for an identical effective_from governs', () => {
    const history = [goalRow('2026-01-01', 3.0), goalRow('2026-01-01', 7.0)];
    expect(resolveGoalForDate(history, '2026-01-01')).toBe(7.0);
    expect(resolveGoalForDate(history, '2026-01-05')).toBe(7.0);
  });

  it('empty goalHistory → DEFAULT_GOAL_KM (SF-12 guard)', () => {
    expect(resolveGoalForDate([], '2026-01-01')).toBe(DEFAULT_GOAL_KM);
    expect(DEFAULT_GOAL_KM).toBe(3.0);
  });

  it('non-array goalHistory → DEFAULT_GOAL_KM (guard)', () => {
    expect(resolveGoalForDate(null, '2026-01-01')).toBe(DEFAULT_GOAL_KM);
    expect(resolveGoalForDate(undefined, '2026-01-01')).toBe(DEFAULT_GOAL_KM);
  });

  it('ignores corrupt rows and falls back when none are usable (SF-13 guard)', () => {
    const corrupt = [null, { effective_from: '2026-01-01' }, { target_distance_km: 5 }, { effective_from: '2026-01-01', target_distance_km: NaN }];
    expect(resolveGoalForDate(corrupt, '2026-06-01')).toBe(DEFAULT_GOAL_KM);
  });

  it('ignores corrupt rows but still uses the valid ones', () => {
    const mixed = [{ effective_from: '2026-01-01', target_distance_km: Infinity }, goalRow('2026-01-02', 5.0)];
    expect(resolveGoalForDate(mixed, '2026-06-01')).toBe(5.0);
  });
});

// ---------------------------------------------------------------------------
// computeUnifiedStreak — AC Scenario 1 (goal change survival)
// ---------------------------------------------------------------------------
describe('computeUnifiedStreak — AC Scenario 1 (goal changed mid-history)', () => {
  const TODAY = '2026-08-10';

  it('a 30-day 3.0 km streak survives a 5.0 km goal change made today', () => {
    // 30 consecutive past days at 3.5 km: 2026-07-11 .. 2026-08-09
    const records = buildRecords(TODAY, 30, 3.5);
    expect(records[records.length - 1].date).toBe('2026-07-11');
    expect(records[0].date).toBe('2026-08-09');

    const goalHistory = [goalRow('2026-07-11', 3.0), goalRow(TODAY, 5.0)];

    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(30);
  });

  it('today at 3.5 km (below the new 5.0 km goal) still yields 30 — today is skipped', () => {
    const records = [
      { date: TODAY, effective_steps: 4593, effective_distance_km: 3.5 },
      ...buildRecords(TODAY, 30, 3.5),
    ];
    const goalHistory = [goalRow('2026-07-11', 3.0), goalRow(TODAY, 5.0)];

    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(30);
  });

  it('today at 5.2 km (meets the new 5.0 km goal) yields 31', () => {
    const records = [
      { date: TODAY, effective_steps: 6824, effective_distance_km: 5.2 },
      ...buildRecords(TODAY, 30, 3.5),
    ];
    const goalHistory = [goalRow('2026-07-11', 3.0), goalRow(TODAY, 5.0)];

    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(31);
  });
});

// ---------------------------------------------------------------------------
// computeUnifiedStreak — AC Scenario 2 (in-progress today)
// ---------------------------------------------------------------------------
describe('computeUnifiedStreak — AC Scenario 2 (in-progress today)', () => {
  const TODAY = '2026-08-10';
  const goalHistory = [goalRow('2026-08-01', 3.0)];

  it('today below goal → skip today, evaluate from yesterday', () => {
    const records = [
      { date: TODAY, effective_steps: 500, effective_distance_km: 0.4 },
      ...buildRecords(TODAY, 5, 3.2),
    ];
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(5);
  });

  it("today's record missing → in-progress skip, evaluate from yesterday", () => {
    const records = buildRecords(TODAY, 5, 3.2);
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(5);
  });

  it('today at 0.0 km with no prior passing day → 0', () => {
    const records = [
      { date: TODAY, effective_steps: 0, effective_distance_km: 0 },
      { date: '2026-08-09', effective_steps: 100, effective_distance_km: 0.08 },
    ];
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeUnifiedStreak — termination rules
// ---------------------------------------------------------------------------
describe('computeUnifiedStreak — termination', () => {
  const TODAY = '2026-08-10';
  const goalHistory = [goalRow('2026-07-01', 3.0)];

  it('a past failing day terminates the streak (rule 5)', () => {
    const records = [
      ...buildRecords(TODAY, 3, 4.0), // 2026-08-09, -08, -07 pass
      { date: '2026-08-06', effective_steps: 100, effective_distance_km: 0.5 }, // fails
      { date: '2026-08-05', effective_steps: 6000, effective_distance_km: 4.6 }, // never reached
      { date: '2026-08-04', effective_steps: 6000, effective_distance_km: 4.6 },
    ];
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(3);
  });

  it('a missing past record terminates the streak (SF-2, fail-closed)', () => {
    const records = [
      ...buildRecords(TODAY, 2, 4.0), // 2026-08-09, 2026-08-08
      // 2026-08-07 missing
      { date: '2026-08-06', effective_steps: 6000, effective_distance_km: 4.6 },
      { date: '2026-08-05', effective_steps: 6000, effective_distance_km: 4.6 },
    ];
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(2);
  });

  it('traversal stops at the earliest record date (no infinite walk)', () => {
    const records = [{ date: '2026-08-09', effective_steps: 6000, effective_distance_km: 4.6 }];
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(1);
  });

  it('today earlier than every record → 0', () => {
    const records = buildRecords('2026-08-10', 3, 4.0);
    expect(computeUnifiedStreak(records, goalHistory, '2026-01-01')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeUnifiedStreak — guards and boundaries
// ---------------------------------------------------------------------------
describe('computeUnifiedStreak — guards and boundaries', () => {
  const TODAY = '2026-08-10';
  const goalHistory = [goalRow('2026-07-01', 3.0)];

  it('non-finite effective_distance_km fails that past day (SF-13) without throwing', () => {
    const records = [
      ...buildRecords(TODAY, 2, 4.0), // 2026-08-09, 2026-08-08
      { date: '2026-08-07', effective_steps: 9000, effective_distance_km: NaN },
      { date: '2026-08-06', effective_steps: 6000, effective_distance_km: 4.6 },
    ];
    expect(() => computeUnifiedStreak(records, goalHistory, TODAY)).not.toThrow();
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(2);
  });

  it('non-finite effective_distance_km today is treated as 0 → today skipped', () => {
    const records = [
      { date: TODAY, effective_steps: 9000, effective_distance_km: undefined },
      ...buildRecords(TODAY, 4, 4.0),
    ];
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(4);
  });

  it('boundary-exact day passes — distance === G(D) uses >= (SF-8)', () => {
    const records = buildRecords(TODAY, 3, 3.0); // exactly the 3.0 km goal
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(3);
  });

  it('a hair below the goal fails', () => {
    const records = [
      { date: '2026-08-09', effective_steps: 3936, effective_distance_km: 2.999 },
      { date: '2026-08-08', effective_steps: 6000, effective_distance_km: 4.6 },
    ];
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(0);
  });

  it('dates before the earliest goal_history entry evaluate against the seed baseline (SF-1)', () => {
    // Seed entry is 5.0 km effective 2026-08-05; 2026-08-01..04 are pre-log dates.
    const seeded = [goalRow('2026-08-05', 5.0)];
    const records = [
      { date: '2026-08-09', effective_steps: 7000, effective_distance_km: 5.4 },
      { date: '2026-08-08', effective_steps: 7000, effective_distance_km: 5.4 },
      { date: '2026-08-07', effective_steps: 7000, effective_distance_km: 5.4 },
      { date: '2026-08-06', effective_steps: 7000, effective_distance_km: 5.4 },
      { date: '2026-08-05', effective_steps: 7000, effective_distance_km: 5.4 },
      // pre-log dates — evaluated against the 5.0 km seed, so 3.5 km fails
      { date: '2026-08-04', effective_steps: 4593, effective_distance_km: 3.5 },
      { date: '2026-08-03', effective_steps: 7000, effective_distance_km: 5.4 },
    ];
    expect(computeUnifiedStreak(records, seeded, TODAY)).toBe(5);
  });

  it('same-day goal overwrite is reflected in G(D)', () => {
    const history = [goalRow('2026-08-01', 3.0), goalRow('2026-08-01', 5.0)];
    const records = buildRecords(TODAY, 3, 3.5); // passes 3.0, fails 5.0
    expect(computeUnifiedStreak(records, history, TODAY)).toBe(0);
  });

  it('empty goalHistory → evaluated against DEFAULT_GOAL_KM (SF-12)', () => {
    const passing = buildRecords(TODAY, 4, 3.0); // exactly 3.0 km
    expect(computeUnifiedStreak(passing, [], TODAY)).toBe(4);

    const failing = buildRecords(TODAY, 4, 2.9);
    expect(computeUnifiedStreak(failing, [], TODAY)).toBe(0);
  });

  it('empty records → 0 (SF-12)', () => {
    expect(computeUnifiedStreak([], goalHistory, TODAY)).toBe(0);
  });

  it('non-array records → 0 (guard)', () => {
    expect(computeUnifiedStreak(null, goalHistory, TODAY)).toBe(0);
    expect(computeUnifiedStreak(undefined, goalHistory, TODAY)).toBe(0);
  });

  it('records with corrupt/absent date keys are ignored (guard)', () => {
    const records = [null, { effective_distance_km: 9 }, { date: 42, effective_distance_km: 9 }];
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(0);
  });

  it('invalid today → 0 (guard)', () => {
    expect(computeUnifiedStreak(buildRecords(TODAY, 3, 4.0), goalHistory, '')).toBe(0);
    expect(computeUnifiedStreak(buildRecords(TODAY, 3, 4.0), goalHistory, null)).toBe(0);
  });

  it('all-pass history → the total number of days', () => {
    const records = [
      { date: TODAY, effective_steps: 6000, effective_distance_km: 4.6 },
      ...buildRecords(TODAY, 9, 4.6),
    ];
    expect(records).toHaveLength(10);
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(10);
  });

  it('accepts unsorted records (sorted internally)', () => {
    const records = [
      { date: '2026-08-07', effective_steps: 6000, effective_distance_km: 4.6 },
      { date: '2026-08-09', effective_steps: 6000, effective_distance_km: 4.6 },
      { date: '2026-08-08', effective_steps: 6000, effective_distance_km: 4.6 },
    ];
    expect(computeUnifiedStreak(records, goalHistory, TODAY)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeTierStreaks — AC Scenario 3 (varying distances per tier)
// ---------------------------------------------------------------------------
describe('computeTierStreaks — AC Scenario 3 (varying distances per tier)', () => {
  const TODAY = '2026-08-10';

  /**
   * Fixture (distances chosen so active differs per tier):
   *   2026-08-06: 5.0 km — passes 1, 3, 5  (fails 10)
   *   2026-08-07: 2.0 km — passes 1         (fails 3, 5, 10)
   *   2026-08-08: 11.0 km — passes all
   *   2026-08-09: 6.0 km — passes 1, 3, 5  (fails 10)
   *   2026-08-10: 4.0 km — passes 1, 3     (fails 5, 10)
   *
   * Expected active (backward from today):
   *   1.0: 4≥1, 6≥1, 11≥1, 2≥1, 5≥1 → 5
   *   3.0: 4≥3, 6≥3, 11≥3, 2<3→stop → 3
   *   5.0: 4<5→skip today, 6≥5, 11≥5, 2<5→stop → 2
   *  10.0: 4<10→skip today, 6<10→stop → 0
   *
   * Expected best (full history scan):
   *   1.0: 5,2,11,6,4 all≥1 consecutively → 5
   *   3.0: 5≥3(1), 2<3(0), 11≥3(1), 6≥3(2), 4≥3(3) → 3
   *   5.0: 5≥5(1), 2<5(0), 11≥5(1), 6≥5(2), 4<5(0) → 2
   *  10.0: 5<10(0), 2<10(0), 11≥10(1), 6<10(0), 4<10(0) → 1
   */
  const RECORDS = [
    { date: '2026-08-06', effective_distance_km: 5.0, effective_steps: 6562 },
    { date: '2026-08-07', effective_distance_km: 2.0, effective_steps: 2625 },
    { date: '2026-08-08', effective_distance_km: 11.0, effective_steps: 14436 },
    { date: '2026-08-09', effective_distance_km: 6.0, effective_steps: 7874 },
    { date: '2026-08-10', effective_distance_km: 4.0, effective_steps: 5249 },
  ];

  it('returns four entries in TIER_THRESHOLDS order each with { threshold, active, best }', () => {
    const result = computeTierStreaks(RECORDS, TODAY);
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.threshold)).toEqual([1.0, 3.0, 5.0, 10.0]);
    result.forEach((entry) => {
      expect(entry).toHaveProperty('threshold');
      expect(entry).toHaveProperty('active');
      expect(entry).toHaveProperty('best');
    });
  });

  it('active streak for 1.0 km threshold = 5 (all five days pass)', () => {
    const result = computeTierStreaks(RECORDS, TODAY);
    expect(result[0]).toEqual({ threshold: 1.0, active: 5, best: 5 });
  });

  it('active streak for 3.0 km threshold = 3 (past 2.0 km day terminates)', () => {
    const result = computeTierStreaks(RECORDS, TODAY);
    expect(result[1]).toEqual({ threshold: 3.0, active: 3, best: 3 });
  });

  it('active streak for 5.0 km threshold = 2 (today skipped; past 2.0 km day terminates)', () => {
    const result = computeTierStreaks(RECORDS, TODAY);
    expect(result[2]).toEqual({ threshold: 5.0, active: 2, best: 2 });
  });

  it('active streak for 10.0 km threshold = 0; best = 1 (only 11 km day qualifies)', () => {
    const result = computeTierStreaks(RECORDS, TODAY);
    expect(result[3]).toEqual({ threshold: 10.0, active: 0, best: 1 });
  });
});

// ---------------------------------------------------------------------------
// computeTierStreaks — today skip rules (SF-9)
// ---------------------------------------------------------------------------
describe('computeTierStreaks — today skip rules (SF-9)', () => {
  const TODAY = '2026-08-10';
  const GOAL = { threshold: 3.0 };

  it('today below threshold → skip today, active count preserved from yesterday', () => {
    // 08-09 and 08-08 both pass (>= 3.0); 08-10 below
    const records = [
      { date: '2026-08-08', effective_distance_km: 4.0, effective_steps: 5249 },
      { date: '2026-08-09', effective_distance_km: 4.0, effective_steps: 5249 },
      { date: '2026-08-10', effective_distance_km: 1.0, effective_steps: 1312 }, // below 3.0
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier3 = result.find((r) => r.threshold === 3.0);
    expect(tier3.active).toBe(2); // only 08-09 and 08-08
  });

  it("today's record missing → skip today, active count preserved from yesterday", () => {
    // 08-09 and 08-08 pass; today (08-10) absent
    const records = [
      { date: '2026-08-08', effective_distance_km: 4.0, effective_steps: 5249 },
      { date: '2026-08-09', effective_distance_km: 4.0, effective_steps: 5249 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier3 = result.find((r) => r.threshold === 3.0);
    expect(tier3.active).toBe(2);
  });

  it('today at/above threshold → counted in active streak (SF-8 >=)', () => {
    // today passes exactly at threshold (boundary)
    const records = [
      { date: '2026-08-09', effective_distance_km: 3.0, effective_steps: 3937 },
      { date: '2026-08-10', effective_distance_km: 3.0, effective_steps: 3937 }, // exact
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier3 = result.find((r) => r.threshold === 3.0);
    expect(tier3.active).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// computeTierStreaks — active streak termination rules
// ---------------------------------------------------------------------------
describe('computeTierStreaks — active streak termination', () => {
  const TODAY = '2026-08-10';

  it('past failing day terminates the active streak', () => {
    // 08-10 & 08-09 pass (>= 3.0); 08-08 fails (1.5 < 3.0); 08-07 passes but unreachable
    const records = [
      { date: '2026-08-07', effective_distance_km: 5.0, effective_steps: 6562 },
      { date: '2026-08-08', effective_distance_km: 1.5, effective_steps: 1968 }, // fails
      { date: '2026-08-09', effective_distance_km: 4.0, effective_steps: 5249 },
      { date: '2026-08-10', effective_distance_km: 4.0, effective_steps: 5249 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier3 = result.find((r) => r.threshold === 3.0);
    expect(tier3.active).toBe(2); // only 08-10 and 08-09
  });

  it('past missing day terminates the active streak (SF-2 semantics)', () => {
    // 08-10 & 08-09 pass; 08-08 missing; 08-07 exists but unreachable
    const records = [
      { date: '2026-08-07', effective_distance_km: 4.0, effective_steps: 5249 },
      // 2026-08-08 missing
      { date: '2026-08-09', effective_distance_km: 4.0, effective_steps: 5249 },
      { date: '2026-08-10', effective_distance_km: 4.0, effective_steps: 5249 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier3 = result.find((r) => r.threshold === 3.0);
    expect(tier3.active).toBe(2); // only 08-10 and 08-09
  });
});

// ---------------------------------------------------------------------------
// computeTierStreaks — best-ever
// ---------------------------------------------------------------------------
describe('computeTierStreaks — best-ever', () => {
  const TODAY = '2026-08-10';

  it('best-ever spans a historical run that ended before today', () => {
    /**
     * Fixture for threshold 10.0:
     *   2026-07-01 .. 2026-07-05: 12 km each (5-day run, ends before today)
     *   2026-07-06: 0.5 km (fails — breaks best run)
     *   gap: 2026-07-07 .. 2026-08-08 missing
     *   2026-08-09: 12 km (active run of 1 day; today missing)
     */
    const records = [
      { date: '2026-07-01', effective_distance_km: 12.0, effective_steps: 15748 },
      { date: '2026-07-02', effective_distance_km: 12.0, effective_steps: 15748 },
      { date: '2026-07-03', effective_distance_km: 12.0, effective_steps: 15748 },
      { date: '2026-07-04', effective_distance_km: 12.0, effective_steps: 15748 },
      { date: '2026-07-05', effective_distance_km: 12.0, effective_steps: 15748 },
      { date: '2026-07-06', effective_distance_km: 0.5, effective_steps: 656 },
      { date: '2026-08-09', effective_distance_km: 12.0, effective_steps: 15748 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier10 = result.find((r) => r.threshold === 10.0);
    expect(tier10.active).toBe(1); // only 08-09 (today missing → skipped; 08-08 missing → terminate)
    expect(tier10.best).toBe(5);  // the historical run in July
  });

  it('single passing day yields best = 1', () => {
    const records = [
      { date: '2026-08-09', effective_distance_km: 11.0, effective_steps: 14436 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier10 = result.find((r) => r.threshold === 10.0);
    expect(tier10.best).toBe(1);
  });

  it('best run separated by a gap is not merged (calendar-consecutive only)', () => {
    // Three separate single days for threshold 5.0
    const records = [
      { date: '2026-08-05', effective_distance_km: 6.0, effective_steps: 7874 },
      { date: '2026-08-07', effective_distance_km: 6.0, effective_steps: 7874 }, // gap at 08-06
      { date: '2026-08-09', effective_distance_km: 6.0, effective_steps: 7874 }, // gap at 08-08
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier5 = result.find((r) => r.threshold === 5.0);
    expect(tier5.best).toBe(1); // non-consecutive — each is its own run of 1
  });

  it('all days pass every tier — active and best equal record length', () => {
    // 5 consecutive days all at 12 km (passes all four thresholds)
    const records = [
      { date: '2026-08-06', effective_distance_km: 12.0, effective_steps: 15748 },
      { date: '2026-08-07', effective_distance_km: 12.0, effective_steps: 15748 },
      { date: '2026-08-08', effective_distance_km: 12.0, effective_steps: 15748 },
      { date: '2026-08-09', effective_distance_km: 12.0, effective_steps: 15748 },
      { date: '2026-08-10', effective_distance_km: 12.0, effective_steps: 15748 },
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

  it('non-finite effective_distance_km is treated as 0 for every tier — no exception (SF-13)', () => {
    const records = [
      { date: '2026-08-09', effective_distance_km: NaN, effective_steps: 5000 },
      { date: '2026-08-10', effective_distance_km: Infinity, effective_steps: 5000 },
    ];
    expect(() => computeTierStreaks(records, TODAY)).not.toThrow();
    const result = computeTierStreaks(records, TODAY);
    // All km are non-finite → treated as 0 → fail every tier
    result.forEach(({ active, best }) => {
      expect(active).toBe(0);
      expect(best).toBe(0);
    });
  });

  it('boundary-exact day (distance === threshold) passes (SF-8 >=)', () => {
    // Record exactly at 5.0 km; today is yesterday (not today) so no skip rule
    const records = [
      { date: '2026-08-09', effective_distance_km: 5.0, effective_steps: 6562 },
      { date: '2026-08-10', effective_distance_km: 5.0, effective_steps: 6562 },
    ];
    const result = computeTierStreaks(records, TODAY);
    const tier5 = result.find((r) => r.threshold === 5.0);
    expect(tier5.active).toBe(2); // both days at exactly 5.0 pass
    expect(tier5.best).toBe(2);
  });

  it('records with corrupt/absent date keys are ignored (guard)', () => {
    const records = [
      null,
      { effective_distance_km: 12.0 }, // no date
      { date: '', effective_distance_km: 12.0 }, // empty date
      { date: '2026-08-09', effective_distance_km: 12.0, effective_steps: 15748 },
    ];
    const result = computeTierStreaks(records, TODAY);
    // Only the valid record counts
    const tier10 = result.find((r) => r.threshold === 10.0);
    expect(tier10.active).toBe(1);
    expect(tier10.best).toBe(1);
  });

  it('invalid today string → all zero (guard)', () => {
    const records = [
      { date: '2026-08-09', effective_distance_km: 12.0, effective_steps: 15748 },
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
      { effective_distance_km: 12.0 },       // missing date
      { date: 42, effective_distance_km: 12.0 }, // numeric date
      { date: '', effective_distance_km: 12.0 },  // empty date
    ];
    const result = computeTierStreaks(records, TODAY);
    expect(result).toHaveLength(4);
    result.forEach(({ active, best }) => {
      expect(active).toBe(0);
      expect(best).toBe(0);
    });
  });
});
