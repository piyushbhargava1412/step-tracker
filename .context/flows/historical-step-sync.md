# Flow: Historical Step Sync (Chunked Google Fit Aggregate Fetch)

<!-- context-meta
verification-commit: 7e440b755ebfd852ef1e22508b0aa5bb0fe55c4a
generated-at: 2026-08-14T00:00:00Z
confidence: high
-->

## Overview
`src/steps.js` is the sole gateway to the Google Fit REST API. The `createStepSync(auth, db, reporter, doc = document)` factory returns `{ sync }`, and `sync()` fetches daily step/distance buckets from the Google Fit aggregate API in ≤30-calendar-day chunks, normalises them, and persists one row per day into the local Dexie `daily_records` table. Chunks are processed newest-first; the newest-anchored incremental window always runs, while a full-history backfill window walks older data back to the `2013-01-01` history anchor until a one-time latch marks the backfill complete.

## Entry Points
- **Type**: UI Event (browser) + automatic on connect/restore
- **Path/Topic**: `#sync-btn` click → `stepSync.sync()` where `const stepSync = createStepSync(auth, db, reporter, doc)` (wired in `src/main.js`). `main.js` also auto-triggers `stepSync.sync()` via the `auth.onTokenReceived(...)` hook the moment a valid token arrives — from the first connect click or a silent session restore after a refresh — so no second click is required.
- **File**: `src/steps.js` (engine), `src/main.js` (wiring)

## Core Path
1. `#sync-btn` click invokes `stepSync.sync()` (wired in `src/main.js` as `async () => { await stepSync.sync(); progressUI.render(); await streakUI.render(); }`), which pre-flight-checks `auth.getAccessToken()` (null token → `🔑 Connect your Google Account first`), then guards against re-entry with a closure-scoped `isSyncing` flag and disables the button. On completion, both the Today's Progress card and streak dashboard are refreshed with the newly-persisted step data.
2. `_determineSyncWindows(db)` resolves the two-segment window model from persisted state alone. First it reads the user-configured sync anchor from `db.settings.get('sync_anchor_date')` (fail-open: falls back to `DEFAULT_SYNC_ANCHOR = '2018-01-01'` on absent row or thrown error):
   - Empty DB → a single `[anchor → tomorrow's local midnight]` full-history window.
   - Non-empty DB → an incremental `[latest stored date − 3 days → tomorrow]` window (the 3-day `SAFETY_BUFFER_DAYS` catches late-arriving wearable/Health Connect data), always.
   - A full-history backfill `[anchor → oldest stored date + 1 day]` window is appended only while the backfill is not complete.
3. Each window is flattened into ≤`CHUNK_DAYS` (30)-day chunks via `_chunkWindow` (newest-first, boundaries on local midnight — DST-safe), then processed strictly sequentially with a `fetch → normalize → upsert` loop; one emoji-prefixed status line is written per chunk via `reporter.sync()`.
4. Each chunk `POST`s to Google Fit `users/me/dataset:aggregate` with `Authorization: Bearer <token>`, `Content-Type: application/json`, and a body of exactly two `aggregateBy` entries — `com.google.step_count.delta` and `com.google.distance.delta` — with no `dataSourceId` (broad multi-device / Health Connect compatibility), `bucketByTime: { durationMillis: 86400000 }`, and `startTimeMillis`/`endTimeMillis` at **local midnight** (00:00:00.000 local time), never UTC zero-hour.
5. `_normalizeBuckets` turns each bucket into one `daily_records` row (zero-filled; dual data type: steps from `step_count.delta` intVal, distance from `distance.delta` fpVal metres → km at 3 decimals, falling back to `steps × 0.000762` km when distance data is absent). Buckets whose resolved start time is not finite (missing both `startTimeMillis` and `startTimeNanos`, or a non-numeric value) are skipped rather than persisted under a NaN primary key.
6. `_upsertChunk` persists each chunk inside a Dexie `rw` transaction, merging against existing rows: `is_overridden: true` rows keep their user-authored `effective_*` and `override` values (only `original_*` is refreshed), and all other rows high-water-mark `effective_*` as `max(stored, incoming)` — a lowered/scrubbed Google Fit response can never reduce a user-visible step or distance count, while `original_*` always follows the raw cloud truth.
7. When a full-history window completed, `_latchBackfillComplete` writes `{ key: 'initial_backfill_complete', value: true }` to the `settings` store; all future syncs collapse to a single incremental request.
8. On success the final status line reports the day/request count and how far the history now reaches; a terminal failure writes the decision-12a message, logs via `console.error`, fail-stops (keeps already-persisted chunks), and the next click resumes at the correct older date. In the backfill-completed success message the anchor is rendered as the formatted local date `2013-01-01` (`_formatLocalDate(HISTORY_ANCHOR_DATE.getTime())`) rather than embedding the `HISTORY_ANCHOR_DATE` Date object — this avoids a locale-dependent `toString()` and matches the tests.
9. **Fire-and-forget Drive backup (ST-012)**: when `driveSync` and `backup` collaborators are injected
   (see `.context/flows/backup-and-cloud-sync.md`), a successful sync triggers a silent background push
   to Google Drive AppData — gated on the persisted `drive_backup_enabled` opt-out setting, a cheap
   dirty-check (`backup.hasUnpushedChanges()`), and an in-flight coalescing guard so overlapping syncs
   upload at most once. This step never blocks, never throws, and never writes to `#sync-status` — a
   Drive failure is isolated and logged only via `console.error('[drive-sync]', err)`.

