# Flow: Search Lab — Filter & Export Daily Records

<!-- context-meta
verification-commit: a4e9d6fd1aeaab215e9ad706d637b8816f346474
generated-at: 2026-08-12T06:00:00Z
confidence: high
-->

## Overview
`src/search.js` and `src/search-ui.js` implement a client-side search and filter lab over the local
Dexie `daily_records` table. The user applies AND-combined filters (date range, step bounds,
override status, goal-target outcome, **step target** for Near-Miss analysis), executes a query,
views a results grid and summary card, optionally inspects Near-Miss days, and downloads the
filtered records as RFC-4180 CSV or pretty-printed JSON via `src/exporter.js`. The entire flow is
browser-only with no network calls.

## Entry Points
- **Type**: UI Event (browser) / Bootstrap render
- **Path/Topic**:
  - `DOMContentLoaded` → `bootstrap()` → `searchUI.render()` (initial mount of the search panel into `#tab-search`)
  - `#tab-search` delegated click on `[data-action="execute"]` → filter query + grid/summary + optional Near-Miss update
  - `#tab-search` delegated click on `[data-action="reset"]` → clear filters + grid/summary
  - `#tab-search` delegated click on `[data-action="export-csv"]` → download filtered records as CSV
  - `#tab-search` delegated click on `[data-action="export-json"]` → download filtered records as JSON
- **File**: `src/search-ui.js` (UI renderer), `src/search.js` (engine + Near-Miss), `src/exporter.js` (download), `src/main.js` (wiring)

## Core Path
1. `bootstrap()` in `src/main.js` instantiates `createSearch(db)` (no `goal` collaborator),
   `createExporter(doc)`, and `createSearchUI(doc, search, exporter, reporter, computeNearMisses)`,
   then calls `searchUI.render()` (fail-open).
2. `render()` mounts four `.card` children into `#tab-search`: `.search-filters` (filter form),
   `.search-results-table` (results grid), `.search-summary` (aggregate stats), `.near-miss-panel`
   (Near-Miss results panel, initially empty), and `.export-controls` (CSV/JSON buttons).
   A single `AbortController`-scoped delegated click listener handles all actions.
3. **Execute**: `_handleExecute(panel)` reads all `[data-field]` inputs — including the optional
   `step-target` number field — and passes the filters object to `search.executeQuery(filters)`,
   then calls `search.computeResultSummary(records, preFilterSet)`. If `computeNearMisses` is
   injected and `filters.stepTarget` is finite, `computeNearMisses(preFilterSet, filters.stepTarget)`
   is called and the result rendered into `.near-miss-panel`. Results grid and summary card are
   also updated. `currentRecords` is stored in closure for subsequent export actions.
4. **Query engine** (`createSearch(db).executeQuery`): if `startDate`+`endDate` are both present,
   uses `db.daily_records.where('date').between(start, end, true, true).toArray()` (Dexie index
   range); otherwise `db.daily_records.toArray()` (full scan). Applies AND-combined JS filters
   (steps bounds, override status, target outcome vs. `stepTarget`). Returns
   `{ records: [...sorted newest-first], preFilterSet: [...raw] }`. Does **not** load `goal_history`
   or call `goal.getActiveGoal()` — the `goal` collaborator was removed in ST-007a.
5. **Near-Miss engine** (`computeNearMisses` from `src/search.js`): pure export beside the factory
   (not inside the `createSearch` closure). Signature: `computeNearMisses(records, stepTarget)`.
   Uses `NEAR_MISS_BAND_PCT = 10` — days where `steps >= stepTarget * 0.9 && steps < stepTarget`.
   Returns `{ count, days: [{ date, steps, shortfall }] }`.
6. **Reset**: clears all `[data-field]` values, nulls `currentRecords`, empties the grid, resets the
   summary to zero-state, clears the Near-Miss panel.
7. **Export CSV/JSON**: guards `currentRecords` non-null and non-empty, then delegates to
   `exporter.exportCsv(currentRecords)` or `exporter.exportJson(currentRecords)`.
