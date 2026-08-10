/**
 * Goal Commitment engine.
 * Manages the active daily distance goal stored in the Dexie `settings` store.
 * No Dexie import — `db` is injected by the composition root.
 */

export const GOAL_PRESETS_KM = [1, 3, 5, 10];
export const DEFAULT_GOAL_KM = 3.0;
export const KM_TO_STEPS = 1312.33;
export const DEFAULT_GOAL_STEPS = Math.round(DEFAULT_GOAL_KM * KM_TO_STEPS); // 3937
export const ACTIVE_GOAL_KEY = 'active_goal';

/**
 * Local-time YYYY-MM-DD formatter.
 * Uses getFullYear/getMonth/getDate — never toISOString() — so dates are
 * timezone-safe (mirrors the _formatLocalDate convention in steps.js:161-167).
 *
 * @param {number} [ms=Date.now()] - timestamp in milliseconds
 * @returns {string} YYYY-MM-DD
 */
export function _localDate(ms = Date.now()) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${MM}-${dd}`;
}

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
 * Factory: Goal Commitment engine.
 *
 * @param {{ settings: { get: Function, put: Function } }} db - injected Dexie db handle
 * @returns {{ getActiveGoal: Function, setActiveGoal: Function }}
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

  return { getActiveGoal, setActiveGoal };
}
