# Walkaholic

<img src="public/icons/icon.svg" alt="" width="96" align="right" />

Walkaholic (repo: `step-tracker`) is a step streak tracker with no backend: an Android app that reads your steps from Health Connect, and a
read-only web viewer (PWA) of the backup the app keeps in your Google Drive.

## App layout (v0.2.0)

The app is laid out like a phone app (ST-025), in the same Deep Blue colours:

- **Bottom tabs**: **Today**, **Calendar**, **Insights**, **Journey**.
- **Today**: connection and sync status (tap the round arrow, or pull down, to sync), the progress
  panel — a step ring with the goal chip, and six tiles: Distance, Strict streak, Lifetime,
  99% tolerance, 95% tolerance, Best run — and the group challenge card. The magnifier opens
  **Search**, the gear opens **Settings**.
- **Calendar**: a **Week / Month** switch. Tap any day for the day sheet (hourly chart, correct steps,
  proof photo).
- **Insights**: Hall of fame, top days, weekday and time-of-day charts, monthly totals — for all
  time or one year.
- **Journey**: your level, trophies and the virtual expedition.
- **Settings**: step-data connection, **Backup & restore** (Google Drive, backup files, storage
  protection), home city, history start and the danger zone.
- On Android the back button closes an open sheet first, then goes back a screen.

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
3. Enable the **Drive API** under **APIs & Services → Library**
4. Configure the **OAuth consent screen** (External) with the one scope the app uses: `.../auth/drive.appdata`
5. Create an OAuth 2.0 Client ID (application type: Web)
6. Add the following to **Authorized JavaScript Origins** (explicit per-client-ID restrictions):
   - `http://localhost:1981`
   - `https://<your-project>.pages.dev`
7. Add the following to **Authorized Redirect URIs**:
   - `http://localhost:1981`
   - `https://<your-project>.pages.dev`
8. Copy the generated Client ID and set it in your `.env.local` file as `VITE_CLIENT_ID`

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
- Legacy configuration files (`config.local.js`, `config.example.js`) have been retired — the successor flow is `cp .env.example .env.local` and setting `VITE_CLIENT_ID` there; no other configuration file is read

### Google Account Connection & Session
- Click **Connect Google Account** once to authorize (Drive app data only); the moment a token arrives the web viewer **downloads the app's latest backup** — no separate tap is needed.
- The connection survives a **page refresh**: a boolean `google_connected` flag is stored in `localStorage` (never the token itself), and on the next load the app asks Google Identity Services for a fresh token silently (`prompt: ''`). When that succeeds, the backup is downloaded again; if Google's session has expired, you simply click Connect once more.
- Limitation: the in-browser token flow has no refresh token, so the silent restore depends on Google's session cookie. A normal refresh keeps it alive; a fully closed/reopened browser or a long gap may require one reconnect click.

## Deploying to Cloudflare Pages

The repo ships a GitHub Actions workflow (`.github/workflows/deploy.yml`) that deploys every push to `main`. The Pages project itself must be created **once** (the workflow cannot create it):

1. **Create the Pages project** (one-time) — either via the Cloudflare dashboard (**Workers & Pages → Create → Pages**) or the Wrangler CLI:
   ```bash
   npm install -g wrangler
   wrangler login
   wrangler pages project create step-tracker
   ```
   The project name must be exactly `step-tracker` — the workflow deploys to it with `--project-name=step-tracker`.
2. **Add three repository secrets** (GitHub repo → **Settings → Secrets and variables → Actions**), named exactly:
   - `GOOGLE_CLIENT_ID` — the OAuth 2.0 Client ID from Google Cloud Console
   - `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with **Cloudflare Pages: Edit** permission
   - `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID
   Never commit these values — the workflow references them only as `${{ secrets.* }}`.
3. **Deploy by pushing to `main`:**
   ```bash
   git push origin main
   ```
   The workflow runs `npm ci` → `npm test` (gate) → `vite build` with `VITE_CLIENT_ID` injected from the `GOOGLE_CLIENT_ID` secret → `wrangler-action` Pages deploy of `dist/`. Every subsequent push to `main` deploys automatically to `https://<your-project>.pages.dev`.

## Install as a PWA

Once deployed (or on `localhost:1981`), the app is installable:

