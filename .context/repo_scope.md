# Repository Scope

## Context Meta
  - verification-commit: `7e440b755ebfd852ef1e22508b0aa5bb0fe55c4a`
  - generated-at: `2026-08-14T00:00:00Z`
  - confidence: `high`

## Purpose
This repository is a client-side step streak tracker web app that connects to Google Identity + Google Fitness APIs, fetches historical daily step buckets, and computes/displays a current streak against a fixed daily goal. The codebase is structured as an ES module tree built and served by Vite, with Dexie-backed IndexedDB persistence and a Vitest unit-test suite.

## In-Scope Responsibilities
- Browser UI — tab-bar shell + panel layout (`index.html`, `styles.css`)
- Google OAuth token acquisition in-browser (`src/auth.js`, `src/config.js`)
- Client-side tab navigation (`src/tabs.js`)
- UI status reporting abstraction (`src/ui-status.js`)
- IndexedDB persistence via Dexie (`src/db.js`, `src/storage.js`) — v2 adds `goal_history` migration; v3 backfills `effective_*`/`is_overridden`/`override` on legacy `daily_records` rows; v4 drops `goal_history` table and seeds `active_step_goal` in `settings` (`DB_VERSION = 5`); v5 seeds `sync_anchor_date = '2018-01-01'` in `settings`
- Application bootstrap / composition root (`src/main.js`)
- Google Fitness aggregate step/distance fetch and incremental sync engine (`src/steps.js`) — chunked requests, normalisation, Dexie `daily_records` persistence, retry/error contract, backfill latch; `effective_*` is high-water-marked (never reduced by a lowered cloud response) while `original_*` preserves raw cloud truth; sync anchor date is read dynamically from Dexie `settings` (`sync_anchor_date` key, fallback `DEFAULT_SYNC_ANCHOR = '2018-01-01'`)
- Goal Commitment management (`src/goal.js`) — read/write active daily step goal (`active_step_goal` key) in Dexie `settings` store; preset options `STEP_GOAL_OPTIONS = [4000, 6000, 8500, 10000]` with display km hints `STEP_GOAL_KM_HINTS`; scalar step-only lens (no km, no `goal_history` write)
- Today's Progress computation and card rendering (`src/progress.js`, `src/progress-ui.js`) — pure computation of steps/distance vs. goal, progress-bar + goal-met/remaining-hint card injected into `#tab-dashboard` on load and after each sync
- Streak computation and output rendering (`src/streak.js`, `src/streak-ui.js`) — effective-date unified streak, fixed tier streaks, Hall of Fame metrics, lifetime compliance banner, and Active Streaks card rendering (Actual + tolerance allowances + Best Runs; no tier chips)
- Record override/revert (`src/records.js`) — `createRecords(db)` factory; `overrideRecord` writes corrected `effective_steps`/`effective_distance_km`/`is_overridden`/`override`; `revertRecord` restores original synced values; never mutates `original_steps`/`original_distance_km`/`synced_at`
- Proof-image processing (`src/image-processor.js`) — `createImageProcessor(deps)` factory; validates MIME type/size, resizes to ≤1024 px, returns JPEG base64 data URL for storage in `override.proof_image_base64`
- Search / filter lab (`src/search.js`, `src/search-ui.js`) — `createSearch(db)` executes AND-combined multi-filter Dexie queries (date range, step bounds, override status, goal-target outcome vs. step target); Near-Miss analysis via `computeNearMisses`; `createSearchUI` renders filter form, results grid, summary card, Near-Miss panel, and export controls into `#tab-search`
- CSV/JSON export (`src/exporter.js`) — `createExporter(doc)` factory; serialises filtered `daily_records` to RFC-4180 CSV or pretty-printed JSON and triggers a `<a download>` click; timezone-safe filename with `_localDate()`
- Group Challenge Tracker (`src/challenge.js`, `src/challenge-ui.js`) — `createChallenge(db)` engine persists `active_challenge` in Dexie `settings` store; `computeChallengeMetrics` derives "Latest Day" steps (today-1 while active, `end_date` once completed), cumulative total, day progress, and avg pace across the challenge window; `createChallengeUI` renders the mockup metric `#challenge-card` stacked below today's progress in `#tab-dashboard`; ⚙️ gear toggles the start/end date config; Save handler persists config; Copy handler formats and copies a plain-text group update to clipboard; re-renders on `data:records:mutated` event
- Settings management (`src/settings.js`, `src/settings-ui.js`, `src/confirm.js`) — `createSettings(db)` engine reads/writes `sync_anchor_date` in Dexie `settings` store, counts/prunes `daily_records` before a given date, counts all records, and wipes the full database; `createSettingsUI(doc, settings, reporter, confirmFn)` renders `#settings-modal` with 📅 SYNC BOUNDARY / 🗑️ DATA PURGE OPTIONS sections (anchor-date picker, impact preview, prune/wipe actions, auto-save anchor on date change); `createConfirmAdapter(windowRef)` is an injectable seam replacing `window.confirm`; settings modal is opened via `#settings-btn`; successful mutations dispatch `data:records:mutated`
- Pure shared utilities — `src/date-utils.js` (`_localDate`, `_addDaysUtc`; no DOM, no Dexie; shared by `goal.js`, `streak.js`, `steps.js`, `exporter.js`); `src/units.js` (`KM_TO_STEPS = 1312.33`; no imports; shared by `progress.js`, `records.js`)
- Local database backup/restore (`src/backup.js`, `src/backup-ui.js`) — `createBackup(db)` serialises/restores the full `daily_records` + `settings` Dexie state as a versioned, size-capped JSON envelope (export/import via a dedicated `#tab-backup` panel); see `.context/flows/backup-and-cloud-sync.md`
- Google Drive AppData cloud sync (`src/drive-sync.js`, `src/drive-sync-ui.js`) — `createDriveSync(...)` pushes/pulls the same backup envelope to/from the user's app-private Google Drive `appDataFolder` over the Drive v3 REST API (reusing the `auth.js` OAuth token, now scoped with `drive.appdata`); manual push/pull controls plus an automatic, opt-out post-sync push wired into `src/steps.js`'s sync flow and a cloud-recovery banner on clean install; see `.context/flows/backup-and-cloud-sync.md`
- Storage persistence guidance (`src/storage-modal.js`) — interactive modal (opened from the `#db-status` badge) explaining browser storage-eviction risk and offering a manual retry of `src/storage.js`'s `requestPersistentStorage`; see `.context/flows/persistent-storage-modal.md`
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
