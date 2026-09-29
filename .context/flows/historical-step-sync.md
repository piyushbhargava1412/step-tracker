# Flow: Historical Step Sync (Chunked StepSource Sync)

<!-- context-meta
verification-commit: d1c86a9 + ST-016 (StepSource port)
generated-at: 2026-09-28T12:00:00Z
confidence: high
-->

## Overview
Since ST-016 the sync is split along a **`StepSource` port** (`src/step-source.js`). `src/steps.js` is the source-agnostic engine. Since ST-024 there is one source: `src/health-connect-step-source.js`, in the Android app (see `.context/flows/android-health-connect.md`). The Google Fit REST source (`fit-step-source.js`, browser) was removed with the Fit shutdown; the browser is now a read-only viewer of the app's Drive backup and runs no step sync (`.context/flows/read-only-web-viewer.md`). `src/platform/step-source.js` `selectStepSource` returns `{ source: null, connection }` in the browser.

## Entry Points
- **Type**: UI Event (browser) + automatic on connect/restore + on resume (ST-021: `src/sync-trigger.js` `runIfStale()` when the tab/app returns to the foreground, connected, ≥ 10 min since the last sync started; every sync entry point goes through the trigger)
- **Path/Topic**: `#sync-btn` click → `stepSync.sync()` where `const stepSync = createStepSync(stepSource, db, reporter, doc, driveSync, backup, settings)` and `stepSource` comes from `selectStepSource(...)` (wired in `src/main.js`). `main.js` also auto-triggers it through the connection's `onConnected` hook the moment Health Connect access is granted (or found at launch), so no second tap is required.
- **File**: `src/steps.js` (engine), `src/step-source.js` (port + failure vocabulary), `src/health-connect-step-source.js` (the source), `src/main.js` (wiring — the step sync is built only in the app)

## Core Path
1. `#sync-btn` (Today's status line) click or pull-to-refresh invokes `syncTrigger.run()` → `stepSync.sync()` (then `src/main.js` re-renders every data view via `_renderViews(dataViews(), 'sync')`), which first claims a closure-scoped `isSyncing` re-entrancy guard, then pre-flight-checks `source.isReady()` — awaited only when the source answers with a promise (Health Connect checks permissions asynchronously; a synchronous answer keeps the button state change in the same tick), a thrown/rejected check counting as not ready (not ready → release the guard, show `source.notReadyMessage`), then guards against re-entry with a closure-scoped `isSyncing` flag and disables the button. The button is an icon (refresh glyph, `aria-label`/`title` "Sync steps"); its busy state is `.is-syncing` (spins the icon; no spin under reduced motion) + `aria-busy="true"`, both cleared in `finally` — its content is never rewritten. Resume hints in sync messages read "sync again to resume / continue". On completion, every data view (Today's panel, calendar month + week, challenge, Insights, Journey) is refreshed with the newly-persisted step data.
2. **Empty-local-DB Drive restore recovery**: when the injected `driveSync`/`backup` collaborators are both present, `sync()` calls `db.daily_records.count()` before resolving any window. A `0` count (a fresh browser profile/localhost signing into a Google account whose cloud history already exists — previously indistinguishable from a genuinely new user) triggers `driveSync.pull({ silent: true })` (silent: without a Google token — e.g. in the Android app — it returns quietly instead of writing "Drive sync unavailable" into the connection status); a truthy envelope is restored via `backup.restoreBackup(envelope)` and a `☁️ Restored your existing data from Google Drive — syncing latest steps…` line is written via `reporter.sync()`. Because `restoreBackup` writes both `daily_records` and `settings` (including the `initial_backfill_complete` latch), step 3 below then sees the account's real history and resolves a normal incremental window instead of re-running the multi-minute full-history backfill. This step is **fully fail-open**: a non-empty local DB, a `null`/`undefined` pull result (no Drive backup exists), a rejected `pull()`, or a rejected/invalid `restoreBackup()` (e.g. a validator `TypeError` on a tampered payload) all fall straight through to the unmodified sync below, logged only via `console.error('[drive-sync]', err)` — this recovery must never block or fail the sync. `driveSync`/`backup` absent (legacy call site or `null`) skips the check entirely, including the `count()` call.
3. `_determineSyncWindows(db)` resolves the two-segment window model from persisted state alone. First it reads the user-configured sync anchor from `db.settings.get('sync_anchor_date')` (fail-open: falls back to `DEFAULT_SYNC_ANCHOR = '2018-01-01'` on absent row or thrown error):
   - Empty DB → a single `[anchor → tomorrow's local midnight]` full-history window.
   - Non-empty DB → an incremental `[latest stored date − 3 days → tomorrow]` window (the 3-day `SAFETY_BUFFER_DAYS` catches late-arriving wearable/Health Connect data), always.
   - A full-history backfill `[anchor → oldest stored date + 1 day]` window is appended only while the backfill is not complete.
