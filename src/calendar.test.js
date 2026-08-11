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
  createCalendar,
} from './calendar.js';
import { DEFAULT_GOAL_KM } from './goal.js';

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
// classifyDay
// ---------------------------------------------------------------------------

describe('classifyDay', () => {
  const TARGET = 3.0;

  it('undefined record → state 0, isOverridden false', () => {
    expect(classifyDay(undefined, TARGET, false)).toEqual({ state: CLASSIFICATION_NO_DATA, isOverridden: false });
  });

  it('null record → state 0, isOverridden false', () => {
    expect(classifyDay(null, TARGET, false)).toEqual({ state: CLASSIFICATION_NO_DATA, isOverridden: false });
  });

  it('future date with a record → state 0, isOverridden false', () => {
    const record = { effective_distance_km: 5.0, effective_steps: 6000 };
    expect(classifyDay(record, TARGET, true)).toEqual({ state: CLASSIFICATION_NO_DATA, isOverridden: false });
  });

  it('ratio exactly 1.0× → state 2 (Met)', () => {
    const record = { effective_distance_km: 3.0, effective_steps: 4000 };
    expect(classifyDay(record, TARGET, false)).toEqual({ state: CLASSIFICATION_MET, isOverridden: false });
  });

  it('ratio just below 1.0× → state 1 (Missed)', () => {
    const record = { effective_distance_km: 2.999, effective_steps: 4000 };
    expect(classifyDay(record, TARGET, false)).toEqual({ state: CLASSIFICATION_MISSED, isOverridden: false });
  });

  it('ratio exactly 2.0× → state 3 (Exceeded)', () => {
    const record = { effective_distance_km: 6.0, effective_steps: 8000 };
    expect(classifyDay(record, TARGET, false)).toEqual({ state: CLASSIFICATION_EXCEEDED, isOverridden: false });
  });

  it('ratio just below 2.0× → state 2 (Met)', () => {
    const record = { effective_distance_km: 5.999, effective_steps: 8000 };
    expect(classifyDay(record, TARGET, false)).toEqual({ state: CLASSIFICATION_MET, isOverridden: false });
  });

  it('effective_distance_km NaN → state 1 (Missed)', () => {
    const record = { effective_distance_km: NaN, effective_steps: 6000 };
    expect(classifyDay(record, TARGET, false).state).toBe(CLASSIFICATION_MISSED);
  });

  it('effective_distance_km Infinity → state 1 (Missed)', () => {
    const record = { effective_distance_km: Infinity, effective_steps: 6000 };
    expect(classifyDay(record, TARGET, false).state).toBe(CLASSIFICATION_MISSED);
  });

  it('effective_distance_km string → state 1 (Missed)', () => {
    const record = { effective_distance_km: '5', effective_steps: 6000 };
    expect(classifyDay(record, TARGET, false).state).toBe(CLASSIFICATION_MISSED);
  });

  it('targetDistanceKm 0 → falls back to DEFAULT_GOAL_KM', () => {
    const record = { effective_distance_km: 3.5, effective_steps: 4000 };
    expect(classifyDay(record, 0, false).state).toBe(
      classifyDay(record, DEFAULT_GOAL_KM, false).state,
    );
  });

  it('targetDistanceKm -1 → falls back to DEFAULT_GOAL_KM', () => {
    const record = { effective_distance_km: 3.5, effective_steps: 4000 };
    expect(classifyDay(record, -1, false).state).toBe(
      classifyDay(record, DEFAULT_GOAL_KM, false).state,
    );
  });

  it('targetDistanceKm NaN → falls back to DEFAULT_GOAL_KM', () => {
    const record = { effective_distance_km: 3.5, effective_steps: 4000 };
    expect(classifyDay(record, NaN, false).state).toBe(
      classifyDay(record, DEFAULT_GOAL_KM, false).state,
    );
  });

  it('isOverridden: true on Missed, Met, and Exceeded', () => {
    const missed = { effective_distance_km: 1.0, effective_steps: 1000, is_overridden: true };
    const met = { effective_distance_km: 3.0, effective_steps: 4000, is_overridden: true };
    const exceeded = { effective_distance_km: 6.0, effective_steps: 8000, is_overridden: true };

    expect(classifyDay(missed, TARGET, false).isOverridden).toBe(true);
    expect(classifyDay(met, TARGET, false).isOverridden).toBe(true);
    expect(classifyDay(exceeded, TARGET, false).isOverridden).toBe(true);
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
// createCalendar — factory (Tasks 6)
// ---------------------------------------------------------------------------

describe('createCalendar — factory', () => {
  const TODAY = '2026-08-10';

  function makeMockDb({ records = [], history = [], activeGoal = null, earliestRecord = null } = {}) {
    const recordMap = new Map();
    for (const r of records) {
      recordMap.set(r.date, r);
    }
    return {
      daily_records: {
        where: vi.fn().mockReturnThis(),
        between: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(records),
        orderBy: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(earliestRecord),
      },
      goal_history: { toArray: vi.fn().mockResolvedValue(history) },
      settings: { get: vi.fn().mockResolvedValue(null) },
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
    const calendar = createCalendar(db, { getActiveGoal: vi.fn().mockResolvedValue(null) });
    await calendar.loadMonth(2026, 7);
    expect(db.daily_records.where).toHaveBeenCalledWith('date');
    const { start, endExclusive } = monthBounds(2026, 7);
    expect(db.daily_records.between).toHaveBeenCalledWith(start, endExclusive, true, false);
  });

  it('all four reads issued in a single Promise.all', async () => {
    const db = makeMockDb();
    const goal = { getActiveGoal: vi.fn().mockResolvedValue(null) };
    const calendar = createCalendar(db, goal);
    await calendar.loadMonth(2026, 7);
    expect(db.daily_records.toArray).toHaveBeenCalledTimes(1);
    expect(db.goal_history.toArray).toHaveBeenCalledTimes(1);
    expect(goal.getActiveGoal).toHaveBeenCalledTimes(1);
    expect(db.daily_records.first).toHaveBeenCalledTimes(1);
  });

  it('day with matching record gets record attached', async () => {
    const records = [
      { date: '2026-08-08', effective_steps: 5000, effective_distance_km: 5.0 },
    ];
    const db = makeMockDb({ records });
    const calendar = createCalendar(db, { getActiveGoal: vi.fn().mockResolvedValue(null) });
    const payload = await calendar.loadMonth(2026, 7);
    const dayWithRecord = payload.days.find((d) => d.date === '2026-08-08');
    expect(dayWithRecord.record).toEqual(records[0]);
  });

  it('day without matching record gets null', async () => {
    const db = makeMockDb({ records: [] });
    const calendar = createCalendar(db, { getActiveGoal: vi.fn().mockResolvedValue(null) });
    const payload = await calendar.loadMonth(2026, 7);
    const noDataDay = payload.days.find((d) => d.date === '2026-08-01');
    expect(noDataDay.record).toBeNull();
  });

  it('empty goal_history + valid active_goal resolves targets from synthetic history', async () => {
    const activeGoal = { effective_from: '2026-08-01', target_distance_km: 5.0, target_steps: 6562 };
    const db = makeMockDb({ records: [], activeGoal });
    const calendar = createCalendar(db, { getActiveGoal: vi.fn().mockResolvedValue(activeGoal) });
    const payload = await calendar.loadMonth(2026, 7);
    const day = payload.days[0];
    expect(day.targetDistanceKm).toBe(5.0);
  });

  it('empty goal_history + no valid active_goal falls back to DEFAULT_GOAL_KM', async () => {
    const db = makeMockDb({ records: [] });
    const calendar = createCalendar(db, { getActiveGoal: vi.fn().mockResolvedValue(null) });
    const payload = await calendar.loadMonth(2026, 7);
    const day = payload.days[0];
    expect(day.targetDistanceKm).toBe(DEFAULT_GOAL_KM);
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
      goal_history: { toArray: vi.fn().mockResolvedValue([]) },
      settings: { get: vi.fn().mockResolvedValue(null) },
    };
    const calendar = createCalendar(db, { getActiveGoal: vi.fn().mockResolvedValue(null) });
    await expect(calendar.loadMonth(2026, 7)).rejects.toThrow('DB failed');
  });

  it('buildZeroState returns full grid, all state 0, all metrics null', () => {
    const db = makeMockDb();
    const calendar = createCalendar(db, { getActiveGoal: vi.fn().mockResolvedValue(null) });
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
    const calendar = createCalendar(db, { getActiveGoal: vi.fn().mockResolvedValue(null) });
    const p1 = await calendar.loadMonth(2026, 7);
    const p2 = await calendar.loadMonth(2026, 8);
    expect(p1.year).toBe(2026);
    expect(p2.year).toBe(2026);
    const dates1 = p1.days.map((d) => d.date);
    const dates2 = p2.days.map((d) => d.date);
    expect(dates1.some((d) => dates2.includes(d))).toBe(false);
  });
});
