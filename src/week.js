/**
 * Week engine for the Calendar's Week view — pure helpers plus a loader.
 * Weeks run Monday to Sunday, matching the month grid. Days are classified
 * and totalled with the month engine's own rules (calendar.js), so a day reads
 * the same in both views.
 */

import { _localDate, _addDaysUtc } from './date-utils.js';
import {
  classifyDay,
  computeMonthlyAggregates,
  CLASSIFICATION_NO_DATA,
  CLASSIFICATION_MET,
} from './calendar.js';
import { DEFAULT_STEP_GOAL } from './goal.js';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function _parts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** The Monday on or before a YYYY-MM-DD date. */
export function mondayOf(dateStr) {
  const { weekday } = _parts(dateStr);
  return _addDaysUtc(dateStr, -((weekday + 6) % 7));
}

/**
 * The seven days of the week starting at `weekStart`.
 * @returns {Array<{ date: string, dayLabel: string, fullLabel: string, isToday: boolean, isFuture: boolean }>}
 */
export function buildWeekDays(weekStart, today) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = _addDaysUtc(weekStart, i);
    const { m, d, weekday } = _parts(date);
    return {
      date,
      dayLabel: DAY_LABELS[weekday],
      fullLabel: `${DAY_LABELS[weekday]} ${d} ${MONTH_ABBR[m - 1]}`,
      isToday: date === today,
      isFuture: date > today,
    };
  });
}

/**
 * Goal hits among the week's finished days — today is still in progress, so
 * it is left out (like the month's hit rate).
 * @returns {{ met: number, finished: number }}
 */
export function computeWeekHits(days, today) {
  const finished = days.filter((d) => d.date < today);
  const met = finished.filter((d) => d.classification?.state >= CLASSIFICATION_MET).length;
  return { met, finished: finished.length };
}

/** Back while the first record is before this week; forward up to the current week. */
export function computeWeekNavBounds(earliestRecordDate, today, weekStart) {
  return {
    canGoPrev: !!earliestRecordDate && earliestRecordDate < weekStart,
    canGoNext: weekStart < mondayOf(today),
  };
}

/** "21 – 27 Sep 2026", "28 Sep – 4 Oct 2026", "29 Dec 2025 – 4 Jan 2026". */
export function formatWeekRange(weekStart) {
  const start = _parts(weekStart);
  const end = _parts(_addDaysUtc(weekStart, 6));
  const endText = `${end.d} ${MONTH_ABBR[end.m - 1]} ${end.y}`;
  if (start.y !== end.y) return `${start.d} ${MONTH_ABBR[start.m - 1]} ${start.y} – ${endText}`;
  if (start.m !== end.m) return `${start.d} ${MONTH_ABBR[start.m - 1]} – ${endText}`;
  return `${start.d} – ${endText}`;
}

/**
 * @param {object} db  Dexie handle with daily_records
 * @param {{ getActiveStepGoal: () => Promise<number> }} goal
 * @param {{ today?: () => string }} [options]  clock (tests)
 * @returns {{ loadWeek: (weekStart?: string) => Promise<object>, buildZeroState: (weekStart?: string) => object }}
 */
export function createWeek(db, goal, { today = () => _localDate() } = {}) {
  /** May reject — the render layer owns the try/catch. */
  async function loadWeek(weekStart) {
    const todayStr = today();
    const start = weekStart || mondayOf(todayStr);
    const endExclusive = _addDaysUtc(start, 7);

    const [records, activeStepGoal, earliestRecord] = await Promise.all([
      db.daily_records.where('date').between(start, endExclusive, true, false).toArray(),
      goal.getActiveStepGoal(),
      db.daily_records.orderBy('date').first(),
    ]);

    const byDate = new Map(records.map((r) => [r.date, r]));
    const days = buildWeekDays(start, todayStr).map((day) => {
      const record = byDate.get(day.date) || null;
      const classification = classifyDay(record, activeStepGoal, day.isFuture);
      // Today reads as "in progress" until it reaches the goal.
      const inProgress = day.isToday && classification.state < CLASSIFICATION_MET;
      return { ...day, record, classification, inProgress };
    });

    return {
      start,
      label: formatWeekRange(start),
      today: todayStr,
      days,
      aggregates: computeMonthlyAggregates(days),
      hits: computeWeekHits(days, todayStr),
      activeStepGoal,
      navBounds: computeWeekNavBounds(earliestRecord ? earliestRecord.date : null, todayStr, start),
    };
  }

  /** Synchronous empty week for error recovery. */
  function buildZeroState(weekStart) {
    const todayStr = today();
    const start = weekStart || mondayOf(todayStr);
    const days = buildWeekDays(start, todayStr).map((day) => ({
      ...day,
      record: null,
      classification: { state: CLASSIFICATION_NO_DATA, isOverridden: false },
      inProgress: false,
    }));
    return {
      start,
      label: formatWeekRange(start),
      today: todayStr,
      days,
      aggregates: computeMonthlyAggregates(days),
      hits: { met: 0, finished: 0 },
      activeStepGoal: DEFAULT_STEP_GOAL,
      navBounds: { canGoPrev: false, canGoNext: false },
    };
  }

  return { loadWeek, buildZeroState };
}
