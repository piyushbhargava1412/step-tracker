# Flow: Search Lab — Filter & Export Daily Records

<!-- context-meta
verification-commit: 6265017b37bb8c1814caae37c1598b42ea75c380
generated-at: 2026-08-11T08:00:00Z
confidence: medium
-->

## Overview
`src/search.js` and `src/search-ui.js` implement a client-side search and filter lab over the local
Dexie `daily_records` table. The user applies AND-combined filters (date range, step bounds, distance
floor, override status, goal-target outcome), executes a query, views a results grid and summary
card, and optionally downloads the filtered records as RFC-4180 CSV or pretty-printed JSON via
`src/exporter.js`. The entire flow is browser-only with no network calls.

## Entry Points
- **Type**: UI Event (browser) / Bootstrap render
- **Path/Topic**:
  - `DOMContentLoaded` → `bootstrap()` → `searchUI.render()` (initial mount of the search panel into `#tab-search`)
  - `#tab-search` delegated click on `[data-action="execute"]` → filter query + grid/summary update
  - `#tab-search` delegated click on `[data-action="reset"]` → clear filters + grid/summary
  - `#tab-search` delegated click on `[data-action="export-csv"]` → download filtered records as CSV
  - `#tab-search` delegated click on `[data-action="export-json"]` → download filtered records as JSON
- **File**: `src/search-ui.js` (UI renderer), `src/search.js` (engine), `src/exporter.js` (download), `src/main.js` (wiring)

## Core Path
1. `bootstrap()` in `src/main.js` instantiates `createSearch(db, goal)`, `createExporter(doc)`, and
   `createSearchUI(doc, search, exporter, reporter)`, then calls `searchUI.render()` (fail-open).
2. `render()` mounts four `.card` children into `#tab-search`: `.search-filters` (filter form),
   `.search-results-table` (results grid), `.search-summary` (aggregate stats), and `.export-controls`
   (CSV/JSON buttons). A single `AbortController`-scoped delegated click listener handles all actions.
3. **Execute**: `_handleExecute(panel)` reads all `[data-field]` inputs, passes the filters object to
   `search.executeQuery(filters)`, then calls `search.computeResultSummary(records, preFilterSet)`.
   Results are rendered into the grid (one `[data-row]` div per record with `[data-cell]` spans) and
   the summary card (`.summary-cell` divs). `currentRecords` is stored in closure for subsequent
   export actions.
4. **Query engine** (`createSearch.executeQuery`): if `startDate`+`endDate` are both present, uses
   `db.daily_records.where('date').between(start, end, true, true).toArray()` (Dexie index range);
   otherwise `db.daily_records.toArray()` (full scan). Loads `db.goal_history` and
   `goal.getActiveGoal()` once, builds an effective goal history via `buildEffectiveGoalHistory` and
   `_prepareGoalHistory` from `src/goal-history.js`, then applies AND-combined JS filters. Returns
   `{ records: [...sorted newest-first], preFilterSet: [...raw] }`.
5. **Reset**: clears all `[data-field]` values, nulls `currentRecords`, empties the grid, resets the
   summary to zero-state.
6. **Export CSV/JSON**: guards `currentRecords` non-null and non-empty, then delegates to
   `exporter.exportCsv(currentRecords)` or `exporter.exportJson(currentRecords)`.
7. `createExporter(doc)` serialises records through `_toExportRow` (maps DB fields to CSV-header-keyed
   object), then `_toCsv` (RFC-4180, with `_csvCell` quoting) or `_toJson` (JSON.stringify with
   indent 2). Downloads via a temporary `<a href=blobURL download=filename>` click; `URL.revokeObjectURL`
   is always called in a `finally` block.

## Data Touchpoints
- **Entities**: `daily_records` rows (`date`, `effective_steps`, `effective_distance_km`,
  `is_overridden`, `override.note`); `goal_history` rows; `settings.active_goal` (via `goal.getActiveGoal()`)
- **Tables**: `daily_records` (Dexie, read-only in this flow), `goal_history` (Dexie, read-only), `settings` (Dexie, read via `goal.getActiveGoal()`)
- **UI Surface**: `#tab-search` panel — `.search-filters`, `.search-results-table`, `.search-summary`, `.export-controls`; errors surfaced via `reporter.db()` → `#db-status`

## Integrations
- No external network calls. All data is read from local Dexie IndexedDB.
- Browser File Download API: `Blob`, `URL.createObjectURL`, `URL.revokeObjectURL`, `<a>.click()`.

## Error / Retry Surface
- `executeQuery` rejects on Dexie error; `_handleExecute` catches, logs `console.error('[search]', err)`, calls `reporter.db('❌ Search query failed')`, nulls `currentRecords`, and renders an empty grid (fail-open, no crash).
- Export actions are no-ops when `currentRecords` is null or empty (guard clause).
- `_triggerDownload` wraps the anchor click in try/catch; `URL.revokeObjectURL` is always called in `finally`.
- Missing `#tab-search` element: `render()` logs `console.warn` and returns (no throw).

## Scope
- `src/search.js` — query engine (`createSearch(db, goal)` factory; `executeQuery`, `computeResultSummary`)
- `src/search-ui.js` — panel renderer (`createSearchUI(doc, search, exporter, reporter)` factory; `render()`)
- `src/exporter.js` — download seam (`createExporter(doc)` factory; `exportCsv`, `exportJson`; pure helpers `_toExportRow`, `_csvCell`, `_toCsv`, `_toJson`)
- `src/main.js` — composition-root wiring

## Tests
- `src/search.test.js` — executeQuery (date-range vs all-time, all filter combinations, result sort, DB error propagation, null/undefined filters), computeResultSummary (count/matchPct/avgSteps, divide-by-zero, non-finite distance).
- `src/search-ui.test.js` — render skeleton, idempotent re-render, AbortController lifecycle, all data-action handlers, textContent-only contract (no innerHTML), error path, stale-data guard after query failure.
- `src/exporter.test.js` — pure serialisation helpers, CSV/JSON parity, RFC-4180 quoting, download seam (Blob type/content, anchor href/download/click, revokeObjectURL finally path, error logging).

## Notes
- `src/search.js` is a pure engine: no DOM imports, no `document` or `window` references. Enforced by `src/search.test.js` source-text assertion.
- `src/search-ui.js` uses no `innerHTML` assignments; all DOM mutations are via `createElement`/`textContent`/`appendChild`. Enforced by `src/search-ui.test.js` source-text assertion.
- Export filename is timezone-safe: uses `_localDate()` (imported from `src/goal.js`), never `Date#toISOString()`. Enforced by `src/exporter.test.js` source-text assertion.
