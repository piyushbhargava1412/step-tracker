/**
 * search-lab.js — pure helper functions for Search Lab behavioral insights.
 * No DOM, no Dexie, no side effects.
 */

/**
 * Returns true when effectiveDistanceKm is a near-miss relative to target:
 * within [target * 0.90, target).
 *
 * @param {number} effectiveDistanceKm
 * @param {number} target
 * @returns {boolean}
 */
export function isNearMiss(effectiveDistanceKm, target) {
  if (!Number.isFinite(effectiveDistanceKm) || !Number.isFinite(target) || target <= 0) {
    return false;
  }
  return effectiveDistanceKm >= target * 0.90 && effectiveDistanceKm < target;
}

/**
 * Returns a Monday=0..Sunday=6 day-of-week index for the given date string.
 * Parses as local date (never new Date(dateString)) to avoid UTC drift.
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {number} 0=Mon, 1=Tue, … 6=Sun
 */
export function dayOfWeekIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return (date.getDay() + 6) % 7;
}

/**
 * Returns { start, endExclusive } where endExclusive is the day after endDate.
 * Both values are YYYY-MM-DD strings suitable for Dexie between() queries.
 *
 * @param {string} startDate  YYYY-MM-DD
 * @param {string} endDate    YYYY-MM-DD
 * @returns {{ start: string, endExclusive: string }}
 */
export function dateBounds(startDate, endDate) {
  const [y, m, d] = endDate.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  const ny = next.getFullYear();
  const nm = String(next.getMonth() + 1).padStart(2, '0');
  const nd = String(next.getDate()).padStart(2, '0');
  return { start: startDate, endExclusive: `${ny}-${nm}-${nd}` };
}

/**
 * Computes the percentage delta between two period totals for comparison display.
 * Returns null when a division by zero or null operand would produce Infinity/NaN.
 *
 * @param {number|null} a  baseline period total
 * @param {number|null} b  comparison period total
 * @returns {number|null}  one-decimal % change, or null when undefinable
 */
export function computeComparisonDelta(a, b) {
  if (a === 0 || a == null || b == null) return null;
  return Math.round(((b - a) / a) * 1000) / 10;
}

import { buildEffectiveGoalHistory, _prepareGoalHistory, _resolvePreparedGoalForDate } from './goal-history.js';
import { _localDate } from './goal.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * DI factory: createSearchLab(db, goal)
 * Returns the Search Lab analytics engine (no DOM, no direct Dexie).
 *
 * @param {object} db   - Dexie db instance (injected)
 * @param {object} goal - goal module (injected), exposes getActiveGoal()
 * @returns {{ findNearMisses: Function, computeDayOfWeekSlump: Function, comparePeriods: Function }}
 */
