# Flow: Historical Step Sync (Chunked Google Fit Aggregate Fetch)

<!-- context-meta
verification-commit: 8eac5589e7fe87b00de879dba314b4bf7691a8e0
generated-at: 2026-08-10T06:36:28Z
confidence: high
-->

## Overview
`src/steps.js` is the sole gateway to the Google Fit REST API. The `createStepSync(auth, db, reporter, doc = document)` factory returns `{ sync }`, and `sync()` fetches daily step/distance buckets from the Google Fit aggregate API in ≤30-calendar-day chunks, normalises them, and persists one row per day into the local Dexie `daily_records` table. Chunks are processed newest-first; the newest-anchored incremental window always runs, while a full-history backfill window walks older data back to the `2013-01-01` history anchor until a one-time latch marks the backfill complete.

## Entry Points
- **Type**: UI Event (browser)
- **Path/Topic**: `#sync-btn` click → `stepSync.sync()` where `const stepSync = createStepSync(auth, db, reporter, doc)` (wired in `src/main.js`)
- **File**: `src/steps.js` (engine), `src/main.js` (wiring)

## Core Path
1. `#sync-btn` click invokes `stepSync.sync()`, which pre-flight-checks `auth.getAccessToken()` (null token → `🔑 Connect your Google Account first`), then guards against re-entry with a closure-scoped `isSyncing` flag and disables the button.
2. `_determineSyncWindows(db)` resolves the two-segment window model from persisted state alone:
   - Empty DB → a single `[2013-01-01 → tomorrow's local midnight]` full-history window.
   - Non-empty DB → an incremental `[latest stored date − 3 days → tomorrow]` window (the 3-day `SAFETY_BUFFER_DAYS` catches late-arriving wearable/Health Connect data), always.
   - A full-history backfill `[2013-01-01 → oldest stored date + 1 day]` window is appended only while the backfill is not complete.
3. Each window is flattened into ≤`CHUNK_DAYS` (30)-day chunks via `_chunkWindow` (newest-first, boundaries on local midnight — DST-safe), then processed strictly sequentially with a `fetch → normalize → upsert` loop; one emoji-prefixed status line is written per chunk via `reporter.sync()`.
4. Each chunk `POST`s to Google Fit `users/me/dataset:aggregate` with `Authorization: Bearer <token>`, `Content-Type: application/json`, and a body of exactly two `aggregateBy` entries — `com.google.step_count.delta` and `com.google.distance.delta` — with no `dataSourceId` (broad multi-device / Health Connect compatibility), `bucketByTime: { durationMillis: 86400000 }`, and `startTimeMillis`/`endTimeMillis` at **local midnight** (00:00:00.000 local time), never UTC zero-hour.
5. `_normalizeBuckets` turns each bucket into one `daily_records` row (zero-filled; dual data type: steps from `step_count.delta` intVal, distance from `distance.delta` fpVal metres → km at 3 decimals, falling back to `steps × 0.000762` km when distance data is absent). Buckets whose resolved start time is not finite (missing both `startTimeMillis` and `startTimeNanos`, or a non-numeric value) are skipped rather than persisted under a NaN primary key.
6. `_upsertChunk` persists each chunk inside a Dexie `rw` transaction, merging against existing rows so `is_overridden: true` rows keep their user-authored `effective_*` and `override` values (only `original_*` is refreshed).
7. When a full-history window completed, `_latchBackfillComplete` writes `{ key: 'initial_backfill_complete', value: true }` to the `settings` store; all future syncs collapse to a single incremental request.
8. On success the final status line reports the day/request count and how far the history now reaches; a terminal failure writes the decision-12a message, logs via `console.error`, fail-stops (keeps already-persisted chunks), and the next click resumes at the correct older date. In the backfill-completed success message the anchor is rendered as the formatted local date `2013-01-01` (`_formatLocalDate(HISTORY_ANCHOR_DATE.getTime())`) rather than embedding the `HISTORY_ANCHOR_DATE` Date object — this avoids a locale-dependent `toString()` and matches the tests.

## Data Touchpoints
- **Entities**: One `daily_records` row per calendar day (`date` primary key, `original_*`/`effective_*` step and distance values, `is_overridden`, `override`, `synced_at`)
- **Tables**: `daily_records` (Dexie) for step data; `settings` (Dexie) for the `initial_backfill_complete` latch key
- **UI Surface**: `#sync-status` line via `reporter.sync()` — the whole status surface (no alert/toast/progress bar)

## Integrations
- **Type**: API Call
- **Target**: Google Fitness REST API
- **Channel**: `POST https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`

## Error / Retry Surface
- Single retry on transient `429` / `5xx`, honouring `Retry-After` (capped at 30 s, else 2 s default).
- `401` short-circuits to a `🔑 Session expired` reconnect prompt.
- Other `4xx` and network errors are terminal (fail-stop); every state (⏳ progress, ✅ success, ⚠️ transient, ❌ terminal, 🔑 auth) is surfaced via `reporter.sync()` → `#sync-status`.

## Scope
- `src/steps.js` — the step-sync engine (factory `createStepSync(auth, db, reporter, doc = document)`)
- `src/main.js` — composition-root wiring (`#sync-btn` click → `stepSync.sync()`)

## Tests
- `src/steps.test.js` — factory shape, DST-safe date helpers, window resolution, chunking, normalisation, retry policy, transactional upsert/override preservation, and the backfill latch.

## Notes
- The history anchor `HISTORY_ANCHOR_DATE = new Date(2013, 0, 1)` (2013-01-01). The first sync spans ~13 years (~166 chunks) and can take several minutes; the app shows a `⏳ Full history sync` message and asks the user to keep the tab open.
- An interrupted backfill is fail-stop but resume-friendly: already-persisted chunks are kept and the next click resumes at the correct older date — the run always walks to the anchor via the persisted state, not a fixed 365-day loop.
- The `initial_backfill_complete` latch lives in the existing `settings` store (declared at DB_VERSION 1) — no schema bump.
