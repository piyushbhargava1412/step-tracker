/**
 * StepSource port — the contract between the sync engine (steps.js) and any
 * provider of daily step data (Google Fit today, Health Connect next).
 *
 * Single-responsibility: define the port and the classified-failure
 * vocabulary every source shares. No I/O, no DOM, no Dexie.
 *
 * @typedef {object} DayReading
 * @property {string}        date         Local calendar day, 'YYYY-MM-DD'.
 * @property {number}        steps        Whole steps for the day (≥ 0).
 * @property {number|null}   distanceKm   Measured distance, or null when the
 *                                        source has none (the engine estimates).
 * @property {number[]|null} hourlySteps  24 local-hour step counts, or null
 *                                        when unavailable.
 *
 * @typedef {object} StepSource
 * @property {string}   label              Human name used in status messages.
 * @property {string}   notReadyMessage    Status shown when isReady() is false.
 * @property {string}   accessLostMessage  Lead-in of the 🔑 message shown when
 *                                         access is revoked mid-sync.
 * @property {() => boolean} isReady       Whether a sync may start now.
 * @property {(chunk: {startMs: number, endMs: number},
 *             ctx: {index: number, total: number, phase: string})
 *             => Promise<DayReading[]>} fetchDays
 *           Read every local day in [startMs, endMs). Throws a syncFailure()
 *           for classified failures.
 */

/** `name` carried by every error a source throws for a classified failure. */
export const SYNC_ERROR_NAME = 'StepSyncError';

/** Access was rejected — the user must reconnect or re-grant. */
export const FAILURE_AUTH_EXPIRED = 'auth-expired';

/** A transient failure survived the source's retry policy. */
export const FAILURE_RETRY_EXHAUSTED = 'retry-exhausted';

/** A deterministic failure that a retry could not help. */
export const FAILURE_HTTP_ERROR = 'http-error';

/** The transport itself failed — offline, DNS, CORS or an aborted connection. */
export const FAILURE_NETWORK_ERROR = 'network-error';

/**
 * Build a classified failure for the engine to render.
 *
 * The message is a developer diagnostic only — it never carries request
 * headers or token material. The user-facing terminal string is composed by
 * the engine from these fields.
 *
 * @param {object} details
 * @param {string} details.kind    One of the FAILURE_* constants.
 * @param {number|null} details.status  Status code, or null when none exists.
 * @param {number} details.index   1-based index of the failing chunk.
 * @param {number} details.total   Total chunk count for the run.
 * @param {string} details.phase   Sync phase tag of the failing chunk.
 * @param {Error=} details.cause   Underlying error, when one exists.
 * @returns {Error}
 */
export function syncFailure({ kind, status, index, total, phase, cause }) {
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

const STRING_MEMBERS = ['label', 'notReadyMessage', 'accessLostMessage'];
const FUNCTION_MEMBERS = ['isReady', 'fetchDays'];

/**
 * Fail fast when a collaborator does not satisfy the StepSource contract.
 *
 * @param {StepSource} source
 * @returns {StepSource} The same source, for inline use.
 * @throws {TypeError} Naming the first missing or invalid member.
 */
export function assertStepSource(source) {
  if (source === null || typeof source !== 'object') {
    throw new TypeError('[step-source] StepSource must be an object');
  }
  for (const member of STRING_MEMBERS) {
    if (typeof source[member] !== 'string' || source[member] === '') {
      throw new TypeError(`[step-source] StepSource.${member} must be a non-empty string`);
    }
  }
  for (const member of FUNCTION_MEMBERS) {
    if (typeof source[member] !== 'function') {
      throw new TypeError(`[step-source] StepSource.${member} must be a function`);
    }
  }
  return source;
}
