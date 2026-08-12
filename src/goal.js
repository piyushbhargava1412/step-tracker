/**
 * Goal engine.
 * Manages the active daily step goal stored in the Dexie `settings` store.
 *
 * `active_step_goal` is a freely re-selectable live preference with no
 * effective-from/date-scoping semantics and no goal_history write. The current
 * value is applied uniformly to every historical day — there is no "goal in
 * force on date D" (SF-3 owner clarification). No Dexie import — `db` is
 * injected by the composition root.
 */

export const STEP_GOAL_OPTIONS = [5000, 7500, 10000, 15000];
export const DEFAULT_STEP_GOAL = 10000;
export const ACTIVE_STEP_GOAL_KEY = 'active_step_goal';

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
 * Factory: Goal engine.
 *
 * @param {{ settings: { get: Function, put: Function } }} db - injected Dexie db handle
 * @returns {{ getActiveStepGoal: Function, setActiveStepGoal: Function }}
 */
export function createGoal(db) {
  /**
   * Persists { key: ACTIVE_STEP_GOAL_KEY, target_steps }. Write failures are
   * logged and swallowed — fail-open, never throws.
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

  return { getActiveStepGoal, setActiveStepGoal };
}
