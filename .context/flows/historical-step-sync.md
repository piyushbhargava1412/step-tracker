# Flow: Historical Step Sync (Chunked Google Fit Aggregate Fetch)

<!-- context-meta
verification-commit: 7885320b799cb2d504ca189beba691d0e1a4d2cc
generated-at: 2026-08-09T00:00:00Z
confidence: medium
-->

## Overview
Fetches ~365 days of daily step buckets from the Google Fitness aggregate API in 30-day chunks and stitches them into a single ordered bucket list for streak analysis.

> **Implementation status**: The `app.js` file that contained `getStepsData()` was deleted during the modular refactor (ST-001). No equivalent step-sync module exists yet in `src/`. This flow documents the intended design; the entry point and core path below describe the prior implementation for reference until the feature is re-introduced.

## Entry Points
- **Type**: UI Event (browser) — **not yet implemented in modular structure**
- **Path/Topic**: `#fetch_btn` click → `getStepsData()` (was in `app.js`, now deleted; `#fetch_btn` removed from `index.html`)
- **File**: N/A — no current implementation in `src/`

## Core Path
1. `#fetch_btn click -> getStepsData()` guards on presence of `accessToken` (alerts if not connected) and sets syncing UI state (`app.js`).
2. Loop `offset` from 0 to `TOTAL_DAYS` (365) in `CHUNK_DAYS` (30) steps, computing `chunkStart`/`chunkEnd` millisecond windows (`app.js`).
3. Each iteration `POST` to Google Fit `users/me/dataset:aggregate` with `com.google.step_count.delta`, 1-day (`86400000` ms) buckets, Bearer `accessToken` (`app.js`).
4. On non-OK response, throw `Google API Error: <status>`; otherwise prepend the returned `data.bucket` into `combinedBuckets` (older-first ordering) (`app.js`).
5. After the loop, hand off to `parseAndCalculateStreak({ bucket: combinedBuckets })` (`app.js`).
6. `catch` renders a red failure message; `finally` re-enables `#fetch_btn` and restores its label (`app.js`).

## Data Touchpoints
- **Entities**: In-memory `combinedBuckets` array of Google Fit buckets (`app.js`)
- **Tables**: None (no local/server persistence in current code)

## Integrations
- **Type**: API Call
- **Target**: Google Fitness REST API
- **Channel**: `POST https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`

## Scope
- `app.js` (`getStepsData` function) — **deleted in modular refactor**
- `index.html` (`#fetch_btn`, `#streak-display`) — **both elements removed from index.html**
- Future: a `src/steps.js` (or similar) module in the `src/` structure

## Tests
- None found in repository.

## Notes
- Constants `TOTAL_DAYS = 365` and `CHUNK_DAYS = 30` were hardcoded in `getStepsData` (now deleted with `app.js`).
- Data lineage / IndexedDB persistence and Drive backup described in the PRD (`.arcus/plans/PRD.md`) are not implemented; a Dexie-backed `src/db.js` now exists but no step-sync module writes to it yet.
- When re-implemented in the `src/` structure, step sync should be extracted into its own module (e.g. `src/steps.js`) following the factory-function convention (`createStepSync(auth, db, reporter)`), injecting `auth.getAccessToken()` rather than reading a shared global.
