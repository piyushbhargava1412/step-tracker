# Repository Map

## Context Meta
- verification-commit: `HEAD`
- generated-at: `2026-08-16T11:48:29Z`
- confidence: `high`

## Top-Level Layout
- `index.html` — main page shell, Google Identity script include, tab-bar UI, PWA `<link
  rel="manifest">` + `<meta name="theme-color">` (ST-013)
- `styles.css` — styling for dark-themed single-page UI with tab panels
- `src/` — ES module source tree (see Implementation Areas)
- `public/` — static files served unmodified at the site root by Vite: `manifest.json` (web app
  manifest), `icons/icon-192.png` / `icons/icon-512.png` (install icons), `sw.js` (classic,
  non-module service worker — hand-mirrors `src/sw-policy.js`'s caching policy; ST-013; see
  `.context/flows/pwa-offline-install.md`)
- `.github/workflows/deploy.yml` — GitHub Actions: test-gated Cloudflare Pages deploy on push to
  `main` (ST-013)
- `package.json` — npm manifest; declares Vite, Vitest, Dexie dependencies
- `package-lock.json` — lockfile
- `vite.config.js` — Vite dev/build config and Vitest test config (`jsdom` environment)
- `.env.example` — template for `.env.local` containing `VITE_CLIENT_ID`
- `README.md` — setup guide, Google Cloud Console registration, Step Sync engine documentation,
  Cloudflare Pages deployment, PWA install, and offline-usage documentation
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
  - Auto-sync on connect: `auth.onTokenReceived(...)` fires on every valid token (first connect or silent restore) → persists the `google_connected` localStorage flag and runs the same post-sync re-render pipeline as `#sync-btn`
  - Silent session restore: on bootstrap, when `google_connected === '1'`, `auth.requestToken({ prompt: '' })` asks GSI for a fresh token without UI, which re-triggers the auto-sync hook above
  - `#sync-btn` click → `stepSync.sync()` then `progressUI.render()` (from `src/steps.js` + `src/progress-ui.js`)
  - `.tab-bar` click (delegated) → `switchTab()` (from `src/tabs.js`)
  - `#goal-select` `change` event → `goal.setActiveStepGoal()` then three-renderer fan-out: `streakUI.render()`, `calendarUI.render()`, `monthOverview.render()` (from `src/goal.js` + `src/main.js`)
  - `data:records:mutated` custom event → `progressUI.render()`, `streakUI.render()`, `calendarUI.render()`, `monthOverview.render()`, `challengeUI.render()` (fail-open, registered in `src/main.js`)
   - `#tab-search` delegated click (`data-action`) → execute/reset/export-csv/export-json/edit-day actions (from `src/search-ui.js`)
   - `#settings-btn` click → `settingsUI.open()` (from `src/settings-ui.js`)
    - `#settings-modal` delegated click/change (`data-action`, `data-field`) → prune / wipe / close-settings / toggle-clear-all actions + auto-save anchor on date change (from `src/settings-ui.js`)
  - `data-tab="backup"` → `#tab-backup` panel (`#backup-controls`, `#cloud-controls`) → local export/import + Google Drive cloud sync controls (from `src/backup-ui.js` + `src/drive-sync-ui.js`, ST-012; see `.context/flows/backup-and-cloud-sync.md`)
  - `#db-status` badge click (when showing the "⚠️ Backup Disabled" state only) → `switchTab('backup', doc)`, jumping to the Backup tab's Storage Health panel; a no-op in the "☁️ Cloud Synced" / "🛡️ Storage Safe" states (from `src/main.js` + `src/storage-health.js`, ST-013; see `.context/flows/storage-health.md`)
  - `DOMContentLoaded` → `bootstrap()` also fires a fire-and-forget, PROD-gated, fail-open service-worker registration: `createSwRegister({ nav: navigator, config: { prod: import.meta.env.PROD } }).register()` (from `src/sw-register.js`, ST-013; see `.context/flows/pwa-offline-install.md`)
  - Browser Service Worker lifecycle (`install`/`activate`/`fetch`) on `public/sw.js`, registered at scope `/` — precaches the app shell, applies a mirrored `src/sw-policy.js` caching policy, network-first navigations, stale-while-revalidate for the GSI script (ST-013; see `.context/flows/pwa-offline-install.md`)
