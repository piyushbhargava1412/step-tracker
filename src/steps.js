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

/** Aggregated data types requested for every chunk — order is request order. */
export const STEP_DATA_TYPE = 'com.google.step_count.delta';
export const DISTANCE_DATA_TYPE = 'com.google.distance.delta';

/**
 * Attempts allowed per chunk: the initial request plus a single retry.
 * A second consecutive non-OK response is terminal for the whole run.
 */
export const MAX_ATTEMPTS_PER_CHUNK = 2;

/** Milliseconds in a second — Retry-After is specified in seconds. */
const MS_PER_SECOND = 1000;

/** HTTP statuses this module classifies on. */
const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MIN = 500;
const HTTP_SERVER_ERROR_MAX = 599;

// ── Failure classification ───────────────────────────────────────────────────

/** `name` carried by every error this module throws for a classified failure. */
export const SYNC_ERROR_NAME = 'StepSyncError';

/** The bearer token was rejected — the user must reconnect (decision 9). */
export const FAILURE_AUTH_EXPIRED = 'auth-expired';

/** A transient status survived the single permitted retry. */
export const FAILURE_RETRY_EXHAUSTED = 'retry-exhausted';

/** A deterministic non-2xx status that a retry could not help. */
export const FAILURE_HTTP_ERROR = 'http-error';

/** fetch() itself threw — offline, DNS, CORS or an aborted connection. */
export const FAILURE_NETWORK_ERROR = 'network-error';

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
  return buckets.flatMap((bucket) => {
    // ── Date label ────────────────────────────────────────────────────────────
    const millis =
      bucket.startTimeMillis != null
        ? Number(bucket.startTimeMillis)
        : Number(bucket.startTimeNanos) / 1_000_000;

    // Fail-safe: a bucket with neither (or a non-numeric) timestamp would
    // otherwise persist a 'NaN-NaN-NaN' primary key. Skip it instead.
    if (!isFinite(millis)) {
      return [];
    }
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

    return [
      {
        date,
        original_steps: steps,
        original_distance_km: distanceKm,
        effective_steps: steps,
        effective_distance_km: distanceKm,
        synced_at: new Date().toISOString(),
      },
    ];
  });
}

// ── Chunk fetch ───────────────────────────────────────────────────────────────

/**
 * Resolve after `ms` milliseconds. Wraps setTimeout in a promise so the retry
 * backoff is a plain `await` — and so tests can drive it with fake timers.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve the backoff to wait before the single permitted retry.
 *
 * `Retry-After` is read as **seconds** and honoured only when it parses to a
 * finite value greater than zero and no larger than MAX_RETRY_AFTER_MS — a
 * rogue or hostile header must not be able to stall the run. The HTTP-date
 * form is deliberately not parsed; it falls through to the default, which is
 * always a shorter wait than any date Google would send.
 *
 * @param {string|null|undefined} retryAfter  Raw Retry-After header value.
 * @returns {number} Milliseconds to wait.
 */
export function _resolveBackoffMs(retryAfter) {
  const waitMs = Number(retryAfter) * MS_PER_SECOND;
  const honourable =
    Number.isFinite(waitMs) && waitMs > 0 && waitMs <= MAX_RETRY_AFTER_MS;
  return honourable ? waitMs : RETRY_BACKOFF_MS;
}

/**
 * Build a classified failure for the orchestrator (Task 10) to render.
 *
 * The message is a developer diagnostic only — it never carries request
 * headers or token material (decision 14). The user-facing terminal string is
 * composed by the caller from these fields.
 *
 * @param {object} details
 * @param {string} details.kind    One of the FAILURE_* constants.
 * @param {number|null} details.status  HTTP status, or null for a thrown fetch.
 * @param {number} details.index   1-based index of the failing chunk.
 * @param {number} details.total   Total chunk count for the run.
 * @param {string} details.phase   PHASE_FULL_HISTORY | PHASE_INCREMENTAL.
 * @param {Error=} details.cause   Underlying error, when one exists.
 * @returns {Error}
 */
