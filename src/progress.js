/**
 * Pure computation module for today's progress.
 * No DOM, no Dexie import.
 * All collaborators are injected.
 */

import { DEFAULT_STEP_GOAL } from './goal.js';
import { _localDate } from './date-utils.js';

/**
 * Thin data-access passthrough: fetch today's daily_records row.
 * May reject — progress-ui owns the try/catch.
 *
 * @param {{ daily_records: { get: Function } }} db - injected Dexie db handle
 * @returns {Promise<object|undefined>}
 */
export function getTodayRecord(db) {
  return db.daily_records.get(_localDate(Date.now()));
}

/**
 * Pure computation: given today's record and the active step goal, returns all
 * progress metrics needed to render the card.
 *
 * Guard clauses (fail-open):
 *   - Falsy todayRecord or non-finite effective_steps → steps = 0.
 *   - Non-finite or non-positive stepGoal → fail-open to DEFAULT_STEP_GOAL,
 *     which also makes division-by-zero structurally impossible.
 *
 * @param {{ effective_steps: number }|null|undefined} todayRecord
 * @param {number|null|undefined} stepGoal - the active step goal (a plain integer)
 * @returns {{ steps: number, target_steps: number, pct: number,
 *             remaining_steps: number, goalMet: boolean }}
 */
export function computeProgress(todayRecord, stepGoal) {
  // Guard: absent / corrupt record → zero steps
  const steps = (todayRecord && Number.isFinite(todayRecord.effective_steps))
    ? todayRecord.effective_steps
    : 0;

  // Guard: absent / corrupt / non-positive goal → fail-open to the default.
  // Fires before the division, so pct can never be NaN or Infinity.
  const target_steps = (Number.isFinite(stepGoal) && stepGoal > 0)
    ? stepGoal
    : DEFAULT_STEP_GOAL;

  const pct = Math.min(100, Math.round((steps / target_steps) * 100));
  const remaining_steps = Math.max(0, target_steps - steps);
  const goalMet = pct >= 100;

  return {
    steps,
    target_steps,
    pct,
    remaining_steps,
    goalMet,
  };
}
