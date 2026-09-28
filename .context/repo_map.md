# Repository Map

## Context Meta
- verification-commit: `HEAD`
- generated-at: `2026-09-28T17:00:00Z` (ST-025 mobile redesign, v0.2.0)
- confidence: `high`

## Top-Level Layout
- `index.html` — mobile app shell (ST-025): sticky app bar (`#app-back`, `#app-title`, `#app-subtitle`,
  search + settings actions), one `<section id="tab-<name>" data-screen>` per screen (Today, Calendar,
  Insights, Journey, Search, Group challenge, Settings, Backup & restore), bottom navigation
  (`[data-tab]`), pull-to-refresh indicator, first-launch `#onboarding`; Google Identity script
  include, PWA `<link rel="manifest">` + `<meta name="theme-color">` (ST-013)
- `styles.css` — Deep Blue tokens (unchanged palette) + mobile layout: app bar, screens, bottom nav,
  cards/tiles/list groups, segmented controls, bottom sheet, every screen's components (ST-025)
- `src/` — ES module source tree (see Implementation Areas)
- `public/` — static files served unmodified at the site root by Vite: `manifest.json` (web app
  manifest), `icons/icon-192.png` / `icons/icon-512.png` (install icons), `sw.js` (classic,
  non-module service worker — hand-mirrors `src/sw-policy.js`'s caching policy; ST-013; see
  `.context/flows/pwa-offline-install.md`)
- `.github/workflows/deploy.yml` — GitHub Actions: test-gated Cloudflare Pages deploy on push to
  `main` (ST-013)
- `package.json` — npm manifest (version `0.2.0`, shown in Settings via Vite `define` → `__APP_VERSION__`); declares Vite, Vitest, Dexie, Capacitor and bundled-font dependencies
- `package-lock.json` — lockfile
- `vite.config.js` — Vite dev/build config (mode-aware: `--mode native` adds `scripts/native-html.js`) and Vitest test config (`jsdom` environment)
- `capacitor.config.json` — Capacitor config for the Android app (`appId` `com.piyushbhargava.steptracker`, `webDir: dist`) (ST-017)
- `android/` — generated Capacitor Android project (committed; build outputs and `local.properties` ignored). Hand-edited: `app/src/main/AndroidManifest.xml` (health permissions + strip list), `app/build.gradle` (release signing from `ST_RELEASE_*`), `variables.gradle` (minSdk 26), `gradle/gradle-daemon-jvm.properties` (JDK 21), launcher/splash resources (ST-017/ST-019)
- `scripts/` — `native-html.js` (+ test), `android-manifest.test.js` (health-permission guard), `generate-android-assets.sh` (icons/splash via `sips`)
- `docs/plans/` — `health-connect-android-roadmap.md`, `android-release.md` (build/sign/install/emulator guide); `docs/slices/ST-016…ST-025` (ST-025 = mobile redesign)
- `.env.example` — template for `.env.local` containing `VITE_CLIENT_ID`
- `README.md` — setup guide, Google Cloud Console registration, Step Sync engine documentation,
  Cloudflare Pages deployment, PWA install, and offline-usage documentation
- `.arcus/plans/PRD.md` — detailed product requirements and future module vision

## Tech Stack
- Languages: JavaScript (ES modules), HTML, CSS, Markdown
- Runtime: browser (PWA) and an Android app (Capacitor 8 WebView shell, `src/platform/*` chooses per platform)
- Build / Dev server: Vite 8.x (`vite.config.js`)
- Test framework: Vitest 4.x (jsdom environment, `src/*.test.js`)
- Dependencies: Dexie 4 (IndexedDB wrapper, `src/db.js`)
- External APIs:
  - Google Identity Services (`google.accounts.oauth2.initTokenClient`)
  - Google Fitness REST aggregate endpoint (`users/me/dataset:aggregate`) — web step source
  - Health Connect via `@capgo/capacitor-health` (`queryAggregated` hourly sums, `requestAuthorization` with history access) — Android step source (ST-019)
  - `@capacitor/filesystem` (Android exports to `Documents/Step Tracker/`), `@capacitor/app-launcher` (Health Connect Play Store link), `@capacitor/share` (challenge update → Android share sheet), `@capacitor/app` (resume + back button)
