# Repository Map

## Context Meta
- verification-commit: `774e287`
- generated-at: `2026-08-12T10:00:00Z`
- confidence: `high`

## Top-Level Layout
- `index.html` — main page shell, Google Identity script include, tab-bar UI
- `styles.css` — styling for dark-themed single-page UI with tab panels
- `src/` — ES module source tree (see Implementation Areas)
- `package.json` — npm manifest; declares Vite, Vitest, Dexie dependencies
- `package-lock.json` — lockfile
- `vite.config.js` — Vite dev/build config and Vitest test config (`jsdom` environment)
- `.env.example` — template for `.env.local` containing `VITE_CLIENT_ID`
- `README.md` — setup guide, Google Cloud Console registration, and Step Sync engine documentation
- `.arcus/plans/PRD.md` — detailed product requirements and future module vision

## Tech Stack
- Languages: JavaScript (ES modules), HTML, CSS, Markdown
- Runtime: Browser-only frontend
- Build / Dev server: Vite 8.x (`vite.config.js`)
- Test framework: Vitest 4.x (jsdom environment, `src/*.test.js`)
- Dependencies: Dexie 4 (IndexedDB wrapper, `src/db.js`)
- External APIs:
  - Google Identity Services (`google.accounts.oauth2.initTokenClient`)
  - Google Fitness REST aggregate endpoint (`users/me/dataset:aggregate`)

## Dependency Managers
- `npm` via `package.json` (Vite 8, Vitest 4, Dexie 4, @vitest/coverage-v8, jsdom)

## Entry Surfaces
- `DOMContentLoaded` → `bootstrap()` in `src/main.js` (composition root)
- UI event handlers (bound in `src/main.js`):
  - `#auth-btn` click → `auth.requestToken()` (from `src/auth.js`)
  - `#sync-btn` click → `stepSync.sync()` then `progressUI.render()` (from `src/steps.js` + `src/progress-ui.js`)
  - `.tab-bar` click (delegated) → `switchTab()` (from `src/tabs.js`)
  - `#goal-select` `change` event → `goal.setActiveStepGoal()` then three-renderer fan-out: `streakUI.render()`, `calendarUI.render()`, `monthOverview.render()` (from `src/goal.js` + `src/main.js`)
  - `data:records:mutated` custom event → `progressUI.render()`, `streakUI.render()`, `calendarUI.render()`, `monthOverview.render()`, `challengeUI.render()` (fail-open, registered in `src/main.js`)
  - `#tab-search` delegated click (`data-action`) → execute/reset/export-csv/export-json actions (from `src/search-ui.js`)
- `DOMContentLoaded` → `bootstrap()` also calls `progressUI.render()`, `streakUI.render()`, `calendarUI.render()`, `monthOverview.render()`, `searchUI.render()`, and `challengeUI.render()` on load

