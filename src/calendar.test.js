/**
 * Tests for src/calendar.js — pure calendar computation.
 * Inline fixture builders only (no factory library), mirroring streak.test.js.
 */

import {
  CLASSIFICATION_NO_DATA,
  CLASSIFICATION_MISSED,
  CLASSIFICATION_MET,
  CLASSIFICATION_EXCEEDED,
  MET_RATIO,
  EXCEEDED_RATIO,
  DAYS_PER_WEEK,
  monthBounds,
  buildMonthGrid,
  classifyDay,
  computeMonthlyAggregates,
  computeNavBounds,
  computeCommitmentHitRate,
  createCalendar,
} from './calendar.js';
import { DEFAULT_STEP_GOAL } from './goal.js';

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// monthBounds
// ---------------------------------------------------------------------------

describe('monthBounds', () => {
  it('mid-year month (July, 0-based 6) returns correct boundaries', () => {
    expect(monthBounds(2026, 6)).toEqual({
      start: '2026-07-01',
      endExclusive: '2026-08-01',
    });
  });

  it('January (month = 0)', () => {
    expect(monthBounds(2026, 0)).toEqual({
      start: '2026-01-01',
      endExclusive: '2026-02-01',
    });
  });

  it('December (month = 11) rolls to next year', () => {
    expect(monthBounds(2026, 11)).toEqual({
      start: '2026-12-01',
      endExclusive: '2027-01-01',
    });
  });
});

// ---------------------------------------------------------------------------
// buildMonthGrid
// ---------------------------------------------------------------------------

