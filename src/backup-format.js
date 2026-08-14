/**
 * Pure formatting helpers for the Backup & Restore panel metadata lines
 * (last local export date, last Drive sync date + size). No DOM, no I/O —
 * every function takes its "now" reference as a parameter for testability.
 */

/**
 * Formats a byte count as a whole-KB string. Anything under 1 KB reads as
 * "<1 KB" rather than "0 KB" so a real (tiny) backup is never mistaken for
 * an empty one.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return '<1 KB';
  return `${Math.round(bytes / 1024)} KB`;
}

function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * @param {string|null|undefined} iso - ISO timestamp of the last local export, or null.
 * @param {Date} [now] - reference "now" for testability; defaults to the current time.
 * @returns {string}
 */
export function formatLastExportLine(iso, now = new Date()) {
  if (!iso) return '🕒 Last local export: Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '🕒 Last local export: Never';
  return `🕒 Last local export: ${formatShortDate(date)}`;
}

/**
 * @param {{ at: string, bytes: number }|null|undefined} entry
 * @param {Date} [now] - reference "now" for testability; defaults to the current time.
 * @returns {string}
 */
export function formatLastSyncLine(entry, now = new Date()) {
  if (!entry) return '🕒 No cloud backup found';
  const date = new Date(entry.at);
  if (Number.isNaN(date.getTime())) return '🕒 No cloud backup found';
  const day = isSameCalendarDay(date, now) ? 'Today' : formatShortDate(date);
  return `🕒 Last cloud sync: ${day}, ${formatTime(date)} (${formatBytes(entry.bytes)})`;
}
