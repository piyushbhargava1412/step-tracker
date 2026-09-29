# Flow: Insights (was Analytics Lab) — Hall of Fame, Top Days, Distributions & Monthly Totals

> Added: ST-009 — 2026-09-08

<!-- context-meta
verification-commit: HEAD
generated-at: 2026-09-28T17:00:00Z
confidence: medium
-->

## Overview
The **Insights** bottom tab (`#lab-analytics` inside `#tab-insights`; the analytics half of the old
Lab tab, ST-025) is a pure read-only compute-and-render pair: `src/analytics.js` derives five independent metrics/views from the full
`daily_records` table (lifetime totals + longest streak, top-5 days, day-of-week distribution,
24-hour distribution, and a year-selectable monthly breakdown), and `src/analytics-ui.js` renders
them under an **All time / per-year range switch** as: Hall of fame tiles, a ranked Top days list
(with an optional proof-image button), By weekday and Time of day bar charts, and Monthly totals
(horizontal bars; a year `<select>` in All time).

## Entry Points
- **Type**: App lifecycle (browser) — automatic on load / after sync / after data mutation
  - `DOMContentLoaded` → `bootstrap()` → `analyticsUI.render()`
  - After `stepSync.sync()` completes → `analyticsUI.render()`
  - `data:records:mutated` custom event → `analyticsUI.render()`
- **Type**: UI Event (browser)
  - `.insights-range [data-range]` click → re-draws every section for "All time" or that year from the cached result (no re-fetch)
  - `#lab-analytics` → `[data-action="open-proof"]` click (Top days row, camera icon button) → `proofLightbox.open(record)` (only rendered when a `proofLightbox` collaborator is injected AND the record carries `screenshot_proof`)
  - `#lab-analytics` → `[data-action="change-year"]` change (yearly section `<select>`) → rebuilds only the monthly bar chart for the selected year from the cached record set (no re-fetch)
- **File**: `src/analytics-ui.js` (renderer), `src/analytics.js` (pure engine + `createAnalytics(db)` factory), `src/main.js` (wiring)