- **iOS Safari**: open the app → tap **Share** → **Add to Home Screen** → **Add**
- **Android Chrome**: open the app → tap the **⋮** menu → **Install app** (or **Add to Home screen**)
- **Desktop Chrome/Edge**: click the install icon in the address bar (Chrome: also via **⋮ → Install step-tracker**)

The installed app launches full-screen from the home screen with its own icon.

## Offline Usage

After the app has loaded successfully at least once, the app shell — every screen and the navigation — works offline, and your synced records remain readable from local IndexedDB storage. What still needs a network connection:

- **Google sign-in**: the GSI bootstrap script is served stale-while-revalidate; signing in always requires connectivity
- **Refreshing from Drive**: Drive (`googleapis.com/drive/*`) REST calls always go straight to the network — tokens and backup data are never served from cache


## Service Worker Updates

The service worker versioned caches update on next visit after a deploy (update-on-next-visit — no auto-reload). If you see an older version, simply **refresh** the page (or close and reopen the tab) to activate the waiting update.

## Android App (Health Connect)

The same code also ships as an Android app (Capacitor). In the app, steps and distance come from
**Health Connect**: tap **Connect Health Connect**, allow Steps and Distance
(and access to past data), and the app syncs — automatically on every later launch, and again whenever you come back to it after 10 minutes or more. Exports and
backups are saved to `Documents/Step Tracker/` on the phone. For Google Drive backup, open
Settings › **Backup & restore** → **Connect Google Drive**; it uses the same Drive backup the web
viewer reads, so **Restore from Drive** brings older web history across. Then tap **Make this the
primary device** so the phone backs up to Drive automatically.

## Web Viewer (read-only)

The website shows the latest backup the Android app made to your Google Drive (ST-023). Tap
**Connect Google Account**, and every screen fills from that backup; the ↻ button (or pull down)
downloads it again, and Today shows **Data as of …**. The website cannot change anything — goals,
corrections, challenges and backups are managed in the app — and it keeps its copy in its own
browser database (`StepTrackerViewerDB`). If there is no backup yet, it tells you to connect Google
Drive in the app. See [.context/flows/read-only-web-viewer.md](.context/flows/read-only-web-viewer.md).

Quick start (Android Studio + JDK 21 installed):

```bash
npm run cap:sync
```

```bash
npm run android:run
```

Releases (ST-028): bump the version on the feature branch with `npm run release -- patch` (or
`minor` / `major`) and commit it with the work. Merging the PR tags `main`, builds the signed APK in
GitHub Actions and publishes it on the repo's Releases page; in the
app, **Settings › App › Check** finds it and installs it in place, keeping your data. See
[.context/flows/app-updates.md](.context/flows/app-updates.md).

Full build, signing, release, install and emulator-testing guide: [docs/plans/android-release.md](docs/plans/android-release.md).
Roadmap: [docs/plans/health-connect-android-roadmap.md](docs/plans/health-connect-android-roadmap.md).

## Step Sync

The step-sync engine (`src/steps.js`) runs in the Android app. It reads daily step data from an injected `StepSource` (`src/step-source.js`) — Health Connect (`src/health-connect-step-source.js`), the only source since ST-024 retired Google Fit — and persists it into the local Dexie `daily_records` table for streak calculation. Tapping the Sync button (`#sync-btn`, the refresh icon on Today) or pulling down runs it; so do connecting, launching and returning to the app after 10 minutes.

**Reading:**
- The sync window is split into ≤30-calendar-day chunks (`CHUNK_DAYS = 30`), processed newest-first, with boundaries on **local midnight** so each day maps to a local calendar day and chunks stay DST-safe.
- The source returns one reading per local day (zero-filled) with steps, distance when measured, and a 24-hour step profile. When no distance was measured, it is estimated as `steps × 0.000762` km/step (`STEP_TO_KM`).

**History backfill:**
- History is fetched back to the sync horizon set in Settings › Track history from (default `2018-01-01`; changing it re-checks whether older days need fetching). On a first sync this spans years (~100 chunks at the default), so **the first sync can take several minutes**; the app shows a progress message in the sync status line and asks you to keep the tab open.
- Syncs run in a two-segment window model: an incremental window over the latest 3 stored days (always), plus a full-history backfill window when the backfill is not yet complete.
- An interrupted backfill is fail-stop: already-persisted chunks are kept, and the next sync resumes at the correct older date. A terminal error skips the latch write, so the persisted chunks stay put for the resume.
- Once the backfill reaches the anchor, a one-time latch (`initial_backfill_complete` in the Dexie `settings` store) is written, so every future sync collapses to a single incremental request.

