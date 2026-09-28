/**
 * Health Connect StepSource (Android app only).
 *
 * Single-responsibility: read steps and distance from Health Connect through
 * the @capgo/capacitor-health plugin and translate them into DayReadings for
 * the sync engine (steps.js).
 *
 * Factory: createHealthConnectStepSource(health, reporter)
 *
 * Why hourly buckets: the plugin's "day" bucket is a fixed 24-hour duration
 * from the query start, which drifts off calendar days across a DST change.
 * Hourly buckets always start on a local hour boundary, so summing them per
 * local calendar date gives exact days — and the same call yields the 24-hour
 * step profile the dashboard charts. A 30-day chunk is 720 buckets, well under
 * Health Connect's 5,000-bucket limit per request.
 */

import { _localDate } from './date-utils.js';
import { FAILURE_AUTH_EXPIRED, FAILURE_SOURCE_ERROR, syncFailure } from './step-source.js';

/** Name shown in user-facing status messages. */
export const HEALTH_CONNECT_LABEL = 'Health Connect';

/** The only data types this app reads. Must match the AndroidManifest permissions. */
export const READ_TYPES = ['steps', 'distance'];

const NOT_READY_MESSAGE = '🔑 Tap "Connect Health Connect" to allow step access first';
const ACCESS_LOST_MESSAGE =
  'Health Connect access was removed — tap "Connect Health Connect" to allow it again';
const PROGRESS_MESSAGE = '⏳ Reading steps from Health Connect…';

/** Error code the plugin rejects with when a read permission is missing. */
const PERMISSION_DENIED_CODE = 'permission-denied';

const HOURS_PER_DAY = 24;
const METRES_PER_KM = 1000;

/**
 * Sum hourly aggregate samples per local calendar date.
 *
 * @param {Array<{startDate: string, value: number}>} samples
 * @returns {Map<string, number[]>} date → 24 hourly values (unrounded)
 */
function groupHourlyByLocalDate(samples) {
  const byDate = new Map();
  for (const sample of samples) {
    const start = new Date(sample.startDate);
    if (Number.isNaN(start.getTime())) continue;
    const date = _localDate(start.getTime());
    if (!byDate.has(date)) byDate.set(date, new Array(HOURS_PER_DAY).fill(0));
    byDate.get(date)[start.getHours()] += Number(sample.value) || 0;
  }
  return byDate;
}

/**
 * Every local calendar date in [startMs, endMs), stepping by calendar day so
 * a 23- or 25-hour DST day is still exactly one date.
 */
function localDatesBetween(startMs, endMs) {
  const dates = [];
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < endMs) {
    dates.push(_localDate(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * Create the Health Connect StepSource.
 *
 * @param {object} health    The @capgo/capacitor-health plugin (Health).
 * @param {object} reporter  Status reporter with sync(text) and optional status(text).
 * @returns {import('./step-source.js').StepSource}
 */
export function createHealthConnectStepSource(health, reporter) {
  if (typeof health?.queryAggregated !== 'function' || typeof health?.checkAuthorization !== 'function') {
    throw new TypeError('[health-connect] the Health plugin is required');
  }
  if (typeof reporter?.sync !== 'function') {
    throw new TypeError('[health-connect] reporter.sync() is required');
  }

  /** Available on this phone and allowed to read steps (distance is optional). */
  async function isReady() {
    const { available } = await health.isAvailable();
    if (!available) return false;
    const { readAuthorized = [] } = await health.checkAuthorization({ read: READ_TYPES });
    return readAuthorized.includes('steps');
  }

  function hourlySums(dataType, chunk) {
    return health
      .queryAggregated({
        dataType,
        startDate: new Date(chunk.startMs).toISOString(),
        endDate: new Date(chunk.endMs).toISOString(),
        bucket: 'hour',
        aggregation: 'sum',
      })
      .then((result) => groupHourlyByLocalDate(result?.samples ?? []));
  }

  /**
   * Read every local day in [startMs, endMs). Steps are required; distance is
   * best-effort (a missing distance permission or read failure leaves
   * distanceKm null for the engine to estimate).
   */
  async function fetchDays(chunk, { index, total, phase }) {
    if (!Number.isFinite(chunk?.startMs) || !Number.isFinite(chunk?.endMs)) {
      throw new TypeError('[health-connect] fetchDays requires a { startMs, endMs } chunk');
    }
    reporter.status?.(PROGRESS_MESSAGE);

    const [steps, distance] = await Promise.all([
      hourlySums('steps', chunk).catch((cause) => {
        const kind = cause?.code === PERMISSION_DENIED_CODE ? FAILURE_AUTH_EXPIRED : FAILURE_SOURCE_ERROR;
        throw syncFailure({ kind, status: null, index, total, phase, cause });
      }),
      hourlySums('distance', chunk).catch((error) => {
        console.error('[health-connect] distance read failed', error);
        return new Map();
      }),
    ]);

    return localDatesBetween(chunk.startMs, chunk.endMs).map((date) => {
      const hourly = steps.get(date);
      const hourlySteps = hourly ? hourly.map(Math.round) : null;
      const metres = distance.get(date)?.reduce((sum, value) => sum + value, 0);
      return {
        date,
        steps: hourlySteps ? hourlySteps.reduce((sum, value) => sum + value, 0) : 0,
        distanceKm: metres === undefined ? null : Number((metres / METRES_PER_KM).toFixed(3)),
        hourlySteps,
      };
    });
  }

  return {
    label: HEALTH_CONNECT_LABEL,
    notReadyMessage: NOT_READY_MESSAGE,
    accessLostMessage: ACCESS_LOST_MESSAGE,
    isReady,
    fetchDays,
  };
}
