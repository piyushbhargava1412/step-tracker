/**
 * Goal Commitment engine.
 * Manages the active daily distance goal stored in the Dexie `settings` store.
 * No Dexie import — `db` is injected by the composition root.
 */

import { _localDate } from './date-utils.js';
import { KM_TO_STEPS } from './units.js';

export const GOAL_PRESETS_KM = [1, 3, 5, 10];
export const DEFAULT_GOAL_KM = 3.0;
export const DEFAULT_GOAL_STEPS = Math.round(DEFAULT_GOAL_KM * KM_TO_STEPS); // 3937
export const ACTIVE_GOAL_KEY = 'active_goal';

// --- Step-goal API (strangler seam, additive — see SF-3/SF-9/SF-10) ---
// `active_step_goal` is a freely re-selectable live preference with no
// effective-from/date-scoping semantics and no goal_history write, applied
// uniformly to every historical day (SF-3 owner clarification).
export const STEP_GOAL_OPTIONS = [5000, 7500, 10000, 15000];
export const DEFAULT_STEP_GOAL = 10000;
export const ACTIVE_STEP_GOAL_KEY = 'active_step_goal';

/**
 * Returns true if a stored goal row is valid (not corrupt).
 * @param {*} row
 * @returns {boolean}
 */
function _isValidRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (!Number.isFinite(row.target_distance_km) || row.target_distance_km <= 0) return false;
  if (!Number.isFinite(row.target_steps) || row.target_steps <= 0) return false;
  return true;
}

/**
 * Builds the default goal row.
 * @returns {{ key: string, target_distance_km: number, target_steps: number, effective_from: string }}
 */
function _defaultGoalRow() {
  return {
    key: ACTIVE_GOAL_KEY,
    target_distance_km: DEFAULT_GOAL_KM,
    target_steps: DEFAULT_GOAL_STEPS,
    effective_from: _localDate(),
  };
}

/**
 * Returns true if a stored step-goal row is valid and its target_steps is a
 * member of STEP_GOAL_OPTIONS.
 * @param {*} row
 * @returns {boolean}
 */
function _isValidStepGoalRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (!Number.isFinite(row.target_steps)) return false;
  return STEP_GOAL_OPTIONS.includes(row.target_steps);
}

/**
 * Factory: Goal Commitment engine.
 *
 * @param {{ settings: { get: Function, put: Function } }} db - injected Dexie db handle
 * @returns {{ getActiveGoal: Function, setActiveGoal: Function, getActiveStepGoal: Function, setActiveStepGoal: Function }}
 */
export function createGoal(db) {
  /**
   * Read-or-init: returns the active goal, lazily persisting the 3.0 km
   * default on first call if no row exists. Corrupt rows are re-initialised
   * to the default. Read/write failures are logged and fail-open — never throws.
   *
   * @returns {Promise<{ key: string, target_distance_km: number, target_steps: number, effective_from: string }>}
   */
  async function getActiveGoal() {
    let row;
    try {
      row = await db.settings.get(ACTIVE_GOAL_KEY);
    } catch (err) {
      console.error('[goal]', err);
      return _defaultGoalRow();
    }

    if (_isValidRow(row)) {
      return row;
    }

    // Absent or corrupt row — lazily write and return the default
    const defaultRow = _defaultGoalRow();
    try {
      await db.settings.put(defaultRow);
      if (db.goal_history?.put) {
        await db.goal_history.put({
          effective_from: defaultRow.effective_from,
          target_distance_km: defaultRow.target_distance_km,
          target_steps: defaultRow.target_steps,
        });
      }
    } catch (err) {
      console.error('[goal]', err);
    }
    return defaultRow;
  }

  /**
   * Persists a new active goal.
   * Guard clause: throws TypeError for any non-finite or non-positive km value.
   * Write failures are logged and do NOT rethrow (fail-open for the card).
   *
   * @param {number} km - target distance in kilometres (must be finite and > 0)
   * @returns {Promise<void>}
   */
  async function setActiveGoal(km) {
    if (!Number.isFinite(km) || km <= 0) {
      throw new TypeError(
        `setActiveGoal: km must be a finite number greater than 0, got ${km}`
      );
    }

    const row = {
      key: ACTIVE_GOAL_KEY,
      target_distance_km: km,
      target_steps: Math.round(km * KM_TO_STEPS),
      effective_from: _localDate(),
    };

    try {
      await db.settings.put(row);
      if (db.goal_history?.put) {
        await db.goal_history.put({
          effective_from: row.effective_from,
          target_distance_km: row.target_distance_km,
          target_steps: row.target_steps,
        });
      }
    } catch (err) {
      console.error('[goal]', err);
      // Intentionally no rethrow — caller card keeps rendering the last persisted goal
    }
  }

  /**
   * Persists { key: ACTIVE_STEP_GOAL_KEY, target_steps }. Write failures are
   * logged and swallowed — fail-open, never throws (caller keeps rendering
   * the last persisted goal).
   *
   * @param {number} targetSteps
   * @returns {Promise<void>}
   */
  async function _persistStepGoal(targetSteps) {
    try {
      await db.settings.put({ key: ACTIVE_STEP_GOAL_KEY, target_steps: targetSteps });
    } catch (err) {
      console.error('[goal]', err);
    }
  }

  /**
   * Read-or-init: returns the active step goal (a plain integer), lazily
   * persisting DEFAULT_STEP_GOAL on first call if no row exists. Corrupt or
   * out-of-enum rows are re-initialised to the default. Read/write failures
   * are logged and fail-open — never throws.
   *
   * SF-3: the persisted row is exactly { key, target_steps } — no
   * effective_from/date-scoping field, and no goal_history write.
   *
   * @returns {Promise<number>}
   */
  async function getActiveStepGoal() {
    let row;
    try {
      row = await db.settings.get(ACTIVE_STEP_GOAL_KEY);
    } catch (err) {
      console.error('[goal]', err);
      return DEFAULT_STEP_GOAL;
    }

    if (_isValidStepGoalRow(row)) {
      return row.target_steps;
    }

    // Absent, corrupt, or out-of-enum row — lazily write and return the default
    await _persistStepGoal(DEFAULT_STEP_GOAL);
    return DEFAULT_STEP_GOAL;
  }

  /**
   * Persists a new active step goal.
   * Guard clause: throws TypeError for any value not in STEP_GOAL_OPTIONS.
   * Write failures are logged and do NOT rethrow (fail-open for the card).
   *
   * SF-3: the persisted row is exactly { key, target_steps } — no
   * effective_from/date-scoping field, and no goal_history write.
   *
   * @param {number} steps - target step count (must be a member of STEP_GOAL_OPTIONS)
   * @returns {Promise<void>}
   */
  async function setActiveStepGoal(steps) {
    if (!STEP_GOAL_OPTIONS.includes(steps)) {
      throw new TypeError(
        `setActiveStepGoal: steps must be one of ${STEP_GOAL_OPTIONS.join(', ')}, got ${steps}`
      );
    }

    await _persistStepGoal(steps);
  }

  return { getActiveGoal, setActiveGoal, getActiveStepGoal, setActiveStepGoal };
}
