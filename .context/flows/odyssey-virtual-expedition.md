# Flow: Odyssey — Virtual Expedition Progression Bar

> Added: ST-009 — 2026-09-08

<!-- context-meta
verification-commit: c804588e515abd1e2b6ebf32151d813077e71215
generated-at: 2026-09-10T13:48:00Z
confidence: medium
-->

## Overview
The **Journey** bottom tab's Virtual expedition (`#lab-odyssey` inside `#tab-journey`; from the old Lab tab, ST-025) gamifies lifetime walking
distance as a virtual expedition: a fixed, hand-authored route of six milestone legs from a
user-selectable home-base city (`src/odyssey.js`'s `HOME_BASE_CITIES` / `MILESTONES`, default
Hyderabad → Goa → Mumbai → New Delhi → Dubai → London → New York) is rendered as a single
multi-segment progression bar (`src/odyssey-ui.js`), with legs marked locked / active / unlocked
based on the user's lifetime distance in km.

## Entry Points
- **Type**: App lifecycle (browser) — automatic on load / after sync / after data mutation
  - `DOMContentLoaded` → `bootstrap()` → `odysseyUI.render()`
  - After `stepSync.sync()` completes → `odysseyUI.render()`
  - `data:records:mutated` custom event → `odysseyUI.render()`
- **File**: `src/odyssey-ui.js` (renderer), `src/odyssey.js` (pure engine — `computeOdysseyProgress`, `HOME_BASE_CITIES`, `MILESTONES`), `src/main.js` (wiring)

## Core Path
1. `createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter).render()` aborts any prior render, resolves the container (`#lab-odyssey`, else falls back to `#tab-journey` directly; no-ops with a console warning if neither exists), then calls **`analyticsEngine.compute()`** (the Analytics Lab engine from `src/analytics.js` — see `.context/flows/analytics-lab-dashboard.md`) to read `lifetimeMetrics.totalDistanceKm`, reusing that single source of truth rather than re-summing `daily_records` distance.
2. `odysseyEngine.computeOdysseyProgress(totalDistanceKm)` (the injected `{ computeOdysseyProgress }` from `src/odyssey.js`) guards non-finite/negative input to a zero-state (`unlockedLegs: []`, `activeLeg: MILESTONES[0]` (Goa), `progressPct: 0`, `remainingKm: MILESTONES[0].distanceKm`); otherwise it filters `MILESTONES` (cumulative km from Hyderabad: Goa 650 → Mumbai 710 → New Delhi 1580 → Dubai 2890 → London 7700 → New York 12500) into `unlockedLegs` (`distanceKm <= totalDistanceKm`) and finds the first not-yet-reached leg as `activeLeg`; when every leg is unlocked it returns `progressPct: 100, remainingKm: 0, activeLeg: undefined`. For the active leg, `progressPct` is the traversal ratio within that leg's span (previous milestone's cumulative km → this milestone's cumulative km), clamped `0–100`.
3. `_buildProgressBar` renders the route list (ST-025 replaced the horizontal capsule bar): the home-base stop, then one `li.odyssey-leg` per milestone with `data-state="unlocked"|"active"|"locked"`; the rail's `.odyssey-leg__line` fill height is `100%` / `progressPct%` / `0%`, the `.odyssey-leg__dot` is green (reached), a ringed sky dot (active) or an outline (locked), and the text shows the destination, its status and cumulative km. Above the route: "7,089 km walked so far"; below it: "Next stop: London — 611 km remaining" (or "All destinations unlocked!").
4. A failure from either `analyticsEngine.compute()` or `odysseyEngine.computeOdysseyProgress` is caught: logged via `console.error('[odyssey-ui]', err)`, `reporter.db('⚠️ Could not render Odyssey')`, and an error `<p>` replaces the container contents — `render()` never throws.
5. The starting city (`HOME_BASE_CITIES`, default Hyderabad) is user-configurable via the Settings screen's Home city row — see `.context/flows/settings-data-management.md`; `src/odyssey.js` itself does not read the stored selection (it is a pure, DI-free module — the milestone route is currently fixed regardless of the selected city).

## Data Touchpoints
- **Entities**: None directly — the engine is pure (no Dexie); it consumes `totalDistanceKm` already computed by the Analytics Lab engine from `daily_records.effective_distance_km`.
- **Tables**: None (no direct Dexie access from `src/odyssey.js` or `src/odyssey-ui.js`).
- **UI Surface**: `#lab-odyssey` inside `#tab-journey` — a vertical route (`ol.odyssey-route`): a "Home base · Start" stop, then one `li.odyssey-leg[data-state=unlocked|active|locked]` per milestone with the line into it filled to the progress (`.odyssey-leg__progress` height: 100% / `progressPct`% / 0%), name, status ("Reached" / "611 km to go" / "Ahead") and cumulative km; the active leg carries `aria-current="step"`; errors surfaced via `reporter.db()` → `#db-status`.

## Integrations
- None — entirely local, pure computation (no network, no Dexie).

## Error / Retry Surface
- `computeOdysseyProgress` never throws — non-finite/negative input is guarded to the zero-state.
- `render()` catches any error from the injected `analyticsEngine.compute()` (the only fallible step in this flow): `console.error('[odyssey-ui]', err)`, `reporter.db('⚠️ Could not render Odyssey')`, error `<p>` replaces the container — never throws further.
- Fail-open at bootstrap/post-sync/post-mutation: `src/main.js` renders through `_renderViews`, which logs `[main] odysseyUI.render failed[ after <context>], continuing` and carries on.

## Scope
- `src/odyssey.js` — pure exports `HOME_BASE_CITIES` (7 cities), `MILESTONES` (6 legs), `computeOdysseyProgress(totalDistanceKm)`
- `src/odyssey-ui.js` — `createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter)` → `{ render() }`
- `src/main.js` — composition-root wiring (bootstrap render, post-sync render, `data:records:mutated` re-render); constructs `createOdysseyUI(doc, { computeOdysseyProgress }, analyticsEngine, reporter)`
- `styles.css` — `.odyssey-bar`, `.odyssey-leg[data-state=...]`, `.odyssey-leg-track`, `.odyssey-leg-marker`, `.odyssey-leg-label`

## Tests
- `src/odyssey.test.js` — `HOME_BASE_CITIES`/`MILESTONES` shape and ordering, `computeOdysseyProgress` zero-state guard, partial/full-unlock boundaries, per-leg progress-ratio math.
- `src/odyssey-ui.test.js` — zero/partial/all-unlocked bar rendering, `data-state` + width assertions, remaining-km label text, analytics-engine and odyssey-engine error paths, idempotent re-render, `analyticsEngine → odysseyEngine` distance hand-off.

## Notes
- `odysseyEngine` is injected as `{ computeOdysseyProgress }` (a plain object, not the `odyssey.js` module import) — this keeps `odyssey-ui.js` free of a direct `odyssey.js` import for the progress function while `MILESTONES` is still imported directly for legend rendering.
- The route distances are hand-authored straight-line approximations from Hyderabad, not routed/driving distances; changing the selected Home Base City does not currently re-scale `MILESTONES`.
