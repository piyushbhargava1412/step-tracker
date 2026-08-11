/**
 * Streak engine — pure computation.
 * No DOM writes, no Dexie import. All data arrives as plain arrays.
 *
 * The unified streak follows the Effective Date Lock rule: every day D is
 * judged against the goal that was in force on D, never against today's goal.
 */

import { DEFAULT_GOAL_KM, DEFAULT_STEP_GOAL } from './goal.js';
import { _localDate, _addDaysUtc } from './date-utils.js';
export { resolveGoalForDate } from './goal-history.js';

export const TIER_THRESHOLDS = [1.0, 3.0, 5.0, 10.0]; // km
export const LIFETIME_STEP_THRESHOLD = 10_000; // steps
export const HALL_OF_FAME_SIZE = 3; // podium entries

// Parameterized Tolerance Streak Engine — one allowed miss per N calendar days.
export const ALLOWANCE_WINDOW_95 = 20; // 95% tier: floor(d / 20) misses allowed
export const ALLOWANCE_WINDOW_90 = 10; // 90% tier: floor(d / 10) misses allowed
const ZERO_TIER_STREAKS = TIER_THRESHOLDS.map((threshold) => ({ threshold, active: 0, best: 0 }));

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

// Internal aliases for streak.js's own use of goal-history helpers.
import { _prepareGoalHistory, _resolvePreparedGoalForDate, _sortByEffectiveFrom, _isValidGoalRow, buildEffectiveGoalHistory } from './goal-history.js';

/**
 * Returns true if a daily_records row can be keyed by date.
 * Module-local so the step-based engine below owns its own record guard and
 * does not depend on the distance-era goal-history module.
 *
 * @param {*} row
 * @returns {boolean}
 */
export function _isValidRecord(row) {
  return !!row && typeof row === 'object' && typeof row.date === 'string' && row.date !== '';
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
  return _computeUnifiedStreakPrepared(usable, _prepareGoalHistory(goalHistory), today);
}

function _computeUnifiedStreakPrepared(usable, preparedGoals, today) {
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
    const goalKm = _resolvePreparedGoalForDate(preparedGoals, day);

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
  if (!Array.isArray(records) || records.length === 0) return ZERO_TIER_STREAKS;
  if (typeof today !== 'string' || today === '') return ZERO_TIER_STREAKS;

  const usable = _sortByDate(records.filter(_isValidRecord));
  return _computeTierStreaksPrepared(usable, today);
}

function _computeTierStreaksPrepared(usable, today) {
  if (usable.length === 0) return ZERO_TIER_STREAKS;

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
  return _computeHallOfFamePrepared(usable, _prepareGoalHistory(goalHistory));
}

function _computeHallOfFamePrepared(usable, preparedGoals) {
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
    const goalKm = _resolvePreparedGoalForDate(preparedGoals, date);
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
  return _computeLifetime10kPrepared(records);
}

function _computeLifetime10kPrepared(records) {
  if (records.length === 0) return { total10k: 0, totalDays: 0, pct: 0 };
  const totalDays = records.length;
  const total10k = records.filter(
    (record) => record && Number.isFinite(record.effective_steps)
      && record.effective_steps >= LIFETIME_STEP_THRESHOLD,
  ).length;
  return { total10k, totalDays, pct: (total10k / totalDays) * 100 };
}

// ── Parameterized Tolerance Streak Engine ──────────────────────────────────

/**
 * Fresh zero result — never a shared literal, so callers may safely mutate.
 *
 * @returns {{ actual: number, allowance95: number, allowance90: number }}
 */
function _zeroToleranceStreaks() {
  return { actual: 0, allowance95: 0, allowance90: 0 };
}

/**
 * Steps credited to a calendar day. A missing day, a corrupt row, or a
 * non-finite `effective_steps` all read as 0 — i.e. a miss (SF-5).
 *
 * @param {{ effective_steps?: number }|undefined} record
 * @returns {number}
 */
function _stepsFor(record) {
  return record && Number.isFinite(record.effective_steps) ? record.effective_steps : 0;
}

/**
 * Three-metric backward tolerance engine — 100% / 95% / 90% (SF-5, SF-6, SF-7).
 *
 * All three streaks are produced in a **single backward pass** over calendar
 * days, because they share one anchor and one step target:
 *
 * - **Anchor (SF-6)**: start at `today` iff a record for `today` exists and
 *   `effective_steps >= stepGoal`; otherwise start at yesterday and exclude
 *   today entirely. Today is never charged as a miss.
 * - **Traversal (SF-7)**: steps calendar days via `_addDaysUtc(day, -1)`, so
 *   `d` is calendar depth — not array position. **`d` convention: the anchor
 *   day is `d = 1`**, and `d` increments by one per calendar day walked back.
 *   This is load-bearing: `floor(d / N)` means "one miss allowed per N calendar
 *   days", so the AC arithmetic (a miss at depth 20 is affordable at N = 20 but
 *   not at depth 19) only holds with a 1-based depth.
 * - **Miss rule (SF-5)**: a missing past day reads as 0 steps and is a miss.
 *   The 100% engine terminates on the first miss. Each allowance engine spends
 *   one unit (`m += 1`) and keeps walking while `m <= floor(d / N)`, recording
 *   `last_valid_streak = d` at every qualifying depth; once `m > floor(d / N)`
 *   that engine freezes at its `last_valid_streak`.
 * - The loop ends when `day < earliestRecordDate` and returns the accumulated
 *   values — the lower bound is what stops the allowance engines walking into
 *   pre-history.
 *
 * Guards: non-array/empty `records`, or a non-string/empty `today`, return the
 * zero shape. A non-finite or non-positive `stepGoal` fails open to
 * `DEFAULT_STEP_GOAL`.
 *
 * @param {Array<{ date: string, effective_steps: number }>} records
 * @param {number} stepGoal - daily step target (S_target)
 * @param {string} today - YYYY-MM-DD
 * @returns {{ actual: number, allowance95: number, allowance90: number }}
 */
