/**
 * Step-sync engine.
 *
 * Single-responsibility: decide which days to sync, pull them from an injected
 * StepSource (see step-source.js) chunk by chunk, and persist them into
 * `daily_records` without ever clobbering user overrides. The engine knows
 * nothing about Google Fit, Health Connect or HTTP — sources do.
 *
 * Factory: createStepSync(source, db, reporter, doc = document, …)
 *
 * All private helpers are exported with an underscore prefix so the test
 * suite can assert on them directly without any circular dependency.
 */

// ── Constants (exported for testability) ─────────────────────────────────────

import { DEFAULT_SYNC_ANCHOR, BACKFILL_COMPLETE_KEY } from './settings.js';
import { _localDate } from './date-utils.js';
import {
  SYNC_ERROR_NAME,
  FAILURE_AUTH_EXPIRED,
  FAILURE_RETRY_EXHAUSTED,
  FAILURE_HTTP_ERROR,
  FAILURE_NETWORK_ERROR,
  assertStepSource,
} from './step-source.js';
export { DEFAULT_SYNC_ANCHOR, BACKFILL_COMPLETE_KEY };

/** Days per API request chunk. */
export const CHUNK_DAYS = 30;

/** Milliseconds in one calendar day — used to count the days a window spans. */
export const BUCKET_MS = 86_400_000;

/**
 * Re-fetch this many calendar days before the newest stored record so that
 * late-arriving wearable or Health Connect data is always captured.
 */
export const SAFETY_BUFFER_DAYS = 3;

/** Kilometres per step — estimates distance when a source reports none. */
export const STEP_TO_KM = 0.000762;

/** Phase tag for a window that walks history back to the configured sync anchor. */
export const PHASE_FULL_HISTORY = 'Full history sync';

/** Phase tag for the recent-days window fetched on every run. */
export const PHASE_INCREMENTAL = 'Incremental sync';

/** Matches the 'YYYY-MM-DD' primary key stored on every daily_records row. */
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  return _localDate(ms);
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
  // Read user-configured sync anchor; fall back to DEFAULT_SYNC_ANCHOR on
  // absence, empty value, or a thrown error (fail-open: mirrors the adjacent
  // BACKFILL_COMPLETE_KEY read pattern).
  let anchorDateStr = DEFAULT_SYNC_ANCHOR;
  try {
    const anchorRow = await db.settings.get('sync_anchor_date');
    if (anchorRow?.value) {
      anchorDateStr = anchorRow.value;
    }
  } catch (err) {
    console.error('[steps]', err);
  }
  const anchorMs = _localMidnight(anchorDateStr).getTime();
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

// ── Reading → record mapping ─────────────────────────────────────────────────

/**
 * Map a source's DayReadings onto the `daily_records` row shape.
 *
 * Owns the one domain rule sources must not decide: when a source has no
 * measured distance (`distanceKm === null`), estimate it as
 * `steps × STEP_TO_KM`, rounded to 3 dp. A measured 0 km is kept as 0.
 * `effective_*` starts equal to `original_*`; overrides are applied later by
 * `_upsertChunk`.
 *
 * @param {Array<import('./step-source.js').DayReading>} readings
 * @returns {Array<{
 *   date: string,
 *   original_steps: number,
 *   original_distance_km: number,
 *   effective_steps: number,
 *   effective_distance_km: number,
 *   hourly_steps: number[]|null,
 *   synced_at: string,
 * }>}
 */
export function _toDailyRecords(readings) {
  const synced_at = new Date().toISOString();
  return readings.map(({ date, steps, distanceKm, hourlySteps }) => {
    const distance = distanceKm ?? Number((steps * STEP_TO_KM).toFixed(3));
    return {
      date,
      original_steps: steps,
      original_distance_km: distance,
      effective_steps: steps,
      effective_distance_km: distance,
      hourly_steps: hourlySteps ?? null,
      synced_at,
    };
  });
}

// ── Transactional upsert ─────────────────────────────────────────────────────