- Fonts: Manrope (`@fontsource-variable/manrope`) and JetBrains Mono (`@fontsource/jetbrains-mono`), bundled — no Google Fonts request

## Dependency Managers
- `npm` via `package.json` (Vite 8, Vitest 4, Dexie 4, @vitest/coverage-v8, jsdom; Capacitor 8 core/android/cli, @capacitor/filesystem, @capacitor/app-launcher, @capgo/capacitor-health, @capgo/capacitor-social-login, @capacitor/app, @capacitor/share; @fontsource-variable/manrope, @fontsource/jetbrains-mono)
- Gradle 8.14 (wrapper) for `android/`, daemon on JDK 21

## Entry Surfaces
- `DOMContentLoaded` → `bootstrap()` in `src/main.js` (composition root)
- UI event handlers (bound in `src/main.js`):
  - Navigation (ST-025): one delegated document click listener from `createNavigator(doc).bind()` (`src/navigation.js`) — `[data-tab]` switches bottom tabs, `[data-go]` pushes a screen, `[data-back]` goes back; `onBackButton` (`src/platform/app-lifecycle.js`) hands the Android back button to `screens.back()` (closes an open `[data-overlay]` first, exits the app at the root); entering Settings runs `settingsUI.open()`; see `.context/flows/mobile-navigation.md`
  - `#auth-btn` (Settings › Connections) click → `connection.connect()` — Google sign-in on web, Health Connect permission in the app (from `src/platform/step-source.js`)
  - Auto-sync on connect: `connection.onConnected(...)` (first connect or silent restore) → dismisses the welcome screen and runs `syncTrigger.run()`
  - Silent session restore: on bootstrap `connection.restore()` (web: `google_connected` flag → silent token; app: already-granted Health Connect access)
  - `#sync-btn` (Today status line) click and pull-to-refresh on Today (`src/pull-to-refresh.js`) → `syncTrigger.run()` → `stepSync.sync()` then every data view re-renders via `_renderViews(dataViews(), 'sync')` (progress, streak, calendar month + week, challenge, analytics, gamification, odyssey) and the last-sync label
  - `#goal-select` (Today's goal chip) `change` → `goal.setActiveStepGoal()` then `streakUI`, `calendarUI`, `weekUI` re-render
  - `#calendar-view-switch` (`src/calendar-view-switch.js`) → shows `#calendar-week` / `#calendar-month`; switching to Week renders `weekUI`; tapping a week day → `calendarUI.openDay(day)` (same day sheet as Month)
  - `data:records:mutated` custom event → every data view plus `searchUI`, the Drive and file backup panels (fail-open `_renderViews(..., 'mutation')` in `src/main.js`)
  - `#tab-search` delegated click (`data-action`) → execute/reset/export-csv/export-json/edit-day/show-more (from `src/search-ui.js`)
  - `#settings-panel` delegated click/change (`data-action`, `data-field`) → prune / wipe / toggle-clear-all / change-home-base + auto-save anchor on date change (from `src/settings-ui.js`)
  - Backup & restore screen (`#tab-backup`, pushed from Settings) → `#storage-health-controls`, `#cloud-controls`, `#backup-controls` (from `src/storage-health-ui.js`, `src/drive-sync-ui.js`, `src/backup-ui.js`; see `.context/flows/backup-and-cloud-sync.md`)
  - `#db-status` pill click (only in the "⚠️ Backup Disabled" state) → `screens.go('backup')` (see `.context/flows/storage-health.md`)
  - First launch: `onboarding.start()` (`src/onboarding-ui.js`) after the first render — shows `#onboarding` while there is no data and it was never dismissed
  - `DOMContentLoaded` → `bootstrap()` also fires a fire-and-forget, PROD-gated, fail-open service-worker registration: `createSwRegister({ nav: navigator, config: { prod: import.meta.env.PROD } }).register()` (from `src/sw-register.js`, ST-013; see `.context/flows/pwa-offline-install.md`)
  - Browser Service Worker lifecycle (`install`/`activate`/`fetch`) on `public/sw.js`, registered at scope `/` — precaches the app shell, applies a mirrored `src/sw-policy.js` caching policy, network-first navigations, stale-while-revalidate for the GSI script (ST-013; see `.context/flows/pwa-offline-install.md`)
- `DOMContentLoaded` → `bootstrap()` renders the backup panels, `settingsUI`, then every data view plus `searchUI` (one `_renderViews` pass), then starts the welcome screen

## Implementation Areas
- Composition root / bootstrap: `src/main.js` (resolves `isNative` first, then the platform storage manager, file saver, and `{ source, connection }` via `selectStepSource`)
- Platform layer (ST-018/019): `src/platform/capabilities.js` (`isNativePlatform`), `files.js` (`createFileSaver` → web download / native Documents), `storage-manager.js` (`selectStorageManager` — browser `navigator` or always-persisted in the app), `step-source.js` (`selectStepSource` → Fit + Google connection on web, Health Connect + Health Connect connection in the app; `connectLabelFor`), `web/google-fit-connection.js` (connect / silent restore via the `google_connected` flag), `native/health-connect-connection.js` (permission request incl. history, Play Store link, restore-at-launch)
- Google auth per platform (ST-020): `src/platform/auth.js` (`selectAuth` — web `createAuth` or native), `src/platform/native/google-auth.js` (`createNativeGoogleAuth`, Drive-only, lazy SocialLogin plugin), `src/platform/google-connection.js` (shared connect/restore/flag logic used by the web header and the app's Drive panel), `src/platform/native/google-drive-connection.js`
- Sync trigger & app lifecycle (ST-021): `src/sync-trigger.js` (`createSyncTrigger` — `run()` / `runIfStale()` with a 10-min cooldown and silent readiness check via `stepSync.canSync()`), `src/platform/app-lifecycle.js` (`onAppResume` — Capacitor `resume` / `visibilitychange`)
- Primary device (ST-020): `src/primary-device.js` (`createPrimaryDevice` — `deviceId`, `otherPrimary({ localOnly })` fail-closed, `status()`, `makeThisPrimary()`); settings `getPrimaryDevice`/`setPrimaryDevice` (`PRIMARY_DEVICE_KEY`); `drive-sync.readPrimaryDevice()` + `appProperties` on upload
- Health Connect step source (ST-019): `src/health-connect-step-source.js` (`createHealthConnectStepSource(health, reporter)` — hourly `queryAggregated` sums grouped by local date, zero-fill, best-effort distance, `permission-denied` → `FAILURE_AUTH_EXPIRED`, other errors → `FAILURE_SOURCE_ERROR`)
- Auth/token state management: `src/auth.js` (`createAuth` factory — `init`, `requestToken(options)` where `{ prompt: '' }` is a silent restore, `getAccessToken`, `onTokenReceived`)
- Configuration validation: `src/config.js` (`VITE_CLIENT_ID` from `import.meta.env`)
- IndexedDB setup: `src/db.js` (`createDb`, `initDB` via Dexie; `DB_VERSION = 6`; v2 adds `goal_history` and seeds active goals; v3 backfills `effective_*`/`is_overridden`/`override` on legacy `daily_records` rows; v4 drops `goal_history`, seeds `active_step_goal` in `settings`; v5 seeds `sync_anchor_date = '2018-01-01'` in `settings`); v6 backfills `hourly_steps: null` on legacy `daily_records` rows (ST-009)
- Persistent storage request: `src/storage.js` (`requestPersistentStorage`)
- Screen navigation (ST-025): `src/navigation.js` (`TAB_SCREENS`, `SCREENS` registry with titles/parents, `createNavigator(doc, { onEnter, today, scrollTo })` → `go`/`back`/`current`/`bind`; replaces the removed `tabs.js`)
- Pull-to-refresh: `src/pull-to-refresh.js` (`createPullToRefresh(doc, { indicator, onRefresh, getScrollTop, isEnabled })`, `PULL_THRESHOLD_PX`)
- Line icons: `src/icons.js` (`createIcon(doc, name, { size })`, `ICON_NAMES`) — used instead of emoji in the interface
- First-launch welcome: `src/onboarding-ui.js` (`createOnboardingUI(doc, { storage, connection, sourceName, hasData, onRestore })` → `start`/`dismiss`/`isOpen`; `ONBOARDING_DONE_KEY`)
- Share adapter: `src/platform/share.js` (`selectShare({ isNative })` → Capacitor Share in the app, Web Share in a browser that has it, else `null`)
- UI status reporting: `src/ui-status.js` (`createStatusReporter`)
- Step data sources (ST-016): `src/step-source.js` (`StepSource` port, `assertStepSource`, `syncFailure`, `FAILURE_*`) and `src/fit-step-source.js` (`createFitStepSource` — the only module calling the Google Fit REST API: request bodies, retry/backoff, hourly pass, bucket parsing into `DayReading`s)
- Step sync engine: `src/steps.js` (`createStepSync(source, …)` factory; `sync()` orchestrator with two-segment windows, chunked `source.fetchDays`, `_toDailyRecords` (distance estimate when a source reports none), upsert, backfill latch; `_upsertChunk` high-water-marks `effective_*` as `max(stored, incoming)` on non-overridden rows while `original_*` tracks the raw cloud truth); (ST-009) the Fit source's parallel, independently-fallible 1-hour-bucket fetch (`HOURLY_BUCKET_MS = 3_600_000`) yields a 24-element `hourly_steps` array per record — see `.context/flows/historical-step-sync.md`
- Date utilities: `src/date-utils.js` (pure helpers: `_localDate`, `_addDaysUtc`; no DOM, no Dexie; extracted from `goal.js` and `streak.js`)
- Unit conversion constants: `src/units.js` (pure constants: `KM_TO_STEPS = 1312.33`; no imports; extracted from `goal.js`)
- Goal Commitment engine: `src/goal.js` (`createGoal` factory; `getActiveStepGoal`/`setActiveStepGoal`; persists `active_step_goal` row in Dexie `settings` store; exports `STEP_GOAL_OPTIONS = [4000, 6000, 8500, 10000]`, `STEP_GOAL_KM_HINTS = { 4000: 3, 6000: 5, 8500: 7, 10000: 8 }`, `DEFAULT_STEP_GOAL = 10000`; no km fields, no `goal_history` write)
- Streak calculation: `src/streak.js` (`createStreak` orchestration; `computeToleranceStreaks` — 100%/95%/99% windows with longest-compliant-window semantics; `ALLOWANCE_WINDOW_95 = 20`, `ALLOWANCE_WINDOW_99 = 100`, `NEAR_MISS_RATIO = 0.95` (near-miss bar for tolerance tiers); tier/HoF/lifetime calculations; scalar step-goal lens — no per-date goal history)
- Streak renderer: `src/streak-ui.js` (`createStreakUI` factory; `render()` fills five tiles of Today's progress panel — `#tile-strict` (Strict), `#tile-lifetime`, `#tile-tol99`, `#tile-tol95` (days + misses used), `#tile-best` (longest strict run at the active goal + year span); `_buildTiles(result)` is exported for tests)
- Progress computation: `src/progress.js` (pure functions: `getTodayRecord`, `computeProgress` — also returns today's `distance_km`)
- Today's progress panel renderer: `src/progress-ui.js` (`createProgressUI` factory; `render()` builds the heading with the goal chip (`#goal-select`, options "Goal 10k · ~8 km"), the SVG progress ring (`RING_CIRCUMFERENCE`) and "N steps to go" / "Goal met" into `#today-progress`, and fills `#tile-distance`)
- Calendar engine: `src/calendar.js` (`createCalendar(db, goal)` factory; pure functions: `monthBounds`, `buildMonthGrid`, `classifyDay(record, stepGoal, isFuture)`, `computeMonthlyAggregates`, `computeNavBounds`, `buildZeroState`, `computeCommitmentHitRate`; exports `EXCEEDED_RATIO = 1.5`, `CLASSIFICATION_*` constants; step-only classification, no km)
- Calendar renderer: `src/calendar-ui.js` (`createCalendarUI(doc, db, calendarEngine, reporter, records, processImage, monthOverview)` factory → `{ render, openDay }`; `render()` builds `#calendar-nav` (icon arrows + month/year selects), `#calendar-summary` (three tiles) and the month grid into `#calendar-month` (fallback `#tab-calendar`); the day sheet `#day-drawer` shows a steps headline, a goal chip (Goal hit / Missed goal / In progress for today), an hourly chart from `hourly_steps`, and the counted / synced rows; `openDay(day)` opens it for the Week view; override form + revert button injected into drawer when `records` is provided; override form and proof lightbox come from the shared `src/override-form.js`)
- Month overview renderer: `src/month-overview.js` (`createMonthOverview(doc, calendar, reporter)` factory; `render({ slot, payload, showTitle, showLegend, onDayClick, ... })` builds the heatmap tile grid; the Calendar uses it with no title and a legend; interactive tiles get an aria-label; `_formatSteps` truncates (9,982 → "9.9k"))
- Week engine + view (ST-025): `src/week.js` (`mondayOf`, `buildWeekDays`, `computeWeekNavBounds`, `formatWeekRange`, `computeWeekHits` — goal hits among finished days; `createWeek(db, goal)` → `loadWeek(weekStart)` / `buildZeroState`) + `src/calendar-week-ui.js` (`createCalendarWeekUI(doc, weekEngine, reporter, { onDayClick })` → range nav, three tiles, bar chart with goal line, day list into `#calendar-week`) + `src/calendar-view-switch.js` (`initCalendarViewSwitch(doc, { onChange })`)
- Record override/revert: `src/records.js` (`createRecords(db)` factory; `overrideRecord(date, params)` — writes `effective_steps`/`effective_distance_km`/`is_overridden`/`override`; `revertRecord(date)` — restores original synced values; never mutates `original_steps`/`original_distance_km`/`synced_at`)
- Proof-image processing: `src/image-processor.js` (`createImageProcessor(deps)` factory; `processImage(file)` — validates type/size, resizes to ≤1024 px, returns JPEG base64 data URL; `MAX_PROOF_IMAGE_PX`, `PROOF_IMAGE_QUALITY`, `MAX_PROOF_FILE_BYTES`, `ALLOWED_IMAGE_TYPES` constants)
- Shared override form / proof lightbox: `src/override-form.js` (`createOverrideForm(doc, records, processImage, reporter, { onViewProof, consolePrefix })` → `{ mount(container, { date, record }, { signal }) }`; builds the steps + mandatory-proof-image form, reuses an existing proof, dispatches `data:records:mutated` on save; `createProofLightbox(doc)` → `{ open(src, panel), close() }` — single-instance full-size proof overlay; extracted from `calendar-ui.js` so the calendar drawer and Search Lab both mount the same form)
- Search / filter engine: `src/search.js` (`createSearch(db)` factory — no `goal` collaborator; `executeQuery(filters)` — date-range / all-time Dexie query with AND-combined filters (steps, override status, target outcome vs. step target); `computeResultSummary(records, preFilterSet)`; pure export: `computeNearMisses(records, stepTarget)`, `NEAR_MISS_BAND_PCT = 10`)
- Search UI renderer: `src/search-ui.js` (`createSearchUI(doc, search, exporter, reporter, computeNearMisses, records, processImage)` factory; `render()` builds filter form, results grid, summary card, Near-Miss panel, and export controls into `#tab-search` (mobile order: collapsible `<details>` filters — folded after a search — summary strip, near misses, results paged 50 at a time with a Show more button, export); delegated `data-action` click dispatcher for execute/reset/export-csv/export-json/edit-day/show-more; missed-outcome rows get an `edit-day` button that mounts the shared override form; `render()` retains and re-runs the last executed query after a re-render (e.g. post-mutation) so results stay fresh instead of resetting)
- CSV/JSON exporter: `src/exporter.js` (`createExporter(fileSaver)` factory; `exportCsv(records)` / `exportJson(records)` — serialise `daily_records` to RFC-4180 CSV or pretty-printed JSON and save via the injected `FileSaver` (never rejects; failures logged); `CSV_HEADERS`, `EXPORT_FILENAME_PREFIX` constants; `_toExportRow`, `_csvCell`, `_toCsv`, `_toJson` pure helpers)
- Challenge engine: `src/challenge.js` (`createChallenge(db)` factory; `getActiveChallenge()` — reads `active_challenge` key from Dexie `settings` store; `setActiveChallenge(options)` — persists with `RangeError` guard when `end_date < start_date`, fail-open on DB write errors; `computeChallengeMetrics(challenge, records)` — pure function, "Latest Day" = today-1 while active or `end_date` once completed, plus cumulative total, elapsed/total days, avg pace; `formatChallengeUpdate(metrics, name)` — formats clipboard export text; `ACTIVE_CHALLENGE_KEY = 'active_challenge'`; see `.context/flows/group-challenge-tracker.md`)
- Challenge UI renderer: `src/challenge-ui.js` (`createChallengeUI(doc, challenge, db, reporter, { share })` factory; idempotent `render()` puts a summary card (`.challenge-summary`, `data-go="challenge"`: name, "Day N of M · avg X / day", progress bar) into `#today-challenge` and the full `#challenge-card` into `#challenge-detail`: title + range, pencil Edit button toggling the date config, four metric tiles, the update text (`formatChallengeUpdate`), Copy (clipboard) and — when `share` is provided — Share to group; AbortController-scoped delegated listener per render; fail-open)
- Settings engine: `src/settings.js` (`createSettings(db)` factory; `getSyncAnchorDate()` — reads `sync_anchor_date` from Dexie `settings` (fallback `DEFAULT_SYNC_ANCHOR = '2018-01-01'`); `setSyncAnchorDate(date)` — validates strict YYYY-MM-DD, clears the `BACKFILL_COMPLETE_KEY` latch, then persists; `countRecordsBefore(date)` — returns count of `daily_records` rows before date; `countAllRecords()` — returns total `daily_records` count (wipe impact preview); `pruneRecordsBefore(date)` — deletes those rows; `wipeDatabase()` — clears all `daily_records`, deletes `initial_backfill_complete`, resets `sync_anchor_date`; exports `SYNC_ANCHOR_KEY`, `DEFAULT_SYNC_ANCHOR`); `getHomeBaseCity()`/`setHomeBaseCity(city)` — read/write `home_base_city` in Dexie `settings`, validated against `src/odyssey.js`'s `HOME_BASE_CITIES` (ST-009)
- Settings UI renderer: `src/settings-ui.js` (`createSettingsUI(doc, settings, reporter, confirmFn)` factory → `{ render, open }`; `render()` builds grouped rows into `#settings-panel` on the Settings screen: Journey › Home city (`#home-base-city-select`), History › Track history from (`#settings-anchor-date`, auto-saved on change), Danger zone › erase-everything switch (`toggle-clear-all`), impact preview and the Delete days before … / Erase all data button; `open()` (run each time Settings is shown) loads the anchor date and refreshes the preview; injected `confirmFn` for prune/wipe; dispatches `data:records:mutated`). The Connections row (`#auth-btn`, `#step-source-name`), the Backup & restore row and `#app-version` are static markup in index.html
- Confirm adapter: `src/confirm.js` (`createConfirmAdapter(windowRef)` — returns a function delegating to `windowRef?.confirm?.(msg)`; injectable seam to replace `window.confirm` in tests)
- Analytics Lab engine + renderer: `src/analytics.js` (pure: `computeLifetimeMetrics`, `computeTopRecords`, `computeDayOfWeekDistribution`, `computeHourlyDistribution`, `computeYearlyMonthlyComparison`; `computeInsights(records, goal, year?)`, `extractYears`; `createAnalytics(db)` factory `compute()` — also returns `activeStepGoal` and `years`) + `src/analytics-ui.js` (`createAnalyticsUI(doc, engine, reporter, proofLightbox=null)` → the Insights screen in `#lab-analytics`: All time / per-year range switch, Hall of fame, Top days list, By weekday, Time of day, Monthly totals (horizontal bars)); ST-009, ST-025; see `.context/flows/analytics-lab-dashboard.md`
- Gamification engine + renderer: `src/gamification.js` (`LEVEL_RANKS` 50-entry ladder, `computeXP`, `computeLevel`, `evaluateAchievements` — Centurion/Marathoner/Unstoppable/Night Owl trophies; `createGamification(db)` factory `compute()`, persists `achievements` in `settings`) + `src/gamification-ui.js` (`createGamificationUI(doc, engine, reporter)` → level card (LVL badge, rank, progress, XP) + "Trophies · N of 4 earned" grid with line icons into `#lab-gamification` on the Journey screen); ST-009, ST-025; see `.context/flows/gamification-levels-trophies.md`
- Odyssey engine + renderer: `src/odyssey.js` (pure: `HOME_BASE_CITIES` 7-city catalogue, `MILESTONES` 6-leg route, `computeOdysseyProgress(totalDistanceKm)`) + `src/odyssey-ui.js` (`createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter)` → the expedition as a vertical route (home base, then each destination with the line into it filled to progress) into `#lab-odyssey` on the Journey screen, reusing `analyticsEngine.compute().lifetimeMetrics.totalDistanceKm`); ST-009; see `.context/flows/odyssey-virtual-expedition.md`
- UI structure: `index.html` (ST-025 mobile shell — see Top-Level Layout)
- Presentation: `styles.css` (ST-025: Deep Blue tokens unchanged + `--accent-red`, layout tokens `--tap`, `--safe-top/bottom`, `--bottom-nav-h`; `[hidden]` wins; app bar, bottom nav, segmented control, list groups, stat tiles, ring, heatmap, week chart, bottom sheet, Insights charts, Journey route, Search, Settings, Backup panels, onboarding; reduced-motion aware; `src/styles.test.js` checks every emitted class has a rule)
- DB schema migrations: `src/db.js` (Dexie `DB_VERSION = 6`; v2 adds `goal_history` and seeds active goals; v3 backfills `effective_*`/`is_overridden`/`override` on legacy `daily_records` rows; v4 drops `goal_history`, seeds `active_step_goal` in `settings`; v5 seeds `sync_anchor_date = '2018-01-01'` in `settings`); v6 backfills `hourly_steps: null` on legacy `daily_records` rows (ST-009)
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
- Unit tests: `src/*.test.js` (Vitest 4, jsdom) — auth, config, db, storage, navigation, pull-to-refresh, icons, week, calendar-week-ui, calendar-view-switch, onboarding-ui, platform/share, ui-status, main, steps, styles, docs, goal, progress, progress-ui, streak, streak-ui, calendar, calendar-ui, month-overview, records, image-processor, override-form, search, search-ui, exporter, date-utils, units, challenge, challenge-ui, settings, settings-ui, confirm, analytics, analytics-ui, gamification, gamification-ui, odyssey, odyssey-ui, backup, backup-ui, backup-format, drive-sync, drive-sync-ui, storage-health, storage-health-ui, sw-policy, sw-register, manifest, pwa-sanity, index (manifest link/theme-color assertions)
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
| Android web build | `npm run build:native` | scripts.build:native = `vite build --mode native` |
| Android sync | `npm run cap:sync` | `build:native` + `cap sync android` |
| Android open / run | `npm run android:open` / `npm run android:run` | `cap open android` / `cap:sync` + `cap run android` |
| Android icons | `npm run android:assets` | `scripts/generate-android-assets.sh` |
| Debug APK | `cd android && ./gradlew assembleDebug` | see `docs/plans/android-release.md` |
| lint | Not found | no eslint/prettier config detected |
| typecheck | Not found | no TypeScript config detected |

## Interface Contracts & Specs
- OpenAPI/Swagger/AsyncAPI/proto/GraphQL/JSON schema: Not found

## Deployment Manifests
- Kubernetes/Helm/Kustomize/Serverless manifests: Not found

## Scripts & Automation
- `scripts/generate-android-assets.sh` — regenerates Android launcher icons and splash images (macOS `sips`)
- `scripts/native-html.js` — Vite plugin for the native build (strips the PWA manifest link)

## Documentation Index
- `README.md`
- `.env.example` (template for `.env.local`)
- `.arcus/plans/PRD.md` (extended product blueprint)

## Commit Convention
- Preferred format: `conventional-commit(scope): message`
- Example: `feat(ST-025): mobile redesign — bottom navigation, Today panel, Calendar week view`
