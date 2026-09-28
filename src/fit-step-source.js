/**
 * Google Fit StepSource.
 *
 * Single-responsibility: read daily and hourly step aggregates from the Google
 * Fit REST API and translate them into DayReadings. This module is the sole
 * gateway to the Fit API; the sync engine (steps.js) only sees the StepSource
 * port defined in step-source.js.
 *
 * Factory: createFitStepSource(auth, reporter, fetchFn)
 *
 * Private helpers are exported with an underscore prefix so the test suite
 * can assert on them directly.
 */

import { _localDate } from './date-utils.js';
import {
  FAILURE_AUTH_EXPIRED,
  FAILURE_HTTP_ERROR,
  FAILURE_NETWORK_ERROR,
  FAILURE_RETRY_EXHAUSTED,
  syncFailure,
} from './step-source.js';

// ── Constants (exported for testability) ─────────────────────────────────────

/** Name shown in user-facing status messages. */
export const FIT_SOURCE_LABEL = 'Google Fit';

/** Google Fit Dataset aggregate endpoint. */
export const STEP_API_URL =
  'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';

/** Aggregated data types requested for every chunk — order is request order. */
export const STEP_DATA_TYPE = 'com.google.step_count.delta';
export const DISTANCE_DATA_TYPE = 'com.google.distance.delta';

/** bucketByTime duration for the daily aggregate. */
export const DAILY_BUCKET_MS = 86_400_000;

/** bucketByTime duration for the hourly-step pass. */
export const HOURLY_BUCKET_MS = 3_600_000;

/** Conversion factor from metres (Fit fpVal unit) to kilometres. */
export const METRES_PER_KM = 1000;

/** Default backoff before a single retry on a transient 429 / 5xx. */
export const RETRY_BACKOFF_MS = 2000;

/**
 * Maximum Retry-After we will honour (30 s). Values above this fall back to
 * RETRY_BACKOFF_MS so a rogue header cannot stall the run indefinitely.
 */
export const MAX_RETRY_AFTER_MS = 30_000;

/**
 * Attempts allowed per chunk: the initial request plus a single retry.
 * A second consecutive non-OK response is terminal for the whole run.
 */
export const MAX_ATTEMPTS_PER_CHUNK = 2;

const NOT_READY_MESSAGE = '🔑 Connect your Google Account first';
const ACCESS_LOST_MESSAGE = 'Session expired — reconnect your Google Account';
const HOURLY_PROGRESS_MESSAGE = '⏳ Fetching hourly step data…';

/** Milliseconds in a second — Retry-After is specified in seconds. */
const MS_PER_SECOND = 1000;
const NANOS_PER_MS = 1_000_000;
const HOURS_PER_DAY = 24;

/** HTTP statuses this module classifies on. */
const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MIN = 500;
const HTTP_SERVER_ERROR_MAX = 599;

/** Late-bound so a test (or polyfill) replacing globalThis.fetch is honoured. */
const globalFetch = (...args) => globalThis.fetch(...args);

// ── Bucket parsing ────────────────────────────────────────────────────────────

/**
 * Start instant of a Fit bucket in ms, from startTimeMillis or, failing that,
 * startTimeNanos. NaN when neither is usable.
 *
 * @param {object} bucket
 * @returns {number}
 */
function bucketStartMs(bucket) {
  return bucket.startTimeMillis != null
    ? Number(bucket.startTimeMillis)
    : Number(bucket.startTimeNanos) / NANOS_PER_MS;
}

/**
 * Locate a dataset by dataSourceId substring, falling back to its request
 * position when no dataset carries a dataSourceId.
 */
function findDataset(dataset, idFragment, fallbackIndex) {
  return dataset?.find((ds) => ds.dataSourceId?.includes(idFragment)) ?? dataset?.[fallbackIndex];
}

function sumPoints(dataset, valueKey) {
  return (dataset?.point ?? []).reduce(
    (sum, point) => sum + (point.value?.[0]?.[valueKey] ?? 0),
    0
  );
}

