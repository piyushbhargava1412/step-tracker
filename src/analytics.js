/**
 * analytics.js — Pure analytics compute engine.
 *
 * No DOM writes, no Dexie import, no `document` or `window` references.
 * All data arrives as plain arrays; the factory wires in the Dexie db.
 *
 * SF-8: longest-streak delegates to computeToleranceStreaks (no duplicate logic).
 * SF-7: computeHourlyDistribution skips rows where hourly_steps is null or
 *       not a 24-element array; returns 24-element zero array if all rows skip.
 * SF-9: computeYearlyMonthlyComparison zero-fills absent months.
 * SF-13: compute() wraps in try/catch, logs [analytics], and rethrows.
 */

import { computeToleranceStreaks } from './streak.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_STEP_GOAL = 10000;
const HOURS_PER_DAY = 24;
const MONTHS_PER_YEAR = 12;
const DEFAULT_TOP_N = 5;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Converts JS Date.getDay() (0=Sunday … 6=Saturday) to ISO week index
 * (0=Monday … 6=Sunday).
 *
 * @param {number} jsDay - 0..6
 * @returns {number} 0..6
 */
function _toIsoWeekday(jsDay) {
  return (jsDay + 6) % 7;
}

/**
 * Returns today as a YYYY-MM-DD string in UTC.
 * Used only by the factory's compute() — keeps pure functions truly pure.
 *
 * @returns {string}
 */
function _todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

// ── Exported pure functions ───────────────────────────────────────────────────

/**
 * Computes lifetime aggregate metrics from all daily records.
 *
 * @param {Array<{ date: string, effective_steps: number, effective_distance_km: number }>} records
 * @param {number} activeStepGoal - forwarded to computeToleranceStreaks
 * @returns {{ totalSteps: number, totalDistanceKm: number, dailyAverage: number, longestStreak: number }}
 */
export function computeLifetimeMetrics(records, activeStepGoal) {
  if (!Array.isArray(records) || records.length === 0) {
    return { totalSteps: 0, totalDistanceKm: 0, dailyAverage: 0, longestStreak: 0 };
  }

  let totalSteps = 0;
  let totalDistanceKm = 0;

  for (const r of records) {
    totalSteps += Number.isFinite(r.effective_steps) ? r.effective_steps : 0;
    totalDistanceKm += Number.isFinite(r.effective_distance_km) ? r.effective_distance_km : 0;
  }

  const dailyAverage = totalSteps / records.length;

  // SF-8: delegate to computeToleranceStreaks — no hand-rolled streak loop here.
  const today = _todayUtc();
  const goal = Number.isFinite(activeStepGoal) && activeStepGoal > 0
    ? activeStepGoal
    : DEFAULT_STEP_GOAL;

  const tolerance = computeToleranceStreaks(records, goal, today);
  const longestStreak = tolerance.actual ?? 0;

  return { totalSteps, totalDistanceKm, dailyAverage, longestStreak };
}

/**
 * Returns the top N records sorted by effective_steps descending.
 *
 * @param {Array<{ effective_steps: number }>} records
 * @param {number} [n=5]
 * @returns {Array}
 */
export function computeTopRecords(records, n = DEFAULT_TOP_N) {
  if (!Array.isArray(records) || records.length === 0) return [];

  return [...records]
    .sort((a, b) => {
      const sa = Number.isFinite(a.effective_steps) ? a.effective_steps : 0;
      const sb = Number.isFinite(b.effective_steps) ? b.effective_steps : 0;
      return sb - sa; // descending
    })
    .slice(0, n);
}

/**
 * Groups records by ISO weekday (0=Monday … 6=Sunday), computes the average
 * steps per slot, and identifies the power day (max average, lowest index wins
 * on tie) and lazy day (min average, lowest index wins on tie).
 *
 * @param {Array<{ date: string, effective_steps: number }>} records
 * @returns {{ averages: number[], powerDay: number, lazyDay: number }}
 */