## Implementation Areas
- Composition root / bootstrap: `src/main.js`
- Auth/token state management: `src/auth.js` (`createAuth` factory)
- Configuration validation: `src/config.js` (`VITE_CLIENT_ID` from `import.meta.env`)
- IndexedDB setup: `src/db.js` (`createDb`, `initDB` via Dexie; `DB_VERSION = 4`)
- Persistent storage request: `src/storage.js` (`requestPersistentStorage`)
- Tab navigation: `src/tabs.js` (`initTabs`, `switchTab`)
- UI status reporting: `src/ui-status.js` (`createStatusReporter`)
- Step sync engine: `src/steps.js` (`createStepSync` factory; `sync()` orchestrator with two-segment windows, chunked fetch, normalize/upsert, retry, backfill latch)
- Date utilities: `src/date-utils.js` (pure helpers: `_localDate`, `_addDaysUtc`; no DOM, no Dexie; extracted from `goal.js` and `streak.js`)
- Unit conversion constants: `src/units.js` (pure constants: `KM_TO_STEPS = 1312.33`; no imports; extracted from `goal.js`)
- Goal Commitment engine: `src/goal.js` (`createGoal` factory; `getActiveStepGoal`/`setActiveStepGoal`; persists `active_step_goal` row in Dexie `settings` store; exports `STEP_GOAL_OPTIONS = [5000, 7500, 10000, 15000]`, `DEFAULT_STEP_GOAL = 10000`; no km fields, no `goal_history` write)
- Streak calculation: `src/streak.js` (`createStreak` orchestration; `computeToleranceStreaks` — 100%/95%/90% windows; `ALLOWANCE_WINDOW_95 = 20`, `ALLOWANCE_WINDOW_90 = 10`; tier/HoF/lifetime calculations; scalar step-goal lens — no per-date goal history)
- Streak renderer: `src/streak-ui.js` (`createStreakUI` factory; `render()` builds `#lifetime-banner` and `#streak-card`; renders `tolerance`, `tiers`, `hallOfFame`, `activeStepGoal`)
- Progress computation: `src/progress.js` (pure functions: `getTodayRecord`, `computeProgress`)
- Today's Progress card renderer: `src/progress-ui.js` (`createProgressUI` factory; `render()` builds card + step-target `<select>` into `#tab-dashboard`; imports `STEP_GOAL_OPTIONS` from `src/goal.js`)
- Calendar engine: `src/calendar.js` (`createCalendar(db, goal)` factory; pure functions: `monthBounds`, `buildMonthGrid`, `classifyDay(record, stepGoal, isFuture)`, `computeMonthlyAggregates`, `computeNavBounds`, `buildZeroState`, `computeCommitmentHitRate`; exports `EXCEEDED_RATIO = 1.5`, `CLASSIFICATION_*` constants; step-only classification, no km)
- Calendar renderer: `src/calendar-ui.js` (`createCalendarUI(doc, db, calendarEngine, reporter, records, processImage, monthOverview)` factory; `render()` builds `#calendar-nav`, `#calendar-summary`, `#calendar-grid`, and `#day-drawer` into `#tab-calendar`; override form + revert button injected into drawer when `records` is provided)
- Month overview renderer: `src/month-overview.js` (`createMonthOverview(doc, calendar, reporter)` factory; `render()` builds heatmap tile grid and commitment hit-rate card; reused by dashboard and calendar tabs)
- Record override/revert: `src/records.js` (`createRecords(db)` factory; `overrideRecord(date, params)` — writes `effective_steps`/`effective_distance_km`/`is_overridden`/`override`; `revertRecord(date)` — restores original synced values; never mutates `original_steps`/`original_distance_km`/`synced_at`)
- Proof-image processing: `src/image-processor.js` (`createImageProcessor(deps)` factory; `processImage(file)` — validates type/size, resizes to ≤1024 px, returns JPEG base64 data URL; `MAX_PROOF_IMAGE_PX`, `PROOF_IMAGE_QUALITY`, `MAX_PROOF_FILE_BYTES`, `ALLOWED_IMAGE_TYPES` constants)
- Search / filter engine: `src/search.js` (`createSearch(db)` factory — no `goal` collaborator; `executeQuery(filters)` — date-range / all-time Dexie query with AND-combined filters (steps, override status, target outcome vs. step target); `computeResultSummary(records, preFilterSet)`; pure export: `computeNearMisses(records, stepTarget)`, `NEAR_MISS_BAND_PCT = 10`)
- Search UI renderer: `src/search-ui.js` (`createSearchUI(doc, search, exporter, reporter, computeNearMisses)` factory; `render()` builds filter form, results grid, summary card, Near-Miss panel, and export controls into `#tab-search`; delegated `data-action` click dispatcher for execute/reset/export-csv/export-json)
- CSV/JSON exporter: `src/exporter.js` (`createExporter(doc)` factory; `exportCsv(records)` / `exportJson(records)` — serialise `daily_records` to RFC-4180 CSV or pretty-printed JSON and trigger a `<a download>` click; `CSV_HEADERS`, `EXPORT_FILENAME_PREFIX` constants; `_toExportRow`, `_csvCell`, `_toCsv`, `_toJson` pure helpers)
- Challenge engine: `src/challenge.js` (`createChallenge(db)` factory; `getActiveChallenge()` — reads `active_challenge` key from Dexie `settings` store; `setActiveChallenge(options)` — persists with `RangeError` guard when `end_date < start_date`, fail-open on DB write errors; `computeChallengeMetrics(challenge, records)` — pure function, "Latest Day" = today-1 while active or `end_date` once completed, plus cumulative total, elapsed/total days, avg pace; `formatChallengeUpdate(metrics, name)` — formats clipboard export text; `ACTIVE_CHALLENGE_KEY = 'active_challenge'`)
- Challenge UI renderer: `src/challenge-ui.js` (`createChallengeUI(doc, challenge, db, reporter)` factory; idempotent `render()` inserts `#challenge-card` into `#tab-dashboard`; AbortController-scoped delegated listener per render; always renders the mockup metric layout (title + date-range subtitle, ⚙️ gear + Copy Update actions, four metric tiles Latest Day / Cumulative / Day Progress / Avg. Pace); the gear toggles a collapsible start/end date config — open by default when unconfigured, hidden once configured; Save handler persists via `challenge.setActiveChallenge()`; Copy handler writes formatted update to clipboard via `navigator.clipboard.writeText()`; fail-open on missing container)
- UI structure: `index.html` (tab-bar + tab-panel layout; includes calendar skeleton with nav/summary/grid containers and day-detail drawer)
- Presentation: `styles.css` (dark theme, tab bar, panels, progress card, goal-selector, calendar grid/tiles/drawer, search filters/results/summary/near-miss/export-controls, challenge-card stacked in the left dashboard column below the progress card at grid row 3 with streak-card spanning rows 2–4 and month-overview-card at row 4; ≤760px mobile single column with `order` lifetime-banner(1) → progress(2) → streak(3) → challenge(4) → calendar(5))
- DB schema migrations: `src/db.js` (Dexie `DB_VERSION = 4`; v2 adds `goal_history` and seeds active goals; v3 backfills `effective_*`/`is_overridden`/`override` on legacy `daily_records` rows; v4 drops `goal_history`, seeds `active_step_goal` in `settings`)

