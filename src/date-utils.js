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
