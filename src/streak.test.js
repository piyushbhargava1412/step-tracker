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
