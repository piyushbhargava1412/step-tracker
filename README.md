# step-tracker

## Setup

### Prerequisites
- **Node.js** v18 or later
- **Google Cloud Console account** (for OAuth 2.0 configuration)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/piyushbhargava1412/step-tracker.git
   cd step-tracker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   # Copy the example configuration file
   cp .env.example .env.local
   
   # Edit .env.local and set your Google OAuth 2.0 Client ID
   # VITE_CLIENT_ID=<your-google-oauth-client-id>
   ```
   > Do NOT use a real client ID in version control. Use a placeholder and set it locally only.

### Google Cloud Console Registration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Create an OAuth 2.0 Client ID (application type: Web)
4. Add the following to **Authorized JavaScript Origins**:
   - `http://localhost:1981`
5. Add the following to **Authorized Redirect URIs**:
   - `http://localhost:1981`
6. Copy the generated Client ID and set it in your `.env.local` file as `VITE_CLIENT_ID`

### Running the Application

**Development server** (starts on port 1981):
```bash
npm run dev
```

**Run tests:**
```bash
npm run test
```

**Build for production:**
```bash
npm run build
```

### Configuration Notes
- Configuration is loaded from `.env.local` at build/dev time via Vite
- The `VITE_CLIENT_ID` environment variable is the authoritative OAuth 2.0 Client ID
- Legacy configuration files (`config.local.js`, `config.example.js`) have been retired

## Step Sync

The step-sync engine (`src/steps.js`) is the sole gateway to the Google Fit REST API. Clicking the **Sync Steps** button (`#sync-btn`) triggers `createStepSync(auth, db, reporter, doc = document).sync()`, which fetches daily step aggregates and persists them into the local Dexie `daily_records` table for streak calculation.

**Request shape:**
- Each chunk is a `POST` to `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate` with `Authorization: Bearer <token>` (the token is re-read from `auth.getAccessToken()` on every attempt and is never logged, cached, or persisted) and `Content-Type: application/json`.
- Exactly two `aggregateBy` entries are requested — `com.google.step_count.delta` (steps) and `com.google.distance.delta` (distance) — with **no `dataSourceId`**, so Google merges data across all connected devices and Health Connect sources.
- `bucketByTime.durationMillis` is one day, and `startTimeMillis`/`endTimeMillis` are constructed at **local midnight** (00:00:00.000 in the browser's timezone), not UTC zero-hour, so each bucket maps to a local calendar day.
- Requests are split into ≤30-calendar-day chunks (`CHUNK_DAYS = 30`), processed newest-first, with boundaries on local midnight so they stay DST-safe.
- Distance is normalised from metres to kilometres; when Google Fit returns no distance data, distance falls back to `steps × 0.000762` km/step (`STEP_TO_KM`). Days with zero steps still produce a record (zero-filled).

**History backfill:**
- The history anchor is `2013-01-01` (`HISTORY_ANCHOR_DATE`) — the earliest Google Fit data that can be fetched. On a first sync this spans ~13 years (~166 chunks), so **the first sync can take several minutes**; the app shows a progress message in the sync status line and asks you to keep the tab open.
- Syncs run in a two-segment window model: an incremental window over the latest 3 stored days (always), plus a full-history backfill window when the backfill is not yet complete.
- An interrupted backfill is fail-stop: already-persisted chunks are kept, and the next click resumes at the correct older date. A terminal error skips the latch write, so the persisted chunks stay put for the resume.
- Once the backfill reaches the anchor, a one-time latch (`initial_backfill_complete` in the Dexie `settings` store) is written, so every future sync collapses to a single incremental request.

**Incremental window:**
- Every run refreshes `[latest stored date − 3 days → tomorrow's local midnight]`. The 3-day `SAFETY_BUFFER_DAYS` window exists because wearable and Health Connect data can arrive late — without it, an overdue step read could incorrectly look like a streak-breaking zero.

**Errors and retries:**
- A single retry is performed on transient `429` (rate limit) and `5xx` responses, honouring `Retry-After` (capped at 30 s, else 2 s). `401` short-circuits with a `🔑 Session expired` prompt; other `4xx` and network errors are terminal and fail-stop.
- Every state — progress, success, transient, terminal, and auth — is surfaced in the `#sync-status` status line via `reporter.sync()`; there are no alerts, toasts, or progress bars.

**Override preservation:**
- Chunks are persisted transactionally, merging with existing rows. Rows marked `is_overridden: true` keep their user-authored `effective_*` values and `override` metadata — only `original_*` is refreshed — so a resync never clobbers a manual correction.

## Goal Commitment & Today's Progress

The Dashboard shows a **Today's Progress** card that measures your daily step count against a configurable distance goal. Goal configuration and progress computation are handled client-side with no backend.

### Active Goal — Dexie `settings` row

The current goal is persisted as a single row in the Dexie `settings` store (primary key `'key'`):

```json
{
  "key": "active_goal",
  "target_distance_km": 3.0,
  "target_steps": 3937,
  "effective_from": "2026-08-10"
}
```

On the **first Dashboard load**, if no `active_goal` row exists, the app lazily writes the **3.0 km default** (3937 steps) and uses it immediately — no manual setup required.

### Preset Values

Four one-click distance presets are available: **1 km**, **3 km**, **5 km**, and **10 km**. Selecting a preset takes effect immediately and persists the new goal for all future loads.

### Conversion Formula

`target_steps` is derived from the distance using the normative constant:

```
KM_TO_STEPS = 1312.33
target_steps = Math.round(distance_km × 1312.33)
```

Authoritative rounded values for the four presets:

| Distance | `target_steps` |
|----------|---------------|
| 1 km     | 1312          |
| 3 km     | 3937          |
| 5 km     | 6562          |
| 10 km    | 13123         |

The formula is the authoritative source; the rounded values in the table are derived from it.

### Custom Distance Input

Any **positive distance** (integers or decimals, e.g. `4.5` km) may be entered in the custom input field. The new goal **takes effect immediately** — the progress card re-renders against the new target as soon as the goal is applied. Inputs of `0`, negative values, non-numeric strings, `NaN`, and `Infinity` are rejected with an inline validation message and produce no database write.

### Card States

The Today's Progress card renders in one of two exclusive states based on the percentage `Math.min(100, Math.round(effective_steps / target_steps × 100))`:

**In-Progress** (`< 100%`):
- Displays the current percentage, step count, and remaining distance.
- A live progress bar fills to the current percentage (`width: <pct>%`, `role="progressbar"`).
- A remaining counter shows steps and approximate distance left: e.g. `⏱️ 1,800 steps remaining to fulfill daily target (~1.37 km)`. Distance follows the SF-5 rule: remaining steps ÷ 1312.33; values under 1 km display in meters (e.g. `152 meters`), 1 km and over display with two decimal places (e.g. `1.37 km`).

**Goal Met** (`≥ 100%`):
- Displays `100%` and a `✅ Daily Commitment Met` badge.
- The progress bar fills to 100% via the `.progress-fill--full` CSS class (no inline width).
- The remaining counter is hidden.