/**
 * Convert Fit daily aggregate buckets into `{ date, steps, distanceKm }`.
 *
 * Each bucket yields exactly one reading — including days with 0 steps.
 * Buckets without a usable timestamp are skipped so no 'NaN-NaN-NaN' key can
 * be produced. `distanceKm` is the measured distance (metres ÷ 1000, 3 dp), or
 * null when the distance dataset is absent, empty or non-finite — estimating
 * a distance is the engine's decision, not the source's.
 *
 * @param {Array<object>} buckets  Raw buckets from the Fit aggregate response.
 * @returns {Array<{date: string, steps: number, distanceKm: number|null}>}
 */
export function _normalizeBuckets(buckets) {
  return buckets.flatMap((bucket) => {
    const millis = bucketStartMs(bucket);
    if (!Number.isFinite(millis)) return [];

    const steps = Math.trunc(sumPoints(findDataset(bucket.dataset, 'step_count.delta', 0), 'intVal'));

    const distDataset = findDataset(bucket.dataset, 'distance.delta', 1);
    const metres = sumPoints(distDataset, 'fpVal');
    const hasDistance = (distDataset?.point ?? []).length > 0 && Number.isFinite(metres);

    return [
      {
        date: _localDate(millis),
        steps,
        distanceKm: hasDistance ? Number((metres / METRES_PER_KM).toFixed(3)) : null,
      },
    ];
  });
}

/**
 * Convert hourly Fit buckets into a 24-element array of step counts indexed
 * by *local* wall-clock hour (0–23). Hours with no bucket are 0; buckets with
 * an unusable timestamp are skipped.
 *
 * Indexed by local hour (not UTC): requests are anchored to local midnight, so
 * each bucket must be read back through the same local-clock lens the user
 * experiences — UTC would shift every hour by the timezone offset.
 *
 * @param {Array<object>|null|undefined} buckets  Raw 1-hour buckets.
 * @returns {Array<number>|null}  24 counts, or null when there are no buckets.
 */
export function _normalizeHourlyBuckets(buckets) {
  if (!buckets || buckets.length === 0) return null;

  const hourly = new Array(HOURS_PER_DAY).fill(0);
  for (const bucket of buckets) {
    const millis = bucketStartMs(bucket);
    if (!Number.isFinite(millis)) continue;
    hourly[new Date(millis).getHours()] += sumPoints(
      findDataset(bucket.dataset, 'step_count.delta', 0),
      'intVal'
    );
  }
  return hourly;
}

/**
 * Group hourly buckets by their local 'YYYY-MM-DD' day.
 *
 * @param {Array<object>} buckets
 * @returns {Record<string, Array<object>>}
 */
function groupBucketsByLocalDate(buckets) {
  const byDate = {};
  for (const bucket of buckets) {
    const millis = bucketStartMs(bucket);
    if (!Number.isFinite(millis)) continue;
    const date = _localDate(millis);
    (byDate[date] ??= []).push(bucket);
  }
  return byDate;
}

// ── Requests ──────────────────────────────────────────────────────────────────