4. Each window is flattened into ≤`CHUNK_DAYS` (30)-day chunks via `_chunkWindow` (newest-first, boundaries on local midnight — DST-safe), then processed strictly sequentially with a `source.fetchDays(chunk, { index, total, phase }) → _toDailyRecords → _upsertChunk` loop; one emoji-prefixed status line is written per chunk via `reporter.sync()`.
5. **The source** (`health-connect-step-source.js`): `fetchDays` reads the chunk from Health Connect (hourly aggregates summed into local days, with the 24-hour step profile) — see `.context/flows/android-health-connect.md`.
6. Each `DayReading` (`distanceKm: null` when the source has none) goes through `_toDailyRecords`, which estimates a `null` distance as `steps × STEP_TO_KM` (0.000762 km/step).
8. `_upsertChunk` persists each chunk inside a Dexie `rw` transaction, merging against existing rows: `is_overridden: true` rows keep their user-authored `effective_*` and `override` values (only `original_*` is refreshed), and all other rows high-water-mark `effective_*` as `max(stored, incoming)` — a lowered/scrubbed source response can never reduce a user-visible step or distance count, while `original_*` always follows the raw cloud truth.
9. When a full-history window ran, `_latchBackfillComplete(db, backfillWindow.startMs)` writes `{ key: BACKFILL_COMPLETE_KEY ('initial_backfill_complete'), value: true }` to the `settings` store once the oldest stored row reaches that window's start — the resolved sync anchor (it throws `TypeError` on a non-finite anchor). All future syncs collapse to a single incremental request. `settings.setSyncAnchorDate()` clears the latch whenever the anchor changes, so moving the horizon earlier triggers a backfill of the newly included days.
10. On success the final status line reports the day/request count and how far the history now reaches; a terminal failure writes the decision-12a message, logs via `console.error`, fail-stops (keeps already-persisted chunks), and the next click resumes at the correct older date. The opening `⏳ Full history sync — fetching all <label> data since <anchor>.` line and the backfill-completed success message (`… full history complete back to <anchor>.`) both render the resolved anchor from the full-history window's `startMs` via `_formatLocalDate` — there is no hard-coded history floor in `steps.js`.
11. **Fire-and-forget Drive backup (ST-012)**: when `driveSync` and `backup` collaborators are injected
   (see `.context/flows/backup-and-cloud-sync.md`), a successful sync triggers a silent background push
   to Google Drive AppData — gated on the persisted `drive_backup_enabled` opt-out setting, a cheap
   dirty-check (`backup.hasUnpushedChanges()`), and an in-flight coalescing guard so overlapping syncs
   upload at most once. This step never blocks, never throws, and never writes to `#sync-status` — a
   Drive failure is isolated and logged only via `console.error('[drive-sync]', err)`.

## Data Touchpoints
- **Entities**: One `daily_records` row per calendar day (`date` primary key, `original_*`/`effective_*` step and distance values, `hourly_steps` — a 24-element local-hour step-count array or `null` when the hourly fetch is unavailable, ST-009 — `is_overridden`, `override`, `synced_at`)
- **Tables**: `daily_records` (Dexie, `DB_VERSION = 6` — v6 backfills `hourly_steps: null` on pre-existing rows) for step data; `settings` (Dexie) for the `initial_backfill_complete` latch key
- **UI Surface**: `#sync-status` line via `reporter.sync()` for progress/throttling/warning/failure messages. Terminal `✅`-prefixed success messages are instead rendered as a transient fading toast (`src/toast.js:showToast`, `src/ui-status.js:sync()`) and `#sync-status` is cleared — no persistent success text remains on the status line.