- `DOMContentLoaded` → `bootstrap()` also calls `progressUI.render()`, `streakUI.render()`, `calendarUI.render()`, `monthOverview.render()`, `searchUI.render()`, `challengeUI.render()`, and `settingsUI.render()` on load
- `data:records:mutated` fan-out now also calls `searchUI.render()` (in addition to progressUI, streakUI, calendarUI, monthOverview, challengeUI)

## Implementation Areas
- Composition root / bootstrap: `src/main.js`
- Auth/token state management: `src/auth.js` (`createAuth` factory — `init`, `requestToken(options)` where `{ prompt: '' }` is a silent restore, `getAccessToken`, `onTokenReceived`)
- Configuration validation: `src/config.js` (`VITE_CLIENT_ID` from `import.meta.env`)
- IndexedDB setup: `src/db.js` (`createDb`, `initDB` via Dexie; `DB_VERSION = 5`; v2 adds `goal_history` and seeds active goals; v3 backfills `effective_*`/`is_overridden`/`override` on legacy `daily_records` rows; v4 drops `goal_history`, seeds `active_step_goal` in `settings`; v5 seeds `sync_anchor_date = '2018-01-01'` in `settings`)
- Persistent storage request: `src/storage.js` (`requestPersistentStorage`)
- Tab navigation: `src/tabs.js` (`initTabs`, `switchTab`)
- UI status reporting: `src/ui-status.js` (`createStatusReporter`)
- Step sync engine: `src/steps.js` (`createStepSync` factory; `sync()` orchestrator with two-segment windows, chunked fetch, normalize/upsert, retry, backfill latch; `_upsertChunk` high-water-marks `effective_*` as `max(stored, incoming)` on non-overridden rows while `original_*` tracks the raw cloud truth)
- Date utilities: `src/date-utils.js` (pure helpers: `_localDate`, `_addDaysUtc`; no DOM, no Dexie; extracted from `goal.js` and `streak.js`)
- Unit conversion constants: `src/units.js` (pure constants: `KM_TO_STEPS = 1312.33`; no imports; extracted from `goal.js`)
- Goal Commitment engine: `src/goal.js` (`createGoal` factory; `getActiveStepGoal`/`setActiveStepGoal`; persists `active_step_goal` row in Dexie `settings` store; exports `STEP_GOAL_OPTIONS = [4000, 6000, 8500, 10000]`, `STEP_GOAL_KM_HINTS = { 4000: 3, 6000: 5, 8500: 7, 10000: 8 }`, `DEFAULT_STEP_GOAL = 10000`; no km fields, no `goal_history` write)
- Streak calculation: `src/streak.js` (`createStreak` orchestration; `computeToleranceStreaks` — 100%/95%/99% windows with longest-compliant-window semantics; `ALLOWANCE_WINDOW_95 = 20`, `ALLOWANCE_WINDOW_99 = 100`, `NEAR_MISS_RATIO = 0.95` (near-miss bar for tolerance tiers); tier/HoF/lifetime calculations; scalar step-goal lens — no per-date goal history)
- Streak renderer: `src/streak-ui.js` (`createStreakUI` factory; `render()` builds `#lifetime-banner` (full-width lifetime compliance: met/total days + pct) and `#streak-card` — Active Streaks mockup: header + goal badge, Actual (100%) block + bar, 95%/99% allowance chips, Best Runs list; renders `tolerance`, `hallOfFame`, `lifetime`, `activeStepGoal`; no tier chips)
- Progress computation: `src/progress.js` (pure functions: `getTodayRecord`, `computeProgress`)
- Today's Progress card renderer: `src/progress-ui.js` (`createProgressUI` factory; `render()` builds card + step-target `<select>` into `#tab-dashboard`; imports `STEP_GOAL_OPTIONS` from `src/goal.js`)
- Calendar engine: `src/calendar.js` (`createCalendar(db, goal)` factory; pure functions: `monthBounds`, `buildMonthGrid`, `classifyDay(record, stepGoal, isFuture)`, `computeMonthlyAggregates`, `computeNavBounds`, `buildZeroState`, `computeCommitmentHitRate`; exports `EXCEEDED_RATIO = 1.5`, `CLASSIFICATION_*` constants; step-only classification, no km)
- Calendar renderer: `src/calendar-ui.js` (`createCalendarUI(doc, db, calendarEngine, reporter, records, processImage, monthOverview)` factory; `render()` builds `#calendar-nav`, `#calendar-summary`, `#calendar-grid`, and `#day-drawer` into `#tab-calendar`; override form + revert button injected into drawer when `records` is provided; override form and proof lightbox come from the shared `src/override-form.js`)
- Month overview renderer: `src/month-overview.js` (`createMonthOverview(doc, calendar, reporter)` factory; `render()` builds heatmap tile grid and commitment hit-rate card; reused by dashboard and calendar tabs)
- Record override/revert: `src/records.js` (`createRecords(db)` factory; `overrideRecord(date, params)` — writes `effective_steps`/`effective_distance_km`/`is_overridden`/`override`; `revertRecord(date)` — restores original synced values; never mutates `original_steps`/`original_distance_km`/`synced_at`)
- Proof-image processing: `src/image-processor.js` (`createImageProcessor(deps)` factory; `processImage(file)` — validates type/size, resizes to ≤1024 px, returns JPEG base64 data URL; `MAX_PROOF_IMAGE_PX`, `PROOF_IMAGE_QUALITY`, `MAX_PROOF_FILE_BYTES`, `ALLOWED_IMAGE_TYPES` constants)
- Shared override form / proof lightbox: `src/override-form.js` (`createOverrideForm(doc, records, processImage, reporter, { onViewProof, consolePrefix })` → `{ mount(container, { date, record }, { signal }) }`; builds the steps + mandatory-proof-image form, reuses an existing proof, dispatches `data:records:mutated` on save; `createProofLightbox(doc)` → `{ open(src, panel), close() }` — single-instance full-size proof overlay; extracted from `calendar-ui.js` so the calendar drawer and Search Lab both mount the same form)
- Search / filter engine: `src/search.js` (`createSearch(db)` factory — no `goal` collaborator; `executeQuery(filters)` — date-range / all-time Dexie query with AND-combined filters (steps, override status, target outcome vs. step target); `computeResultSummary(records, preFilterSet)`; pure export: `computeNearMisses(records, stepTarget)`, `NEAR_MISS_BAND_PCT = 10`)
- Search UI renderer: `src/search-ui.js` (`createSearchUI(doc, search, exporter, reporter, computeNearMisses, records, processImage)` factory; `render()` builds filter form, results grid, summary card, Near-Miss panel, and export controls into `#tab-search`; delegated `data-action` click dispatcher for execute/reset/export-csv/export-json/edit-day; missed-outcome rows get an `edit-day` button that mounts the shared override form; `render()` retains and re-runs the last executed query after a re-render (e.g. post-mutation) so results stay fresh instead of resetting)
- CSV/JSON exporter: `src/exporter.js` (`createExporter(doc)` factory; `exportCsv(records)` / `exportJson(records)` — serialise `daily_records` to RFC-4180 CSV or pretty-printed JSON and trigger a `<a download>` click; `CSV_HEADERS`, `EXPORT_FILENAME_PREFIX` constants; `_toExportRow`, `_csvCell`, `_toCsv`, `_toJson` pure helpers)
- Challenge engine: `src/challenge.js` (`createChallenge(db)` factory; `getActiveChallenge()` — reads `active_challenge` key from Dexie `settings` store; `setActiveChallenge(options)` — persists with `RangeError` guard when `end_date < start_date`, fail-open on DB write errors; `computeChallengeMetrics(challenge, records)` — pure function, "Latest Day" = today-1 while active or `end_date` once completed, plus cumulative total, elapsed/total days, avg pace; `formatChallengeUpdate(metrics, name)` — formats clipboard export text; `ACTIVE_CHALLENGE_KEY = 'active_challenge'`; see `.context/flows/group-challenge-tracker.md`)
- Challenge UI renderer: `src/challenge-ui.js` (`createChallengeUI(doc, challenge, db, reporter)` factory; idempotent `render()` inserts `#challenge-card` into `#tab-dashboard`; AbortController-scoped delegated listener per render; always renders the mockup metric layout (title + date-range subtitle, ⚙️ gear + Copy Update actions, four metric tiles Latest Day / Cumulative / Day Progress / Avg. Pace); the gear toggles a collapsible start/end date config — open by default when unconfigured, hidden once configured; Save handler persists via `challenge.setActiveChallenge()`; Copy handler writes formatted update to clipboard via `navigator.clipboard.writeText()`; fail-open on missing container)
- Settings engine: `src/settings.js` (`createSettings(db)` factory; `getSyncAnchorDate()` — reads `sync_anchor_date` from Dexie `settings` (fallback `DEFAULT_SYNC_ANCHOR = '2018-01-01'`); `setSyncAnchorDate(date)` — validates strict YYYY-MM-DD, persists; `countRecordsBefore(date)` — returns count of `daily_records` rows before date; `countAllRecords()` — returns total `daily_records` count (wipe impact preview); `pruneRecordsBefore(date)` — deletes those rows; `wipeDatabase()` — clears all `daily_records`, deletes `initial_backfill_complete`, resets `sync_anchor_date`; exports `SYNC_ANCHOR_KEY`, `DEFAULT_SYNC_ANCHOR`)
- Settings UI renderer: `src/settings-ui.js` (`createSettingsUI(doc, settings, reporter, confirmFn)` factory; `render()` builds settings modal DOM (header "⚙️ Settings & Data Hygiene" with compact ✕ close button; 📅 SYNC BOUNDARY section with "Track History From:" anchor-date picker; divider; 🗑️ DATA PURGE OPTIONS section with clear-all checkbox, 📊 Impact Preview, prune/wipe action button); `open()` populates date input and displays `#settings-modal`; `close()` hides modal; AbortController-scoped delegated click/change listeners; anchor auto-saved on date change via `setSyncAnchorDate`; injected `confirmFn` for prune/wipe confirmation; dispatches `data:records:mutated` on successful mutation)
- Confirm adapter: `src/confirm.js` (`createConfirmAdapter(windowRef)` — returns a function delegating to `windowRef?.confirm?.(msg)`; injectable seam to replace `window.confirm` in tests)
- UI structure: `index.html` (tab-bar + tab-panel layout; includes calendar skeleton with nav/summary/grid containers and day-detail drawer)
- Presentation: `styles.css` (dark theme, tab bar, panels, progress card, goal-selector, calendar grid/tiles/drawer, search filters/results/summary/near-miss/export-controls, lifetime compliance banner spanning the top dashboard row, Active Streaks card mockup styles — `.streak-header`/`.goal-badge`/`.streak-actual`/`.streak-bar`/`.streak-allowances`/`.streak-runs`, challenge-card stacked in the left dashboard column below the progress card at grid row 3 with streak-card spanning rows 2–4 and month-overview-card at row 4; ≤760px mobile single column with `order` lifetime-banner(1) → progress(2) → streak(3) → challenge(4) → calendar(5))
- DB schema migrations: `src/db.js` (Dexie `DB_VERSION = 5`; v2 adds `goal_history` and seeds active goals; v3 backfills `effective_*`/`is_overridden`/`override` on legacy `daily_records` rows; v4 drops `goal_history`, seeds `active_step_goal` in `settings`; v5 seeds `sync_anchor_date = '2018-01-01'` in `settings`)
- Local backup engine: `src/backup.js` (`createBackup(db)` factory — `buildBackup()`/`restoreBackup(parsed)` full-database JSON envelope export/import; pure exports `blobToBase64`, `base64ToBlob`, `_validateEnvelope`/`validateBackupPayload`, `BACKUP_SCHEMA_VERSION`, `MAX_BACKUP_RECORDS`, `MAX_BACKUP_BYTES`; also exposes `computeSignature`/`hasUnpushedChanges`/`markPushed` dirty-check for the Drive push hook; ST-012)
- Local backup UI renderer: `src/backup-ui.js` (`createBackupUI(doc, backup, reporter, confirmFn, settings = null)`; renders the "📄 Local JSON Files" export/restore controls (confirm-gated restore, last-export metadata line) into `#backup-controls`; ST-012)
- Backup/cloud-sync metadata formatting: `src/backup-format.js` (pure, DI-testable helpers `formatBytes`, `formatLastExportLine`, `formatLastSyncLine` for the "Last local export"/"Last cloud sync" panel lines; ST-012)
- Google Drive AppData gateway: `src/drive-sync.js` (`createDriveSync({ getAccessToken, reporter, fetchFn, validator })` — sole module talking to the Drive v3 REST API via injected `fetchFn`; `find()`/`push(envelope, { silent })`/`pull()`; exports `DRIVE_APPDATA_FILE_NAME`, `DRIVE_API_BASE_URL`, `DRIVE_PUSH_SKIPPED`; ST-012)
- Google Drive cloud sync UI renderer: `src/drive-sync-ui.js` (`createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, driveBackupPrefs, nav = navigator)`; renders the "☁️ Google Drive Cloud Sync" controls (inline auto-upload toggle, last-sync metadata line) into `#cloud-controls`; ST-012; toggle success (ST-013) silently requests `navigator.storage.persist()` + refreshes the `#db-status` badge and, together with a successful manual backup, dispatches `data:storage-health:refresh` so the separately-mounted Storage Health panel stays in sync)
- Storage Health protection matrix: `src/storage-health.js` (`computeBadgeText`/`isProtected` pure matrix combining `drive_backup_enabled` + `navigator.storage.persisted()`; `refreshStorageProtectionBadge(reporter, settings, nav)` and `requestSilentPersistAndRefreshBadge(reporter, settings, nav)` orchestration; exports `CLOUD_SYNCED_TEXT`, `BACKUP_DISABLED_TEXT`; ST-013, replaces `src/storage-modal.js`)
- Storage Health panel renderer: `src/storage-health-ui.js` (`createStorageHealthUI(doc, settings, reporter, nav = navigator)` → `{ render }`; renders the "💾 Storage & Data Health" panel — Drive Cloud Backup status, Local Browser Storage status, `[ 🛡️ Request Browser Storage Protection ]` direct-action button (no modal) — into `#storage-health-controls`; ST-013)
- Transient toast notifier: `src/toast.js` (`showToast(doc, message, ms)`; single shared `#app-toast` fade-out popup; used by `src/ui-status.js`'s `sync()` method to surface terminal `✅` sync-success messages instead of the persistent `#sync-status` line)
- PWA caching-policy classifier: `src/sw-policy.js` (pure, no DOM/Dexie/`navigator`/`caches`/`fetch`; `classifyRequestUrl(urlString, origin)` → `CACHE_FIRST` | `STALE_WHILE_REVALIDATE` | `NETWORK_ONLY` | `SKIP`; hand-mirrored into `public/sw.js`'s classic-worker `fetch` handler; ST-013; see `.context/flows/pwa-offline-install.md`)
- Service worker registration: `src/sw-register.js` (`createSwRegister({ nav, config, log })` → `{ register() }`; PROD-gated, fail-open — no-op on non-PROD or missing `nav.serviceWorker.register`; wired fire-and-forget from `src/main.js` bootstrap; ST-013)

## Testing Surfaces
- Unit tests: `src/*.test.js` (Vitest 4, jsdom) — auth, config, db, storage, tabs, ui-status, main, steps, styles, docs, goal, progress, progress-ui, streak, streak-ui, calendar, calendar-ui, month-overview, records, image-processor, override-form, search, search-ui, exporter, date-utils, units, challenge, challenge-ui, settings, settings-ui, confirm, backup, backup-ui, backup-format, drive-sync, drive-sync-ui, storage-health, storage-health-ui, sw-policy, sw-register, manifest, pwa-sanity, index (manifest link/theme-color assertions)
- Integration/functional/acceptance/performance tests: Not found
- Shell script tests: Not found

## CI/CD
- GitHub workflows: `.github/workflows/deploy.yml` — triggers on `push` to `main`; test-gated
  (`npm ci` → `npm test` → `npm run build` with `VITE_CLIENT_ID` from the `GOOGLE_CLIENT_ID` secret)
  → `cloudflare/wrangler-action@v3` deploys `dist/` to the Cloudflare Pages project `step-tracker`
  using `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets; `permissions: contents: read` (ST-013)
- Other CI configs (`.gitlab-ci.yml`, `Jenkinsfile`, etc.): Not found
- Pipeline stages: checkout → setup-node (20, npm cache) → `npm ci` → `npm test` → `npm run build` → Cloudflare Pages deploy

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