## Core Path
1. `createAnalytics(db).compute()` reads `db.daily_records.toArray()` and `db.settings.get('active_step_goal')` in parallel (fallback `DEFAULT_STEP_GOAL` from `src/config.js` when the setting is absent), then runs five pure functions over the records and returns `{ records, lifetimeMetrics, topRecords, dayOfWeek, hourly, yearlyMonthly }`. Any read error is logged (`console.error('[analytics]', err)`) and rethrown — `compute()` never fails silently. It also returns `activeStepGoal` and `years` (years with data, newest first, via `extractYears`).
2. `computeLifetimeMetrics(records, activeStepGoal)` sums `effective_steps`/`effective_distance_km` and computes `dailyAverage`; `longestStreak` **delegates to `computeHallOfFame`** (from `src/streak.js`) rather than re-implementing streak logic, reporting the best-ever historical run at the active goal — deliberately distinct from `computeToleranceStreaks.actual` (the dashboard's in-progress "Actual" streak), which resets on the first missed day and is not a lifetime-best metric.
3. `computeTopRecords(records, n=5)` sorts a shallow copy descending by `effective_steps` and slices the top N.
4. `computeDayOfWeekDistribution(records)` buckets by ISO weekday (0=Monday…6=Sunday, converted from a component-built `new Date(y, m-1, d).getDay()` — never `new Date(dateStr)`, which UTC-parses the string and rolls the weekday back by one in timezones west of UTC), averages per slot, and picks `powerDay`/`lazyDay` with lowest-index-wins tie-breaking.
5. `computeHourlyDistribution(records)` sums `hourly_steps` (a 24-element array populated by the Historical Step Sync flow's hourly fetch — see `.context/flows/historical-step-sync.md`) across all records; rows with `null` or non-24-element `hourly_steps` are skipped; returns a 24-element zero array when no valid rows exist.
6. `computeYearlyMonthlyComparison(records, year)` filters by year prefix and zero-fills the 12 months.
6a. `computeInsights(records, activeStepGoal, year?)` (ST-025) runs steps 2–5 over all records or one calendar year — used when the range switch picks a year.
7. `createAnalyticsUI(doc, engine, reporter, proofLightbox=null).render()` resolves `#lab-analytics`, calls `engine.compute()` once and draws from the cached result: the range switch (`.segmented.insights-range[role=tablist]`, "All time" + each year; a year that no longer has data falls back to All time), then five `.card.insights-section`s — Hall of fame (Total steps, Distance, Daily average, Longest streak), Top days (`ol.rank-list`, date "5 May 2025", steps, km; proof button labelled "View proof for …" only with a lightbox and `screenshot_proof`), By weekday ("Tuesday is your strongest day · Sunday your quietest", peak/low bars highlighted), Time of day ("Most steps land around 6 pm", 24 bars without value labels, tick row; empty message when every hour is zero), Monthly totals (`.hbar` rows; a year `<select>` in All time, fixed to the chosen year otherwise). "All time" uses the engine's figures; a year uses `computeInsights`. An empty `daily_records` table renders a single empty-state message.
8. The vertical charts share `_buildBarChart(values, labels, names, unit, { showValues })` — heights against `Math.max(...values, 1)` (never `/0`), each bar `role="img"` with an `aria-label`; weekday bars also show compact values ("10.3k").
9. A render failure (thrown by `engine.compute()`) is caught: logged via `console.error('[analytics-ui]', err)`, `reporter.db('⚠️ Could not render Analytics')`, and an error `<p>` replaces the panel contents — `render()` never throws.

## Data Touchpoints
- **Entities**: `daily_records` (`date`, `effective_steps`, `effective_distance_km`, `hourly_steps`, `screenshot_proof`); `settings` row `key = 'active_step_goal'` (read-only, for the streak-goal input to `computeHallOfFame`)
- **Tables**: `daily_records` (Dexie, read-only); `settings` (Dexie, read-only). No new table, no writes.
- **UI Surface**: `#lab-analytics` inside `#tab-insights`; errors surfaced via `reporter.db()` → a toast (ST-027).

## Integrations
- None — entirely local (Dexie IndexedDB reads only, no network).

## Error / Retry Surface
- `compute()` DB-read failure: logged (`console.error('[analytics]', err)`) and rethrown — no fail-open at the engine layer.
- `render()` catches the rethrown error: `console.error('[analytics-ui]', err)`, `reporter.db('⚠️ Could not render Analytics')`, error `<p>` replaces the panel — never throws further.
- Fail-open at bootstrap/post-sync/post-mutation: `src/main.js` renders through `_renderViews`, which logs `[main] analyticsUI.render failed[ after <context>], continuing` and carries on.

## Scope
- `src/analytics.js` — pure engine (`computeLifetimeMetrics`, `computeTopRecords`, `computeDayOfWeekDistribution`, `computeHourlyDistribution`, `computeYearlyMonthlyComparison`, `computeInsights`, `extractYears`) + `createAnalytics(db)` factory (`compute()`)
- `src/analytics-ui.js` — `createAnalyticsUI(doc, engine, reporter, proofLightbox=null)` → `{ render() }`
- `src/main.js` — composition-root wiring (bootstrap render, post-sync render, `data:records:mutated` re-render)
- `styles.css` — `.insights-section`, `.hof-grid`/`.hof-tile*`, `.rank-list*`, `.bar-chart*`, `.chart-ticks`, `.hbar*`, `.segmented--scroll`

## Tests
- `src/analytics.test.js` — all five pure functions in isolation (tie-breaking, zero-fill, skip-invalid-row rules) plus `createAnalytics` factory (result shape, fallback goal, DB-error rethrow + `[analytics]` log prefix).
- `src/analytics-ui.test.js` — render sections, empty state, proof-button gating, year-select rebuild, error fallback.

## Notes
- `computeHourlyDistribution` and the 24-hour chart depend on the `hourly_steps` field introduced by the
  Historical Step Sync flow's parallel hourly-bucket fetch (Dexie `DB_VERSION = 6`); records synced
  before that migration read as `null` and are skipped rather than treated as zero-filled data.
- The Odyssey flow (`.context/flows/odyssey-virtual-expedition.md`) reuses this engine's
  `lifetimeMetrics.totalDistanceKm` rather than duplicating a distance-summation loop.
- `hourly_steps` is indexed by **local** wall-clock hour (`_normalizeHourlyBuckets` in `src/steps.js`
  uses `.getHours()`, not `.getUTCHours()`) — the 24-hour chart must read the same local-clock lens the
  user experiences, or every hour renders shifted by the timezone offset.
