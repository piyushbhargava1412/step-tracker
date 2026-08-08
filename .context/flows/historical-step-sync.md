# Flow: Historical Step Sync (Chunked Google Fit Aggregate Fetch)

<!-- context-meta
verification-commit: 87a2be210c32952fad49351243445601b3564a97
generated-at: 2026-08-08T11:16:42.345+05:30
confidence: high
-->

## Overview
Fetches ~365 days of daily step buckets from the Google Fitness aggregate API in 30-day chunks and stitches them into a single ordered bucket list for streak analysis.

## Entry Points
- **Type**: UI Event (browser)
- **Path/Topic**: `#fetch_btn` click → `getStepsData()`
- **File**: `index.html` (button), `app.js` (handler)

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
- `app.js` (`getStepsData` function)
- `index.html` (`#fetch_btn`, `#streak-display`)

## Tests
- None found in repository.

## Notes
- Constants `TOTAL_DAYS = 365` and `CHUNK_DAYS = 30` are hardcoded in `getStepsData`.
- Data lineage / IndexedDB persistence and Drive backup described in the PRD (`.arcus/plans/PRD.md`) are not implemented; current sync is ephemeral in-memory only.
