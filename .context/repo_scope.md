# Repository Scope

## Context Meta
  - verification-commit: `371dc5b8d87197e66eefafc8e977b8b58211fda9`
  - generated-at: `2026-08-11T00:00:00Z`
  - confidence: `high`

## Purpose
This repository is a client-side step streak tracker web app that connects to Google Identity + Google Fitness APIs, fetches historical daily step buckets, and computes/displays a current streak against a fixed daily goal. The codebase is structured as an ES module tree built and served by Vite, with Dexie-backed IndexedDB persistence and a Vitest unit-test suite.

## In-Scope Responsibilities
- Browser UI — tab-bar shell + panel layout (`index.html`, `styles.css`)
- Google OAuth token acquisition in-browser (`src/auth.js`, `src/config.js`)
- Client-side tab navigation (`src/tabs.js`)
- UI status reporting abstraction (`src/ui-status.js`)
- IndexedDB persistence via Dexie (`src/db.js`, `src/storage.js`) — v2 adds `goal_history` migration and goal-history writes from `src/goal.js`; v3 backfills `effective_*`/`is_overridden`/`override` on legacy `daily_records` rows
- Application bootstrap / composition root (`src/main.js`)
- Google Fitness aggregate step/distance fetch and incremental sync engine (`src/steps.js`) — chunked requests, normalisation, Dexie `daily_records` persistence, retry/error contract, backfill latch
- Goal Commitment management (`src/goal.js`) — read/write active daily distance goal (`active_goal` key) in Dexie `settings` store; preset (1/3/5/10 km) and custom km input
- Today's Progress computation and card rendering (`src/progress.js`, `src/progress-ui.js`) — pure computation of steps/distance vs. goal, progress-bar + goal-met/remaining-hint card injected into `#tab-dashboard` on load and after each sync
- Streak computation and output rendering (`src/streak.js`, `src/streak-ui.js`) — effective-date unified streak, fixed tier streaks, Hall of Fame metrics, and lifetime 10k-day banner
- Record override/revert (`src/records.js`) — `createRecords(db)` factory; `overrideRecord` writes corrected `effective_steps`/`effective_distance_km`/`is_overridden`/`override`; `revertRecord` restores original synced values; never mutates `original_steps`/`original_distance_km`/`synced_at`
- Proof-image processing (`src/image-processor.js`) — `createImageProcessor(deps)` factory; validates MIME type/size, resizes to ≤1024 px, returns JPEG base64 data URL for storage in `override.proof_image_base64`
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