export function _syncFailure({ kind, status, index, total, phase, cause }) {
  const statusSuffix = status === null ? '' : ` (HTTP ${status})`;
  const error = new Error(
    `[steps] ${kind} on chunk ${index}/${total}${statusSuffix}`
  );
  error.name = SYNC_ERROR_NAME;
  error.kind = kind;
  error.status = status;
  error.index = index;
  error.total = total;
  error.phase = phase;
  if (cause !== undefined) error.cause = cause;
  return error;
}

/**
 * Fetch one chunk of daily aggregates from Google Fit.
 *
 * This is the module's only external I/O and the only place the bearer token is
 * used. It is a module-level export — not a closure-private function — so the
 * suite can exercise it directly; `sync()` passes `auth` and `reporter` through
 * from the factory closure.
 *
 * Retry policy (decision 17): at most MAX_ATTEMPTS_PER_CHUNK attempts. `429`
 * and `5xx` are retried once; `401` short-circuits immediately, and every other
 * non-OK status or thrown network error is terminal — a retry cannot help. The
 * token is re-read from `auth.getAccessToken()` on each attempt and the request
 * is rebuilt, so a refreshed token is picked up and no header object is ever
 * replayed. The `⚠️` message is written *before* the sleep so the user sees the
 * reason during the wait rather than after it.
 *
 * @param {object} auth      Collaborator exposing getAccessToken().
 * @param {object} reporter  Status reporter with a sync(text) method.
 * @param {{startMs: number, endMs: number}} chunk  Window bounds for this call.
 * @param {number} index     1-based chunk index, for status and diagnostics.
 * @param {number} total     Total chunk count for the run.
 * @param {string} phase     PHASE_FULL_HISTORY | PHASE_INCREMENTAL.
 * @returns {Promise<object>} The parsed aggregate response.
 * @throws {TypeError} On a malformed chunk — before any request is issued.
 * @throws {Error} A SYNC_ERROR_NAME error carrying { kind, status, index, total, phase }.
 */
export async function _fetchChunk(auth, reporter, chunk, index, total, phase) {
  if (!Number.isFinite(chunk?.startMs) || !Number.isFinite(chunk?.endMs)) {
    throw new TypeError('[steps] _fetchChunk requires a { startMs, endMs } chunk');
  }

  const body = JSON.stringify({
    aggregateBy: [
      { dataTypeName: STEP_DATA_TYPE },
      { dataTypeName: DISTANCE_DATA_TYPE },
    ],
    bucketByTime: { durationMillis: BUCKET_MS },
    startTimeMillis: _localMidnight(chunk.startMs).getTime(),
    endTimeMillis: _localMidnight(chunk.endMs).getTime(),
  });

  const fail = (kind, status, cause) =>
    _syncFailure({ kind, status, index, total, phase, cause });

  let lastStatus = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CHUNK; attempt += 1) {
    let response;
    try {
      response = await fetch(STEP_API_URL, {
        method: 'POST',
        headers: {
          // Read fresh on every attempt — never captured, cached or logged.
          Authorization: `Bearer ${auth.getAccessToken()}`,
          'Content-Type': 'application/json',
        },
        body,
      });
    } catch (cause) {
      throw fail(FAILURE_NETWORK_ERROR, null, cause);
    }

    if (response.ok) return response.json();

    lastStatus = response.status;

    if (lastStatus === HTTP_UNAUTHORIZED) {
      throw fail(FAILURE_AUTH_EXPIRED, lastStatus);
    }

    const isTransient =
      lastStatus === HTTP_TOO_MANY_REQUESTS ||
      (lastStatus >= HTTP_SERVER_ERROR_MIN && lastStatus <= HTTP_SERVER_ERROR_MAX);
    if (!isTransient) {
      throw fail(FAILURE_HTTP_ERROR, lastStatus);
    }

    if (attempt < MAX_ATTEMPTS_PER_CHUNK) {
      const waitMs = _resolveBackoffMs(response.headers.get('Retry-After'));
      const waitSeconds = waitMs / MS_PER_SECOND;
      reporter.sync(
        lastStatus === HTTP_TOO_MANY_REQUESTS
          ? `⚠️ Rate limited by Google Fit — retrying chunk ${index}/${total} in ${waitSeconds}s…`
          : `⚠️ Google Fit error ${lastStatus} — retrying chunk ${index}/${total} in ${waitSeconds}s…`
      );
      await _sleep(waitMs);
    }
  }

  throw fail(FAILURE_RETRY_EXHAUSTED, lastStatus);
}

