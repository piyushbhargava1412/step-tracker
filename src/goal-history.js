/**
 * Goal history engine — pure computation.
 * No DOM writes, no Dexie import. All data arrives as plain arrays.
 *
 * Extracted from streak.js (ST-005 Task 1) so that calendar.js can share
 * the same goal-resolution logic.
 */

import { DEFAULT_GOAL_KM } from './goal.js';

/**
 * Stable ascending comparator over a string key. Stability keeps
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
 * Returns true if a goal_history row is usable.
 * @param {*} row
 * @returns {boolean}
 */
export function _isValidGoalRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (typeof row.effective_from !== 'string' || row.effective_from === '') return false;
  return Number.isFinite(row.target_distance_km) && row.target_distance_km > 0;
}

/**
 * Returns true if an active_goal row can produce a valid goalHistory entry.
 * Requires a non-empty `effective_from` string and a finite positive `target_distance_km`.
 *
 * Intentionally separate from _isValidGoalRow: active_goal and goal_history rows are
 * distinct store shapes and may diverge as the schema evolves.
 *
 * @param {*} row
 * @returns {boolean}
 */
export function _isValidActiveGoalForHistory(row) {
  if (!row || typeof row !== 'object') return false;
  if (typeof row.effective_from !== 'string' || row.effective_from === '') return false;
  return Number.isFinite(row.target_distance_km) && row.target_distance_km > 0;
}

/**
 * Returns true if a daily_records row can be keyed by date.
 * @param {*} row
 * @returns {boolean}
 */
export function _isValidRecord(row) {
  return !!row && typeof row === 'object' && typeof row.date === 'string' && row.date !== '';
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
 * Stable ascending sort by `effective_from` — preserves insertion order for
 * same-day entries so the later `put` governs.
 *
 * @param {Array<{ effective_from: string }>} rows
 * @returns {Array<{ effective_from: string }>}
 */
export function _sortByEffectiveFrom(rows) {
  return [...rows].sort(_ascBy('effective_from'));
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
  return _resolvePreparedGoalForDate(_prepareGoalHistory(goalHistory), dateStr);
}

/**
 * Filters unusable rows and sorts by effective_from.
 *
 * @param {Array} goalHistory
 * @returns {Array<{ effective_from: string, target_distance_km: number, target_steps?: number }>}
 */
export function _prepareGoalHistory(goalHistory) {
  if (!Array.isArray(goalHistory)) return [];
  return _sortByEffectiveFrom(goalHistory.filter(_isValidGoalRow));
}

/**
 * Binary-search the prepared (sorted) goal history to find the goal in force
 * on `dateStr`.
 *
 * @param {Array<{ effective_from: string, target_distance_km: number }>} valid
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {number} target distance in km
 */
export function _resolvePreparedGoalForDate(valid, dateStr) {
  if (valid.length === 0) return DEFAULT_GOAL_KM;

  if (dateStr < valid[0].effective_from) return valid[0].target_distance_km;

  let low = 0;
  let high = valid.length - 1;
  let resolved = valid[0].target_distance_km;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const row = valid[middle];
    if (row.effective_from <= dateStr) {
      resolved = row.target_distance_km;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return resolved;
}

/**
 * Builds the effective goal history used for calendar computation.
 *
 * If `history` has rows, use them directly.
 * Otherwise, synthesize a single-entry history from the current `activeGoal`
 * so that pre-log records are evaluated against the active goal (fail-open).
 * If activeGoal is also absent/corrupt, return [] — pure functions already
 * fall back to DEFAULT_GOAL_KM via resolveGoalForDate (SF-12).
 *
 * @param {Array} history
 * @param {*} activeGoal
 * @returns {Array<{ effective_from: string, target_distance_km: number, target_steps?: number }>}
 */
export function buildEffectiveGoalHistory(history, activeGoal) {
  if (Array.isArray(history) && history.length > 0) {
    return history;
  }
  if (_isValidActiveGoalForHistory(activeGoal)) {
    return [
      {
        effective_from: activeGoal.effective_from,
        target_distance_km: activeGoal.target_distance_km,
        target_steps: activeGoal.target_steps,
      },
    ];
  }
  return [];
}