**Incremental window:**
- Every run refreshes `[latest stored date − 3 days → tomorrow's local midnight]`. The 3-day `SAFETY_BUFFER_DAYS` window exists because watch and fitness-app data can reach Health Connect late — without it, an overdue step read could incorrectly look like a streak-breaking zero.

**Errors:**
- The source classifies failures (`syncFailure` in `src/step-source.js`); lost Health Connect access shows a `🔑` prompt to allow it again, and read failures are terminal and fail-stop.
- Every state — progress, success, transient, terminal, and auth — is surfaced in the `#sync-status` status line via `reporter.sync()`; there are no alerts, toasts, or progress bars.

**Override preservation & high-water mark:**
- Chunks are persisted transactionally, merging with existing rows. Rows marked `is_overridden: true` keep their user-authored `effective_*` values and `override` metadata — only `original_*` is refreshed — so a resync never clobbers a manual correction.
- For all other rows, `effective_steps` / `effective_distance_km` apply a **high-water mark**: `max(stored, incoming)`. If the source later reports a *lower* number for a day (a late data revision), the app ignores the reduction and keeps the highest recorded value — steps a user has already seen are never taken away. `original_*` always tracks the raw cloud truth for debugging.

## Goal Commitment & Today's Progress

The Today screen's **progress panel** measures your daily step count against a configurable step goal. Goal configuration and progress computation are handled client-side with no backend.

### Active Step Goal — Scalar Lens

The current goal is persisted as a single row in the Dexie `settings` store (primary key `'key'`):

```json
{
  "key": "active_step_goal",
  "target_steps": 10000
}
```

`active_step_goal` is a **freely re-selectable live lens with no effective-from semantics**. The current value is applied to *every* historical day — there is no per-date goal history and no Effective Date Lock. Changing the goal retroactively reclassifies every past day in the calendar heatmap and all streak metrics.

### Step Goal Presets

Four step-count presets are available from Today's goal chip (`STEP_GOAL_OPTIONS = [4000, 6000, 8500, 10000]`). The default is `DEFAULT_STEP_GOAL = 10000`. Selecting a preset takes effect immediately and persists the new goal for all future loads. Distance-based goals are not supported.

> **Why these tiers?** The tier ladder is the `STEP_GOAL_OPTIONS` enum verbatim — no km-to-steps conversion is applied. A converted ladder (e.g. `1312.33 × km`) can never produce a value equal to an enum member, so the preset would never describe an achievable goal; the rounding would also be an approximation of an approximation; and a threshold of 1,312 steps/day carries no practical signal.

On first load, if no `active_step_goal` row exists, the app lazily writes the `10000`-step default and uses it immediately — no manual setup required.

### Progress Ring States

Today's progress ring fills to `Math.min(100, Math.round(effective_steps / target_steps × 100))`:

- **In progress** (`< 100%`): steps, "of 10,000 steps", the percentage and "N steps to go".
- **Goal met** (`≥ 100%`): the ring closes in green and "Goal met" replaces the remaining count.

## Streak Engine

Today's panel shows three tolerance streak metrics, calculated via `computeToleranceStreaks(records, stepGoal, today)` in `src/streak.js`. All three share a single evaluation lens: the live `active_step_goal` scalar applied uniformly to every historical day.

### Three-Metric Tolerance Engine

| Metric | What it counts |
|--------|---------------|
| **`actual`** (100%) | Consecutive passing days backward from anchor; any day below goal terminates. Strict — no leniency. |
| **`allowance95`** (95%) | Longest backward window where true misses stay within budget: `misses ≤ floor(d / 20)` — one allowed miss per 20 calendar days. |
| **`allowance99`** (99%) | Longest backward window where true misses stay within budget: `misses ≤ floor(d / 100)` — one allowed miss per 100 calendar days. |