/**
 * High-water mark for a day's effective value.
 *
 * Returns the higher of the stored effective value and the freshly fetched
 * cloud value, so a scrubbed/lowered source response can never take
 * away steps (or distance) a user has already seen and celebrated.
 *
 * A non-finite stored value is treated as absent — a corrupt row must never
 * pin a stale number. Only the sync engine applies this; a user-authored
 * override (outside the sync path) remains authoritative and is never maxed.
 *
 * @param {number|undefined} existing  The stored effective value.
 * @param {number} incoming            The freshly fetched cloud value.
 * @returns {number}
 */
export function _effectiveHighWater(existing, incoming) {
  return Number.isFinite(existing) && existing > incoming ? existing : incoming;
}

/**
 * Persist one chunk's normalized records into `daily_records` under a Dexie
 * `rw` transaction, merging against existing rows so user-authored overrides
 * survive and raw cloud truth is preserved for debugging.
 *
 * Merge rules (Decision 3 + high-water mark):
 *  - Absent row      → insert a fresh record with `is_overridden: false`,
 *                       `override: null`, and `effective_*` = `original_*`.
 *  - `is_overridden !== true` → overwrite `original_*` with the raw cloud
 *                               values; set `effective_*` to the **higher** of
 *                               the stored value and the incoming cloud value
 *                               (`_effectiveHighWater`) so a lowered response
 *                               never reduces a user-visible count; refresh
 *                               `synced_at`.
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
 * }>} records  Records from `_toDailyRecords` for this chunk.
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
        // hourly_steps is always refreshed — it is not part of the override contract.
        return {
          ...row,
          original_steps: record.original_steps,
          original_distance_km: record.original_distance_km,
          hourly_steps: record.hourly_steps ?? null,
          synced_at,
        };
      }

      // Present and not overridden → original_* always reflects the raw cloud
      // truth; effective_* is high-water-marked so a lowered/scrubbed response
      // never takes away steps (or distance) the user has already seen.
      // hourly_steps is always refreshed from the incoming record.
      return {
        ...row,
        original_steps: record.original_steps,
        original_distance_km: record.original_distance_km,
        effective_steps: _effectiveHighWater(row.effective_steps, record.effective_steps),
        effective_distance_km: _effectiveHighWater(
          row.effective_distance_km,
          record.effective_distance_km
        ),
        hourly_steps: record.hourly_steps ?? null,
        synced_at,
      };
    });

    await db.daily_records.bulkPut(merged);
  });
}

/**
 * Latch the backfill as complete once the oldest stored record reaches or
 * passes the sync anchor the backfill ran to (the user's configured horizon —
 * the full-history window's `startMs`).
 *
 * Re-reads the oldest record itself — never trusts a caller-supplied value —
 * and writes the terminal flag to the `settings` store. The write sits
 * deliberately outside any `daily_records` transaction so a latch failure can
 * never roll back step data. A failed write is logged and swallowed: the only
 * consequence of a lost latch is one extra idempotent backfill pass, never a
 * sync failure.
 *
 * @param {object} db        Dexie database exposing `daily_records` and `settings`.
 * @param {number} anchorMs  Local-midnight ms of the sync anchor.
 * @returns {Promise<void>}
 * @throws {TypeError} When `anchorMs` is not finite — before any read.
 */
