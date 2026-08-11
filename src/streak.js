/**
 * Streak engine — pure computation.
 * No DOM writes, no Dexie import. All data arrives as plain arrays.
 *
 * SF-3: there is exactly one evaluation lens — the live `active_step_goal`
 * scalar. It carries no effective-from/date-scoping semantics: the *current*
 * value is applied uniformly to *every* historical day, for the tolerance
 * streaks, the Hall of Fame, and the lifetime compliance metric alike.
 */

import { DEFAULT_STEP_GOAL, STEP_GOAL_OPTIONS } from './goal.js';
import { _localDate, _addDaysUtc } from './date-utils.js';

// SF-4b: the tier ladder is the step-goal enum itself — verbatim, no
// conversion. This keeps the goal enum and the tier ladder from drifting.
export const TIER_STEP_THRESHOLDS = STEP_GOAL_OPTIONS;
export const HALL_OF_FAME_SIZE = 3; // podium entries

// Parameterized Tolerance Streak Engine — one allowed miss per N calendar days.
export const ALLOWANCE_WINDOW_95 = 20; // 95% tier: floor(d / 20) misses allowed
export const ALLOWANCE_WINDOW_90 = 10; // 90% tier: floor(d / 10) misses allowed
const ZERO_TIER_STREAKS = TIER_STEP_THRESHOLDS.map((threshold) => ({ threshold, active: 0, best: 0 }));

/**
 * Builds a stable ascending comparator over a string key. Stability keeps
 * insertion order for equal keys, so same-date rows keep their arrival order.
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
 * Returns true if a daily_records row can be keyed by date.
 * Module-local so this engine owns its own record guard outright.
 *
 * @param {*} row
 * @returns {boolean}
 */