// ── Transactional upsert ─────────────────────────────────────────────────────

/**
 * Persist one chunk's normalized records into `daily_records` under a Dexie
 * `rw` transaction, merging against existing rows so user-authored overrides
 * survive.
 *
 * Merge rules (Decision 3):
 *  - Absent row      → insert a fresh record with `is_overridden: false` and
 *                       `override: null`.
 *  - `is_overridden !== true` → overwrite `original_*` AND `effective_*`;
 *                               refresh `synced_at`.
 *  - `is_overridden === true` → overwrite `original_*` ONLY; carry
 *                               `effective_*` and the `override` metadata
 *                               object through byte-for-byte; refresh
 *                               `synced_at`.
 *
 * Transaction scope is one chunk (≤30 dates) — never the whole run.
 * Exactly one `bulkGet` and one `bulkPut` are issued per call.
 *
 * @param {object} db       Dexie database exposing `daily_records`.
 * @param {Array<{
 *   date: string,
 *   original_steps: number,
 *   original_distance_km: number,
 *   effective_steps: number,
 *   effective_distance_km: number,
 *   synced_at: string,
 * }>} records  Normalized records from `_normalizeBuckets` for this chunk.
 * @returns {Promise<void>}
 */
export async function _upsertChunk(db, records) {
  return db.transaction('rw', db.daily_records, async () => {
    const dates = records.map((r) => r.date);
    const existing = await db.daily_records.bulkGet(dates);

    const synced_at = new Date().toISOString();
    const merged = records.map((record, i) => {
      const row = existing[i];

      if (!row) {
        // Absent → insert with sentinel defaults.
        return {
          ...record,
          is_overridden: false,
          override: null,
          synced_at,
        };
      }

      if (row.is_overridden === true) {
        // Present and overridden → update original_* only; carry effective_*
        // and the override object through unchanged.
        return {
          ...row,
          original_steps: record.original_steps,
          original_distance_km: record.original_distance_km,
          synced_at,
        };
      }

      // Present and not overridden → overwrite both original_* and effective_*.
      return {
        ...row,
        original_steps: record.original_steps,
        original_distance_km: record.original_distance_km,
        effective_steps: record.effective_steps,
        effective_distance_km: record.effective_distance_km,
        synced_at,
      };
    });

    await db.daily_records.bulkPut(merged);
  });
}

/**
 * Latch the backfill as complete once the oldest stored record reaches or
 * passes HISTORY_ANCHOR_DATE.
 *
 * Re-reads the oldest record itself — never trusts a caller-supplied value —
 * and writes the terminal flag to the `settings` store. The write sits
 * deliberately outside any `daily_records` transaction so a latch failure can
 * never roll back step data. A failed write is logged and swallowed: the only
 * consequence of a lost latch is one extra idempotent backfill pass, never a
 * sync failure.
 *
 * @param {object} db  Dexie database exposing `daily_records` and `settings`.
 * @returns {Promise<void>}
 */
export async function _latchBackfillComplete(db) {
  try {
    const oldest = await db.daily_records.orderBy('date').first();
    if (!oldest) return;
    if (_localMidnight(oldest.date).getTime() <= HISTORY_ANCHOR_DATE.getTime()) {
      await db.settings.put({ key: BACKFILL_COMPLETE_KEY, value: true });
    }
  } catch (error) {
    console.error('[steps]', error);
  }
}

