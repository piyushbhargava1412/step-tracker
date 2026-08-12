/**
 * Challenge engine.
 * Manages the active group challenge stored in the Dexie `settings` store under
 * the key `'active_challenge'`.
 *
 * Pure engine — no DOM imports. All DOM work belongs in `challenge-ui.js`.
 * Follows the factory-with-DI pattern from `goal.js`.
 */

export const ACTIVE_CHALLENGE_KEY = 'active_challenge';

/**
 * Returns true when a stored row has the minimum required fields for a valid
 * active challenge: `start_date` and `end_date` must both be strings.
 * @param {*} row
 * @returns {boolean}
 */
function _isValidChallengeRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (typeof row.start_date !== 'string') return false;
  if (typeof row.end_date !== 'string') return false;
  return true;
}

/**
 * Factory: Challenge engine.
 *
 * @param {{ settings: { get: Function, put: Function } }} db - injected Dexie db handle
 * @returns {{ getActiveChallenge: Function, setActiveChallenge: Function }}
 */
export function createChallenge(db) {
  /**
   * Reads the active challenge from the `settings` store.
   * Returns the stored row when it is a valid challenge object; returns `null`
   * for absent or corrupt rows. Read errors are logged and swallowed — never
   * throws.
   *
   * @returns {Promise<object|null>}
   */
  async function getActiveChallenge() {
    let row;
    try {
      row = await db.settings.get(ACTIVE_CHALLENGE_KEY);
    } catch (err) {
      console.error('[challenge]', err);
      return null;
    }

    return _isValidChallengeRow(row) ? row : null;
  }

  /**
   * Persists a new or updated active challenge.
   *
   * Guard clause: throws `RangeError` when `end_date < start_date`.
   * Preserves the existing `created_at` on edit; sets a fresh ISO timestamp on
   * first save. DB write errors are logged and swallowed (fail-open) — the
   * `RangeError` guard still propagates.
   *
   * @param {{ name?: string|null, start_date: string, end_date: string }} options
   * @returns {Promise<void>}
   */
  async function setActiveChallenge({ name, start_date, end_date } = {}) {
    if (end_date < start_date) {
      throw new RangeError(
        `setActiveChallenge: end_date (${end_date}) must not be before start_date (${start_date})`
      );
    }

    // Preserve created_at from an existing row; set a new one on first save.
    let created_at;
    try {
      const existing = await db.settings.get(ACTIVE_CHALLENGE_KEY);
      created_at =
        existing && typeof existing.created_at === 'string'
          ? existing.created_at
          : new Date().toISOString();
    } catch {
      created_at = new Date().toISOString();
    }

    try {
      await db.settings.put({
        key: ACTIVE_CHALLENGE_KEY,
        name: name ?? null,
        start_date,
        end_date,
        created_at,
      });
    } catch (err) {
      console.error('[challenge]', err);
    }
  }

  return { getActiveChallenge, setActiveChallenge };
}

// ---------------------------------------------------------------------------
// Pure metric helpers
// ---------------------------------------------------------------------------

import { _localDate, _addDaysUtc } from './date-utils.js';

/**
 * Computes the four challenge metrics from a challenge object and a set of
 * daily records. Pure — no DOM, no Dexie. Records are passed by the caller.
 *
 * Mirrors `computeNearMisses` in search.js as a module-level export.
 *
 * @param {{ start_date: string, end_date: string }} challenge
 * @param {Array<{ date: string, effective_steps: number }>} records
 * @returns {{
 *   yesterdaySteps: number,
 *   cumulativeTotal: number,
 *   elapsedDays: number,
 *   totalDays: number,
 *   avgPace: number,
 *   completed: boolean,
 * }}
 */
export function computeChallengeMetrics(challenge, records) {
  const today = _localDate();
  const yesterday = _addDaysUtc(today, -1);
  const { start_date, end_date } = challenge;

  // SF-1 decision A: completed = end_date strictly before today
  const completed = end_date < today;

  // Cumulative date range boundary (inclusive on both ends)
  const rangeEnd = completed ? end_date : yesterday;

  // Yesterday's Steps: always today-1, regardless of completion state (SF-1)
  const yesterdayRecord = records.find(r => r.date === yesterday);
  const yesterdaySteps = yesterdayRecord ? yesterdayRecord.effective_steps : 0;

  // Cumulative Total: records within [start_date, rangeEnd]
  let cumulativeTotal = 0;
  for (const r of records) {
    if (r.date >= start_date && r.date <= rangeEnd) {
      cumulativeTotal += r.effective_steps;
    }
  }

  // Elapsed-day counter
  // Active: (yesterday - start_date) + 1, floored at 0
  // Completed: full duration
  let elapsedDays;
  if (completed) {
    elapsedDays = _daysBetween(start_date, end_date) + 1;
  } else {
    const raw = _daysBetween(start_date, yesterday) + 1;
    elapsedDays = Math.max(0, raw);
  }

  // Total duration M for "Day N of M" label
  const totalDays = _daysBetween(start_date, end_date) + 1;

  // Average pace — guarded against divide-by-zero
  const avgPace = elapsedDays === 0 ? 0 : cumulativeTotal / elapsedDays;

  return { yesterdaySteps, cumulativeTotal, elapsedDays, totalDays, avgPace, completed };
}

/**
 * Returns the number of calendar days between two YYYY-MM-DD strings.
 * Result is negative when dateA > dateB.
 * @param {string} dateA
 * @param {string} dateB
 * @returns {number}
 */
function _daysBetween(dateA, dateB) {
  const MS_PER_DAY = 86_400_000;
  const [ay, am, ad] = dateA.split('-').map(Number);
  const [by, bm, bd] = dateB.split('-').map(Number);
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY;
}

// ---------------------------------------------------------------------------
// Copy-text formatter
// ---------------------------------------------------------------------------

/**
 * Formats a human-readable challenge update string suitable for sharing.
 *
 * Template (single trailing newline):
 *   🚶 {name} Update
 *   📅 Yesterday's Steps: {yesterday}
 *   📊 Cumulative Total: {cumulative} steps (Day {elapsedDays})
 *   📈 Average Pace: {avgPace} steps/day
 *
 * @param {{ yesterdaySteps: number, cumulativeTotal: number, elapsedDays: number, avgPace: number }} metrics
 * @param {string|null|undefined} name - Challenge name; falls back to 'Step Challenge' when null/empty.
 * @returns {string}
 */
export function formatChallengeUpdate(metrics, name) {
  const displayName = (name && name.trim()) ? name : 'Step Challenge';
  const { yesterdaySteps, cumulativeTotal, elapsedDays, avgPace } = metrics;
  const fmt = n => Number(n).toLocaleString('en-US');
  const avgPaceFormatted = fmt(Math.round(avgPace));
  return (
    `🚶 ${displayName} Update\n` +
    `📅 Yesterday's Steps: ${fmt(yesterdaySteps)}\n` +
    `📊 Cumulative Total: ${fmt(cumulativeTotal)} steps (Day ${elapsedDays})\n` +
    `📈 Average Pace: ${avgPaceFormatted} steps/day\n`
  );
}
