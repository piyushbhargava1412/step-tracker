/**
 * Streak engine — pure computation.
 * No DOM writes, no Dexie import. All data arrives as plain arrays.
 *
 * The unified streak follows the Effective Date Lock rule: every day D is
 * judged against the goal that was in force on D, never against today's goal.
 */

import { DEFAULT_GOAL_KM } from './goal.js';

export const TIER_THRESHOLDS = [1.0, 3.0, 5.0, 10.0]; // km
export const LIFETIME_STEP_THRESHOLD = 10_000; // steps
export const HALL_OF_FAME_SIZE = 3; // podium entries

const MS_PER_DAY = 86_400_000; // ms

/**
 * Calendar arithmetic on a YYYY-MM-DD string.
 * Parses components and rebuilds via Date.UTC so the result never depends on
 * the local timezone or DST — the same invariant `_localDate` protects.
 *
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} delta - days to add (may be negative)
 * @returns {string} YYYY-MM-DD
 */
export function _addDaysUtc(dateStr, delta) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + delta * MS_PER_DAY);
  const yy = shifted.getUTCFullYear();
  const MM = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${MM}-${dd}`;
}

/**
 * Builds a stable ascending comparator over a string key. Stability keeps
 * insertion order for equal keys, which is what makes a same-day goal
 * overwrite resolve to the later row.
 *
 * @param {string} key - property name to compare
 * @returns {(a: object, b: object) => number}
 */
function _ascBy(key) {
  return (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
}

/**
 * Returns a new array of records sorted ascending by `date`.
 * Never mutates the input (Dexie collections are shared across renders).
 *
 * @param {Array<{ date: string }>} records
 * @returns {Array<{ date: string }>}
 */
export function _sortByDate(records) {
  return [...records].sort(_ascBy('date'));
}

/**
 * Returns true if a goal_history row is usable.
 * @param {*} row
 * @returns {boolean}
 */
function _isValidGoalRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (typeof row.effective_from !== 'string' || row.effective_from === '') return false;
  return Number.isFinite(row.target_distance_km) && row.target_distance_km > 0;
}

/**
 * Returns true if a daily_records row can be keyed by date.
 * @param {*} row
 * @returns {boolean}
 */
function _isValidRecord(row) {
  return !!row && typeof row === 'object' && typeof row.date === 'string' && row.date !== '';
}

/**
 * G(D) — the goal in force on `dateStr` (SF-1).
 *
 * Latest entry whose `effective_from <= dateStr` wins. Dates before the
 * earliest entry use that earliest entry (the seed is the baseline). Equal
 * `effective_from` values are a primary-key overwrite, so the later entry wins.
 * Empty or unusable history fails open to DEFAULT_GOAL_KM (SF-12).
 *
 * @param {Array<{ effective_from: string, target_distance_km: number }>} goalHistory
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {number} target distance in km
 */
export function resolveGoalForDate(goalHistory, dateStr) {
  if (!Array.isArray(goalHistory)) return DEFAULT_GOAL_KM;

  const valid = _sortByEffectiveFrom(goalHistory.filter(_isValidGoalRow));
  if (valid.length === 0) return DEFAULT_GOAL_KM;

  let resolved = valid[0].target_distance_km; // seed baseline for pre-log dates
  for (const row of valid) {
    if (row.effective_from > dateStr) break;
    resolved = row.target_distance_km; // `<=` so a same-day overwrite wins
  }
  return resolved;
}

/**
 * Stable ascending sort by `effective_from` — preserves insertion order for
 * same-day entries so the later `put` governs.
 *
 * @param {Array<{ effective_from: string }>} rows
 * @returns {Array<{ effective_from: string }>}
 */
function _sortByEffectiveFrom(rows) {
  return [...rows].sort(_ascBy('effective_from'));
}

/**
 * Unified Active Streak — Effective Date Lock traversal.
 *
 * Walks backwards from `today` to the earliest record in a single in-memory
 * pass (SF-14):
 *   1. Missing record on a past day terminates the streak (SF-2, fail-closed).
 *   2. Missing record today is an in-progress skip — evaluate from yesterday.
 *   3. `distance >= G(D)` increments (SF-8, `>=` not `>`).
 *   4. `distance < G(D)` today is a skip; on a past day it terminates.
 *   5. Non-finite `effective_distance_km` counts as 0 (SF-13).
 *
 * @param {Array<{ date: string, effective_distance_km: number }>} records
 * @param {Array<{ effective_from: string, target_distance_km: number }>} goalHistory
 * @param {string} today - YYYY-MM-DD
 * @returns {number} consecutive qualifying days
 */
export function computeUnifiedStreak(records, goalHistory, today) {
  if (!Array.isArray(records) || records.length === 0) return 0;
  if (typeof today !== 'string' || today === '') return 0;

  const usable = _sortByDate(records.filter(_isValidRecord));
  if (usable.length === 0) return 0;

  const byDate = new Map(usable.map((r) => [r.date, r]));
  const earliest = usable[0].date;

  let streak = 0;
  let day = today;

  while (day >= earliest) {
    const isToday = day === today;
    const record = byDate.get(day);

    if (!record) {
      if (!isToday) break; // past gap terminates (SF-2)
      day = _addDaysUtc(day, -1); // today in progress — skip it
      continue;
    }

    const distanceKm = Number.isFinite(record.effective_distance_km)
      ? record.effective_distance_km
      : 0; // SF-13: corrupt value fails the day
    const goalKm = resolveGoalForDate(goalHistory, day);

    if (distanceKm >= goalKm) {
      streak += 1;
    } else if (!isToday) {
      break; // past shortfall terminates
    }

    day = _addDaysUtc(day, -1);
  }

  return streak;
}