/**
 * Re-read the oldest stored `daily_records` row and render its local
 * YYYY-MM-DD label for the decision-12a `🔑` auth-expired message.
 *
 * Fail-open by design: a failed read is logged and treated as an empty store
 * (`null`) so the caller's error-message contract always completes — a status
 * read must never be able to swallow the terminal error message itself.
 *
 * @param {object} db  Dexie database exposing `daily_records`.
 * @returns {Promise<string|null>}  Local date label, or null when no row exists
 *                                  or the read failed.
 */
export async function _readOldestStoredLabel(db) {
  try {
    const oldest = await db.daily_records.orderBy('date').first();
    if (!oldest) return null;
    return _formatLocalDate(_localMidnight(oldest.date).getTime());
  } catch (error) {
    console.error('[steps]', error);
    return null;
  }
}

/**
 * Render the terminal decision-12a message for a sync failure.
 *
 * Auth-expired is the only asynchronous branch — it re-reads the oldest stored
 * date for the `🔑` reconnect message. Every other terminal path produces the
 * `❌` message carrying the failing chunk coordinates and the fail-stop day
 * count. The caller is responsible for `console.error` and the
 * `reporter.sync()` write; this function only returns the message.
 *
 * @param {object} args
 * @param {Error}  args.error           The thrown error (classified or not).
 * @param {number} args.i               1-based failing chunk index.
 * @param {number} args.total           Total chunk count for the run.
 * @param {number} args.persistedDays   Days persisted before the failure.
 * @param {object} args.db              Dexie database (auth-expired read only).
 * @returns {Promise<string>}  The emoji-prefixed terminal message.
 */