function toLocalMidnightMs(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function aggregateRequest(auth, body) {
  return {
    method: 'POST',
    headers: {
      // Read fresh on every request — never captured, cached or logged.
      Authorization: `Bearer ${auth.getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body,
  };
}

/**
 * Resolve after `ms` milliseconds, so the retry backoff is a plain `await`
 * that tests can drive with fake timers.
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
 * finite value greater than zero and no larger than MAX_RETRY_AFTER_MS. The
 * HTTP-date form is deliberately not parsed; it falls through to the default.
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
 * Fetch one chunk of daily aggregates from Google Fit.
 *
 * Retry policy: at most MAX_ATTEMPTS_PER_CHUNK attempts. `429` and `5xx` are
 * retried once; `401` short-circuits immediately, and every other non-OK
 * status or thrown network error is terminal. The token is re-read on each
 * attempt so a refreshed token is picked up. The `⚠️` message is written
 * *before* the sleep so the user sees the reason during the wait.
 *
 * @param {object} auth      Collaborator exposing getAccessToken().
 * @param {object} reporter  Status reporter with a sync(text) method.
 * @param {{startMs: number, endMs: number}} chunk  Window bounds for this call.
 * @param {number} index     1-based chunk index, for status and diagnostics.
 * @param {number} total     Total chunk count for the run.
 * @param {string} phase     Sync phase tag of this chunk.
 * @param {Function} [fetchFn]  fetch implementation.
 * @returns {Promise<object>} The parsed aggregate response.
 * @throws {TypeError} On a malformed chunk — before any request is issued.
 * @throws {Error} A syncFailure() carrying { kind, status, index, total, phase }.
 */
export async function _fetchChunk(auth, reporter, chunk, index, total, phase, fetchFn = globalFetch) {
  if (!Number.isFinite(chunk?.startMs) || !Number.isFinite(chunk?.endMs)) {
    throw new TypeError('[steps] _fetchChunk requires a { startMs, endMs } chunk');
  }

  const body = JSON.stringify({
    aggregateBy: [
      { dataTypeName: STEP_DATA_TYPE },
      { dataTypeName: DISTANCE_DATA_TYPE },
    ],
    bucketByTime: {
      durationMillis: DAILY_BUCKET_MS,
      timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    startTimeMillis: toLocalMidnightMs(chunk.startMs),
    endTimeMillis: toLocalMidnightMs(chunk.endMs),
  });

  const fail = (kind, status, cause) =>
    syncFailure({ kind, status, index, total, phase, cause });

  let lastStatus = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CHUNK; attempt += 1) {
    let response;
    try {
      response = await fetchFn(STEP_API_URL, aggregateRequest(auth, body));
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
          ? `⚠️ Rate limited by ${FIT_SOURCE_LABEL} — retrying chunk ${index}/${total} in ${waitSeconds}s…`
          : `⚠️ ${FIT_SOURCE_LABEL} error ${lastStatus} — retrying chunk ${index}/${total} in ${waitSeconds}s…`
      );
      await _sleep(waitMs);
    }
  }

  throw fail(FAILURE_RETRY_EXHAUSTED, lastStatus);
}

/**
 * Fetch hourly step buckets for a chunk. Non-fatal by contract: any failure
 * is logged and resolves null so the daily sync is never aborted by it.
 *
 * @returns {Promise<object|null>}
 */
async function fetchHourly(auth, chunk, fetchFn) {
  try {
    const body = JSON.stringify({
      aggregateBy: [{ dataTypeName: STEP_DATA_TYPE }],
      bucketByTime: { durationMillis: HOURLY_BUCKET_MS },
      startTimeMillis: toLocalMidnightMs(chunk.startMs),
      endTimeMillis: toLocalMidnightMs(chunk.endMs),
    });
    const response = await fetchFn(STEP_API_URL, aggregateRequest(auth, body));
    if (!response.ok) throw new Error(`[steps] hourly fetch non-OK: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('[steps] hourly fetch failed', error);
    return null;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create the Google Fit StepSource.
 *
 * @param {object} auth      Collaborator exposing getAccessToken().
 * @param {object} reporter  Status reporter with sync(text) and optional status(text).
 * @param {Function} [fetchFn]  fetch implementation (defaults to the global fetch).
 * @returns {import('./step-source.js').StepSource}
 */
export function createFitStepSource(auth, reporter, fetchFn = globalFetch) {
  if (typeof auth?.getAccessToken !== 'function') {
    throw new TypeError('[fit-step-source] auth.getAccessToken() is required');
  }
  if (typeof reporter?.sync !== 'function') {
    throw new TypeError('[fit-step-source] reporter.sync() is required');
  }

  function isReady() {
    return Boolean(auth.getAccessToken());
  }

  /**
   * Read every local day in the chunk: the daily aggregate (with retries) and
   * the hourly pass run in parallel; the daily request is issued first.
   */
  async function fetchDays(chunk, { index, total, phase }) {
    reporter.status?.(HOURLY_PROGRESS_MESSAGE);

    const [daily, hourly] = await Promise.all([
      _fetchChunk(auth, reporter, chunk, index, total, phase, fetchFn),
      fetchHourly(auth, chunk, fetchFn),
    ]);

    const hourlyByDate = hourly === null ? null : groupBucketsByLocalDate(hourly.bucket ?? []);

    return _normalizeBuckets(daily.bucket ?? []).map((day) => ({
      ...day,
      hourlySteps: hourlyByDate ? _normalizeHourlyBuckets(hourlyByDate[day.date]) : null,
    }));
  }

  return {
    label: FIT_SOURCE_LABEL,
    notReadyMessage: NOT_READY_MESSAGE,
    accessLostMessage: ACCESS_LOST_MESSAGE,
    isReady,
    fetchDays,
  };
}
