# Flow: Settings — Sync Horizon & Data Management

> Added: ST-015 — 2026-08-13

<!-- context-meta
verification-commit: 889018e
generated-at: 2026-08-13T00:00:00Z
confidence: medium
-->

## Overview
The Settings modal lets the user configure the sync anchor date (how far back Google Fit history
is fetched) and manage local data — pruning records before a chosen date or wiping the entire
database. The engine (`src/settings.js`) is pure Dexie; the DOM-writer (`src/settings-ui.js`)
owns `#settings-modal` exclusively; `src/confirm.js` provides an injectable confirm seam. All
mutations dispatch `data:records:mutated` to trigger downstream re-renders.

## Entry Points
- **Type**: UI Event (browser)
- **Path/Topic**: `#settings-btn` click → `settingsUI.open()` (wired in `src/main.js`)
- **File**: `src/settings-ui.js` (DOM-writer), `src/settings.js` (engine), `src/main.js` (wiring)

## Core Path

### Open / Render
1. `DOMContentLoaded` → `bootstrap()` calls `settingsUI.render()` to build the modal interior
   (header with close button, Sync Horizon section: anchor-date `<input type="date">`, impact
   preview `<div>`, Save Anchor Date button, Clear-All checkbox, Prune / Wipe action button).
2. `#settings-btn` click → `settingsUI.open()`: makes `#settings-modal` visible (`display: flex`),
   reads `settings.getSyncAnchorDate()` and pre-populates the date input.

### Save Anchor Date
3. User changes the date input → `change` event on `[data-field="anchor-date"]` → calls
   `settings.countRecordsBefore(date)` → updates the impact preview with the count of rows that
   would be pruned.
4. User clicks Save Anchor Date (`data-action="save-anchor"`) → validates date, calls
   `settings.setSyncAnchorDate(date)`, reports success via `reporter.db()`.

### Prune Records (normal mode)
5. User clicks Prune button (`data-action="prune"`) → `confirmFn()` prompts for confirmation;
   on accept, calls `settings.pruneRecordsBefore(date)` → dispatches `data:records:mutated`.

### Wipe Database (Clear-All mode)
6. User checks the Clear-All checkbox (`data-action="toggle-clear-all"`) → date picker and impact
   counter are disabled; action button switches label to "Wipe Entire Database" and `data-action`
   to `"wipe"`.
7. User clicks Wipe button (`data-action="wipe"`) → `confirmFn()` prompts for confirmation;
   on accept, calls `settings.wipeDatabase()` (clears `daily_records`, deletes
   `initial_backfill_complete` latch, resets `sync_anchor_date` to `DEFAULT_SYNC_ANCHOR`) →
   dispatches `data:records:mutated`.

### Close
8. Close button (`data-action="close-settings"`) or any other dismiss path → `settingsUI.close()`
   hides the modal (`display: none`).

## Data Touchpoints
- **Entities**: `settings.sync_anchor_date` row; all `daily_records` rows (prune/wipe); `settings.initial_backfill_complete` row (wipe only)
- **Tables**: `settings` (Dexie) for anchor key; `daily_records` (Dexie) for prune/wipe target
- **UI Surface**: `#settings-modal` (managed exclusively by `src/settings-ui.js`)

## Integrations
- None — entirely local (Dexie IndexedDB only)

## Error / Retry Surface
- `getSyncAnchorDate` / `setSyncAnchorDate`: DB errors are caught, logged via `console.error('[settings]', err)`, reported via `reporter.db()`.
- `pruneRecordsBefore` / `wipeDatabase`: DB errors are caught, logged, and rethrown; `settings-ui` catches and reports them via `reporter.db()`.
- All operations fail-open at the bootstrap render step (`console.error('[main] settingsUI.render failed, continuing', err)`).

## Scope
- `src/settings.js` — engine factory `createSettings(db)`
- `src/settings-ui.js` — DOM-writer factory `createSettingsUI(doc, settings, reporter, confirmFn)`
- `src/confirm.js` — injectable confirm adapter `createConfirmAdapter(windowRef)`
- `src/main.js` — composition-root wiring (`#settings-btn` click, bootstrap render)
- `index.html` — `#settings-btn` button, `#settings-modal` bare shell
- `styles.css` — settings modal layout and section styles

## Tests
- `src/settings.test.js` — engine: read/write anchor, count/prune records, wipe database, guard clauses
- `src/settings-ui.test.js` — DOM-writer: render skeleton, open/close, delegated actions, confirm injection, mutation dispatch, fail-open
- `src/confirm.test.js` — adapter: delegation, fail-open on absent windowRef