Constants (from `src/streak.js`):
- `ALLOWANCE_WINDOW_95 = 20` (95% tier)
- `ALLOWANCE_WINDOW_99 = 100` (99% tier)
- `NEAR_MISS_RATIO = 0.95` — the per-day near-miss bar for the tolerance tiers

**Anchor rule**: the walk starts at `today` if today's record exists and `effective_steps >= stepGoal`; otherwise today is excluded and the walk starts at yesterday. Today is never charged as a miss — the bar stays strict here even though past days get near-miss leniency.

**Miss rule**: a missing past day reads as 0 steps and counts as a miss. The 100% engine freezes on the first day below goal. For the tolerance tiers, a past day counts as **met** when `effective_steps >= round(NEAR_MISS_RATIO × stepGoal)` — e.g. 5,800 of a 6k goal (97%) is treated as achieved. Only days *below* that near-miss bar are "true misses" that spend the tier's density budget.

**Longest-compliant-window**: each allowance engine reports the *maximum* depth `d` whose window it can afford, not the last depth before a violation. The density predicate is non-monotonic — clean days dilute the miss ratio — so a window that violates mid-history can become compliant again once enough clean days accumulate (e.g. 2 misses in the first 100 days, then clean: the 99% tier recovers at depth 200). The engine therefore walks to `earliestRecordDate` unconditionally and keeps the deepest qualifying depth. Ordering invariant: `actual ≤ allowance99 ≤ allowance95`.

**`earliestRecordDate` bound**: the walk ends when `day < earliestRecordDate` — the oldest synced record. This prevents engines from walking into pre-history indefinitely, so no value can exceed it.

**Depth convention**: the anchor day is `d = 1`; `d` increments by one per calendar day walked back. `floor(d / N)` is load-bearing — the AC arithmetic only holds with a 1-based depth.

**AC Scenario 2 worked example** (39 days, one true miss at depth 20):
- 39 days of data; day 20 is the only true miss.
- `actual`: freezes at the first strict miss → **19**.
- `allowance95`: budget is 1 from depth 20 on (`floor(20/20) = 1`) and the window stays compliant through all 39 days → **39**.
- `allowance99`: budget is 0 for every depth ≤ 100, so the deepest qualifying depth is **19**.
- Result: `{ actual: 19, allowance95: 39, allowance99: 19 }`.

### Tier Streaks