export function computeToleranceStreaks(records, stepGoal, today) {
  if (!Array.isArray(records) || records.length === 0) return _zeroToleranceStreaks();
  if (typeof today !== 'string' || today === '') return _zeroToleranceStreaks();

  const target = Number.isFinite(stepGoal) && stepGoal > 0 ? stepGoal : DEFAULT_STEP_GOAL;

  // Drop unusable rows and future-dated rows (clock skew), then index by date.
  const usable = _sortByDate(
    records.filter((r) => _isValidRecord(r) && r.date <= today),
  );
  if (usable.length === 0) return _zeroToleranceStreaks();

  const byDate = new Map(usable.map((r) => [r.date, r]));
  const earliestRecordDate = usable[0].date;

  // SF-6: today only anchors the walk when it is present and already met.
  const todayRecord = byDate.get(today);
  const anchor = todayRecord && _stepsFor(todayRecord) >= target
    ? today
    : _addDaysUtc(today, -1);

  let actual = 0;
  let actualAlive = true;
  let misses = 0;

  // One tracker per allowance tier — each spends `misses` against its own
  // window and freezes at its `last_valid_streak` (`value`) once it can no
  // longer afford the miss count. Order matches the returned shape.
  const allowances = [
    { window: ALLOWANCE_WINDOW_95, value: 0, alive: true },
    { window: ALLOWANCE_WINDOW_90, value: 0, alive: true },
  ];

  let day = anchor;
  let d = 0; // calendar depth; the anchor day is d = 1

  while (day >= earliestRecordDate && (actualAlive || allowances.some((a) => a.alive))) {
    d += 1;
    const met = _stepsFor(byDate.get(day)) >= target;

    if (met) {
      if (actualAlive) actual = d;
    } else {
      actualAlive = false;
      misses += 1;
    }

    for (const allowance of allowances) {
      if (!allowance.alive) continue;
      if (misses <= Math.floor(d / allowance.window)) allowance.value = d;
      else allowance.alive = false;
    }

    day = _addDaysUtc(day, -1);
  }

  const [allowance95, allowance90] = allowances.map((a) => a.value);

  return { actual, allowance95, allowance90 };
}

// ── createStreak helper ────────────────────────────────────────────────────

/**
 * Streak data factory — orchestrates Dexie reads and delegates computation to
 * the pure functions above.  Zero DOM writes; error handling delegated to the
 * render layer (streak-ui.js) — `compute()` intentionally rejects on any DB
 * failure (mirrors `getTodayRecord`'s contract in src/progress.js:16-18).
 *
 * @param {{ daily_records: { toArray: Function }, goal_history: { toArray: Function }, settings: { get: Function } }} db
 * @returns {{ compute: Function }}
 */
export function createStreak(db) {
  /**
   * Reads all three stores in parallel, applies the SF-1 synthetic-history
   * fallback, filters future-dated records, and returns the full compute result.
   *
   * May reject — the render layer owns the try/catch and reports the error.
   *
   * @returns {Promise<{ unified: number, tiers: Array, hallOfFame: Array, lifetime: object, activeGoalKm: number }>}
   */
  async function compute() {
    const historyPromise = db.goal_history.toArray().catch((err) => {
      // History is an optional audit aid; current active_goal remains usable.
      console.error('[streak]', err);
      return [];
    });
    const [records, activeGoal, history] = await Promise.all([
      db.daily_records.toArray(),
      db.settings.get('active_goal'),
      historyPromise,
    ]);

    const today = _localDate();

    // ── SF-1 goalHistory fallback ─────────────────────────────────────────
    let goalHistory = buildEffectiveGoalHistory(history, activeGoal);

    // ── SF-3/SF-6 activeGoalKm ────────────────────────────────────────────
    // Drives the goal label and active tier chip in streak-ui.  Falls back to
    // DEFAULT_GOAL_KM for absent, corrupt, or non-positive values.
    const rawKm = activeGoal?.target_distance_km;
    const activeGoalKm = Number.isFinite(rawKm) && rawKm > 0 ? rawKm : DEFAULT_GOAL_KM;

    // ── Filter future-dated records ───────────────────────────────────────
    // Sync can deposit rows with a future date (clock skew, ahead-of-midnight
    // writes).  They must not inflate HoF, best-ever, or active streak counts.
    const filteredRecords = (Array.isArray(records) ? records : []).filter(
      (r) => r && typeof r.date === 'string' && r.date <= today,
    );
    const preparedRecords = _sortByDate(filteredRecords.filter(_isValidRecord));
    const preparedGoals = _prepareGoalHistory(goalHistory);

    return {
      unified:     _computeUnifiedStreakPrepared(preparedRecords, preparedGoals, today),
      tiers:       _computeTierStreaksPrepared(preparedRecords, today),
      hallOfFame:  _computeHallOfFamePrepared(preparedRecords, preparedGoals),
      lifetime:    _computeLifetime10kPrepared(preparedRecords),
      activeGoalKm,
    };
  }

  return { compute };
}