export async function _renderSyncErrorMessage({ error, i, total, persistedDays, db }) {
  if (error.name === SYNC_ERROR_NAME && error.kind === FAILURE_AUTH_EXPIRED) {
    const oldestLabel = (await _readOldestStoredLabel(db)) ?? 'the beginning';
    return `🔑 Session expired — reconnect your Google Account, then click Sync Steps to continue (history synced back to ${oldestLabel}).`;
  }

  const at = `chunk ${i}/${total}`;
  const resume = `${persistedDays} days saved; click Sync Steps to resume.`;

  if (error.name === SYNC_ERROR_NAME && error.kind === FAILURE_RETRY_EXHAUSTED) {
    return `❌ Sync stopped at ${at} — Google Fit returned ${error.status} twice. ${resume}`;
  }
  if (error.name === SYNC_ERROR_NAME && error.kind === FAILURE_HTTP_ERROR) {
    return `❌ Sync stopped at ${at} — Google Fit returned ${error.status}. ${resume}`;
  }
  if (error.name === SYNC_ERROR_NAME && error.kind === FAILURE_NETWORK_ERROR) {
    return `❌ Sync stopped at ${at} — network error. ${resume}`;
  }

  // Any unclassified throw — a Dexie rejection from _upsertChunk, or
  // _normalizeBuckets / _determineSyncWindows failing — is a persistence
  // failure. Chunk coordinates arrive resolved from the caller.
  return `❌ Sync stopped while saving ${at} — database error. ${resume}`;
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
   *
   * Orchestration (decision 12a / 13 / 14 / 16): pre-flight token guard, a
   * silent closure-scoped re-entrancy guard, the button busy state, window
   * resolution, a strictly sequential per-chunk fetch→normalize→upsert loop,
   * the backfill latch, a decision-12a success message, and a `finally` that
   * restores the button and clears the guard without touching `#sync-status`.
   *
   * The `catch` implements the full decision-12a error contract: every
   * terminal failure writes its exact emoji-prefixed message via
   * `reporter.sync()` and logs `console.error('[steps]', error)` — never a
   * silent path — while fail-stopping (no further requests, no latch write,
   * previously-persisted chunks kept).
   *
   * @returns {Promise<void>}
   */
  async function sync() {
    // 1. Pre-flight token guard — before touching the button.
    const token = auth.getAccessToken();
    if (!token) {
      reporter.sync('🔑 Connect your Google Account first');
      return;
    }

    // 2. Silent re-entrancy guard — never clobbers the in-flight message.
    if (isSyncing) return;

    // 3. Button busy state — owned here, unwound in `finally`.
    isSyncing = true;
    const syncBtn = doc?.getElementById?.('sync-btn');
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing…';
    }

    // Fail-stop accounting consumed by the catch: how many days landed before
    // a terminal error, and which chunk the run had reached.
    let persistedDays = 0;
    let lastChunk = null;

    try {
      // 4. Resolve the windows from persisted state (full/incremental).
      const windows = await _determineSyncWindows(db);
      const backfillRan = windows.some((w) => w.phase === PHASE_FULL_HISTORY);

      if (backfillRan) {
        reporter.sync(
          '⏳ Full history sync — fetching all Google Fit data since 2013. This can take several minutes; keep this tab open.'
        );
      }

      // 5. Flatten every window into chunk descriptors and tally the day count.
      const chunks = [];
      let dayCount = 0;
      for (const window of windows) {
        dayCount += Math.round((window.endMs - window.startMs) / BUCKET_MS);
        for (const chunk of _chunkWindow(window.startMs, window.endMs)) {
          chunks.push({ ...chunk, phase: window.phase });
        }
      }
      const total = chunks.length;

      // 6. Sequential fetch → normalize → upsert, one status line per chunk.
      for (let i = 0; i < total; i += 1) {
        const chunk = chunks[i];
        const index = i + 1;
        lastChunk = { index, total };
        reporter.sync(
          `⏳ ${chunk.phase} — chunk ${index}/${total} (${_formatLocalDate(chunk.startMs)} → ${_formatLocalDate(chunk.endMs)})…`
        );

        const raw = await _fetchChunk(auth, reporter, chunk, index, total, chunk.phase);
        const records = _normalizeBuckets(raw.bucket ?? []);
        await _upsertChunk(db, records);
        persistedDays += records.length;
      }

      // 7. Latch the backfill when a full-history window completed it.
      if (backfillRan) {
        await _latchBackfillComplete(db);
      }

      // 8. Success message variant (decision 12a).
      const oldestRow = await db.daily_records.orderBy('date').first();
      const oldestMs = oldestRow
        ? _localMidnight(oldestRow.date).getTime()
        : null;
      const anchorMs = _localMidnight(HISTORY_ANCHOR_DATE).getTime();

      if (backfillRan && oldestMs != null && oldestMs <= anchorMs) {
        reporter.sync(
          `✅ Synced ${dayCount} days across ${total} requests — full history complete back to ${_formatLocalDate(HISTORY_ANCHOR_DATE.getTime())}. Future syncs will be fast.`
        );
      } else if (backfillRan && oldestMs != null) {
        reporter.sync(
          `✅ Synced ${dayCount} days — history now goes back to ${_formatLocalDate(oldestMs)}; click Sync Steps again to continue the backfill.`
        );
      } else {
        reporter.sync(
          `✅ Synced ${dayCount} days (${total} request${total === 1 ? '' : 's'}) — up to date.`
        );
      }
    } catch (error) {
      // Decision-12a error contract: every terminal path writes its exact
      // emoji-prefixed message to #sync-status and logs — never a silent catch.
      // Fail-stop semantics: no further requests, previously-persisted chunks
      // are kept, and the backfill latch is never written (the latch call above
      // was already skipped because the throw unwound the try).
      console.error('[steps]', error);

      // Chunk coordinates come from the error, then the last loop position,
      // then a single implied chunk (window resolution failed).
      const i = error.index ?? lastChunk?.index ?? 1;
      const total = error.total ?? lastChunk?.total ?? 1;

      reporter.sync(await _renderSyncErrorMessage({ error, i, total, persistedDays, db }));
    } finally {
      // 9. finally invariants: restore the button, clear the guard, and leave
      //    #sync-status exactly as the last reporter.sync() wrote it.
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync Steps';
      }
      isSyncing = false;
    }
  }

  return { sync };
}
