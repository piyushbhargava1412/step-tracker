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

/**
 * DI factory: createSearchLab(db, goal)
 * Returns the Search Lab analytics engine (no DOM, no direct Dexie).
 *
 * @param {object} db   - Dexie db instance (injected)
 * @param {object} goal - goal module (injected), exposes getActiveGoal()
 * @returns {{ findNearMisses: Function, computeDayOfWeekSlump: Function, comparePeriods: Function }}
 */
export function createSearchLab(db, goal) {
  async function findNearMisses() {
    const earliest = await db.daily_records.orderBy('date').first();
    if (!earliest) return [];

    const today = _localDate();
    const { endExclusive } = dateBounds(earliest.date, today);

    const [records, goalHistoryRows, activeGoal] = await Promise.all([
      db.daily_records.where('date').between(earliest.date, endExclusive, true, false).toArray(),
      db.goal_history.toArray(),
      goal.getActiveGoal(),
    ]);

    const effectiveHistory = buildEffectiveGoalHistory(goalHistoryRows, activeGoal);
    const prepared = _prepareGoalHistory(effectiveHistory);

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
    const EMPTY_BUCKET = () => ({ hitRate: null, averageSteps: null, totalDistanceKm: null, count: 0 });
    const buckets = Array.from({ length: 7 }, EMPTY_BUCKET);

    const earliest = await db.daily_records.orderBy('date').first();
    if (!earliest) return buckets;

    const today = _localDate();
    const { endExclusive } = dateBounds(earliest.date, today);

    const [records, goalHistoryRows, activeGoal] = await Promise.all([
      db.daily_records.where('date').between(earliest.date, endExclusive, true, false).toArray(),
      db.goal_history.toArray(),
      goal.getActiveGoal(),
    ]);

    const effectiveHistory = buildEffectiveGoalHistory(goalHistoryRows, activeGoal);
    const prepared = _prepareGoalHistory(effectiveHistory);

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

    return sums.map(({ sumSteps, sumDistanceKm, metCount, count }) => {
      if (count === 0) return EMPTY_BUCKET();
      return {
        hitRate: Math.round((metCount / count) * 100),
        averageSteps: Math.round(sumSteps / count),
        totalDistanceKm: sumDistanceKm,
        count,
      };
    });
  }

  async function comparePeriods(rangeA, rangeB) {
    const EMPTY_PERIOD = () => ({ totalSteps: 0, totalDistanceKm: null, hitRate: null });

    function isValidRange(range) {
      return range && range.startDate && range.endDate && range.startDate <= range.endDate;
    }

    async function aggregatePeriod(range) {
      if (!isValidRange(range)) return EMPTY_PERIOD();
      const { start, endExclusive } = dateBounds(range.startDate, range.endDate);
      const [records, goalHistoryRows, activeGoal] = await Promise.all([
        db.daily_records.where('date').between(start, endExclusive, true, false).toArray(),
        db.goal_history.toArray(),
        goal.getActiveGoal(),
      ]);

      if (records.length === 0) return EMPTY_PERIOD();

      const effectiveHistory = buildEffectiveGoalHistory(goalHistoryRows, activeGoal);
      const prepared = _prepareGoalHistory(effectiveHistory);

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

    const [periodA, periodB] = await Promise.all([
      aggregatePeriod(rangeA),
      aggregatePeriod(rangeB),
    ]);

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