## Integrations
- **Type**: Native plugin
- **Target**: Health Connect (on-device, via `@capgo/capacitor-health`)
- **Channel**: Capacitor plugin calls — no network

## Error / Retry Surface
- Sources throw `syncFailure({ kind, status, index, total, phase })` (from `step-source.js`) with a `FAILURE_*` kind (`FAILURE_SOURCE_ERROR` renders as `❌ … — <label> data could not be read.`, for on-device sources without an HTTP status); the engine renders them using `source.label` (e.g. `❌ … — Health Connect returned 403.`) and `source.accessLostMessage` (the `🔑` message). Unclassified throws render as a database error.
- Access removed mid-sync (`FAILURE_AUTH_EXPIRED`) renders `🔑 <accessLostMessage>, then sync again to continue …`.
- Other `4xx` and network errors are terminal (fail-stop); every state (⏳ progress, ✅ success, ⚠️ transient, ❌ terminal, 🔑 auth) is surfaced via `reporter.sync()` → `#sync-status`.

## Scope
- `src/step-source.js` — `StepSource` / `DayReading` typedefs, `assertStepSource`, `syncFailure` and the `FAILURE_*` / `SYNC_ERROR_NAME` vocabulary
- `src/health-connect-step-source.js` — `createHealthConnectStepSource(health, reporter)`: the only source (ST-024)
- `src/steps.js` — the step-sync engine (factory `createStepSync(source, db, reporter, doc, driveSync, backup, settings)`; the last three collaborators are optional/injectable and drive both the empty-local-DB Drive restore recovery (step 2) and the ST-012 post-sync Drive push described in step 11)
- `src/main.js` — composition-root wiring (`#sync-btn` click → `stepSync.sync()`)
- `src/toast.js` / `src/ui-status.js` — success-message toast surface (see step 10 / UI Surface above)

## Tests
- `src/step-source.test.js` — port validation and failure construction.
- `src/health-connect-step-source.test.js` — the source's aggregation, zero-fill and failure classification.
- `src/steps.test.js` (every engine test runs on the in-memory `makeFakeSource()` from `src/steps.fixtures.js`) — factory shape (incl. rejecting a non-`StepSource`), DST-safe date helpers, window resolution, chunking, `_toDailyRecords` distance estimation, a full `sync()` driven by a fake `StepSource` with `fetch` forbidden, transactional upsert/override preservation, the backfill latch, the empty-local-DB Drive restore recovery (pull/restoreBackup ordering, fail-open error paths, and an end-to-end integration test with the real `createBackup` proving a restored account resolves an incremental window instead of a full-history backfill), and (ST-009) the parallel hourly-fetch contract end-to-end through the real Fit source.

## Notes
- The sync anchor is user-configurable via `src/settings.js` / the Settings screen's "Track history from" row (`#settings-panel`); the default `DEFAULT_SYNC_ANCHOR = '2018-01-01'` is seeded in `settings` at DB v5. Previously the anchor was a hard-coded `HISTORY_ANCHOR_DATE = new Date(2013, 0, 1)`; that constant was removed once the latch and messages moved to the configured anchor (ST-016 follow-up).
- The first sync spans from the anchor date to today (~100 chunks at the 2018 default); it can take several minutes; the app shows a `⏳ Full history sync` message and asks the user to keep the tab open.
- An interrupted backfill is fail-stop but resume-friendly: already-persisted chunks are kept and the next click resumes at the correct older date — the run always walks to the anchor via the persisted state, not a fixed 365-day loop.
- The `initial_backfill_complete` latch lives in the existing `settings` store (declared at DB_VERSION 1) — no schema bump.
- **ST-009**: `hourly_steps` (a 24-element local-hour array, or `null`) is refreshed on every upsert (not part of the override contract — even an `is_overridden` row gets it updated) and feeds the Insights 24-hour chart and the Night Owl trophy.
- **Empty-local-DB Drive restore recovery**: added so a fresh browser profile or `localhost` dev server signing into a Google account that already has cloud history (e.g. the deployed production app) restores the existing Drive AppData backup before syncing, instead of misreading the empty local Dexie table as a brand-new account and re-running the full 2013 backfill. See `.context/flows/backup-and-cloud-sync.md` for the Drive gateway/backup-engine details this step reuses.