8. `createExporter(doc)` serialises records through `_toExportRow` (maps DB fields to CSV-header-keyed
   object), then `_toCsv` (RFC-4180, with `_csvCell` quoting) or `_toJson` (JSON.stringify with
   indent 2). Downloads via a temporary `<a href=blobURL download=filename>` click; `URL.revokeObjectURL`
   is always called in a `finally` block.

## Data Touchpoints
- **Entities**: `daily_records` rows (`date`, `effective_steps`, `effective_distance_km`,
  `is_overridden`, `override.note`); `settings.active_step_goal` is **not** read by `search.js`.
- **Tables**: `daily_records` (Dexie, read-only in this flow). No `goal_history` table — dropped at DB_VERSION 4.
- **UI Surface**: `#tab-search` panel — `.search-filters`, `.search-results-table`, `.search-summary`, `.near-miss-panel`, `.export-controls`; errors surfaced via `reporter.db()` → `#db-status`

## Integrations
- No external network calls. All data is read from local Dexie IndexedDB.
- Browser File Download API: `Blob`, `URL.createObjectURL`, `URL.revokeObjectURL`, `<a>.click()`.

## Error / Retry Surface
- `executeQuery` rejects on Dexie error; `_handleExecute` catches, logs `console.error('[search]', err)`, calls `reporter.db('❌ Search query failed')`, nulls `currentRecords`, and renders an empty grid (fail-open, no crash).
- Export actions are no-ops when `currentRecords` is null or empty (guard clause).
- `_triggerDownload` wraps the anchor click in try/catch; `URL.revokeObjectURL` is always called in `finally`.
- Missing `#tab-search` element: `render()` logs `console.warn` and returns (no throw).

## Scope
- `src/search.js` — query engine (`createSearch(db)` factory; `executeQuery`, `computeResultSummary`); Near-Miss pure export: `computeNearMisses`, `NEAR_MISS_BAND_PCT`
- `src/search-ui.js` — panel renderer (`createSearchUI(doc, search, exporter, reporter, computeNearMisses)` factory; `render()` builds filter form, results grid, summary card, Near-Miss panel, and export controls into `#tab-search`; delegated `data-action` click dispatcher for execute/reset/export-csv/export-json)
- `src/exporter.js` — download seam (`createExporter(doc)` factory; `exportCsv(records)` / `exportJson(records)` — serialise `daily_records` to RFC-4180 CSV or pretty-printed JSON and trigger a `<a download>` click; `CSV_HEADERS`, `EXPORT_FILENAME_PREFIX` constants; `_toExportRow`, `_csvCell`, `_toCsv`, `_toJson` pure helpers)
- `src/main.js` — composition-root wiring; passes `computeNearMisses` to `createSearchUI`

## Tests
- `src/search.test.js` — executeQuery (date-range vs all-time, all filter combinations, result sort, DB error propagation, null/undefined filters), computeResultSummary (count/matchPct/avgSteps, divide-by-zero, non-finite distance), computeNearMisses (band calculation, zero/empty, shortfall values).
- `src/search-ui.test.js` — render skeleton, idempotent re-render, AbortController lifecycle, all data-action handlers, Near-Miss panel render/empty state, textContent-only contract (no innerHTML), error path, stale-data guard after query failure.
- `src/exporter.test.js` — pure serialisation helpers, CSV/JSON parity, RFC-4180 quoting, download seam (Blob type/content, anchor href/download/click, revokeObjectURL finally path, error logging).

## Notes
- `src/search.js` is a pure engine: no DOM imports, no `document` or `window` references. Enforced by `src/search.test.js` source-text assertion.
- `src/search-ui.js` uses no `innerHTML` assignments; all DOM mutations are via `createElement`/`textContent`/`appendChild`. Enforced by `src/search-ui.test.js` source-text assertion.
- Export filename is timezone-safe: uses `_localDate()` (imported from `src/date-utils.js`), never `Date#toISOString()`. Enforced by `src/exporter.test.js` source-text assertion.
- The `createSearch(db, goal)` signature was **changed to `createSearch(db)`** in ST-007a — the `goal` collaborator (used to resolve per-date goal history) was removed when `goal_history` was dropped. The Min Distance filter was also removed; filters now operate on step counts only.
