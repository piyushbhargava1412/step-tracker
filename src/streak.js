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

/**
 * Tier streaks for each threshold in TIER_THRESHOLDS.
 *
 * Returns an array in TIER_THRESHOLDS order. For each threshold:
 * - `active`: backward walk from today with the in-progress rule (SF-9).
 *   Today's record missing or below threshold → skip today, evaluate from
 *   yesterday. First failing or missing past day terminates (SF-2).
 * - `best`: longest consecutive `>=` run anywhere in the full history,
 *   including today if it passes. A failing or missing calendar day breaks
 *   the run.
 *
 * SF-8: evaluation uses `>=` (not `>`).
 * SF-9: in-progress rule applies only to the active streak, not to best.
 * SF-13: non-finite `effective_distance_km` is treated as 0 (fails the tier).
 *
 * @param {Array<{ date: string, effective_distance_km: number }>} records
 * @param {string} today - YYYY-MM-DD (in-progress anchor for the active streak)
 * @returns {Array<{ threshold: number, active: number, best: number }>}
 */
export function computeTierStreaks(records, today) {
  const ZERO_STATE = TIER_THRESHOLDS.map((threshold) => ({ threshold, active: 0, best: 0 }));

  if (!Array.isArray(records) || records.length === 0) return ZERO_STATE;
  if (typeof today !== 'string' || today === '') return ZERO_STATE;

  const usable = _sortByDate(records.filter(_isValidRecord));
  if (usable.length === 0) return ZERO_STATE;

  const byDate = new Map(usable.map((r) => [r.date, r]));
  const earliest = usable[0].date;

  return TIER_THRESHOLDS.map((threshold) => {
    // ── Active streak (in-progress rule, SF-9) ────────────────────────────
    // Walk backward from today; today gets a skip pass if below/missing;
    // any past day that is missing or below threshold terminates the streak.
    let active = 0;
    let day = today;

    while (day >= earliest) {
      const isToday = day === today;
      const record = byDate.get(day);

      if (!record) {
        if (!isToday) break; // past gap terminates (SF-2)
        day = _addDaysUtc(day, -1); // today in-progress — skip
        continue;
      }

      const km = Number.isFinite(record.effective_distance_km)
        ? record.effective_distance_km
        : 0; // SF-13: non-finite fails the tier

      if (km >= threshold) {
        active += 1;
      } else if (!isToday) {
        break; // past shortfall terminates
      }
      // today shortfall: skip (no increment, no break), fall through to decrement

      day = _addDaysUtc(day, -1);
    }

    // ── Best-ever (full history scan, no in-progress concept) ─────────────
    // A single ascending pass; a calendar gap (missing day) or a failing day
    // both reset the current run.
    let best = 0;
    let currentRun = 0;
    let prevDate = null;

    for (const record of usable) {
      // Non-consecutive calendar dates → gap; reset before evaluating this day
      if (prevDate !== null && record.date !== _addDaysUtc(prevDate, 1)) {
        currentRun = 0;
      }

      const km = Number.isFinite(record.effective_distance_km)
        ? record.effective_distance_km
        : 0; // SF-13

      if (km >= threshold) {
        currentRun += 1;
        if (currentRun > best) best = currentRun;
      } else {
        currentRun = 0; // failing day breaks the run
      }

      prevDate = record.date;
    }

    return { threshold, active, best };
  });
}

/**
 * Hall of Fame — top-N longest unified streak periods.
 *
 * Single ascending pass (SF-14): walks sorted records, evaluates each day
 * against G(D), and splits the current period at any failing or missing day.
 * No in-progress concept — today passes or fails on its own record (SF-7).
 * Periods are ranked by `days` desc, then `startDate` desc (recency
 * tie-break, SF-7). Returns up to `HALL_OF_FAME_SIZE` entries.
 *
 * @param {Array<{ date: string, effective_distance_km: number }>} records
 * @param {Array<{ effective_from: string, target_distance_km: number }>} goalHistory
 * @returns {Array<{ startDate: string, endDate: string, days: number }>}
 */
export function computeHallOfFame(records, goalHistory) {
  if (!Array.isArray(records) || records.length === 0) return [];

  const usable = _sortByDate(records.filter(_isValidRecord));
  if (usable.length === 0) return [];

  const periods = [];
  let periodStart = null;
  let periodEnd = null;
  let periodDays = 0;
  let prevDate = null;

  for (const record of usable) {
    const date = record.date;
    const distance = Number.isFinite(record.effective_distance_km)
      ? record.effective_distance_km
      : 0; // SF-13: non-finite fails the day
    const goalKm = resolveGoalForDate(goalHistory, date);
    const passes = distance >= goalKm;

    // A passing day extends the period only when it is calendar-consecutive.
    const isConsecutive = prevDate !== null && date === _addDaysUtc(prevDate, 1);

    if (passes) {
      if (periodStart !== null && isConsecutive) {
        // Extend the open period
        periodEnd = date;
        periodDays += 1;
      } else {
        // Close any open period before starting a new one
        if (periodStart !== null) {
          periods.push({ startDate: periodStart, endDate: periodEnd, days: periodDays });
        }
        periodStart = date;
        periodEnd = date;
        periodDays = 1;
      }
    } else {
      // Failing day — close the open period (if any)
      if (periodStart !== null) {
        periods.push({ startDate: periodStart, endDate: periodEnd, days: periodDays });
        periodStart = null;
        periodEnd = null;
        periodDays = 0;
      }
    }

    prevDate = date;
  }

  // Close the final open period
  if (periodStart !== null) {
    periods.push({ startDate: periodStart, endDate: periodEnd, days: periodDays });
  }

  // Rank: days desc; same days → later startDate first (recency tie-break, SF-7)
  periods.sort((a, b) => {
    if (b.days !== a.days) return b.days - a.days;
    // Descending startDate: a more recent than b → a before b (return -1)
    return a.startDate > b.startDate ? -1 : a.startDate < b.startDate ? 1 : 0;
  });

  return periods.slice(0, HALL_OF_FAME_SIZE);
}

/**
 * Lifetime 10k-step metrics (AC Scenario 4).
 *
 * `totalDays` is the full record count; `total10k` counts records whose
 * `effective_steps` is finite and `>= LIFETIME_STEP_THRESHOLD` (SF-13:
 * non-finite steps contribute 0). Division-by-zero guard: `pct = 0` when
 * there are no records.
 *
 * @param {Array<{ effective_steps: number }>} records
 * @returns {{ total10k: number, totalDays: number, pct: number }}
 */
export function computeLifetime10k(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { total10k: 0, totalDays: 0, pct: 0 };
  }

  const totalDays = records.length;
  const total10k = records.filter(
    (record) =>
      record &&
      Number.isFinite(record.effective_steps) &&
      record.effective_steps >= LIFETIME_STEP_THRESHOLD,
  ).length;

  const pct = totalDays > 0 ? (total10k / totalDays) * 100 : 0; // division-by-zero guard
  return { total10k, totalDays, pct };
}