export function createSearchLab(db, goal) {
  /**
   * Fetches goal history and active goal once, returning the prepared context.
   * Used to avoid redundant IDB round-trips across engine methods.
   *
   * @returns {Promise<{ effectiveHistory: Array, prepared: object }>}
   */
  async function loadGoalContext() {
    const [goalHistoryRows, activeGoal] = await Promise.all([
      db.goal_history.toArray(),
      goal.getActiveGoal(),
    ]);
    const effectiveHistory = buildEffectiveGoalHistory(goalHistoryRows, activeGoal);
    const prepared = _prepareGoalHistory(effectiveHistory);
    return { effectiveHistory, prepared };
  }

  async function findNearMisses() {
    const earliest = await db.daily_records.orderBy('date').first();
    if (!earliest) return [];

    const today = _localDate();
    const { endExclusive } = dateBounds(earliest.date, today);

    const [records, { prepared }] = await Promise.all([
      db.daily_records.where('date').between(earliest.date, endExclusive, true, false).toArray(),
      loadGoalContext(),
    ]);

    const nearMisses = records
      .filter(record => {
        const target = _resolvePreparedGoalForDate(prepared, record.date);
        return isNearMiss(record.effective_distance_km, target);
      })
      .map(record => ({
        date: record.date,
        effectiveDistanceKm: record.effective_distance_km,
        target: _resolvePreparedGoalForDate(prepared, record.date),
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return nearMisses;
  }

  async function computeDayOfWeekSlump() {
    const EMPTY_BUCKET = (i) => ({ day: DAY_NAMES[i], hitRate: null, avgSteps: null, totalDistanceKm: null, count: 0, primarySlump: false });
    const buckets = Array.from({ length: 7 }, (_, i) => EMPTY_BUCKET(i));

    const earliest = await db.daily_records.orderBy('date').first();
    if (!earliest) return buckets;

    const today = _localDate();
    const { endExclusive } = dateBounds(earliest.date, today);

    const [records, { prepared }] = await Promise.all([
      db.daily_records.where('date').between(earliest.date, endExclusive, true, false).toArray(),
      loadGoalContext(),
    ]);

    // Accumulators per bucket
    const sums = Array.from({ length: 7 }, () => ({ sumSteps: 0, sumDistanceKm: 0, metCount: 0, count: 0 }));

    for (const record of records) {
      const idx = dayOfWeekIndex(record.date);
      const target = _resolvePreparedGoalForDate(prepared, record.date);
      const distanceKm = Number.isFinite(record.effective_distance_km) ? record.effective_distance_km : 0;
      const steps = Number.isFinite(record.steps) ? record.steps : 0;
      const met = Number.isFinite(record.effective_distance_km) && record.effective_distance_km >= target ? 1 : 0;

      sums[idx].sumDistanceKm += distanceKm;
      sums[idx].sumSteps += steps;
      sums[idx].metCount += met;
      sums[idx].count += 1;
    }

    const result = sums.map(({ sumSteps, sumDistanceKm, metCount, count }, i) => {
      if (count === 0) return EMPTY_BUCKET(i);
      return {
        day: DAY_NAMES[i],
        hitRate: Math.round((metCount / count) * 100),
        avgSteps: Math.round(sumSteps / count),
        totalDistanceKm: sumDistanceKm,
        count,
      };
    });

    // Mark primarySlump: bucket with lowest hitRate (ignoring null), tie-break on avgSteps then index
    const eligible = result.filter(b => b.hitRate !== null);
    if (eligible.length > 0) {
      const minHitRate = Math.min(...eligible.map(b => b.hitRate));
      const tied = eligible.filter(b => b.hitRate === minHitRate);
      const minAvgSteps = Math.min(...tied.map(b => b.avgSteps !== null ? b.avgSteps : Infinity));
      const tiedSteps = tied.filter(b => (b.avgSteps !== null ? b.avgSteps : Infinity) === minAvgSteps);
      // lowest index wins among remaining ties
      const primaryDay = tiedSteps[0].day;
      for (const b of result) {
        b.primarySlump = (b.day === primaryDay && b.hitRate !== null);
      }
    } else {
      for (const b of result) {
        b.primarySlump = false;
      }
    }

    return result;
  }

  async function comparePeriods(rangeA, rangeB) {
    const EMPTY_PERIOD = () => ({ totalSteps: 0, totalDistanceKm: null, hitRate: null });

    function isValidRange(range) {
      return range && range.startDate && range.endDate && range.startDate <= range.endDate;
    }

    // Fetch goal context once, shared across both periods
    const { prepared } = await loadGoalContext();

    function aggregatePeriodSync(range, records) {
      if (!isValidRange(range) || records.length === 0) return EMPTY_PERIOD();

      let totalSteps = 0;
      let totalDistanceKm = 0;
      let metCount = 0;

      for (const record of records) {
        const target = _resolvePreparedGoalForDate(prepared, record.date);
        const steps = Number.isFinite(record.steps) ? record.steps : 0;
        const distKm = Number.isFinite(record.effective_distance_km) ? record.effective_distance_km : 0;
        const met = Number.isFinite(record.effective_distance_km) && record.effective_distance_km >= target ? 1 : 0;
        totalSteps += steps;
        totalDistanceKm += distKm;
        metCount += met;
      }

      const hitRate = Math.round((metCount / records.length) * 100);
      return { totalSteps, totalDistanceKm, hitRate };
    }

    // Fetch records for both periods in parallel (goal context already loaded)
    const [recordsA, recordsB] = await Promise.all([
      isValidRange(rangeA)
        ? db.daily_records.where('date').between(
            dateBounds(rangeA.startDate, rangeA.endDate).start,
            dateBounds(rangeA.startDate, rangeA.endDate).endExclusive,
            true, false
          ).toArray()
        : Promise.resolve([]),
      isValidRange(rangeB)
        ? db.daily_records.where('date').between(
            dateBounds(rangeB.startDate, rangeB.endDate).start,
            dateBounds(rangeB.startDate, rangeB.endDate).endExclusive,
            true, false
          ).toArray()
        : Promise.resolve([]),
    ]);

    const periodA = aggregatePeriodSync(rangeA, recordsA);
    const periodB = aggregatePeriodSync(rangeB, recordsB);

    return {
      periodA,
      periodB,
      deltas: {
        totalSteps: computeComparisonDelta(periodA.totalSteps, periodB.totalSteps),
        totalDistanceKm: computeComparisonDelta(periodA.totalDistanceKm, periodB.totalDistanceKm),
        hitRate: computeComparisonDelta(periodA.hitRate, periodB.hitRate),
      },
    };
  }

  return { findNearMisses, computeDayOfWeekSlump, comparePeriods };
}
