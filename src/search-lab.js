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
