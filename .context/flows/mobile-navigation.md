# Flow: Mobile Navigation — Bottom Tabs, Screens, Back Button & Pull-to-Refresh

> Added: ST-025 — 2026-09-28

<!-- context-meta
verification-commit: HEAD
generated-at: 2026-09-28T17:00:00Z
confidence: high
-->

## Overview
The app shows one screen at a time. Four bottom tabs — **Today, Calendar, Insights, Journey** — are
roots; **Search**, **Group challenge** and **Settings** are pushed from Today, and **Backup &
restore** is pushed from Settings. The app bar shows the screen title (Today adds the date and the
search + settings icons; pushed screens add a back arrow). The Android back button closes an open
sheet or photo first, then walks back, then returns to Today, and finally leaves the app. On Today,
pulling down syncs. A first-launch welcome screen covers the app until the user connects, restores
or skips.

## Entry Points
- **Type**: UI events (one delegated `click` listener on the document, `createNavigator(doc).bind()`)
  - `[data-tab="<tab>"]` (bottom nav) → `go(tab)` — resets the stack to that tab
  - `[data-go="<screen>"]` (app-bar icons, Settings › Backup row, Today's challenge card) → `go(screen)` — pushes it
  - `[data-back]` (`#app-back`) → `back()`
- **Type**: Android back button → `onBackButton({ isNative }, () => screens.back())` (`src/platform/app-lifecycle.js`); when `back()` returns false, `App.exitApp()`
- **Type**: Touch — pull down on Today → `createPullToRefresh(doc, { indicator: #ptr-indicator, onRefresh: requestSync, isEnabled: on Today and no welcome screen })`
- **Type**: App lifecycle — `bootstrap()` → `onboarding.start()` after the first render
- **File**: `src/navigation.js`, `src/pull-to-refresh.js`, `src/onboarding-ui.js`, `src/platform/app-lifecycle.js`, `src/main.js` (wiring), `index.html`, `styles.css`

## Core Path
1. `SCREENS` maps each screen to its app-bar title and (for pushed screens) its parent; `TAB_SCREENS` = `['today', 'calendar', 'insights', 'journey']`.
2. `go(name)`: unknown names are ignored; a tab replaces the stack, a pushed screen is appended (never twice in a row). `_show(name)` sets `hidden` on every `[data-screen]` except `#tab-<name>`, sets `aria-current="page"` on the bottom tab the screen belongs to, writes `#app-title` / `#app-subtitle` ("Monday, 28 September" on Today), shows `#app-back` only when something is stacked, sets `body[data-active-screen]`, scrolls to the top and runs `onEnter[name]` (errors logged). main.js's `onEnter.settings` calls `settingsUI.open()`.
3. `back()`: if a `[data-overlay]` element is open (the day sheet, the proof photo), dispatch an Escape `keydown` (their own close handlers run) → true; else pop a pushed screen → true; else go to Today from another tab → true; else false.
4. Pull-to-refresh: from `scrollTop === 0`, finger travel is halved and moves the indicator; past `PULL_THRESHOLD_PX` (64) it is armed (`.ptr--armed`); releasing armed calls `onRefresh` (the same `requestSync` as `#sync-btn`: silent storage-persist request + `syncTrigger.run()`); failures are logged.
5. Welcome screen: `onboarding.start()` shows `#onboarding` only when `localStorage.onboarding_done !== '1'` and `db.daily_records.count()` is 0 — naming the step source ("Health Connect" / "Google Fit") and labelling its connect button with `connection.label`. Connect → `connection.connect()` (stays open until connected); "Restore from a backup" → dismiss + `screens.go('backup')`; "Not now" → dismiss. `connection.onConnected` (owned by main.js — the Health Connect connection keeps a single listener) calls `onboarding.dismiss()` then `syncTrigger.run()`. `body.has-onboarding` hides the app bar and bottom nav.

## Data Touchpoints
- `localStorage.onboarding_done` (welcome screen dismissed); `daily_records.count()` (read-only). Navigation keeps no persisted state.

## Integrations
- `@capacitor/app` `backButton` (Android only; the browser keeps its own back button).

## Scope
- `src/navigation.js` — `TAB_SCREENS`, `SCREENS`, `createNavigator`, `_formatTodaySubtitle`
- `src/pull-to-refresh.js` — `createPullToRefresh`, `PULL_THRESHOLD_PX`
- `src/onboarding-ui.js` — `createOnboardingUI`, `ONBOARDING_DONE_KEY`
- `src/platform/app-lifecycle.js` — `onBackButton` (and ST-021's `onAppResume`)
- `src/icons.js` — line icons used in the rendered screens
- `index.html` — `.app-bar`, `main.screens > section[data-screen]`, `nav.bottom-nav`, `#ptr-indicator`, `#onboarding`
- `styles.css` — `.app-bar*`, `.screens`, `.screen`, `.bottom-nav*`, `.ptr*`, `.onboarding*`, `body:not([data-active-screen="today"]) .app-bar__actions`

## Tests
- `src/navigation.test.js` — registry, first render, tab switching, pushed screens, back order, stack reset, dedupe, unknown names, enter hooks (and their errors), click delegation, `data-nav` left alone, overlay-first back, scroll to top, re-bind
- `src/pull-to-refresh.test.js`, `src/onboarding-ui.test.js`, `src/platform/app-lifecycle.test.js` (`onBackButton`), `src/index.test.js` (shell contract), `src/main.test.js` (wiring: tabs, back button, Settings `open()`, `#db-status` → Backup, welcome screen, pull-to-refresh)

## Notes
- Screens use the `hidden` attribute; `styles.css` makes `[hidden]` win over every display rule.
- `data-nav` stays reserved for the calendar's month arrows (the navigator uses `data-tab` / `data-go` / `data-back`).
