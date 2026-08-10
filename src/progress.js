/**
 * Pure computation module for today's progress.
 * No DOM, no Dexie import.
 * All collaborators are injected.
 */

import { KM_TO_STEPS, DEFAULT_GOAL_KM, DEFAULT_GOAL_STEPS } from './goal.js';

/**
 * Local-time YYYY-MM-DD formatter.
 * Uses getFullYear/getMonth/getDate — never toISOString() — so dates are
 * timezone-safe (mirrors the _formatLocalDate convention in steps.js:161-167).
 *
 * @param {number} [ms=Date.now()] - timestamp in milliseconds
 * @returns {string} YYYY-MM-DD
 */
export function _formatLocalDate(ms = Date.now()) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${MM}-${dd}`;
}

/**
 * Thin data-access passthrough: fetch today's daily_records row.
 * May reject — progress-ui owns the try/catch.
 *
 * @param {{ daily_records: { get: Function } }} db - injected Dexie db handle
 * @returns {Promise<object|undefined>}
 */
export function getTodayRecord(db) {
  return db.daily_records.get(_formatLocalDate(Date.now()));
}

/**
 * Pure computation: given today's record and the active goal, returns all
 * progress metrics needed to render the card.
 *
 * Guard clauses (SF-6):
 *   - Falsy todayRecord → zero defaults.
 *   - Non-finite/absent target_steps or target_distance_km on activeGoal → fail-open to default goal.
 *   - target_steps <= 0 → pct = 0, goalMet = false (no NaN / Infinity).
 *
 * @param {{ effective_steps: number, effective_distance_km: number }|null|undefined} todayRecord
 * @param {{ target_steps: number, target_distance_km: number }|null|undefined} activeGoal
 * @returns {{ steps: number, distance_km: number, target_steps: number, target_km: number,
 *             pct: number, remaining_steps: number, remaining_m: number,
 *             remaining_km: number, goalMet: boolean }}
 */
export function computeProgress(todayRecord, activeGoal) {
  // Guard: absent record → zero defaults
  const steps = (todayRecord && Number.isFinite(todayRecord.effective_steps))
    ? todayRecord.effective_steps
    : 0;
  const distance_km = (todayRecord && Number.isFinite(todayRecord.effective_distance_km))
    ? todayRecord.effective_distance_km
    : 0;

  // Guard: corrupt / absent activeGoal → fail-open to default
  const rawTargetSteps = activeGoal ? activeGoal.target_steps : undefined;
  const rawTargetKm = activeGoal ? activeGoal.target_distance_km : undefined;

  // Non-finite (NaN, Infinity, absent) target → fail-open to defaults
  // Zero is handled separately below (pct=0, no default substitution)
  const targetStepsNonFinite = !Number.isFinite(rawTargetSteps);
  const targetKmNonFinite = !Number.isFinite(rawTargetKm);
  const useDefault = targetStepsNonFinite || targetKmNonFinite;

  const target_steps = useDefault ? DEFAULT_GOAL_STEPS : rawTargetSteps;
  const target_km = (useDefault || rawTargetKm <= 0) ? DEFAULT_GOAL_KM : rawTargetKm;

  // Guard: target_steps <= 0 → pct = 0, goalMet = false (no division-by-zero)
  if (target_steps <= 0) {
    return {
      steps,
      distance_km,
      target_steps,
      target_km: rawTargetKm <= 0 ? 0 : target_km,
      pct: 0,
      remaining_steps: 0,
      remaining_m: 0,
      remaining_km: 0,
      goalMet: false,
    };
  }

  const pct = Math.min(100, Math.round((steps / target_steps) * 100));
  const remaining_steps = Math.max(0, target_steps - steps);
  const remaining_km = remaining_steps / KM_TO_STEPS;
  const remaining_m = Math.round(remaining_km * 1000);
  const goalMet = pct >= 100;

  return {
    steps,
    distance_km,
    target_steps,
    target_km,
    pct,
    remaining_steps,
    remaining_m,
    remaining_km,
    goalMet,
  };
}