describe('buildMonthGrid', () => {
  const TODAY = '2026-08-10';

  it('month starting on Thursday — January 2026 (leadingPad === 3)', () => {
    const grid = buildMonthGrid(2026, 0, TODAY); // January 2026 starts on Thursday
    expect(grid.leadingPad).toBe(3);
  });

  it('month starting on Wednesday — April 2026 (leadingPad === 2)', () => {
    const grid = buildMonthGrid(2026, 3, TODAY); // April 2026 starts on Wednesday
    expect(grid.leadingPad).toBe(2);
  });

  it('month starting on Tuesday — September 2026 (leadingPad === 1)', () => {
    const grid = buildMonthGrid(2026, 8, TODAY); // September 2026 starts on Tuesday
    expect(grid.leadingPad).toBe(1);
  });

  it('month starting on Monday — June 2026 (leadingPad === 0)', () => {
    const grid = buildMonthGrid(2026, 5, TODAY); // June 2026 starts on Monday
    expect(grid.leadingPad).toBe(0);
  });

  it('month starting on Sunday — March 2026 (leadingPad === 6)', () => {
    const grid = buildMonthGrid(2026, 2, TODAY); // March 2026 starts on Sunday
    expect(grid.leadingPad).toBe(6);
  });

  it('February 2024 (leap year, 29 days)', () => {
    const grid = buildMonthGrid(2024, 1, '2024-02-15');
    expect(grid.days.length).toBe(29);
    expect((grid.leadingPad + 29 + grid.trailingPad) % 7).toBe(0);
  });

  it('February 2026 (28 days)', () => {
    const grid = buildMonthGrid(2026, 1, '2026-02-15');
    expect(grid.days.length).toBe(28);
    expect((grid.leadingPad + 28 + grid.trailingPad) % 7).toBe(0);
  });

  it('total cells is a multiple of 7', () => {
    for (let year = 2024; year <= 2028; year += 1) {
      for (let month = 0; month < 12; month += 1) {
        const grid = buildMonthGrid(year, month, '2026-08-10');
        const total = grid.leadingPad + grid.days.length + grid.trailingPad;
        expect(total % 7).toBe(0);
      }
    }
  });

  it('isFuture flag: today+1 is true, today is false', () => {
    const grid = buildMonthGrid(2026, 7, TODAY);
    const todayDay = grid.days.find((d) => d.date === TODAY);
    expect(todayDay.isFuture).toBe(false);
    const tomorrowDay = grid.days.find((d) => d.date === '2026-08-11');
    expect(tomorrowDay.isFuture).toBe(true);
  });

  it('every date matches YYYY-MM-DD format', () => {
    const grid = buildMonthGrid(2026, 7, TODAY);
    for (const day of grid.days) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// classifyDay (step lens — Task 10)
// ---------------------------------------------------------------------------

describe('classifyDay', () => {
  const STEP_GOAL = 10000;

  it('undefined record → state 0, isOverridden false', () => {
    expect(classifyDay(undefined, STEP_GOAL, false)).toEqual({ state: CLASSIFICATION_NO_DATA, isOverridden: false });
  });

  it('null record → state 0, isOverridden false', () => {
    expect(classifyDay(null, STEP_GOAL, false)).toEqual({ state: CLASSIFICATION_NO_DATA, isOverridden: false });
  });

  it('future date with a record → state 0, isOverridden false', () => {
    const record = { effective_steps: 15000 };
    expect(classifyDay(record, STEP_GOAL, true)).toEqual({ state: CLASSIFICATION_NO_DATA, isOverridden: false });
  });

  it('ratio exactly 1.0× → state 2 (Met)', () => {
    const record = { effective_steps: 10000 };
    expect(classifyDay(record, STEP_GOAL, false)).toEqual({ state: CLASSIFICATION_MET, isOverridden: false });
  });

  it('ratio just below 1.0× → state 1 (Missed)', () => {
    const record = { effective_steps: 9999 };
    expect(classifyDay(record, STEP_GOAL, false)).toEqual({ state: CLASSIFICATION_MISSED, isOverridden: false });
  });

  it('ratio exactly 1.5× → state 3 (Exceeded)', () => {
    const record = { effective_steps: 15000 };
    expect(classifyDay(record, STEP_GOAL, false)).toEqual({ state: CLASSIFICATION_EXCEEDED, isOverridden: false });
  });

  it('ratio just below 1.5× → state 2 (Met)', () => {
    const record = { effective_steps: 14999 };
    expect(classifyDay(record, STEP_GOAL, false)).toEqual({ state: CLASSIFICATION_MET, isOverridden: false });
  });

  it('effective_steps NaN → state 1 (Missed)', () => {
    const record = { effective_steps: NaN };
    expect(classifyDay(record, STEP_GOAL, false).state).toBe(CLASSIFICATION_MISSED);
  });

  it('effective_steps Infinity → state 1 (Missed)', () => {
    const record = { effective_steps: Infinity };
    expect(classifyDay(record, STEP_GOAL, false).state).toBe(CLASSIFICATION_MISSED);
  });

  it('stepGoal 0 → falls back to DEFAULT_STEP_GOAL', () => {
    const record = { effective_steps: DEFAULT_STEP_GOAL };
    expect(classifyDay(record, 0, false).state).toBe(
      classifyDay(record, DEFAULT_STEP_GOAL, false).state,
    );
  });

  it('stepGoal -1 → falls back to DEFAULT_STEP_GOAL', () => {
    const record = { effective_steps: DEFAULT_STEP_GOAL };
    expect(classifyDay(record, -1, false).state).toBe(
      classifyDay(record, DEFAULT_STEP_GOAL, false).state,
    );
  });

  it('stepGoal NaN → falls back to DEFAULT_STEP_GOAL', () => {
    const record = { effective_steps: DEFAULT_STEP_GOAL };
    expect(classifyDay(record, NaN, false).state).toBe(
      classifyDay(record, DEFAULT_STEP_GOAL, false).state,
    );
  });

  it('isOverridden: true on Missed, Met, and Exceeded', () => {
    const missed = { effective_steps: 1000, is_overridden: true };
    const met = { effective_steps: 10000, is_overridden: true };
    const exceeded = { effective_steps: 15000, is_overridden: true };

    expect(classifyDay(missed, STEP_GOAL, false).isOverridden).toBe(true);
    expect(classifyDay(met, STEP_GOAL, false).isOverridden).toBe(true);
    expect(classifyDay(exceeded, STEP_GOAL, false).isOverridden).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeMonthlyAggregates
// ---------------------------------------------------------------------------

describe('computeMonthlyAggregates', () => {
  function makeDay(options) {
    return {
      isFuture: options.isFuture || false,
      record: options.record || null,
      classification: options.classification || { state: CLASSIFICATION_NO_DATA },
    };
  }

  it('empty array → all metrics null', () => {
    const result = computeMonthlyAggregates([]);
    expect(result.daysEvaluated).toBe(0);
    expect(result.totalSteps).toBe(null);
    expect(result.totalDistanceKm).toBe(null);
    expect(result.averageDailySteps).toBe(null);
    expect(result.hitRatePct).toBe(null);
  });

  it('non-array input → same zero-denominator shape', () => {
    const result = computeMonthlyAggregates(null);
    expect(result.daysEvaluated).toBe(0);
    expect(result.totalSteps).toBe(null);
  });

  it('all-future month → daysEvaluated 0, all null', () => {
    const days = Array.from({ length: 30 }, (_, i) =>
      makeDay({ isFuture: true, record: { effective_steps: 5000, effective_distance_km: 5.0 } }),
    );
    const result = computeMonthlyAggregates(days);
    expect(result.daysEvaluated).toBe(0);
    expect(result.totalSteps).toBe(null);
  });

  it('past days with no record (no-data) excluded from daysEvaluated', () => {
    const days = Array.from({ length: 28 }, () =>
      makeDay({ isFuture: false, record: null }),
    );
    const result = computeMonthlyAggregates(days);
    expect(result.daysEvaluated).toBe(0);
    expect(result.totalSteps).toBe(null);
  });

  it('partial month: only recorded past days contribute', () => {
    const days = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeDay({
          isFuture: false,
          record: { effective_steps: 5000, effective_distance_km: 5.0 },
          classification: { state: CLASSIFICATION_MET },
        }),
      ),
      ...Array.from({ length: 5 }, () =>
        makeDay({ isFuture: true, record: null }),
      ),
      ...Array.from({ length: 5 }, () =>
        makeDay({ isFuture: false, record: null }),
      ),
    ];
    const result = computeMonthlyAggregates(days);
    expect(result.daysEvaluated).toBe(10);
    expect(result.targetMetDays).toBe(10);
    expect(result.hitRatePct).toBe(100);
  });

  it('no returned value is NaN or Infinity', () => {
    const days = [
      makeDay({
        isFuture: false,
        record: { effective_steps: 5000, effective_distance_km: 5.0 },
        classification: { state: CLASSIFICATION_MET },
      }),
    ];
    const result = computeMonthlyAggregates(days);
    for (const key of Object.keys(result)) {
      const val = result[key];
      if (val !== null) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });

  it('day with non-finite effective_steps counts toward daysEvaluated, contributes 0', () => {
    const days = [
      makeDay({
        isFuture: false,
        record: { effective_steps: NaN, effective_distance_km: 5.0 },
        classification: { state: CLASSIFICATION_MET },
      }),
    ];
    const result = computeMonthlyAggregates(days);
    expect(result.daysEvaluated).toBe(1);
    expect(result.totalSteps).toBe(0);
  });

  it('hitRatePct of 100 when all contributing days met', () => {
    const days = Array.from({ length: 5 }, () =>
      makeDay({
        isFuture: false,
        record: { effective_steps: 5000, effective_distance_km: 5.0 },
        classification: { state: CLASSIFICATION_MET },
      }),
    );
    const result = computeMonthlyAggregates(days);
    expect(result.hitRatePct).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// computeNavBounds
// ---------------------------------------------------------------------------

describe('computeNavBounds', () => {
  const TODAY = '2026-08-10';

  it('selection at current month → canGoNext false', () => {
    const result = computeNavBounds('2026-01-01', TODAY, 2026, 7);
    expect(result.canGoNext).toBe(false);
  });

  it('selection one month before current → canGoNext true', () => {
    const result = computeNavBounds('2026-01-01', TODAY, 2026, 6);
    expect(result.canGoNext).toBe(true);
  });

  it('selection at earliest-record month → canGoPrev false', () => {
    const result = computeNavBounds('2026-07-01', TODAY, 2026, 6);
    expect(result.canGoPrev).toBe(false);
  });

  it('selection one month after earliest-record → canGoPrev true', () => {
    const result = computeNavBounds('2026-01-01', TODAY, 2026, 2);
    expect(result.canGoPrev).toBe(true);
  });

  it('null earliestRecordDate → both flags false, single-year range', () => {
    const result = computeNavBounds(null, TODAY, 2026, 7);
    expect(result.canGoPrev).toBe(false);
    expect(result.canGoNext).toBe(false);
    expect(result.minYear).toBe(2026);
    expect(result.maxYear).toBe(2026);
  });

  it('earliest and current in same month → both flags false', () => {
    const result = computeNavBounds('2026-08-01', TODAY, 2026, 7);
    expect(result.canGoPrev).toBe(false);
    expect(result.canGoNext).toBe(false);
  });

  it('December selection with following-January today → canGoNext correct', () => {
    const janToday = '2027-01-10';
    const result = computeNavBounds('2026-01-01', janToday, 2026, 11);
    expect(result.canGoNext).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createCalendar — factory (Task 10 step lens)
// ---------------------------------------------------------------------------

describe('createCalendar — factory', () => {
  const TODAY = '2026-08-10';

  function makeMockDb({ records = [], earliestRecord = null } = {}) {
    return {
      daily_records: {
        where: vi.fn().mockReturnThis(),
        between: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(records),
        orderBy: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(earliestRecord),
      },
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('between() receives exact monthBounds values with (start, endExclusive, true, false)', async () => {
    const db = makeMockDb();
    const calendar = createCalendar(db, { getActiveStepGoal: vi.fn().mockResolvedValue(10000) });
    await calendar.loadMonth(2026, 7);
    expect(db.daily_records.where).toHaveBeenCalledWith('date');
    const { start, endExclusive } = monthBounds(2026, 7);
    expect(db.daily_records.between).toHaveBeenCalledWith(start, endExclusive, true, false);
  });

  it('three reads issued in a single Promise.all (no goal_history)', async () => {
    const db = makeMockDb();
    const goal = { getActiveStepGoal: vi.fn().mockResolvedValue(10000) };
    const calendar = createCalendar(db, goal);
    await calendar.loadMonth(2026, 7);
    expect(db.daily_records.toArray).toHaveBeenCalledTimes(1);
    expect(goal.getActiveStepGoal).toHaveBeenCalledTimes(1);
    expect(db.daily_records.first).toHaveBeenCalledTimes(1);
  });

  it('day with matching record gets record attached', async () => {
    const records = [
      { date: '2026-08-08', effective_steps: 5000, effective_distance_km: 5.0 },
    ];
    const db = makeMockDb({ records });
    const calendar = createCalendar(db, { getActiveStepGoal: vi.fn().mockResolvedValue(10000) });
    const payload = await calendar.loadMonth(2026, 7);
    const dayWithRecord = payload.days.find((d) => d.date === '2026-08-08');
    expect(dayWithRecord.record).toEqual(records[0]);
  });

  it('day without matching record gets null', async () => {
    const db = makeMockDb({ records: [] });
    const calendar = createCalendar(db, { getActiveStepGoal: vi.fn().mockResolvedValue(10000) });
    const payload = await calendar.loadMonth(2026, 7);
    const noDataDay = payload.days.find((d) => d.date === '2026-08-01');
    expect(noDataDay.record).toBeNull();
  });

  it('loadMonth rejects when daily_records rejects', async () => {
    const db = {
      daily_records: {
        where: vi.fn().mockReturnThis(),
        between: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockRejectedValue(new Error('DB failed')),
        orderBy: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      },
    };
    const calendar = createCalendar(db, { getActiveStepGoal: vi.fn().mockResolvedValue(10000) });
    await expect(calendar.loadMonth(2026, 7)).rejects.toThrow('DB failed');
  });

  it('buildZeroState returns full grid, all state 0, all metrics null', () => {
    const db = makeMockDb();
    const calendar = createCalendar(db, { getActiveStepGoal: vi.fn().mockResolvedValue(10000) });
    const payload = calendar.buildZeroState(2026, 7);
    expect(payload.days.length).toBeGreaterThan(0);
    for (const day of payload.days) {
      expect(day.classification.state).toBe(CLASSIFICATION_NO_DATA);
    }
    expect(payload.aggregates.daysEvaluated).toBe(0);
    expect(payload.aggregates.totalSteps).toBe(null);
    expect(payload.navBounds.canGoPrev).toBe(false);
    expect(payload.navBounds.canGoNext).toBe(false);
  });

  it('two sequential calls with different months return independent payloads', async () => {
    const db = makeMockDb();
    const calendar = createCalendar(db, { getActiveStepGoal: vi.fn().mockResolvedValue(10000) });
    const p1 = await calendar.loadMonth(2026, 7);
    const p2 = await calendar.loadMonth(2026, 8);
    expect(p1.year).toBe(2026);
    expect(p2.year).toBe(2026);
    const dates1 = p1.days.map((d) => d.date);
    const dates2 = p2.days.map((d) => d.date);
    expect(dates1.some((d) => dates2.includes(d))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ST-006 Task 7 — Effective-field classification regression (classifyDay on steps)
// ---------------------------------------------------------------------------

describe('classifyDay — effective_steps field regression (ST-007a Task 10)', () => {
  const STEP_GOAL = 10000;

  // Divergent-field fixture: original_steps is below goal threshold,
  // effective_steps is above it (simulates a corrected override).
  // classifyDay must read effective_steps, so state should be Met (2).

  it('classifies as Met using effective_steps when original_steps is below threshold', () => {
    const record = {
      original_steps: 500,
      effective_steps: 10500, // >= 10000 → should be Met
      is_overridden: true,
    };

    const result = classifyDay(record, STEP_GOAL, false);
    expect(result.state).toBe(CLASSIFICATION_MET);
  });

  it('classifies as Missed on effective_steps even when original_steps exceeds goal', () => {
    const record = {
      original_steps: 15000, // >= 10000 → would be Met
      effective_steps: 500,  // < 10000 → should be Missed
      is_overridden: true,
    };

    const result = classifyDay(record, STEP_GOAL, false);
    expect(result.state).toBe(CLASSIFICATION_MISSED);
  });
});

// ---------------------------------------------------------------------------
// ST-007a Task 10 — Step lens conversion tests
// ---------------------------------------------------------------------------

describe('Task 10 — classifyDay step lens (EXCEEDED_RATIO = 1.5)', () => {
  // EXCEEDED_RATIO boundary: at stepGoal=10000, 1.5x = 15000
  it('9,999 steps at stepGoal 10000 → MISSED', () => {
    const record = { effective_steps: 9999, is_overridden: false };
    expect(classifyDay(record, 10000, false).state).toBe(CLASSIFICATION_MISSED);
  });

  it('10,000 steps at stepGoal 10000 → MET (MET_RATIO boundary inclusive)', () => {
    const record = { effective_steps: 10000, is_overridden: false };
    expect(classifyDay(record, 10000, false).state).toBe(CLASSIFICATION_MET);
  });

  it('14,999 steps at stepGoal 10000 → MET (below 1.5x)', () => {
    const record = { effective_steps: 14999, is_overridden: false };
    expect(classifyDay(record, 10000, false).state).toBe(CLASSIFICATION_MET);
  });

  it('15,000 steps at stepGoal 10000 → EXCEEDED (1.5x boundary inclusive)', () => {
    const record = { effective_steps: 15000, is_overridden: false };
    expect(classifyDay(record, 10000, false).state).toBe(CLASSIFICATION_EXCEEDED);
  });

  it('same record re-classifies at stepGoal 5000 vs 15000 with no DB write', () => {
    const mockDb = { settings: { put: vi.fn(), get: vi.fn() } };
    const record = { effective_steps: 6000, is_overridden: false };
    const at5k = classifyDay(record, 5000, false);
    const at15k = classifyDay(record, 15000, false);
    // 8000 >= 5000 → MET; 8000 < 15000 → MISSED
    expect(at5k.state).toBe(CLASSIFICATION_MET);
    expect(at15k.state).toBe(CLASSIFICATION_MISSED);
    // No DB write happened
    expect(mockDb.settings.put).not.toHaveBeenCalled();
    expect(mockDb.settings.get).not.toHaveBeenCalled();
  });

  it('future day → NO_DATA regardless of record', () => {
    const record = { effective_steps: 15000, is_overridden: false };
    expect(classifyDay(record, 10000, true).state).toBe(CLASSIFICATION_NO_DATA);
  });

  it('null record → NO_DATA', () => {
    expect(classifyDay(null, 10000, false).state).toBe(CLASSIFICATION_NO_DATA);
  });

  it('non-finite effective_steps → MISSED', () => {
    const record = { effective_steps: NaN, is_overridden: false };
    expect(classifyDay(record, 10000, false).state).toBe(CLASSIFICATION_MISSED);
  });

  it('non-finite stepGoal falls open to DEFAULT_STEP_GOAL (10000)', () => {
    // 10000 steps / DEFAULT_STEP_GOAL (10000) = 1.0 → MET
    const record = { effective_steps: 10000, is_overridden: false };
    expect(classifyDay(record, NaN, false).state).toBe(CLASSIFICATION_MET);
  });

  it('isOverridden is preserved on step-lens path', () => {
    const record = { effective_steps: 10000, is_overridden: true };
    expect(classifyDay(record, 10000, false).isOverridden).toBe(true);
  });
});

describe('Task 10 — computeCommitmentHitRate step lens', () => {
  function makeDay(date, steps, isFuture = false) {
    return {
      date,
      isFuture,
      record: steps != null ? { effective_steps: steps } : null,
    };
  }

  it('today excluded, elapsed days computed on effective_steps vs stepGoal', () => {
    const today = '2026-08-10';
    const days = [
      makeDay('2026-08-08', 10000), // met at 10000
      makeDay('2026-08-09', 5000),  // missed at 10000
      makeDay('2026-08-10', 12000, false), // today — excluded
    ];
    expect(computeCommitmentHitRate(days, today, 10000)).toBe(50);
  });

  it('missing record counts as a miss', () => {
    const today = '2026-08-10';
    const days = [
      makeDay('2026-08-08', 10000), // met
      { date: '2026-08-09', isFuture: false, record: null }, // missing = miss
    ];
    expect(computeCommitmentHitRate(days, today, 10000)).toBe(50);
  });

  it('returns null when no elapsed days', () => {
    const today = '2026-08-10';
    const days = [
      makeDay('2026-08-10', 10000, false), // today only — excluded
    ];
    expect(computeCommitmentHitRate(days, today, 10000)).toBeNull();
  });

  it('all days met → 100', () => {
    const today = '2026-08-10';
    const days = [
      makeDay('2026-08-07', 10000),
      makeDay('2026-08-08', 12000),
      makeDay('2026-08-09', 15000),
    ];
    expect(computeCommitmentHitRate(days, today, 10000)).toBe(100);
  });

  it('none of the days met → 0', () => {
    const today = '2026-08-10';
    const days = [
      makeDay('2026-08-07', 100),
      makeDay('2026-08-08', 200),
    ];
    expect(computeCommitmentHitRate(days, today, 10000)).toBe(0);
  });
});

describe('Task 10 — createCalendar loadMonth step lens payload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeMockDb({ records = [], earliestRecord = null } = {}) {
    return {
      daily_records: {
        where: vi.fn().mockReturnThis(),
        between: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(records),
        orderBy: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(earliestRecord),
      },
      // goal_history should NOT be called in Task 10
      goal_history: { toArray: vi.fn().mockRejectedValue(new Error('should not be called')) },
    };
  }

  it('loadMonth never calls db.goal_history.toArray()', async () => {
    const db = makeMockDb();
    const goal = { getActiveStepGoal: vi.fn().mockResolvedValue(10000) };
    const calendar = createCalendar(db, goal);
    await calendar.loadMonth(2026, 7);
    expect(db.goal_history.toArray).not.toHaveBeenCalled();
  });

  it('payload contains activeStepGoal and no activeGoalKm', async () => {
    const db = makeMockDb();
    const goal = { getActiveStepGoal: vi.fn().mockResolvedValue(7500) };
    const calendar = createCalendar(db, goal);
    const payload = await calendar.loadMonth(2026, 7);
    expect(payload.activeStepGoal).toBe(7500);
    expect(payload).not.toHaveProperty('activeGoalKm');
  });

  it('no day object carries targetDistanceKm', async () => {
    const db = makeMockDb({ records: [{ date: '2026-08-08', effective_steps: 9000 }] });
    const goal = { getActiveStepGoal: vi.fn().mockResolvedValue(10000) };
    const calendar = createCalendar(db, goal);
    const payload = await calendar.loadMonth(2026, 7);
    for (const day of payload.days) {
      expect(day).not.toHaveProperty('targetDistanceKm');
    }
  });

  it('buildZeroState payload has activeStepGoal = DEFAULT_STEP_GOAL and no activeGoalKm', () => {
    const db = makeMockDb();
    const goal = { getActiveStepGoal: vi.fn() };
    const calendar = createCalendar(db, goal);
    const payload = calendar.buildZeroState(2026, 7);
    expect(payload.activeStepGoal).toBe(DEFAULT_STEP_GOAL);
    expect(payload).not.toHaveProperty('activeGoalKm');
  });

  it('classifyDay uses effective_steps for classification in loadMonth', async () => {
    const records = [{ date: '2026-08-08', effective_steps: 15000, effective_distance_km: 1.0 }];
    const db = makeMockDb({ records });
    const goal = { getActiveStepGoal: vi.fn().mockResolvedValue(10000) };
    const calendar = createCalendar(db, goal);
    const payload = await calendar.loadMonth(2026, 7);
    const day = payload.days.find((d) => d.date === '2026-08-08');
    // 15000 / 10000 = 1.5 → EXCEEDED
    expect(day.classification.state).toBe(CLASSIFICATION_EXCEEDED);
  });
});