`computeTierStreaks(records, today)` evaluates the same `STEP_GOAL_OPTIONS` ladder as independent fixed thresholds (i.e., each of `[5000, 7500, 10000, 15000]` is evaluated independently). For each tier:
- **`active`**: backward walk from today with the in-progress rule (today's shortfall is skipped, not a miss).
- **`best`**: longest consecutive `>=` run in the full history, including today if it passes. Missing calendar days break the run.

All evaluations use `>=`.

### Hall of Fame

`computeHallOfFame(records, stepGoal)` returns the top three (`HALL_OF_FAME_SIZE = 3`) longest strict (100%) streak periods evaluated against the single `active_step_goal`. Periods are ranked by `days` descending, then by recency (`startDate` descending) as a tie-break. The Hall of Fame uses the same scalar lens — no per-date goal history.

### Lifetime Compliance

`computeLifetimeCompliance(records, stepGoal)` returns `{ metDays, totalDays, pct }` — the fraction of all synced days that hit `effective_steps >= stepGoal`.

### Streak Tiles

Five tiles in Today's progress panel show the results:

- **Strict** — `tolerance.actual`, every day at 100% of the goal.
- **99% tol** / **95% tol** — the tolerance streaks, with the misses each one used.
- **Lifetime** — the share of all synced days on goal, e.g. "54%" and "488 of 900 days".
- **Best run** — the longest strict run at the current goal, e.g. "11 days · at 10k · 2024".

Tier streaks are still computed by the engine but are not shown.

## Calendar

The Calendar tab has a **Week / Month** switch. Month shows a heatmap grid of daily step performance against the active step goal; Week shows the seven days as a bar chart (with the goal line) and a list, with Total, Daily avg and Goal hit (finished days only — today is in progress). Tapping a day in either opens the same day sheet.

### Navigating Months

The calendar opens on the current local month and allows navigation via:

- **Previous/Next buttons** — Move backward or forward by one month. These buttons are disabled at the data boundaries.
- **Month dropdown** — Select any of the 12 months.
- **Year dropdown** — Select from a range derived from your data: from the year of your earliest synced step record to the current year.

**Navigation bounds**: The Prev button disables when the calendar reaches the month containing your earliest synced record; the Next button disables when the calendar reaches the current month. If your data is empty or incomplete, both Prev and Next render disabled and only the current month appears in the year dropdown.

### Tile Colours — Dynamic Classification

Each tile is coloured by `classifyDay(record, stepGoal, isFuture)` in `src/calendar.js` using `ratio = effective_steps / active_step_goal`:

| Condition | Display | Meaning |
|-----------|---------|---------|
| **Future date** or **no synced data** | Neutral (muted) | No performance data available yet |
| `ratio >= EXCEEDED_RATIO` (`1.5`) | Green (Exceeded) | Exceeded the daily target by 50% or more |
| `ratio >= MET_RATIO` (`1.0`) | Green (Met) | Met or exceeded the daily target |
| `ratio < MET_RATIO` | Amber (Missed) | Fell short of the daily target |

Constants: `MET_RATIO = 1.0`, `EXCEEDED_RATIO = 1.5` (from `src/calendar.js`).

**Important**: Every day is evaluated against the **current** `active_step_goal` — the scalar lens. Changing the goal rerenders all tiles with the new threshold. Classification writes nothing to Dexie.

The comparisons use `>=` for both thresholds. Non-finite `effective_steps` values (e.g. missing, `NaN`, `Infinity`) are treated as `0`.

### Override Badge

Days marked with a `*` (asterisk) badge indicate `is_overridden === true` — a user-authored override created through manual logging. The badge is orthogonal to the tile colour and may appear on any performance tier.

### Monthly Summary

Below the calendar grid, four metrics summarize the month's performance:

```
Total Steps      = sum of effective_steps for all contributing days
Total Distance   = sum of effective_distance_km for all contributing days
Avg Daily Steps  = Math.round(Total Steps / days_evaluated)
Hit Rate %       = Math.round((days_target_met / days_evaluated) × 100)
```

**Critical note on `days_evaluated`**: This metric counts **only past or present days that have at least one synced record**, not all calendar days in the month. A day with no synced data is excluded from both the numerator and denominator. This ensures an incompletely backfilled month is not reported as a near-zero hit rate.

For example:
- A month with 15 synced days (of which 10 met target) renders Hit Rate as `67%`, not a lower ratio based on the full 31-day month.
- A month with zero synced records renders all four metrics as `—` (em dash), indicating insufficient data.

### Day Sheet

Tapping any day (except future dates) opens a bottom sheet for that day: the steps in large type with a Goal hit / Missed goal / In progress chip, an hourly chart when the day has hourly data, and:

**For a synced day:**
- **Effective Steps** — the steps actually counted (after any override).
- **Effective Distance** — the distance actually counted (after any override), in km.
- **Synced steps** — the original steps reported by the step source (Health Connect).
- **Verified Manual** — shown only if the day is marked as overridden; displays the user's corrected steps. Otherwise, renders `—`.
- **Override note** — the user's explanatory text (e.g. "Phone was in pocket during phone call"). Shown only if overridden.
- **Override status** — whether the day has a user correction (`Yes` or absent).

**For an unsynced day (no record from the step source):**
- The date header appears, but all metrics show `—`.
- A placeholder message reads `No synced data for this date`.
- The **Correct steps** button is still present and active, allowing you to manually log the day.

**Dismissal:**
- Tap the close button in the top-right of the sheet, or use the Android back button.
- Tap the dimmed area behind the sheet.
- Press `Escape` on your keyboard.

Focus returns to the tile you clicked after dismissal. If the calendar re-renders (e.g. month navigation, sync), an open sheet closes automatically.

Tapping **Correct steps** opens the override form inline in the sheet.

## Manual Override

The **Manual Override** feature lets you correct any day's step and distance record — for example, when your phone was in a pocket during a workout, or when wearable data is clearly wrong.

### Workflow

**Create or edit an override:**
1. Open the Calendar tab and click any past day's tile to open the Day Detail Drawer.
2. Tap **Correct steps** to reveal the override form.
3. Fill in **Effective Steps** (required; integer ≥ 0).
4. Optionally fill in **Effective Distance** (km; if left blank it is derived from steps: `effective_steps / 1312.33`).
5. Enter a **Justification Note** (required, non-empty) — this is the audit trail for the correction.
6. Optionally attach a **Proof Image** (PNG, JPEG, or WEBP) to support the correction.
7. Click **Save Override**. The progress card, streaks, and calendar heatmap update immediately without a page refresh.

**Revert to synced data:**
1. Open the day sheet for an overridden day (shown with a `*` badge on the tile).
2. Click **Revert to Synced**. Confirm the native browser prompt.
3. The record returns to the synced values; the `*` badge disappears and all metrics recalculate.

### Data Lineage: `original_*` vs `effective_*`

Every `daily_records` row carries two parallel field sets:

| Field | Meaning |
|-------|---------|
| `original_steps` / `original_distance_km` | The raw value reported by the step source — refreshed to whatever the source returns on every sync (preserved on overridden rows). The raw cloud truth for debugging. |
| `effective_steps` / `effective_distance_km` | The value used by all metrics (streak engine, progress card, calendar heatmap, monthly summary). On insert it equals `original_*`; on resync it only ever goes **up** — it is `max(stored, incoming)` — and is overridden only by a user correction or revert. |
| `is_overridden` | `true` when a user correction is active. |
| `override.note` | Required audit justification (plain text). |
| `override.proof_image_base64` | Optional JPEG Base64 proof image, or `null`. |
| `override.updated_at` | ISO timestamp of the last manual correction. |

**Resync safety**: When a day is re-read from the step source, only `original_*` and `synced_at` are refreshed on overridden rows — the `effective_*` values and `override` metadata are preserved, so a resync never clobbers a manual correction. On non-overridden rows `effective_*` is never reduced by a lower cloud value (high-water mark); only `original_*` follows the cloud down.

### Proof-Image Storage

Proof images are stored entirely client-side in IndexedDB (Dexie) as Base64-encoded JPEG strings. No image is uploaded to any server.

Before storage the image is normalised:
- **Maximum dimension**: 1024 px (width or height, whichever is larger; aspect ratio is preserved).
- **Encoding**: re-encoded to JPEG at quality 0.8, regardless of the input format (PNG, JPEG, WEBP).

This bounds the Base64 string size while retaining sufficient detail for a proof screenshot. Accepted input types: `image/png`, `image/jpeg`, `image/webp`.

## Search

The Search screen (the magnifier on Today, `#tab-search`) provides a dynamic query builder over the local `daily_records` store. All filtering, aggregation, and export happens entirely client-side — no data leaves the browser.

**Independence**: `createSearch(db)` receives only the Dexie database — no `goal` collaborator is injected. The panel manages its own step-target input (`stepTarget`) locally; this value drives both the `targetOutcome` filter and the Near-Miss Detector. The Min Distance filter has been removed (distance measurements are unreliable as a primary filter criterion; distance is still present in the records and exported, but not filterable). Retained distance *measurements* remain in the `effective_distance_km` field and all exports.

### Query Builder

Six filter controls are available. All active constraints are combined with AND logic — a record must satisfy every non-empty filter to appear in the results.

| Control | Field | Values |
|---------|-------|--------|
| Start Date | `startDate` | ISO date string (`YYYY-MM-DD`); leave blank for all-time |
| End Date | `endDate` | ISO date string (`YYYY-MM-DD`); leave blank for all-time |
| Min Steps | `minSteps` | Integer; records with `effective_steps < minSteps` are excluded |
| Max Steps | `maxSteps` | Integer; records with `effective_steps > maxSteps` are excluded |
| Override Status | `overrideStatus` | `all` (default), `overridden`, `not-overridden` |
| Target Outcome | `targetOutcome` | `all` (default), `met`, `missed` |

**Date range**: When both Start Date and End Date are provided, the query reads only records in that closed interval. When either is blank, the query scans the full table.

**Override Status**: Selects records where `is_overridden === true` (`overridden`), `is_overridden !== false` (`not-overridden`), or either (`all`).

**Target Outcome**: Evaluates each record against the panel-local `stepTarget` field. `met` selects records where `effective_steps >= stepTarget`; `missed` selects records with a finite `effective_steps` that falls below the target. Records with non-finite step values do not pass either filter.

**Results** are returned sorted newest-first.

### Near-Miss Detector

`computeNearMisses(records, stepTarget)` (from `src/search.js`) identifies days that fell just short of the step target. The near-miss band is `NEAR_MISS_BAND_PCT = 10` — i.e. `[stepTarget × 0.9, stepTarget)`. Records with `effective_steps` in that range are returned sorted newest-first with each record's `shortfall` (i.e. `stepTarget - effective_steps`).

### Result Summary

After each query the summary card shows four metrics computed over the returned result set:

```
Matches                = count of records in the result set
Match %                = Math.round((Matches / totalDays) × 100)
Cumulative Distance    = sum of effective_distance_km for all result records
                         (non-finite values contribute 0)
Avg Steps              = Math.round(sum of effective_steps / Matches)
```

**Match % denominator (`totalDays`)**: the number of records in the pre-filter set — either the full `daily_records` table (all-time query) or the records in the specified date range. This is record-based, not calendar-day-based, matching the Calendar's `days_evaluated` convention. When `totalDays` is `0`, Match % renders as `—`. When the result set is empty, Avg Steps renders as `—` and Cumulative Distance renders as `0 km`.

### Export

The **Export CSV** and **Export JSON** buttons are enabled once a query returns at least one record. Clicking either triggers a client-side download — no data is transmitted to any server.

**Filename convention**: `step-tracker-export-YYYY-MM-DD.csv` / `step-tracker-export-YYYY-MM-DD.json`, where the date is the local calendar date at the time of export.

#### CSV Format

The CSV file uses RFC-4180 encoding (CRLF line endings, fields containing commas, double-quotes, or newlines wrapped in double-quotes with embedded double-quotes doubled). The first line is always the header row:

```
Date,Original_Steps,Original_Distance_KM,Effective_Steps,Effective_Distance_KM,Is_Overridden,Override_Note
```

Each subsequent row corresponds to one `daily_records` entry in the result set:

| Column | Source field | Notes |
|--------|-------------|-------|
| `Date` | `record.date` | ISO date string (`YYYY-MM-DD`) |
| `Original_Steps` | `record.original_steps` | Raw step count from the step source |
| `Original_Distance_KM` | `record.original_distance_km` | Raw distance in km from the step source |
| `Effective_Steps` | `record.effective_steps` | Steps used by all metrics (post-override) |
| `Effective_Distance_KM` | `record.effective_distance_km` | Distance used by all metrics (post-override) |
| `Is_Overridden` | `record.is_overridden === true` | Boolean: `true` or `false` |
| `Override_Note` | `record.override?.note ?? ''` | Audit justification; empty string when not overridden |

#### JSON Format

The JSON file is a pretty-printed array (`JSON.stringify(..., null, 2)`) of objects. Each object has exactly the same seven keys as the CSV headers:

```json
[
  {
    "Date": "2026-08-10",
    "Original_Steps": 8200,
    "Original_Distance_KM": 6.249,
    "Effective_Steps": 9500,
    "Effective_Distance_KM": 7.237,
    "Is_Overridden": true,
    "Override_Note": "Phone was in pocket during run"
  }
]
```

The JSON keys are identical to the CSV header names — the two formats are produced from the same `_toExportRow` mapper and cannot drift relative to each other.

## Database Schema

### DB Version 4 (`DB_VERSION = 4`)

The app uses [Dexie](https://dexie.org/) (IndexedDB wrapper). The current schema version is **4**.

**Stores:**

| Store | Primary key / indexes |
|-------|----------------------|
| `daily_records` | `date`, `effective_steps`, `effective_distance_km`, `is_overridden`, `synced_at` |
| `settings` | `key` |

The `goal_history` table that existed in DB v2–v3 has been **dropped** in v4. It is not present in the current schema.

**v4 Migration (one-way, non-reversible):**
1. The `active_goal` settings row (legacy km-based goal) is deleted.
2. A new `active_step_goal` row `{ key: 'active_step_goal', target_steps: 10000 }` is seeded in `settings`.
3. The legacy km goal is **not** converted — it is reset to the `10000`-step default.
4. `goal_history` is dropped (`null` in the v4 store map).

This migration is one-way: downgrading to a DB version that expects `goal_history` is not supported.

## Group Challenge Tracker

Today shows a **Group challenge** card that opens its own screen (`#challenge-card`) for monitoring a team step challenge and sharing progress — **Copy**, or **Share to group** through the Android share sheet.

The widget is driven by two modules:
- `src/challenge.js` — pure engine (no DOM): persistence, metric computation, and text formatting.
- `src/challenge-ui.js` — sole DOM writer: renders the configure or metric card, handles user actions.

### Configuring a Challenge Window

When no challenge is saved, the widget shows a configure card with three fields:

| Field | Required | Default | Constraint |
|-------|----------|---------|------------|
| Challenge Name | No | `Step Challenge` | Free text; stored as-is; displayed in the copy output |
| Start Date | Yes | First day of the current month | ISO date (`YYYY-MM-DD`) |
| End Date | Yes | Last day of the current month | Must be ≥ Start Date; `RangeError` is thrown otherwise |

Click **Save Challenge** to persist the window. The widget immediately switches to the metric view.

### Settings Schema

The active challenge is stored as a single row in the Dexie `settings` store under the primary key `'active_challenge'`:

```json
{
  "key": "active_challenge",
  "name": "Office Steps Challenge",
  "start_date": "2026-08-01",
  "end_date": "2026-08-31",
  "created_at": "2026-08-01T09:00:00.000Z"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `key` | `string` | Always `'active_challenge'` — the Dexie primary key |
| `name` | `string \| null` | Optional display name; `null` when omitted |
| `start_date` | `string` | ISO date (`YYYY-MM-DD`); inclusive range start |
| `end_date` | `string` | ISO date (`YYYY-MM-DD`); inclusive range end |
| `created_at` | `string` | ISO timestamp set on first save; preserved on subsequent edits |

### Cumulative Summation Rules

The engine (`computeChallengeMetrics`) applies the following rules consistently:

**Yesterday's Steps** — always `today − 1`, regardless of whether the challenge is active or completed. If the challenge ended last week, "Yesterday's Steps" is still yesterday's literal step count from `daily_records` (may be 0 if outside the challenge window).

**Cumulative Total** — sum of `effective_steps` for records in `[start_date, rangeEnd]` (inclusive):
- **Active challenge** (`end_date >= today`): `rangeEnd = yesterday` — sums from `start_date` through yesterday, excluding today's in-progress day.
- **Completed challenge** (`end_date < today`): `rangeEnd = end_date` — sums the full challenge window.

**Elapsed Days** (`Day N of M`):
- Active: `(yesterday − start_date) + 1`, floored at 0 (renders as `Day 0` when the challenge has just started today).
- Completed: full duration `(end_date − start_date) + 1`.

**Average Pace** — `cumulativeTotal / elapsedDays` steps/day, rounded to the nearest integer. Renders as `0` when `elapsedDays = 0` (divide-by-zero guard).

### Four Displayed Metrics

| Label | Value |
|-------|-------|
| Yesterday's Steps | Step count for `today − 1` |
| Cumulative Total | Sum of `effective_steps` in the summation window |
| Day Progress | `Day N of M` (elapsed / total challenge duration) |
| Average Pace | `steps/day` rounded to integer |

When `end_date < today`, a **🏁 Challenge Finished** badge appears in the card header.

### One-Click Clipboard Export

Click **📋 Copy Group Update** to copy a pre-formatted progress update to the system clipboard. Requires a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) (`https://` or `localhost`).

**Formatted output template:**

```
🚶 {name} Update
📅 Yesterday's Steps: {yesterdaySteps}
📊 Cumulative Total: {cumulativeTotal} steps (Day {elapsedDays})
📈 Average Pace: {avgPace} steps/day
```

All step counts are formatted with thousands separators (`toLocaleString('en-US')`). If no name was saved, `{name}` falls back to `Step Challenge`.

**Example output:**

```
🚶 Office Steps Challenge Update
📅 Yesterday's Steps: 11,243
📊 Cumulative Total: 187,450 steps (Day 17)
📈 Average Pace: 11,026 steps/day
```

After a successful copy, a **✅ Copied to Clipboard!** badge appears on the card for 2 seconds. If the clipboard API fails (non-secure context or permission denied), a `⚠️ Copy to clipboard failed` message appears in the status line.
