# Flow: Settings — Sync Horizon & Data Management

> Added: ST-015 — 2026-08-13

<!-- context-meta
verification-commit: HEAD
generated-at: 2026-09-28T17:00:00Z
confidence: medium
-->

## Overview
The **Settings screen** (ST-025; pushed from Today's app-bar gear) holds grouped rows: Connections
(the step source's Connect button `#auth-btn`), Backup (→ Backup & restore), then the data panel
`#settings-panel` built by `src/settings-ui.js` — Journey › Home city, History › Track history from
(the sync anchor: how far back history is fetched), and Danger zone (delete days before the anchor,
or erase everything) — then, in the Android app only, App › Updates (`#app-update`, ST-028, see
[app-updates.md](app-updates.md)) — and the app version. The engine (`src/settings.js`) is pure Dexie; the
DOM-writer owns `#settings-panel`; `src/confirm.js` provides an injectable confirm seam. All
mutations dispatch `data:records:mutated` to trigger downstream re-renders.

## Entry Points
- **Type**: UI Event (browser)
- **Path/Topic**: `[data-go="settings"]` (Today app bar) → navigation shows `#tab-settings` → the `onEnter.settings` hook calls `settingsUI.open()` (wired in `src/main.js`), every time the screen is shown
- **File**: `src/settings-ui.js` (DOM-writer), `src/settings.js` (engine), `src/main.js` (wiring)

## Core Path

### Open / Render
1. `DOMContentLoaded` → `bootstrap()` calls `settingsUI.render()` to build `#settings-panel`:
   `.list-label` + `.list-group` groups — "Journey" (Home city row, `label[for=home-base-city-select]`),
   "History" (Track history from row, `input#settings-anchor-date`), "Danger zone"
   (`.list-group--danger`: "Erase everything instead" switch `#settings-clear-all[role=switch]`,
   the impact preview, and the "Delete days before …" / "Erase all data on this device" button).
2. Showing the Settings screen → `settingsUI.open()`: reads `settings.getSyncAnchorDate()`,
   pre-populates the date input, then refreshes the impact preview for the loaded anchor.

### Save Anchor Date (auto-save on change)
3. User changes the date input → `change` event on `[data-field="anchor-date"]` → calls
   `settings.setSyncAnchorDate(date)` to persist the anchor immediately (it first deletes the
   `initial_backfill_complete` latch so the next sync re-evaluates the backfill against the new
   anchor; a failed delete is logged, rethrown, and the anchor is not written), then
   `settings.countRecordsBefore(date)` → updates the impact preview ("X record(s) found prior to
   YYYY-MM-DD") and the button label ("Delete days before Jan 1, 2018"). There is no
   separate Save button — the anchor saves on every date change.

### Prune Records (normal mode)
4. User clicks Prune button (`data-action="prune"`) → `confirmFn()` prompts for confirmation;
   on accept, calls `settings.pruneRecordsBefore(date)` → dispatches `data:records:mutated`.

### Wipe Database (Clear-All mode)
5. User checks the Clear-All checkbox (`data-action="toggle-clear-all"`) → date picker is disabled;
   action button switches label to "Erase all data on this device" and `data-action` to `"wipe"`; impact
   preview shows `settings.countAllRecords()` total ("X total records will be deleted").
6. User clicks Wipe button (`data-action="wipe"`) → `confirmFn()` prompts for confirmation;
   on accept, calls `settings.wipeDatabase()` (clears `daily_records`, deletes
   `initial_backfill_complete` latch, resets `sync_anchor_date` to `DEFAULT_SYNC_ANCHOR`) →
   dispatches `data:records:mutated`.

### Leave
7. The app-bar back arrow or the Android back button returns to Today (navigation.js); there is no
   close action in the panel.

### Home Base City (ST-009)
8. The Journey › Home city row renders a `<select id="home-base-city-select"
   data-action="change-home-base">` populated from `src/odyssey.js`'s `HOME_BASE_CITIES` (7 cities, default
   Hyderabad); on `open()`, `settings.getHomeBaseCity()` pre-selects the stored city (or Hyderabad when unset).
9. `change` on `[data-action="change-home-base"]` → looks up the matching `HOME_BASE_CITIES` entry by name (a
   free-text/unmatched value is silently ignored — no write), calls `settings.setHomeBaseCity(matchedCity)` to
   persist `{ key: 'home_base_city', value: city, updated_at }` in Dexie `settings`, then dispatches
   `data:records:mutated` (`detail: { source: 'home-base-city' }`) so the Odyssey Lab section re-renders with
   the (currently unchanged) milestone route — see `.context/flows/odyssey-virtual-expedition.md`.

## Data Touchpoints
- **Entities**: `settings.sync_anchor_date` row; all `daily_records` rows (prune/wipe); `settings.initial_backfill_complete` row (wipe only); `settings.home_base_city` row (`{ name, country, lat, lng }`, ST-009)
- **Tables**: `settings` (Dexie) for anchor key; `daily_records` (Dexie) for prune/wipe target
- **UI Surface**: `#settings-panel` on `#tab-settings` (managed exclusively by `src/settings-ui.js`); static rows in index.html

## Integrations
- None — entirely local (Dexie IndexedDB only)

## Error / Retry Surface
- `getSyncAnchorDate` / `setSyncAnchorDate`: DB errors are caught, logged via `console.error('[settings]', err)`, reported via `reporter.db()`.
- `pruneRecordsBefore` / `wipeDatabase`: DB errors are caught, logged, and rethrown; `settings-ui` catches and reports them via `reporter.db()`.
- All operations fail-open at the bootstrap render step (`console.error('[main] settingsUI.render failed, continuing', err)`).

## Scope
- `src/settings.js` — engine factory `createSettings(db)` (imports `HOME_BASE_CITIES` from `src/odyssey.js` for city validation, ST-009)
- `src/settings-ui.js` — DOM-writer factory `createSettingsUI(doc, settings, reporter, confirmFn)`
- `src/confirm.js` — injectable confirm adapter `createConfirmAdapter(windowRef)`
- `src/main.js` — composition-root wiring (navigation `onEnter.settings` → `open()`, bootstrap render, `#step-source-name`, `#app-version`)
- `index.html` — `#tab-settings` screen: Connections row (`#auth-btn`), Backup & restore row (`data-go="backup"`), `#settings-panel` mount, `#app-version`
- `styles.css` — `.list-label`, `.list-group`, `.list-group--danger`, `.list-row*`, `.row-select`, `.row-input`, `input.switch`, `.settings-impact-preview`, `.btn-danger`, `.btn-hazard`

## Tests
- `src/settings.test.js` — engine: read/write anchor, count records (before-date + all), prune records, wipe database, guard clauses; (ST-009) `getHomeBaseCity`/`setHomeBaseCity` — default fallback, unrecognised-city rejection
- `src/settings-ui.test.js` — DOM-writer: grouped layout, labelled controls, switch role, open(), delegated actions, confirm injection, mutation dispatch, fail-open, no emoji; `src/main.test.js` — Settings opens via navigation and calls `open()` each time
- `src/confirm.test.js` — adapter: delegation, fail-open on absent windowRef