export function computeDayOfWeekDistribution(records) {
  const totals = Array(7).fill(0);
  const counts = Array(7).fill(0);

  if (Array.isArray(records)) {
    for (const r of records) {
      if (typeof r.date !== 'string') continue;
      const dow = _toIsoWeekday(new Date(r.date).getDay());
      const steps = Number.isFinite(r.effective_steps) ? r.effective_steps : 0;
      totals[dow] += steps;
      counts[dow] += 1;
    }
  }

  const averages = totals.map((total, i) => (counts[i] > 0 ? total / counts[i] : 0));

  // Tie-breaking: lowest index wins for both powerDay and lazyDay.
  let powerDay = 0;
  let lazyDay = 0;

  for (let i = 1; i < 7; i++) {
    if (averages[i] > averages[powerDay]) powerDay = i;   // strict >: first max keeps index
    if (averages[i] < averages[lazyDay]) lazyDay = i;     // strict <: first min keeps index
  }

  return { averages, powerDay, lazyDay };
}

/**
 * Sums hourly_steps across all records that have a valid 24-element array.
 * Records with null or wrong-length arrays are skipped.
 * Returns a 24-element zero array when no valid rows exist.
 *
 * @param {Array<{ hourly_steps: number[]|null }>} records
 * @returns {number[]} 24-element array
 */
export function computeHourlyDistribution(records) {
  const sums = Array(HOURS_PER_DAY).fill(0);

  if (!Array.isArray(records)) return sums;

  for (const r of records) {
    if (!Array.isArray(r.hourly_steps) || r.hourly_steps.length !== HOURS_PER_DAY) continue;
    for (let h = 0; h < HOURS_PER_DAY; h++) {
      const v = r.hourly_steps[h];
      sums[h] += Number.isFinite(v) ? v : 0;
    }
  }

  return sums;
}

/**
 * Filters records by year, groups by calendar month, and returns a 12-element
 * array with totals and day counts. Absent months are zero-filled.
 *
 * @param {Array<{ date: string, effective_steps: number }>} records
 * @param {number} year
 * @returns {Array<{ month: number, total: number, dayCount: number }>}
 */
export function computeYearlyMonthlyComparison(records, year) {
  const months = Array.from({ length: MONTHS_PER_YEAR }, (_, m) => ({
    month: m,
    total: 0,
    dayCount: 0,
  }));

  if (!Array.isArray(records)) return months;

  const prefix = String(year);

  for (const r of records) {
    if (typeof r.date !== 'string' || !r.date.startsWith(prefix)) continue;
    const month = parseInt(r.date.slice(5, 7), 10) - 1; // 0-based
    if (month < 0 || month > 11) continue;
    const steps = Number.isFinite(r.effective_steps) ? r.effective_steps : 0;
    months[month].total += steps;
    months[month].dayCount += 1;
  }

  return months;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates an analytics instance backed by a Dexie db reference.
 *
 * @param {{ daily_records: { toArray: Function }, settings: { get: Function } }} db
 * @returns {{ compute: Function }}
 */
export function createAnalytics(db) {
  /**
   * Reads all daily_records and the active_step_goal setting, calls all five
   * pure functions, and returns the combined result.
   *
   * SF-13: wraps in try/catch; logs [analytics] and rethrows on failure.
   *
   * @returns {Promise<{ lifetimeMetrics, topRecords, dayOfWeek, hourly, yearlyMonthly }>}
   */
  async function compute() {
    try {
      const [records, settingRecord] = await Promise.all([
        db.daily_records.toArray(),
        db.settings.get('active_step_goal'),
      ]);

      const activeStepGoal = settingRecord?.value ?? DEFAULT_STEP_GOAL;
      const currentYear = new Date().getFullYear();

      const lifetimeMetrics = computeLifetimeMetrics(records, activeStepGoal);
      const topRecords = computeTopRecords(records);
      const dayOfWeek = computeDayOfWeekDistribution(records);
      const hourly = computeHourlyDistribution(records);
      const yearlyMonthly = computeYearlyMonthlyComparison(records, currentYear);

      return { lifetimeMetrics, topRecords, dayOfWeek, hourly, yearlyMonthly };
    } catch (err) {
      console.error('[analytics]', err);
      throw err;
    }
  }

  return { compute };
}
