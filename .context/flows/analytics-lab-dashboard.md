# Flow: Analytics Lab — Hall of Fame, Top Days, Distributions & Yearly Breakdown

> Added: ST-009 — 2026-09-08

<!-- context-meta
verification-commit: c804588e515abd1e2b6ebf32151d813077e71215
generated-at: 2026-09-10T13:48:00Z
confidence: medium
-->

## Overview
The 🧪 Lab tab's Analytics section (`#lab-analytics` inside `#tab-lab`) is a pure read-only
compute-and-render pair: `src/analytics.js` derives five independent metrics/views from the full
`daily_records` table (lifetime totals + longest streak, top-5 days, day-of-week distribution,
24-hour distribution, and a year-selectable monthly breakdown), and `src/analytics-ui.js` renders
them as a Hall of Fame tile grid, a Top Days table (with an optional proof-image lightbox), and two
pure-CSS bar charts (day-of-week and hourly), plus a year `<select>` that swaps the monthly chart.

## Entry Points
- **Type**: App lifecycle (browser) — automatic on load / after sync / after data mutation
  - `DOMContentLoaded` → `bootstrap()` → `analyticsUI.render()`
  - After `stepSync.sync()` completes → `analyticsUI.render()`
  - `data:records:mutated` custom event → `analyticsUI.render()`
- **Type**: UI Event (browser)
  - `#lab-analytics` → `[data-action="open-proof"]` click (Top Days table row) → `proofLightbox.open(record)` (only rendered when a `proofLightbox` collaborator is injected AND the record carries `screenshot_proof`)
  - `#lab-analytics` → `[data-action="change-year"]` change (yearly section `<select>`) → rebuilds only the monthly bar chart for the selected year from the cached record set (no re-fetch)
- **File**: `src/analytics-ui.js` (renderer), `src/analytics.js` (pure engine + `createAnalytics(db)` factory), `src/main.js` (wiring)

## Core Path
1. `createAnalytics(db).compute()` reads `db.daily_records.toArray()` and `db.settings.get('active_step_goal')` in parallel (fallback `DEFAULT_STEP_GOAL` from `src/config.js` when the setting is absent), then runs five pure functions over the records and returns `{ records, lifetimeMetrics, topRecords, dayOfWeek, hourly, yearlyMonthly }`. Any read error is logged (`console.error('[analytics]', err)`) and rethrown — `compute()` never fails silently.
2. `computeLifetimeMetrics(records, activeStepGoal)` sums `effective_steps`/`effective_distance_km` and computes `dailyAverage`; `longestStreak` **delegates to `computeHallOfFame`** (from `src/streak.js`) rather than re-implementing streak logic, reporting the best-ever historical run at the active goal — deliberately distinct from `computeToleranceStreaks.actual` (the dashboard's in-progress "Actual" streak), which resets on the first missed day and is not a lifetime-best metric.
3. `computeTopRecords(records, n=5)` sorts a shallow copy descending by `effective_steps` and slices the top N.
4. `computeDayOfWeekDistribution(records)` buckets by ISO weekday (0=Monday…6=Sunday, converted from a component-built `new Date(y, m-1, d).getDay()` — never `new Date(dateStr)`, which UTC-parses the string and rolls the weekday back by one in timezones west of UTC), averages per slot, and picks `powerDay`/`lazyDay` with lowest-index-wins tie-breaking.
5. `computeHourlyDistribution(records)` sums `hourly_steps` (a 24-element array populated by the Historical Step Sync flow's hourly fetch — see `.context/flows/historical-step-sync.md`) across all records; rows with `null` or non-24-element `hourly_steps` are skipped; returns a 24-element zero array when no valid rows exist.
6. `computeYearlyMonthlyComparison(records, year)` filters by year prefix and zero-fills the 12 months.
7. `createAnalyticsUI(doc, engine, reporter, proofLightbox=null).render()` aborts any prior `AbortController`, resolves `#lab-analytics`, calls `engine.compute()`, and — when records exist — `replaceChildren()`s five sections in order: Hall of Fame (`<dl>` tile grid), Top Days table (proof button only when `proofLightbox` is injected and the row has `screenshot_proof`), day-of-week bar chart + power/lazy-day caption, 24-hour bar chart (descriptive empty message instead of a chart when every hour is zero), and the yearly section (year `<select>` defaulting to the current year if present else the most-recent year with data, plus a monthly bar chart rebuilt in-place on `change`). An empty `daily_records` table renders a single empty-state message instead.
8. All bar charts share one generic `_buildBarChart(values, labels, unit)` builder — proportional `<div>` widths against `Math.max(...values, 1)` (never `/0`), each bar carrying an `aria-label` **and** a visible `.bar-chart__value` number label above it (the aria-label alone left every histogram numberless for sighted users).
9. A render failure (thrown by `engine.compute()`) is caught: logged via `console.error('[analytics-ui]', err)`, `reporter.db('⚠️ Could not render Analytics')`, and an error `<p>` replaces the panel contents — `render()` never throws.

## Data Touchpoints
- **Entities**: `daily_records` (`date`, `effective_steps`, `effective_distance_km`, `hourly_steps`, `screenshot_proof`); `settings` row `key = 'active_step_goal'` (read-only, for the streak-goal input to `computeHallOfFame`)
- **Tables**: `daily_records` (Dexie, read-only); `settings` (Dexie, read-only). No new table, no writes.
- **UI Surface**: `#lab-analytics` inside `#tab-lab`; errors surfaced via `reporter.db()` → `#db-status`.

## Integrations
- None — entirely local (Dexie IndexedDB reads only, no network).

## Error / Retry Surface
- `compute()` DB-read failure: logged (`console.error('[analytics]', err)`) and rethrown — no fail-open at the engine layer.
- `render()` catches the rethrown error: `console.error('[analytics-ui]', err)`, `reporter.db('⚠️ Could not render Analytics')`, error `<p>` replaces the panel — never throws further.
- Fail-open at bootstrap/post-sync/post-mutation: every `src/main.js` call site wraps `analyticsUI.render()` in its own `try/catch` (`console.error('[main] analyticsUI.render failed, continuing', err)`).

## Scope
- `src/analytics.js` — pure engine (`computeLifetimeMetrics`, `computeTopRecords`, `computeDayOfWeekDistribution`, `computeHourlyDistribution`, `computeYearlyMonthlyComparison`) + `createAnalytics(db)` factory (`compute()`)
- `src/analytics-ui.js` — `createAnalyticsUI(doc, engine, reporter, proofLightbox=null)` → `{ render() }`
- `src/main.js` — composition-root wiring (bootstrap render, post-sync render, `data:records:mutated` re-render)
- `styles.css` — `.hof-grid`, `.bar-chart`/`.bar-chart__bar`/`.bar-chart__value` (shared with Gamification's RPG progress bar styling area), Lab panel section styles

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
