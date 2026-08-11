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

## Streak Engine

The Dashboard calculates the Unified Active Streak using an Effective Date Lock. Each historical
date `D` is evaluated against `G(D)`, the goal that was effective on that date, rather than the
current goal. The calculation:

1. Resolves `G(D)` from the latest `goal_history` entry whose `effective_from` is on or before `D`.
2. Uses the earliest history entry as the baseline for dates before the first logged change.
3. Compares `effective_distance_km` with `G(D)` using `>=`.
4. Counts consecutive passing days backwards from today.
5. Skips an incomplete today, but stops at the first non-passing past day.

The `goal_history` Dexie store was added in `DB_VERSION 2` with `effective_from` as its primary key,
alongside `target_distance_km` and `target_steps`. The migration seeds history from the existing
`settings.active_goal` row, and every later goal change appends or replaces the row for that local
date. If history is unavailable, computation falls back to the current active goal and then the
3.0 km default.

### Unified vs. Goal-Tier Streaks

The Unified Active Streak follows the user's date-effective goal. Independent Goal-Tier streaks
use fixed daily distance thresholds of **1 km**, **3 km**, **5 km**, and **10 km**. Their active
counts are displayed as the Dashboard's tier chips; the engine also computes each tier's best-ever
run for analytics. The chips use `>=` evaluation even though their compact labels use the mockup's
`>1km`, `>3km`, `>5km`, and `>10km` display format.

Today's incomplete or missing record does not break an active streak, because the day is still in
progress. A missing record for a past date is treated as non-passing and terminates the streak.
Non-finite distance or step values fail their respective thresholds. The engine also computes the
lifetime 10k metric shown in the banner: `total_10k_days / total_days * 100`, including days with
at least 10,000 steps. The Hall of Fame retains the top three unified streak periods for future
analytics; rendering that list is outside this story's scope.

## Calendar

The Calendar tab displays a monthly heatmap grid with daily step performance against the date-effective goal, enabling users to explore their historical progress and access per-day details.

### Navigating Months

The calendar opens on the current local month and allows navigation via:

- **Previous/Next buttons** — Move backward or forward by one month. These buttons are disabled at the data boundaries.
- **Month dropdown** — Select any of the 12 months.
- **Year dropdown** — Select from a range derived from your data: from the year of your earliest synced step record to the current year.

**Navigation bounds**: The Prev button disables when the calendar reaches the month containing your earliest synced record; the Next button disables when the calendar reaches the current month. If your data is empty or incomplete, both Prev and Next render disabled and only the current month appears in the year dropdown.

### Tile Colours

Each tile in the calendar represents a single day and is coloured according to that day's performance against the goal in force on that date (using the Streak Engine's Effective Date Lock). The precedence ladder is:

| Condition | Display | Meaning |
|-----------|---------|---------|
| **Future date** or **no synced data** | Neutral (muted) | No performance data available yet |
| `effective_distance_km >= (target × 2.0)` | Green (Exceeded) | Exceeded the daily target by 2× or more |
| `effective_distance_km >= target × 1.0` | Green (Met) | Met or exceeded the daily target |
| `effective_distance_km < target × 1.0` | Amber (Missed) | Fell short of the daily target |

**Important**: Every day is evaluated against **the goal in force on that day**, not today's goal. If you changed your target in the past, historical days use the goal that was active when they occurred.

The comparisons use `>=` for both thresholds. Non-finite `effective_distance_km` values (e.g. missing, `NaN`, `Infinity`) are treated as `0`.

### Override Badge

Days marked with a `*` (asterisk) badge indicate `is_overridden === true` — a user-authored override created through manual logging (arriving in ST-006). The badge is orthogonal to the tile colour and may appear on any performance tier.

### Monthly Summary

Below the calendar grid, four metrics summarize the month's performance:

```
Total Steps      = sum of effective_steps for all contributing days
Total Distance   = sum of effective_distance_km for all contributing days
Avg Daily Steps  = Math.round(Total Steps / days_evaluated)
Hit Rate %       = Math.round((days_target_met / days_evaluated) × 100)
```

