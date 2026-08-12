# Repository Scope

## Context Meta
  - verification-commit: `774e287`
  - generated-at: `2026-08-12T10:00:00Z`
  - confidence: `high`

## Purpose
This repository is a client-side step streak tracker web app that connects to Google Identity + Google Fitness APIs, fetches historical daily step buckets, and computes/displays a current streak against a fixed daily goal. The codebase is structured as an ES module tree built and served by Vite, with Dexie-backed IndexedDB persistence and a Vitest unit-test suite.

## In-Scope Responsibilities
- Browser UI — tab-bar shell + panel layout (`index.html`, `styles.css`)
- Google OAuth token acquisition in-browser (`src/auth.js`, `src/config.js`)
- Client-side tab navigation (`src/tabs.js`)
- UI status reporting abstraction (`src/ui-status.js`)
- IndexedDB persistence via Dexie (`src/db.js`, `src/storage.js`) — v2 adds `goal_history` migration; v3 backfills `effective_*`/`is_overridden`/`override` on legacy `daily_records` rows; v4 drops `goal_history` table and seeds `active_step_goal` in `settings` (`DB_VERSION = 4`)
- Application bootstrap / composition root (`src/main.js`)
- Google Fitness aggregate step/distance fetch and incremental sync engine (`src/steps.js`) — chunked requests, normalisation, Dexie `daily_records` persistence, retry/error contract, backfill latch
- Goal Commitment management (`src/goal.js`) — read/write active daily step goal (`active_step_goal` key) in Dexie `settings` store; preset options `STEP_GOAL_OPTIONS = [5000, 7500, 10000, 15000]`; scalar step-only lens (no km, no `goal_history` write)
- Today's Progress computation and card rendering (`src/progress.js`, `src/progress-ui.js`) — pure computation of steps/distance vs. goal, progress-bar + goal-met/remaining-hint card injected into `#tab-dashboard` on load and after each sync
- Streak computation and output rendering (`src/streak.js`, `src/streak-ui.js`) — effective-date unified streak, fixed tier streaks, Hall of Fame metrics, and lifetime 10k-day banner
- Record override/revert (`src/records.js`) — `createRecords(db)` factory; `overrideRecord` writes corrected `effective_steps`/`effective_distance_km`/`is_overridden`/`override`; `revertRecord` restores original synced values; never mutates `original_steps`/`original_distance_km`/`synced_at`
- Proof-image processing (`src/image-processor.js`) — `createImageProcessor(deps)` factory; validates MIME type/size, resizes to ≤1024 px, returns JPEG base64 data URL for storage in `override.proof_image_base64`
- Search / filter lab (`src/search.js`, `src/search-ui.js`) — `createSearch(db)` executes AND-combined multi-filter Dexie queries (date range, step bounds, override status, goal-target outcome vs. step target); Near-Miss analysis via `computeNearMisses`; `createSearchUI` renders filter form, results grid, summary card, Near-Miss panel, and export controls into `#tab-search`
- CSV/JSON export (`src/exporter.js`) — `createExporter(doc)` factory; serialises filtered `daily_records` to RFC-4180 CSV or pretty-printed JSON and triggers a `<a download>` click; timezone-safe filename with `_localDate()`
- Group Challenge Tracker (`src/challenge.js`, `src/challenge-ui.js`) — `createChallenge(db)` engine persists `active_challenge` in Dexie `settings` store; `computeChallengeMetrics` derives "Latest Day" steps (today-1 while active, `end_date` once completed), cumulative total, day progress, and avg pace across the challenge window; `createChallengeUI` renders the mockup metric `#challenge-card` stacked below today's progress in `#tab-dashboard`; ⚙️ gear toggles the start/end date config; Save handler persists config; Copy handler formats and copies a plain-text group update to clipboard; re-renders on `data:records:mutated` event
- Pure shared utilities — `src/date-utils.js` (`_localDate`, `_addDaysUtc`; no DOM, no Dexie; shared by `goal.js`, `streak.js`, `steps.js`, `exporter.js`); `src/units.js` (`KM_TO_STEPS = 1312.33`; no imports; shared by `progress.js`, `records.js`)
- Build tooling and dev server (Vite 8, `vite.config.js`)
- Unit test suite (Vitest 4, `src/*.test.js`)
- Environment-based configuration (`.env.example`, `import.meta.env.VITE_CLIENT_ID`)

## Out-of-Scope / Boundaries
- No backend service
- No server-side persistence/database
- No CI/CD workflows in repo (`.github/workflows/` not detected)
- No linting or type-checking toolchain detected

## Evidence Base
- Source scanned: `src/` (all modules + tests), `index.html`, `styles.css`, `package.json`, `vite.config.js`, `.env.example`, `README.md`, `.arcus/plans/PRD.md`
- Ignore rules: `.gitignore` (ignores `.env.local`, `node_modules/`, `dist/`, `.arcus/`, `.krill/`, `.idea/`)