export function _isValidRecord(row) {
  return !!row && typeof row === 'object' && typeof row.date === 'string' && row.date !== '';
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
 * Normalises a caller-supplied step goal. Fail-open: a non-finite or
 * non-positive value falls back to `DEFAULT_STEP_GOAL` (SF-4c/SF-4d).
 *
 * @param {*} stepGoal
 * @returns {number}
 */
function _resolveStepGoal(stepGoal) {
  return Number.isFinite(stepGoal) && stepGoal > 0 ? stepGoal : DEFAULT_STEP_GOAL;
}

/**
 * Tier streaks for each threshold in TIER_STEP_THRESHOLDS.
 *
 * Returns an array in TIER_STEP_THRESHOLDS order. For each threshold:
 * - `active`: backward walk from today with the in-progress rule (SF-9).
 *   Today's record missing or below threshold → skip today, evaluate from
 *   yesterday. First failing or missing past day terminates (SF-2).
 * - `best`: longest consecutive `>=` run anywhere in the full history,
 *   including today if it passes. A failing or missing calendar day breaks
 *   the run.
 *
 * SF-8: evaluation uses `>=` (not `>`).
 * SF-9: in-progress rule applies only to the active streak, not to best.
 * SF-13: non-finite `effective_steps` is treated as 0 (fails the tier).
 *
 * @param {Array<{ date: string, effective_steps: number }>} records
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

  return TIER_STEP_THRESHOLDS.map((threshold) => {
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

      if (_stepsFor(record) >= threshold) {
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

      if (_stepsFor(record) >= threshold) {
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
 * Hall of Fame — top-N longest strict (100%) step-goal periods (SF-4c).
 *
 * Single ascending pass (SF-14): walks sorted records, evaluates each day
 * against the single active step goal, and splits the current period at any
 * failing day or non-calendar-consecutive date (a missing day is a gap, SF-5).
 * No in-progress concept — today passes or fails on its own record (SF-7).
 * Periods are ranked by `days` desc, then `startDate` desc (recency
 * tie-break, SF-7). Returns up to `HALL_OF_FAME_SIZE` entries.
 *
 * Strict only: the Hall of Fame reports best *runs*, so there are no 95%/90%
 * podium variants. Fail-open: a non-finite or non-positive `stepGoal` falls
 * back to `DEFAULT_STEP_GOAL`.
 *
 * @param {Array<{ date: string, effective_steps: number }>} records
 * @param {number} stepGoal - daily step target applied to every historical day
 * @returns {Array<{ startDate: string, endDate: string, days: number }>}
 */
export function computeHallOfFame(records, stepGoal) {
  if (!Array.isArray(records) || records.length === 0) return [];

  const usable = _sortByDate(records.filter(_isValidRecord));
  return _computeHallOfFamePrepared(usable, _resolveStepGoal(stepGoal));
}

function _computeHallOfFamePrepared(usable, target) {
  if (usable.length === 0) return [];

  const periods = [];
  let periodStart = null;
  let periodEnd = null;
  let periodDays = 0;
  let prevDate = null;

  for (const record of usable) {
    const date = record.date;
    // SF-13: a non-finite step count reads as 0 and fails the day.
    const passes = _stepsFor(record) >= target;

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
 * Lifetime compliance against the single active step goal (SF-4d).
 *
 * `totalDays` is the full record count; `metDays` counts records whose
 * `effective_steps` is finite and `>= stepGoal` (SF-13: non-finite steps read
 * as 0 and never count as met). Division-by-zero guard: `pct = 0` when there
 * are no records. Fail-open on a non-finite or non-positive `stepGoal`.
 *
 * @param {Array<{ effective_steps: number }>} records
 * @param {number} stepGoal - daily step target applied to every historical day
 * @returns {{ metDays: number, totalDays: number, pct: number }}
 */
export function computeLifetimeCompliance(records, stepGoal) {
  if (!Array.isArray(records) || records.length === 0) {
    return { metDays: 0, totalDays: 0, pct: 0 };
  }
  return _computeLifetimeCompliancePrepared(records, _resolveStepGoal(stepGoal));
}

function _computeLifetimeCompliancePrepared(records, target) {
  if (records.length === 0) return { metDays: 0, totalDays: 0, pct: 0 };
  const totalDays = records.length;
  const metDays = records.filter((record) => _stepsFor(record) >= target).length;
  return { metDays, totalDays, pct: (metDays / totalDays) * 100 };
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
 * Streak data factory — orchestrates the Dexie read and delegates computation
 * to the pure functions above.  Zero DOM writes; error handling delegated to
 * the render layer (streak-ui.js) — `compute()` intentionally rejects on any DB
 * failure (mirrors `getTodayRecord`'s contract in src/progress.js:16-18).
 *
 * The goal collaborator is injected, matching `createCalendar(db, goal)`.
 * SF-3: there is no `goal_history` read and no `settings.get('active_goal')`
 * read — the live `active_step_goal` scalar is the only evaluation lens.
 *
 * @param {{ daily_records: { toArray: Function } }} db
 * @param {{ getActiveStepGoal: Function }} goal
 * @returns {{ compute: Function }}
 */
export function createStreak(db, goal) {
  /**
   * Reads the records and the active step goal in parallel, filters
   * future-dated records, and returns the full compute result.
   *
   * May reject — the render layer owns the try/catch and reports the error.
   *
   * @returns {Promise<{ tolerance: object, tiers: Array, hallOfFame: Array, lifetime: object, activeStepGoal: number }>}
   */
  async function compute() {
    const [records, activeStepGoal] = await Promise.all([
      db.daily_records.toArray(),
      goal.getActiveStepGoal(),
    ]);

    const today = _localDate();

    // ── Filter future-dated records ───────────────────────────────────────
    // Sync can deposit rows with a future date (clock skew, ahead-of-midnight
    // writes).  They must not inflate HoF, best-ever, or active streak counts.
    const filteredRecords = (Array.isArray(records) ? records : []).filter(
      (r) => r && typeof r.date === 'string' && r.date <= today,
    );
    const preparedRecords = _sortByDate(filteredRecords.filter(_isValidRecord));

    // Fail-open once, here — every metric below and the reported label then
    // share one lens, so the card can never show a goal it did not evaluate.
    const target = _resolveStepGoal(activeStepGoal);

    return {
      tolerance:      computeToleranceStreaks(preparedRecords, target, today),
      tiers:          _computeTierStreaksPrepared(preparedRecords, today),
      hallOfFame:     _computeHallOfFamePrepared(preparedRecords, target),
      lifetime:       _computeLifetimeCompliancePrepared(preparedRecords, target),
      activeStepGoal: target,
    };
  }

  return { compute };
}