## Data Touchpoints
- **Entities**: One `daily_records` row per calendar day (`date` primary key, `original_*`/`effective_*` step and distance values, `is_overridden`, `override`, `synced_at`)
- **Tables**: `daily_records` (Dexie) for step data; `settings` (Dexie) for the `initial_backfill_complete` latch key
- **UI Surface**: `#sync-status` line via `reporter.sync()` for progress/throttling/warning/failure messages. Terminal `✅`-prefixed success messages are instead rendered as a transient fading toast (`src/toast.js:showToast`, `src/ui-status.js:sync()`) and `#sync-status` is cleared — no persistent success text remains on the status line.

## Integrations
- **Type**: API Call
- **Target**: Google Fitness REST API
- **Channel**: `POST https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`

## Error / Retry Surface
- Single retry on transient `429` / `5xx`, honouring `Retry-After` (capped at 30 s, else 2 s default).
- `401` short-circuits to a `🔑 Session expired` reconnect prompt.
- Other `4xx` and network errors are terminal (fail-stop); every state (⏳ progress, ✅ success, ⚠️ transient, ❌ terminal, 🔑 auth) is surfaced via `reporter.sync()` → `#sync-status`.

## Scope
- `src/steps.js` — the step-sync engine (factory `createStepSync(auth, db, reporter, doc, driveSync, backup, settings)`; the last three collaborators are optional/injectable and drive the ST-012 post-sync Drive push described in step 9)
- `src/main.js` — composition-root wiring (`#sync-btn` click → `stepSync.sync()`)
- `src/toast.js` / `src/ui-status.js` — success-message toast surface (see step 8 / UI Surface above)

## Tests
- `src/steps.test.js` — factory shape, DST-safe date helpers, window resolution, chunking, normalisation, retry policy, transactional upsert/override preservation, and the backfill latch.

## Notes
- The sync anchor is user-configurable via `src/settings.js` / `#settings-modal`; the default `DEFAULT_SYNC_ANCHOR = '2018-01-01'` is seeded in `settings` at DB v5. Previously the anchor was a hard-coded `HISTORY_ANCHOR_DATE = new Date(2013, 0, 1)`.
- The first sync spans from the anchor date to today (~166 chunks at the 2013 default); it can take several minutes; the app shows a `⏳ Full history sync` message and asks the user to keep the tab open.
- An interrupted backfill is fail-stop but resume-friendly: already-persisted chunks are kept and the next click resumes at the correct older date — the run always walks to the anchor via the persisted state, not a fixed 365-day loop.
- The `initial_backfill_complete` latch lives in the existing `settings` store (declared at DB_VERSION 1) — no schema bump.