## Testing Surfaces
- Unit tests: `src/*.test.js` (Vitest 4, jsdom) — auth, config, db, storage, tabs, ui-status, main, steps, styles, docs, goal, progress, progress-ui, streak, streak-ui, calendar, calendar-ui, month-overview, records, image-processor, search, search-ui, exporter, date-utils, units, challenge, challenge-ui
- Integration/functional/acceptance/performance tests: Not found
- Shell script tests: Not found

## CI/CD
- GitHub workflows: Not found (`.github/workflows/*`)
- Other CI configs (`.gitlab-ci.yml`, `Jenkinsfile`, etc.): Not found
- Pipeline stages: Not found

## Build & Run Commands

| Action | Command | Evidence |
|---|---|---|
| dev server | `npm run dev` | `package.json` scripts.dev = `vite` |
| build | `npm run build` | `package.json` scripts.build = `vite build` |
| test (full suite) | `npm test` | `package.json` scripts.test = `vitest run` |
| test (watch) | `npm run test:watch` | `package.json` scripts.test:watch = `vitest` |
| lint | Not found | no eslint/prettier config detected |
| typecheck | Not found | no TypeScript config detected |

## Interface Contracts & Specs
- OpenAPI/Swagger/AsyncAPI/proto/GraphQL/JSON schema: Not found

## Deployment Manifests
- Kubernetes/Helm/Kustomize/Serverless manifests: Not found

## Scripts & Automation
- Shell scripts (`*.sh`, `*.bash`, `*.zsh`): Not found
- `scripts/`, `bin/`, `tools/`, `hack/`, `ci/`, `cd/`: Not found (repo automation folders)

## Documentation Index
- `README.md`
- `.env.example` (template for `.env.local`)
- `.arcus/plans/PRD.md` (extended product blueprint)

## Commit Convention
- Preferred format: `conventional-commit(scope): message`
- Example: `feat(ST-001): Task 8: tabs.js — delegated client-side tab navigation`
