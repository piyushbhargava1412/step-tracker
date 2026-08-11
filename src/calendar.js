/**
 * Calendar engine — pure computation.
 * No DOM writes, no Dexie import. All data arrives as plain arrays.
 *
 * Built from streak.js (ST-005 Tasks 2–6) to power the monthly heatmap grid.
 * `month` is 0-based throughout (matches Date's getMonth()).
 */

import { DEFAULT_GOAL_KM, _localDate } from './goal.js';
import { resolveGoalForDate, buildEffectiveGoalHistory, _prepareGoalHistory, _resolvePreparedGoalForDate } from './goal-history.js';

// Classification constants (SF-2 precedence ladder)
export const CLASSIFICATION_NO_DATA = 0;
export const CLASSIFICATION_MISSED = 1;
export const CLASSIFICATION_MET = 2;
export const CLASSIFICATION_EXCEEDED = 3;

export const MET_RATIO = 1.0;
export const EXCEEDED_RATIO = 2.0;
export const DAYS_PER_WEEK = 7;

/**
 * Computes the month boundaries as YYYY-MM-01 strings.
 * Month is 0-based (January = 0).
 *
 * @param {number} year
 * @param {number} month - 0-based
 * @returns {{ start: string, endExclusive: string }}
 */
export function monthBounds(year, month) {
  // month is 0-based; output uses 1-based month numbers in YYYY-MM-DD format
  const startMonth = String(month + 1).padStart(2, '0');
  // endExclusive: month + 1, potentially rolling to next year
  const endMonthNum = (month + 1) % 12 + 1;
  const endYear = month === 11 ? year + 1 : year;
  const endMonth = String(endMonthNum).padStart(2, '0');
  return {
    start: `${year}-${startMonth}-01`,
    endExclusive: `${endYear}-${endMonth}-01`,
  };
}

/**
 * Builds a Monday-first calendar grid for the given year/month.
 *
 * @param {number} year
 * @param {number} month - 0-based
 * @param {string} today - YYYY-MM-DD
 * @returns {{ year: number, month: number, leadingPad: number, trailingPad: number, days: Array<{ date: string, dayOfMonth: number, isFuture: boolean }> }}
 */
export function buildMonthGrid(year, month, today) {
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const leadingPad = firstDayOfWeek;
  const days = [];

  for (let i = 1; i <= daysInMonth; i += 1) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    days.push({
      date: dateStr,
      dayOfMonth: i,
      isFuture: dateStr > today,
    });
  }

  const totalCells = leadingPad + days.length;
  const trailingPad = (DAYS_PER_WEEK - (totalCells % DAYS_PER_WEEK)) % DAYS_PER_WEEK;

  return { year, month, leadingPad, trailingPad, days };
}

/**
 * Classifies a single day based on its record, target distance, and whether it's in the future.
 *
 * Ladder (top-down):
 *   1. Future → NO_DATA
 *   2. No record → NO_DATA
 *   3. ratio >= EXCEEDED_RATIO → EXCEEDED
 *   4. ratio >= MET_RATIO → MET
 *   5. otherwise → MISSED
 *
 * @param {{ effective_distance_km?: number, is_overridden?: boolean } | null | undefined} record
 * @param {number} targetDistanceKm
 * @param {boolean} isFuture
 * @returns {{ state: number, isOverridden: boolean }}
 */
export function classifyDay(record, targetDistanceKm, isFuture) {
  // Future days are always no-data regardless of record
  if (isFuture) {
    return { state: CLASSIFICATION_NO_DATA, isOverridden: false };
  }

  // Null/undefined record → no-data
  if (!record) {
    return { state: CLASSIFICATION_NO_DATA, isOverridden: false };
  }

  // Non-finite effective_distance_km treated as 0
  const km = Number.isFinite(record.effective_distance_km) ? record.effective_distance_km : 0;

  // Non-finite or non-positive target → fall back to DEFAULT_GOAL_KM
  const target = Number.isFinite(targetDistanceKm) && targetDistanceKm > 0
    ? targetDistanceKm
    : DEFAULT_GOAL_KM;

  const ratio = target > 0 ? km / target : 0;

  // is_overridden is orthogonal to the state
  const isOverridden = record.is_overridden === true;

  if (ratio >= EXCEEDED_RATIO) {
    return { state: CLASSIFICATION_EXCEEDED, isOverridden };
  }
  if (ratio >= MET_RATIO) {
    return { state: CLASSIFICATION_MET, isOverridden };
  }
  return { state: CLASSIFICATION_MISSED, isOverridden };
}

/**
 * Computes monthly aggregate metrics from classified days.
 * Contributing day = !isFuture && record != null.
 *
 * @param {Array<{ isFuture: boolean, record: object|null, classification: { state: number } }>} days
 * @returns {{ daysEvaluated: number, targetMetDays: number, totalSteps: number|null, totalDistanceKm: number|null, averageDailySteps: number|null, hitRatePct: number|null }}
 */
export function computeMonthlyAggregates(days) {
  if (!Array.isArray(days) || days.length === 0) {
    return {
      daysEvaluated: 0,
      targetMetDays: 0,
      totalSteps: null,
      totalDistanceKm: null,
      averageDailySteps: null,
      hitRatePct: null,
    };
  }

  const contributing = days.filter((d) => !d.isFuture && d.record != null);
  const daysEvaluated = contributing.length;

  if (daysEvaluated === 0) {
    return {
      daysEvaluated: 0,
      targetMetDays: 0,
      totalSteps: null,
      totalDistanceKm: null,
      averageDailySteps: null,
      hitRatePct: null,
    };
  }

  let totalSteps = 0;
  let totalDistanceKm = 0;
  let targetMetDays = 0;

  for (const day of contributing) {
    const record = day.record;
    // Non-finite effective_steps contributes 0
    totalSteps += Number.isFinite(record.effective_steps) ? record.effective_steps : 0;
    // Distance
    totalDistanceKm += Number.isFinite(record.effective_distance_km) ? record.effective_distance_km : 0;
    // Met count: state >= CLASSIFICATION_MET
    if (day.classification.state >= CLASSIFICATION_MET) {
      targetMetDays += 1;
    }
  }

  const averageDailySteps = Math.round(totalSteps / daysEvaluated);
  const hitRatePct = Math.round((targetMetDays / daysEvaluated) * 100);

  return {
    daysEvaluated,
    targetMetDays,
    totalSteps,
    totalDistanceKm,
    averageDailySteps,
    hitRatePct,
  };
}

