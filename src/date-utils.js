/**
 * Date utilities — pure, timezone-safe helpers.
 * No DOM writes, no Dexie import. Extracted from goal.js and streak.js so that
 * every importer points at a single canonical source (SRP).
 */

const MS_PER_DAY = 86_400_000; // ms

/**
 * Local-time YYYY-MM-DD formatter.
 * Uses getFullYear/getMonth/getDate — never toISOString() — so dates are
 * timezone-safe (mirrors the _formatLocalDate convention in steps.js:161-167).
 *
 * @param {number} [ms=Date.now()] - timestamp in milliseconds
 * @returns {string} YYYY-MM-DD
 */
export function _localDate(ms = Date.now()) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${MM}-${dd}`;
}

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
 * Human-readable formatter for a strict YYYY-MM-DD string.
 * Renders the local-calendar components ("2018-01-01" → "Jan 1, 2018").
 *
 * @param {string} dateStr - strict YYYY-MM-DD
 * @returns {string} e.g. "Jan 1, 2018"
 */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function _formatReadableDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new TypeError(`Invalid date for _formatReadableDate: ${dateStr}. Expected strict YYYY-MM-DD.`);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    throw new TypeError(`Invalid date for _formatReadableDate: ${dateStr}. Expected strict YYYY-MM-DD.`);
  }
  return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
}