**Critical note on `days_evaluated`**: This metric counts **only past or present days that have at least one synced record**, not all calendar days in the month. This is a **deliberate divergence from the story's literal "Total Days" wording** and is record-backed: a day with no synced data from Google Fit is excluded from both the numerator and denominator. This ensures an incompletely backfilled month is not reported as a near-zero hit rate.

For example:
- A month with 15 synced days (of which 10 met target) renders Hit Rate as `67%`, not a lower ratio based on the full 31-day month.
- A month with zero synced records renders all four metrics as `—` (em dash), indicating insufficient data.

### Day Detail Drawer

Clicking any calendar tile (except future dates or padding) opens a side drawer showing detailed information for that day:

**For a synced day:**
- **Effective Steps** — the steps actually counted (after any override).
- **Effective Distance** — the distance actually counted (after any override), in km.
- **Synced (Google Fit)** — the original steps and distance reported by Google Fit.
- **Verified Manual** — shown only if the day is marked as overridden; displays the user's corrected steps. Otherwise, renders `—`.
- **Override note** — the user's explanatory text (e.g. "Phone was in pocket during phone call"). Shown only if overridden.
- **Override status** — whether the day has a user correction (`Yes` or absent).

**For an unsynced day (no record from Google Fit):**
- The date header appears, but all metrics show `—`.
- A placeholder message reads `No synced data for this date`.
- The Edit / Override button is still present and active, allowing you to manually log the day.

**Dismissal:**
- Click the close button (`×`) in the top-right of the drawer.
- Click the semi-transparent overlay behind the drawer.
- Press `Escape` on your keyboard.

Focus returns to the tile you clicked after dismissal. If the calendar re-renders (e.g. month navigation, sync), any open drawer closes automatically.

Clicking **Edit / Override** opens the override form inline in the drawer.

## Manual Override

The **Manual Override** feature lets you correct any day's step and distance record — for example, when your phone was in a pocket during a workout, or when wearable data is clearly wrong.

### Workflow

**Create or edit an override:**
1. Open the Calendar tab and click any past day's tile to open the Day Detail Drawer.
2. Click **Edit / Override** to reveal the override form.
3. Fill in **Effective Steps** (required; integer ≥ 0).
4. Optionally fill in **Effective Distance** (km; if left blank it is derived from steps: `effective_steps / 1312.33`).
5. Enter a **Justification Note** (required, non-empty) — this is the audit trail for the correction.
6. Optionally attach a **Proof Image** (PNG, JPEG, or WEBP) to support the correction.
7. Click **Save Override**. The progress card, streaks, and calendar heatmap update immediately without a page refresh.

**Revert to synced data:**
1. Open the drawer for an overridden day (shown with a `*` badge on the tile).
2. Click **Revert to Synced**. Confirm the native browser prompt.
3. The record returns to Google Fit values; the `*` badge disappears and all metrics recalculate.

### Data Lineage: `original_*` vs `effective_*`

Every `daily_records` row carries two parallel field sets:

| Field | Meaning |
|-------|---------|
| `original_steps` / `original_distance_km` | The raw value reported by Google Fit. **Never mutated** after initial sync. |
| `effective_steps` / `effective_distance_km` | The value used by all metrics (streak engine, progress card, calendar heatmap, monthly summary). Equals `original_*` unless the day is overridden. |
| `is_overridden` | `true` when a user correction is active. |
| `override.note` | Required audit justification (plain text). |
| `override.proof_image_base64` | Optional JPEG Base64 proof image, or `null`. |
| `override.updated_at` | ISO timestamp of the last manual correction. |

**Resync safety**: When Google Fit data is re-fetched, only `original_*` and `synced_at` are refreshed on overridden rows. The `effective_*` values and `override` metadata are preserved — a resync never clobbers a manual correction.

### Proof-Image Storage

Proof images are stored entirely client-side in IndexedDB (Dexie) as Base64-encoded JPEG strings. No image is uploaded to any server.

Before storage the image is normalised:
- **Maximum dimension**: 1024 px (width or height, whichever is larger; aspect ratio is preserved).
- **Encoding**: re-encoded to JPEG at quality 0.8, regardless of the input format (PNG, JPEG, WEBP).

This bounds the Base64 string size while retaining sufficient detail for a proof screenshot. Accepted input types: `image/png`, `image/jpeg`, `image/webp`.
