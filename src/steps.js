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

/** Phase tag for a window that walks history back to HISTORY_ANCHOR_DATE. */
export const PHASE_FULL_HISTORY = 'Full history sync';

/** Phase tag for the recent-days window fetched on every run. */
export const PHASE_INCREMENTAL = 'Incremental sync';

/** Matches the 'YYYY-MM-DD' primary key stored on every daily_records row. */
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Google Fit Dataset aggregate endpoint. */
export const STEP_API_URL =
  'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';

// ── Private date helpers (exported for testability; _ prefix = impl detail) ──

/**
 * Return a new Date at local midnight for the given Date, millisecond
 * timestamp, or 'YYYY-MM-DD' string (the daily_records primary-key form).
 * Never mutates the input.
 *
 * The string form is split into numeric parts and rebuilt with
 * new Date(y, m - 1, d) — never new Date('2025-06-05'), which the language
 * parses as UTC midnight and which therefore resolves to the *previous*
 * calendar day in every negative-offset timezone.
 *
 * @param {Date|number|string} dateOrMs
 * @returns {Date}
 * @throws {TypeError} When given a string that is not 'YYYY-MM-DD'.
 */
export function _localMidnight(dateOrMs) {
  if (typeof dateOrMs === 'string') {
    if (!LOCAL_DATE_PATTERN.test(dateOrMs)) {
      throw new TypeError(`[steps] Expected a YYYY-MM-DD date, got "${dateOrMs}"`);
    }
    const [year, month, day] = dateOrMs.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

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

/**
 * Resolve the sync windows for this run from persisted state alone.
 *
 * Every window ends at **tomorrow's** local midnight so today's partial record
 * is refreshed on each run. Reads use only the existing `date` primary index —
 * there is no `sync_meta` store and no schema bump.
 *
 *  - Empty DB              → one [anchor → tomorrow] window, PHASE_FULL_HISTORY.
 *  - Non-empty DB          → PHASE_INCREMENTAL first, always:
 *                            [latest − SAFETY_BUFFER_DAYS → tomorrow].
 *  - Backfill still owed   → PHASE_FULL_HISTORY appended second:
 *                            [anchor → oldest + 1 day]. The extra day is a
 *                            deliberate one-bucket overlap guard at the seam.
 *
 * The latch is authoritative once set: a `true` flag suppresses the backfill
 * window without any reconciliation against the `date` index — that derivation
 * is exactly what the latch exists to avoid. Conversely a missing row, a falsy
 * `value`, or a failed read all mean *not complete*: a redundant backfill is
 * idempotent, a skipped one is silent data loss.
 *
 * @param {object} db  Dexie database exposing `settings` and `daily_records`.
 * @returns {Promise<Array<{startMs: number, endMs: number, phase: string}>>}
 *          Windows in processing order.
 */
export async function _determineSyncWindows(db) {
  const anchorMs = _localMidnight(HISTORY_ANCHOR_DATE).getTime();
  const endMs = _addDays(_localMidnight(new Date()), 1).getTime();

  let backfillComplete = false;
  try {
    const flagRow = await db.settings.get(BACKFILL_COMPLETE_KEY);
    backfillComplete = flagRow?.value === true;
  } catch (error) {
    // Fail open toward doing the work — never let a read error skip history.
    console.error('[steps] Failed to read the backfill latch', error);
  }

  const oldest = await db.daily_records.orderBy('date').first();
  const latest = await db.daily_records.orderBy('date').last();

  if (!latest) {
    return [{ startMs: anchorMs, endMs, phase: PHASE_FULL_HISTORY }];
  }

  const windows = [
    {
      startMs: _addDays(
        _localMidnight(latest.date),
        -SAFETY_BUFFER_DAYS
      ).getTime(),
      endMs,
      phase: PHASE_INCREMENTAL,
    },
  ];

  const oldestMidnight = _localMidnight(oldest.date);
  if (!backfillComplete && oldestMidnight.getTime() > anchorMs) {
    windows.push({
      startMs: anchorMs,
      endMs: _addDays(oldestMidnight, 1).getTime(),
      phase: PHASE_FULL_HISTORY,
    });
  }

  return windows;
}

// ── Bucket normalization ──────────────────────────────────────────────────────

/**
 * Convert a raw Google Fit `dataset:aggregate` response bucket array into the
 * record shape persisted in `daily_records`.
 *
 * Each bucket yields exactly one record — including days with 0 steps (Decision 6).
 *
 * Dataset lookup:
 *   - Locate each dataset by `dataSourceId.includes('step_count.delta')` /
 *     `.includes('distance.delta')`.
 *   - Fall back to positional index 0 (steps) / 1 (distance) when
 *     `dataSourceId` is absent on all datasets.
 *
 * Distance (km) priority:
 *   1. Real `distance.delta` fpVal metres ÷ METRES_PER_KM, rounded to 3 dp.
 *   2. Fallback to `steps × STEP_TO_KM`, rounded to 3 dp, when the distance
 *      dataset is absent, has no points, or yields a non-finite total.
 *
 * @param {Array<object>} buckets  Raw buckets from the Fit aggregate response.
 * @returns {Array<{
 *   date: string,
 *   original_steps: number,
 *   original_distance_km: number,
 *   effective_steps: number,
 *   effective_distance_km: number,
 *   synced_at: string,
 * }>}
 */
export function _normalizeBuckets(buckets) {
  return buckets.map((bucket) => {
    // ── Date label ────────────────────────────────────────────────────────────
    const millis =
      bucket.startTimeMillis != null
        ? Number(bucket.startTimeMillis)
        : Number(bucket.startTimeNanos) / 1_000_000;
    const date = _formatLocalDate(millis);

    // ── Dataset lookup ────────────────────────────────────────────────────────
    const dataset = bucket.dataset ?? [];

    const stepDataset =
      dataset.find((ds) => ds.dataSourceId?.includes('step_count.delta')) ??
      dataset[0];

    const distDataset =
      dataset.find((ds) => ds.dataSourceId?.includes('distance.delta')) ??
      dataset[1];

    // ── Step sum ──────────────────────────────────────────────────────────────
    const stepPoints = stepDataset?.point ?? [];
    const steps = Math.trunc(
      stepPoints.reduce((sum, point) => sum + (point.value?.[0]?.intVal ?? 0), 0)
    );

    // ── Distance (km) with fallback ───────────────────────────────────────────
    const distPoints = distDataset?.point ?? [];
    const metres = distPoints.reduce(
      (sum, point) => sum + (point.value?.[0]?.fpVal ?? 0),
      0
    );

    const useRealDistance = distPoints.length > 0 && isFinite(metres);
    const distanceKm = useRealDistance
      ? Number((metres / METRES_PER_KM).toFixed(3))
      : Number((steps * STEP_TO_KM).toFixed(3));

    return {
      date,
      original_steps: steps,
      original_distance_km: distanceKm,
      effective_steps: steps,
      effective_distance_km: distanceKm,
      synced_at: new Date().toISOString(),
    };
  });
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
