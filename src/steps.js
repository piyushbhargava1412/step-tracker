/**
 * Google Fit step-sync engine.
 *
 * Single-responsibility: fetch, normalize and persist Google Fit step data.
 * This module is the sole gateway to the Google Fit REST API.
 *
 * Factory: createStepSync(auth, db, reporter, doc = document)
 *
 * All private helpers are exported with an underscore prefix so the test
 * suite can assert on them directly without any circular dependency.
 * No other src/ module is imported here.
 */

// ── Constants (exported for testability) ─────────────────────────────────────

/**
 * Oldest possible sync start: local midnight on 2013-01-01.
 * Constructed via numeric args — never new Date('2013-01-01'), which is
 * parsed as UTC and would land on 2012-12-31 in negative-offset timezones.
 */
export const HISTORY_ANCHOR_DATE = new Date(2013, 0, 1);

/** Days per API request chunk. */
export const CHUNK_DAYS = 30;

/** Duration in ms for a calendar bucket (passed to Google Fit bucketByTime). */
export const BUCKET_MS = 86_400_000;

/**
 * Re-fetch this many calendar days before the newest stored record so that
 * late-arriving wearable or Health Connect data is always captured.
 */
export const SAFETY_BUFFER_DAYS = 3;

/** Fallback: metres per step, used when Google Fit returns no distance data. */
export const STEP_TO_KM = 0.000762;

/** Conversion factor from metres (Google Fit fpVal unit) to kilometres. */
export const METRES_PER_KM = 1000;

/** Default backoff before a single retry on a transient 429 / 5xx. */
export const RETRY_BACKOFF_MS = 2000;

/**
 * Maximum Retry-After we will honour (30 s). Values above this fall back to
 * RETRY_BACKOFF_MS so a rogue header cannot stall the run indefinitely.
 */
export const MAX_RETRY_AFTER_MS = 30_000;

/** Key in the Dexie `settings` store that latches a completed backfill. */
export const BACKFILL_COMPLETE_KEY = 'initial_backfill_complete';

/** Google Fit Dataset aggregate endpoint. */
export const STEP_API_URL =
  'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';

// ── Private date helpers (exported for testability; _ prefix = impl detail) ──

/**
 * Return a new Date at local midnight for the given Date or millisecond
 * timestamp. Never mutates the input.
 *
 * @param {Date|number} dateOrMs
 * @returns {Date}
 */
export function _localMidnight(dateOrMs) {
  const d =
    dateOrMs instanceof Date
      ? new Date(dateOrMs.getTime())
      : new Date(dateOrMs);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Return a new Date that is `n` calendar days after `date`, always landing on
 * local midnight. Uses setDate() + setHours(0,0,0,0) so the result is
 * DST-safe: crossing a spring-forward or fall-back boundary still produces
 * exactly 00:00:00.000 in local time (unlike pure ms arithmetic which would
 * drift by ±1 hour). Never mutates the input.
 *
 * @param {Date} date
 * @param {number} n  May be negative to subtract days.
 * @returns {Date}
 */
export function _addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format a millisecond timestamp as a local YYYY-MM-DD string using
 * getFullYear / getMonth / getDate — never toISOString(), which returns
 * UTC and would shift the date backwards in positive-offset timezones.
 *
 * @param {number} ms
 * @returns {string}
 */
export function _formatLocalDate(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${MM}-${dd}`;
}

/**
 * Split the [startDate, endDate] window into ≤CHUNK_DAYS-day chunks, returned
 * newest-first. The oldest chunk is clamped to startDate when the span is not
 * an exact multiple of CHUNK_DAYS. Chunk boundaries always land on local
 * midnight because _addDays uses setDate + setHours(0,0,0,0) (DST-safe).
 *
 * Chunk count is derived — never a literal:
 *   Math.ceil((endDate − startDate) / BUCKET_MS / CHUNK_DAYS)
 *
 * @param {Date} startDate  Inclusive window start (local midnight).
 * @param {Date} endDate    Exclusive window end (local midnight).
 * @returns {Array<{startMs: number, endMs: number}>}  Newest-first order.
 */
export function _chunkWindow(startDate, endDate) {
  const startMs = _localMidnight(startDate).getTime();
  let cursor = _localMidnight(endDate);
  const chunks = [];

  while (cursor.getTime() > startMs) {
    const cursorMs = cursor.getTime();
    const chunkStart = _addDays(cursor, -CHUNK_DAYS);
    const chunkStartMs = chunkStart.getTime();

    if (chunkStartMs <= startMs) {
      // Next boundary would fall before (or exactly at) startDate — clamp.
      chunks.push({ startMs, endMs: cursorMs });
      break;
    }

    chunks.push({ startMs: chunkStartMs, endMs: cursorMs });
    cursor = chunkStart;
  }

  return chunks;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create the step-sync engine.
 *
 * @param {object} auth      - Collaborator exposing getAccessToken().
 * @param {object} db        - Dexie database instance.
 * @param {object} reporter  - Status reporter with a sync(text) method.
 * @param {Document} doc     - The document to use for DOM access (defaults to
 *                             the global document). Follows the repo pattern of
 *                             createAuth(…, gsi = google) and
 *                             createStatusReporter(doc = document): accepting a
 *                             defaulted collaborator rather than reaching for a
 *                             global directly.
 * @returns {{ sync: Function }}
 */
export function createStepSync(auth, db, reporter, doc = document) {
  // Re-entrancy guard — lives in the factory closure, never at module level.
  let isSyncing = false;

  /**
   * Synchronise Google Fit step data into the local Dexie database.
   * Full implementation added in Tasks 9 and 10; this is the scaffolded stub.
   */
  async function sync() {
    // TODO: implement in Tasks 9–10
  }

  return { sync };
}
