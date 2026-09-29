# Flow: Gamification — RPG Level & Trophy Case

> Added: ST-009 — 2026-09-08

<!-- context-meta
verification-commit: bd81d7ee90757c3e1b5555e18cf88f7e3282eddd
generated-at: 2026-09-08T04:03:55Z
confidence: medium
-->

## Overview
The **Journey** bottom tab's level and trophies (`#lab-gamification` inside `#tab-journey`; from the old Lab tab, ST-025) turn lifetime step
totals into an RPG-style progression: `src/gamification.js` derives an XP total, a level (1–50, with
a 50-entry flavour-text rank ladder), and four boolean achievement trophies from `daily_records`;
`src/gamification-ui.js` renders a level card (LVL badge, rank label, "Max rank reached" or "Level N ·
next at X XP", progress bar, XP line) and a "Trophies · N of 4 earned" 2×2 grid (line icons, Earned /
Locked chips; locked tiles dimmed).

## Entry Points
- **Type**: App lifecycle (browser) — automatic on load / after sync / after data mutation
  - `DOMContentLoaded` → `bootstrap()` → `gamificationUI.render()`
  - After `stepSync.sync()` completes → `gamificationUI.render()`
  - `data:records:mutated` custom event → `gamificationUI.render()`
- **File**: `src/gamification-ui.js` (renderer), `src/gamification.js` (engine + pure XP/level/achievement helpers), `src/main.js` (wiring)

## Core Path
1. `createGamification(db).compute()` reads `db.daily_records.toArray()` and `db.settings.get('active_step_goal')` (fallback `DEFAULT_STEP_GOAL` from `src/config.js`) in parallel, sums `effective_steps` into `totalSteps`, and derives `xp`/`level`/`levelLabel`/`achievements`.
2. `computeXP(lifetimeSteps)` = `Math.floor(lifetimeSteps / 100)`, guarded to `0` for non-finite or negative input.
3. `computeLevel(xp)` = `Math.min(Math.floor(Math.sqrt(xp / 10)) + 1, 50)` — a square-root curve capped at level 50.
4. `getLevelLabel(lifetimeSteps)` looks up `LEVEL_RANKS[level - 1]` (50 flavour-text entries, "Couch Potato" → "Globe Trotter") and appends `" (MAX)"` when the *uncapped* raw level would exceed 50.
5. `evaluateAchievements(records, activeStepGoal)` sorts records ascending by date once, then evaluates four independent trophies against that sorted array: **Centurion** (any ISO week — via a hand-rolled `_isoWeekKey` — with total `effective_steps` > 100,000); **Marathoner** (any single day > 55,000 steps); **Unstoppable** (delegates to `computeToleranceStreaks` from `src/streak.js`, unlocked when `actual >= 30`, using the latest record's date as "today" so it never depends on the wall clock); **Night Owl** (any consecutive day pair whose `hourly_steps[23] (day N) + hourly_steps[0..2] (day N+1)` sum exceeds 2,000 — skipped when either day's `hourly_steps` is `null`/not a 24-element array).
6. `compute()` persists the achievements snapshot via `db.settings.put({ key: 'achievements', value: achievements })` before returning — the only DB write in this flow.
7. `createGamificationUI(doc, engine, reporter).render()` aborts any prior `AbortController`, resolves the container (`#lab-gamification`, else creates a fallback `<div id="lab-gamification">` inside `#tab-journey`, else no-ops with a console warning), calls `engine.compute()`, and `replaceChildren()`s one section: the level card (`.rpg-level-badge` with `aria-label` "Level N", rank `<h2>`, status line, progress bar — `_computeProgressWidth` clamps to `100.0%` at level 50 — and "93,030 XP · 1 XP per 100 steps"), the "Trophies" heading with the earned count, and the 2×2 trophy grid (`TROPHY_DEFINITIONS` — Centurion `trophy` / Marathoner `shoe` / Unstoppable `flame` / Night Owl `moon` icons from `src/icons.js` — each tile with an Earned/Locked chip and `.trophy-card--locked` when its achievement is `false`).
8. A render failure is caught: logged via `console.error('[gamification-ui]', err)`, `reporter.db('⚠️ Could not render Gamification')`, and an error `<p>` replaces the container contents — `render()` never throws.

## Data Touchpoints
- **Entities**: `daily_records` (`date`, `effective_steps`, `hourly_steps`); `settings` row `key = 'active_step_goal'` (read, for the Unstoppable trophy's goal input); `settings` row `key = 'achievements'` (write, snapshot of the last-computed trophy booleans)
- **Tables**: `daily_records` (Dexie, read-only); `settings` (Dexie, read `active_step_goal`, write `achievements`)
- **UI Surface**: `#lab-gamification` inside `#tab-journey`; errors surfaced via `reporter.db()` → a toast (ST-027).

## Integrations
- None — entirely local (Dexie IndexedDB only, no network).

## Error / Retry Surface
- `compute()` failure (DB read or write): logged (`console.error('[gamification]', err)`) and rethrown — no fail-open at the engine layer.
- `render()` catches the rethrown error: `console.error('[gamification-ui]', err)`, `reporter.db('⚠️ Could not render Gamification')`, error `<p>` replaces the container — never throws further.
- Fail-open at bootstrap/post-sync/post-mutation: `src/main.js` renders through `_renderViews`, which logs `[main] gamificationUI.render failed[ after <context>], continuing` and carries on.

## Scope
- `src/gamification.js` — `LEVEL_RANKS` (50 entries), pure `computeXP`, `computeLevel`, `getLevelLabel`, `evaluateAchievements`, plus `createGamification(db)` factory (`compute()`)
- `src/gamification-ui.js` — `createGamificationUI(doc, engine, reporter)` → `{ render() }`
- `src/main.js` — composition-root wiring (bootstrap render, post-sync render, `data:records:mutated` re-render)
- `styles.css` — `.rpg-level-card`, `.rpg-progress-bar`/`.rpg-progress-bar__fill`, `.trophy-grid`, `.trophy-card`/`.trophy-card--locked`

## Tests
- `src/gamification.test.js` — `LEVEL_RANKS` shape, `computeXP`/`computeLevel` guard clauses and monotonicity, `evaluateAchievements` per-trophy unlock/lock boundary cases (including exact-threshold non-unlock and ISO-week-boundary splitting).
- `src/gamification-ui.test.js` — level card content + progress-bar formula, trophy grid (locked/unlocked classes, no-`innerHTML` text assertions), MAX-level clamping, error fallback, idempotent re-render, fallback-container creation.

## Notes
- Achievement thresholds are strict (`>`, not `>=`) — a value exactly at threshold (e.g. exactly 100,000 weekly steps or exactly 55,000 daily steps) stays locked by design.
- `evaluateAchievements` sorts once and passes the sorted array to both `_evaluateUnstoppable` and `_evaluateNightOwl` so neither sub-evaluator re-sorts.
