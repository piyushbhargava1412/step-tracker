/**
 * records.js — Override/revert capability module.
 * Factory: createRecords(db) → { overrideRecord, revertRecord }
 *
 * Never mutates original_steps / original_distance_km / synced_at.
 * All Dexie I/O wrapped in try/catch per repo convention.
 */
import { KM_TO_STEPS } from './goal.js';

/**
 * @param {object} db — Dexie db instance (injected by composition root)
 */
export function createRecords(db) {
  /**
   * Override a daily record with corrected effective values.
   *
   * @param {string} date — YYYY-MM-DD
   * @param {object} params
   * @param {number} params.effective_steps — required finite integer >= 0
   * @param {number} [params.effective_distance_km] — optional finite >= 0; derived if omitted
   * @param {string} params.note — required non-empty justification
   * @param {string|null} [params.proof_image_base64] — optional proof image
   */
  async function overrideRecord(date, {
    effective_steps,
    effective_distance_km,
    note,
    proof_image_base64,
  } = {}) {
    // Guard-clause validation (fail-fast, throws TypeError)
    if (
      !Number.isFinite(effective_steps) ||
      !Number.isInteger(effective_steps) ||
      effective_steps < 0
    ) {
      throw new TypeError(
        `[records] overrideRecord: effective_steps must be a finite integer >= 0; got ${effective_steps}`
      );
    }

    if (
      effective_distance_km !== undefined &&
      effective_distance_km !== null &&
      (!Number.isFinite(effective_distance_km) || effective_distance_km < 0)
    ) {
      throw new TypeError(
        `[records] overrideRecord: effective_distance_km must be a finite number >= 0; got ${effective_distance_km}`
      );
    }

    const trimmedNote = typeof note === 'string' ? note.trim() : '';
    if (!trimmedNote) {
      throw new TypeError('[records] overrideRecord: note must be a non-empty string');
    }

    // Derive distance if not provided
    const resolvedDistance =
      effective_distance_km !== undefined && effective_distance_km !== null
        ? effective_distance_km
        : effective_steps / KM_TO_STEPS;

    try {
      const row = await db.daily_records.get(date);
      const updated = {
        date,
        ...row,
        effective_steps,
        effective_distance_km: resolvedDistance,
        is_overridden: true,
        override: {
          note: trimmedNote,
          proof_image_base64: proof_image_base64 ?? null,
          updated_at: new Date().toISOString(),
        },
        // synced_at, original_steps, original_distance_km intentionally NOT touched
      };
      await db.daily_records.put(updated);
    } catch (err) {
      console.error('[records]', err);
      throw err;
    }
  }

  /**
   * Revert an overridden record back to raw synced values.
   *
   * @param {string} date — YYYY-MM-DD
   */
  async function revertRecord(date) {
    try {
      const row = await db.daily_records.get(date);
      if (!Number.isFinite(row?.original_steps)) {
        throw new TypeError('[records] revertRecord: no original values to revert to');
      }
      const reverted = { ...row };
      reverted.effective_steps = row.original_steps;
      reverted.effective_distance_km = row.original_distance_km;
      reverted.is_overridden = false;
      delete reverted.override;
      await db.daily_records.put(reverted);
    } catch (err) {
      console.error('[records]', err);
      throw err;
    }
  }

  return { overrideRecord, revertRecord };
}
