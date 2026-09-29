Story ID: ST-025

# ST-025 — Mobile App Redesign (v0.2.0)

## Context

The PWA became an Android app in ST-017–ST-021, but it still looked and navigated like a desktop web page: six top tabs, a header full of buttons, an "Active Lens" dropdown, a Settings modal and an empty Map tab. The owner asked for a real mobile-app feel with the Deep Blue colour scheme unchanged, and reviewed a design canvas of every screen before implementation (owner decisions, 2026-09-28):

* Remove the Map tab; move Backup into Settings; make Search an icon on Today.
* Merge Today's progress and the streaks into one panel: the step ring plus six tiles — Distance, Strict, Lifetime, 99% tol, 95% tol, Best run.
* Drop the week chart and the month summary from Today; the Calendar gets a Week / Month switch instead.
* Release as **v0.2.0**.

## Scope

* **Navigation** — four bottom tabs (Today, Calendar, Insights, Journey); pushed screens (Search, Group challenge, Settings, Backup & restore) with an app-bar back arrow; the Android back button closes an open sheet or photo, then goes back, then leaves the app.
* **Today** — status line (connection, last sync, storage protection, sync button), pull down to sync, the progress panel (ring, goal chip, six tiles) and a Group challenge summary card.
* **Calendar** — Week / Month switch; the Week view (range, totals, bar chart with the goal line, day list); the day detail as a bottom sheet with an hourly chart.
* **Insights** — the Lab's analytics with an All time / per-year range switch.
* **Journey** — level, trophies and the virtual expedition as a vertical route.
* **Search** — collapsible filters, summary strip, near misses, paged results (50 at a time), export.
* **Group challenge** — its own screen with the update text, Copy and Share (Android share sheet).
* **Settings** — a full screen of grouped rows (connection, Backup & restore, home city, history start, danger zone, version); **Backup & restore** below it.
* **First launch** — a welcome screen (connect, restore, not now).
* Line icons instead of emoji in the interface; Manrope + JetBrains Mono bundled with the app (no Google Fonts request).

## Out of Scope

* New metrics or engines (the redesign reuses every engine as is, plus a small week loader).
* Status-channel messages (`reporter.*`), which keep their emoji prefixes; the shareable challenge update text keeps its emoji.

## Acceptance Criteria

* Only Today, Calendar, Insights and Journey are bottom tabs; no Map, Lab or Backup tab exists.
* Today shows the ring and the six tiles in one panel, then the challenge card — no week chart, no month card.
* Calendar switches between Week and Month; tapping a day in either opens the same day sheet.
* The Android back button walks back through screens and closes sheets first.
* Every colour token of the Deep Blue palette is unchanged.
* Tests for every new module and every changed render layer; the full suite passes.

## Implementation

* New: [navigation.js](../../src/navigation.js), [pull-to-refresh.js](../../src/pull-to-refresh.js), [icons.js](../../src/icons.js), [week.js](../../src/week.js), [calendar-week-ui.js](../../src/calendar-week-ui.js), [calendar-view-switch.js](../../src/calendar-view-switch.js), [onboarding-ui.js](../../src/onboarding-ui.js), [platform/share.js](../../src/platform/share.js); `onBackButton` in [platform/app-lifecycle.js](../../src/platform/app-lifecycle.js).
* Reworked render layers: progress-ui, streak-ui, challenge-ui, calendar-ui, month-overview, analytics-ui, gamification-ui, odyssey-ui, search-ui, settings-ui and the three backup panels.
* Removed: `tabs.js` (replaced by navigation.js), the Settings modal, the Map tab, the Today month overview.
* Rewritten: [index.html](../../index.html) (screens + bottom nav), [styles.css](../../styles.css), [main.js](../../src/main.js) wiring (one fail-open `_renderViews` helper for every refresh).
* Dependencies: `@capacitor/share`, `@fontsource-variable/manrope`, `@fontsource/jetbrains-mono`.
* Version 0.2.0: `package.json`, Android `versionName "0.2.0"` / `versionCode 3`; the Settings screen shows it (Vite `define` → `__APP_VERSION__`).

## As built

* `createNavigator(doc, { onEnter })` → `go`, `back`, `current`, `bind`. Screens are `#tab-<name>[data-screen]`, shown with `hidden`; `body[data-active-screen]` lets CSS show the Today-only app-bar actions. `back()` sends Escape to an open `[data-overlay]` (day sheet, proof photo) before popping a screen.
* Today's six tiles are fixed slots in index.html: progress-ui fills `#tile-distance`; streak-ui fills the other five. `computeProgress()` now also returns today's `distance_km`.
* The Week view counts goal hits among **finished** days only — today reads "in progress" until it reaches the goal, in the week chart and in the day sheet. Compact step labels truncate (9,982 → "9.9k"), so a miss never reads as the 10k goal.
* Insights' "All time" uses the engine's figures; a year recomputes from the cached records with `computeInsights()` (no extra database read).
* The onboarding screen shows only while there is no data and it was never dismissed (`localStorage.onboarding_done`); the connection's single `onConnected` listener, owned by main.js, dismisses it and syncs.
* Verified in a 390 × 844 browser viewport against seeded data (every screen); on-device testing on the owner's emulator is the next step before tagging v0.2.0.

## On-device polish (after the first release build)

The owner's phone (system font size ≈1.25×, which the Android WebView applies) showed Today overflowing:

* **Stat tiles** — values are a number plus a unit in separate spans ([stat-tile.js](../../src/stat-tile.js), shared by progress-ui and streak-ui); the value is a wrapping flex row, so "1,910 days" drops "days" under the number instead of spilling out of the card.
* **Ring** — the step count is padded inside the ring and shrunk to fit by [fit-text.js](../../src/fit-text.js) (`ResizeObserver` on the ring centre, scale via the `--fit` custom property so the WebView's text zoom applies once).
* **Status line** — the connection, last-sync and storage statuses sit in a wrapping `.status-pills` group beside the sync button, so they show in full on a second line instead of truncating ("Conn…").
* **Sync button** — stays the refresh icon (`title`/`aria-label` "Sync steps"); the sync engine no longer overwrote it with "Syncing…"/"Sync Steps" text. Busy state is `.is-syncing` (spinning icon; no spin under reduced motion) + `aria-busy`. Resume hints now say "sync again".
* **Six-digit days** (2026-09-29) — the ring's stroke went from 16px to 10px and the ring from 220px to 236px, so the inner circle grew from 168px to 210px; the ring scales down with a narrow screen (`min(236px, 100%)`, viewBox) and the text column is 72% of it. 999,999 fits at the full 42px; at a 1.25× system font it shrinks to 81% (≈42px), still larger than before, with no overflow down to a 320px screen.