export async function _latchBackfillComplete(db, anchorMs) {
  if (!Number.isFinite(anchorMs)) {
    throw new TypeError('[steps] _latchBackfillComplete requires a finite anchorMs');
  }
  try {
    const oldest = await db.daily_records.orderBy('date').first();
    if (!oldest) return;
    if (_localMidnight(oldest.date).getTime() <= anchorMs) {
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
 * @param {import('./step-source.js').StepSource} args.source  Supplies the
 *                                      label and access-lost wording.
 * @returns {Promise<string>}  The emoji-prefixed terminal message.
 */
export async function _renderSyncErrorMessage({ error, i, total, persistedDays, db, source }) {
  if (error.name === SYNC_ERROR_NAME && error.kind === FAILURE_AUTH_EXPIRED) {
    const oldestLabel = (await _readOldestStoredLabel(db)) ?? 'the beginning';
    return `🔑 ${source.accessLostMessage}, then click Sync Steps to continue (history synced back to ${oldestLabel}).`;
  }

  const at = `chunk ${i}/${total}`;
  const resume = `${persistedDays} days saved; click Sync Steps to resume.`;

  if (error.name === SYNC_ERROR_NAME && error.kind === FAILURE_RETRY_EXHAUSTED) {
    return `❌ Sync stopped at ${at} — ${source.label} returned ${error.status} twice. ${resume}`;
  }
  if (error.name === SYNC_ERROR_NAME && error.kind === FAILURE_HTTP_ERROR) {
    return `❌ Sync stopped at ${at} — ${source.label} returned ${error.status}. ${resume}`;
  }
  if (error.name === SYNC_ERROR_NAME && error.kind === FAILURE_NETWORK_ERROR) {
    return `❌ Sync stopped at ${at} — network error. ${resume}`;
  }

  // Any unclassified throw — a Dexie rejection from _upsertChunk, or
  // _toDailyRecords / _determineSyncWindows failing — is a persistence
  // failure. Chunk coordinates arrive resolved from the caller.
  return `❌ Sync stopped while saving ${at} — database error. ${resume}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create the step-sync engine.
 *
 * @param {import('./step-source.js').StepSource} source - Where daily step
 *                             data comes from (Google Fit, Health Connect, …).
 * @param {object} db        - Dexie database instance.
  * @param {object} reporter  - Status reporter with a sync(text) method.
  * @param {Document} doc     - The document to use for DOM access (defaults to
  *                             the global document). Follows the repo pattern of
  *                             createAuth(…, gsi = google) and
  *                             createStatusReporter(doc = document): accepting a
  *                             defaulted collaborator rather than reaching for a
  *                             global directly.
  * @param {object|null} driveSync  - ST-012 Drive sync gateway (createDriveSync).
  *                             When null, the post-sync silent upload AND the
  *                             pre-sync empty-local-DB restore are both skipped.
  * @param {object|null} backup     - ST-012 backup engine (createBackup).
  *                             When null, the post-sync silent upload AND the
  *                             pre-sync empty-local-DB restore are both skipped.
  * @param {object|null} driveBackupPrefs  - Collaborator exposing
  *                             getDriveBackupEnabled() and optionally
  *                             setLastDriveSync(). When null (legacy call
  *                             sites), the post-sync Drive auto-upload is
  *                             treated as enabled (default).
 * @returns {{ sync: Function }}
 */
export function createStepSync(source, db, reporter, doc = document, driveSync = null, backup = null, driveBackupPrefs = null) {
  assertStepSource(source);

  // Re-entrancy guard — lives in the factory closure, never at module level.
  let isSyncing = false;

  // Task 28: coalescing guard for the fire-and-forget post-sync upload. Holds
  // the in-flight push promise so an overlapping sync's hook uploads at most
  // once. Lives here (not on driveSync) so the manual "Back up to Drive"
  // button and "Restore from Drive" are never coalesced or skipped.
  let postSyncPush = null;

  /**
   * Synchronise the source's step data into the local Dexie database.
   *
   * Orchestration (decision 12a / 13 / 14 / 16): pre-flight readiness guard, a
   * silent closure-scoped re-entrancy guard, the button busy state, an
   * empty-local-DB Drive restore recovery, window resolution, a strictly
   * sequential per-chunk fetch→normalize→upsert loop, the backfill latch, a
   * decision-12a success message, and a `finally` that restores the button
   * and clears the guard without touching `#sync-status`.
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
    // 1. Pre-flight readiness guard — before touching the button.
    if (!source.isReady()) {
      reporter.sync(source.notReadyMessage);
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
      // 3a. First-run-on-this-device recovery: an empty local `daily_records`
      // table (e.g. a fresh browser profile or localhost signing into an
      // account that already has cloud history) is otherwise indistinguishable
      // from a brand-new user and would trigger the multi-minute
      // PHASE_FULL_HISTORY backfill from the sync anchor even though a Drive backup
      // already holds that history. Restore it first so step 4's
      // `_determineSyncWindows` sees the repopulated `daily_records`/`settings`
      // rows and resolves a normal incremental window instead. Fail-open: any
      // failure here (no token, no backup file, a network error, or a
      // validator rejection on a tampered payload) is logged under the
      // `[drive-sync]` tag and falls through to the unmodified Fit sync below
      // — this recovery step must never block or fail the sync.
      if (driveSync && backup) {
        try {
          const localCount = await db.daily_records.count();
          if (localCount === 0) {
            const envelope = await driveSync.pull();
            if (envelope) {
              await backup.restoreBackup(envelope);
              reporter.sync('☁️ Restored your existing data from Google Drive — syncing latest steps…');
            }
          }
        } catch (err) {
          console.error('[drive-sync]', err);
        }
      }

      // 4. Resolve the windows from persisted state (full/incremental).
      const windows = await _determineSyncWindows(db);
      // The full-history window always starts at the resolved sync anchor, so
      // it is the single source of truth for the latch and both messages.
      const backfillWindow = windows.find((w) => w.phase === PHASE_FULL_HISTORY);
      const backfillRan = backfillWindow !== undefined;

      if (backfillRan) {
        reporter.sync(
          `⏳ Full history sync — fetching all ${source.label} data since ${_formatLocalDate(backfillWindow.startMs)}. This can take several minutes; keep this tab open.`
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

      // 6. Sequential fetch → normalize → upsert.
      for (let i = 0; i < total; i += 1) {
        const chunk = chunks[i];
        const index = i + 1;
        lastChunk = { index, total };

        const readings = await source.fetchDays(
          { startMs: chunk.startMs, endMs: chunk.endMs },
          { index, total, phase: chunk.phase }
        );
        const records = _toDailyRecords(readings);

        await _upsertChunk(db, records);
        persistedDays += records.length;
      }

      // 7. Latch the backfill when a full-history window completed it.
      if (backfillRan) {
        await _latchBackfillComplete(db, backfillWindow.startMs);
      }

      // 8. Success message variant (decision 12a).
      const oldestRow = await db.daily_records.orderBy('date').first();
      const oldestMs = oldestRow
        ? _localMidnight(oldestRow.date).getTime()
        : null;

      if (backfillRan && oldestMs != null && oldestMs <= backfillWindow.startMs) {
        reporter.sync(
          `✅ Synced ${dayCount} days across ${total} requests — full history complete back to ${_formatLocalDate(backfillWindow.startMs)}. Future syncs will be fast.`
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

      // 9. Fire-and-forget Drive backup — must not block or suppress the ✅ status.
      //    A Drive failure is isolated: logged with [drive-sync] prefix, never
      //    re-thrown, and run silent so the background upload never surfaces a
      //    user-visible reporter message (Task 18 — no Drive reporter surface
      //    on the post-sync hook).
      //    Task 27 (opt-out): the persisted drive_backup_enabled setting is
      //    consulted BEFORE any backup is built, so a user who disabled the
      //    auto-upload incurs no DB serialisation cost and no push at all.
      //    Task 28 (coalescing): the in-flight guard is set synchronously before
      //    the first await so an overlapping sync's hook sees it and skips —
      //    concurrent post-sync pushes upload exactly once. The guard lives on
      //    the steps closure, never on driveSync, so manual pushes and
      //    restores are always allowed through.
      //    Every successful step sync uploads a fresh snapshot when enabled so
      //    the cloud backup timestamp reflects the latest sync, even when the
      //    fetched data is unchanged.
      if (driveSync && backup) {
        if (postSyncPush) return;
        postSyncPush = (async () => {
          try {
            const enabled =
              driveBackupPrefs?.getDriveBackupEnabled
                ? await driveBackupPrefs.getDriveBackupEnabled()
                : true;
            if (!enabled) return;
            const envelope = await backup.buildBackup();
            const result = await driveSync.push(envelope, { silent: true });
            if (result?.skipped === true) return;
            if (driveBackupPrefs?.setLastDriveSync) {
              try {
                await driveBackupPrefs.setLastDriveSync({
                  at: new Date().toISOString(),
                  bytes: JSON.stringify(envelope).length,
                });
                const CustomEventCtor = doc?.defaultView?.CustomEvent ?? globalThis.CustomEvent;
                if (CustomEventCtor) {
                  doc?.dispatchEvent?.(new CustomEventCtor('data:drive-sync:refresh'));
                }
              } catch (err) {
                console.error('[drive-sync]', err);
              }
            }
            await backup.markPushed();
          } catch (err) {
            console.error('[drive-sync]', err);
          } finally {
            postSyncPush = null;
          }
        })();
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
      const errorTotal = error.total ?? lastChunk?.total ?? 1;

      reporter.sync(await _renderSyncErrorMessage({ error, i, total: errorTotal, persistedDays, db, source }));
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