/**
 * Computes navigation bounds from data.
 *
 * @param {string|null} earliestRecordDate - YYYY-MM-DD or null
 * @param {string} today - YYYY-MM-DD
 * @param {number} year
 * @param {number} month - 0-based
 * @returns {{ canGoPrev: boolean, canGoNext: boolean, minYear: number, maxYear: number }}
 */
export function computeNavBounds(earliestRecordDate, today, year, month) {
  // Parse today's year/month from the passed today string
  const todayParts = today.split('-').map(Number);
  const todayYearNum = todayParts[0];
  const todayMonthNum = todayParts[1] - 1;

  const selectionYear = year;
  const selectionMonth = month;

  // Max year/month comes from today
  const maxYear = todayYearNum;
  const canGoNext = !(selectionYear > todayYearNum || (selectionYear === todayYearNum && selectionMonth >= todayMonthNum));

  if (earliestRecordDate == null) {
    return { canGoPrev: false, canGoNext, minYear: todayYearNum, maxYear };
  }

  // Parse earliest record date
  const earliestParts = earliestRecordDate.split('-').map(Number);
  const earliestYear = earliestParts[0];
  const earliestMonth = earliestParts[1] - 1;

  const minYear = earliestYear;

  // Defensive clamp: if earliest is after today, clamp to today's month
  if (earliestYear > todayYearNum || (earliestYear === todayYearNum && earliestMonth >= todayMonthNum)) {
    return { canGoPrev: false, canGoNext: false, minYear: todayYearNum, maxYear: todayYearNum };
  }

  const canGoPrev = !(selectionYear < earliestYear || (selectionYear === earliestYear && selectionMonth <= earliestMonth));

  return { canGoPrev, canGoNext, minYear, maxYear };
}

/**
 * Calendar data factory — orchestrates Dexie reads and delegates to
 * pure functions above. Zero DOM writes.
 *
 * @param {{ daily_records: { where: Function, orderBy: Function }, goal_history: { toArray: Function }, settings: { get: Function } }} db
 * @param {{ getActiveGoal: Function }} goal
 * @returns {{ loadMonth: Function, buildZeroState: Function }}
 */
export function createCalendar(db, goal) {
  /**
   * Loads a month's worth of data from the database, classifies each day,
   * computes aggregates and navigation bounds.
   *
   * May reject — the render layer owns the try/catch.
   *
   * @param {number} year
   * @param {number} month - 0-based
   * @returns {Promise<{ year: number, month: number, leadingPad: number, trailingPad: number, today: string, days: Array, aggregates: object, navBounds: object }>}
   */
  async function loadMonth(year, month) {
    const bounds = monthBounds(year, month);
    const today = _localDate();

    const [records, history, activeGoal, earliestRecord] = await Promise.all([
      db.daily_records.where('date').between(bounds.start, bounds.endExclusive, true, false).toArray(),
      db.goal_history.toArray(),
      goal.getActiveGoal(),
      db.daily_records.orderBy('date').first(),
    ]);

    const goalHistory = buildEffectiveGoalHistory(history, activeGoal);
    const prepared = _prepareGoalHistory(goalHistory);

    const grid = buildMonthGrid(year, month, today);

    // Index records by date
    const recordMap = new Map();
    for (const r of records) {
      recordMap.set(r.date, r);
    }

    // Enrich each day with record, target, and classification
    const days = grid.days.map((day) => {
      const record = recordMap.get(day.date) || null;
      const targetDistanceKm = _resolvePreparedGoalForDate(prepared, day.date);
      const classification = classifyDay(record, targetDistanceKm, day.isFuture);

      return { ...day, record, targetDistanceKm, classification };
    });

    const aggregates = computeMonthlyAggregates(days);

    const earliestRecordDate = earliestRecord ? earliestRecord.date : null;
    const navBounds = computeNavBounds(earliestRecordDate, today, year, month);

    return {
      year,
      month,
      leadingPad: grid.leadingPad,
      trailingPad: grid.trailingPad,
      today,
      days,
      aggregates,
      navBounds,
    };
  }

  /**
   * Synchronous zero-state payload for error recovery.
   *
   * @param {number} year
   * @param {number} month - 0-based
   * @returns {{ year: number, month: number, leadingPad: number, trailingPad: number, today: string, days: Array, aggregates: object, navBounds: object }}
   */
  function buildZeroState(year, month) {
    const today = _localDate();
    const grid = buildMonthGrid(year, month, today);

    const days = grid.days.map((day) => ({
      ...day,
      record: null,
      targetDistanceKm: DEFAULT_GOAL_KM,
      classification: { state: CLASSIFICATION_NO_DATA, isOverridden: false },
    }));

    const aggregates = computeMonthlyAggregates(days);
    const navBounds = computeNavBounds(null, today, year, month);

    return {
      year,
      month,
      leadingPad: grid.leadingPad,
      trailingPad: grid.trailingPad,
      today,
      days,
      aggregates,
      navBounds,
    };
  }

  return { loadMonth, buildZeroState };
}
