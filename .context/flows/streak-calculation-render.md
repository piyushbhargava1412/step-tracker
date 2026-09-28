# Flow: Streak Calculation & Rendering

<!-- context-meta
verification-commit: HEAD
generated-at: 2026-09-28T17:00:00Z
confidence: high
-->

## Overview
Reads persisted daily step records and the active step goal (a scalar integer), computes a
three-metric tolerance streak (100% / 95% / 99% windows), fixed-threshold tier streaks,
Hall of Fame periods, and lifetime 10k-day totals, then fills five tiles of the Today screen's
progress panel (ST-025).

> **Implementation status**: Implemented by the pure computation functions in `src/streak.js` and the DOM render layer in `src/streak-ui.js`, wired from `src/main.js`.

## Entry Points
- **Type**: App lifecycle (browser) — automatic on load and after sync/goal changes
- **Path/Topic**: `DOMContentLoaded` → `bootstrap()` → `streakUI.render()`
- **File**: `src/main.js`, `src/streak.js`, `src/streak-ui.js`

## Core Path
1. `createStreak(db).compute()` reads `daily_records` and `settings.active_step_goal` (single scalar,
   via `goal.getActiveStepGoal()`). There is **no** `goal_history` read; the same step goal applies
   uniformly to every historical day (scalar lens, no per-date resolution).
2. Future-dated records are excluded; records are sorted by date. The streak engine calls
   `computeToleranceStreaks(preparedRecords, target, today)` for the three-metric tolerance block and
   also evaluates four fixed-threshold tier streaks (4 000 / 6 000 / 8 500 / 10 000 steps), Hall of
   Fame periods, and lifetime 10k-step metrics.
3. Tolerance engine constants (from `src/streak.js`):
   - `ALLOWANCE_WINDOW_95 = 20` — 95% tier: `floor(d / 20)` true misses allowed in a `d`-day window.
   - `ALLOWANCE_WINDOW_99 = 100` — 99% tier: `floor(d / 100)` true misses allowed in a `d`-day window.
   - `NEAR_MISS_RATIO = 0.95` — per-day near-miss bar for the tolerance tiers only: a past day at
     `>= round(0.95 × goal)` steps counts as met (e.g. 5,800 of a 6k goal is treated as achieved).
4. Missing or below-goal today is "in progress" for active streaks (strict bar, even though past
   days get near-miss leniency); missing or failing past days terminate the 100% run; non-finite
   values fail the day. The allowance tiers report the **longest-compliant-window** — the maximum
   depth whose miss density stays within budget, so a window that violates mid-history can recover
   once clean days dilute the miss ratio (walks to `earliestRecordDate` unconditionally).
   A qualifying window must start on a met day — its oldest day is never a true miss — so a budget
   boundary (e.g. d = 1900 for the 99% tier) cannot absorb the lone pre-run miss for one extra day
   and one extra oopsie; the next miss is only taken on when met days lie beyond it.
5. `streakUI.render()` replaces the content of the five tile slots and reports a zero-state on data
   failure. The render consumes `{ tolerance, hallOfFame, lifetime, activeStepGoal }`.

## Render Layout
`_buildTiles(result)` (exported) maps the compute result onto the tile slots in index.html as
`{ label, num, unit?, sub, good? }`; `fillStatTile` (`src/stat-tile.js`, shared with `progress-ui.js`)
writes `.stat-tile__label` / `.stat-tile__value` (`.stat-tile__num` + optional `.stat-tile__unit`,
e.g. "1,910" + "days") / `.stat-tile__sub`. The value is a wrapping flex row, so on a narrow tile or a
large system font size the unit drops under the number instead of overflowing the card:
- `#tile-strict` (amber `.stat-tile--hot`) — "Strict" · `tolerance.actual` days · "every day at 100%"
- `#tile-lifetime` — "Lifetime" · rounded `lifetime.pct`% · "488 of 900 days"
- `#tile-tol99` / `#tile-tol95` — "99% tol" / "95% tol" · allowance days · "N misses used"
  (`.stat-tile__sub--good` when none were used)
- `#tile-best` — "Best run" · `hallOfFame[0].days` · "at 10k · 2024" (year span "2025–2026" across
  years; "—" / "no run yet" when empty)
A missing slot is skipped. `#tile-distance` belongs to `progress-ui.js`. Tier chips are not rendered.

## Data Touchpoints
- **Entities**: Daily step records (`effective_steps`), active step goal (`target_steps` integer),
  streak metrics, Hall of Fame periods, lifetime 10k metrics.
- **Tables**: `daily_records` (Dexie, read-only), `settings` key `'active_step_goal'` (read via `goal.getActiveStepGoal()`).
- **No `goal_history` table** — dropped at DB_VERSION 4.

## Integrations
- **Type**: None (pure client-side computation + DOM render)
- **Target**: `#tile-strict`, `#tile-lifetime`, `#tile-tol99`, `#tile-tol95`, `#tile-best`
- **Channel**: N/A

## Scope
- `src/streak.js` — pure calculations and Dexie read orchestration; exports `ALLOWANCE_WINDOW_95`, `ALLOWANCE_WINDOW_99`, `NEAR_MISS_RATIO`, `computeToleranceStreaks`
- `src/streak-ui.js` — the five streak tiles; renders `tolerance`, `hallOfFame`, `lifetime`, `activeStepGoal`
- `src/stat-tile.js` — `fillStatTile`, the shared tile content builder (number + unit split)
- `src/main.js` — lifecycle wiring and post-sync / post-goal-change rendering
- `src/goal.js`, `src/db.js` — goal engine (step scalar) and schema
- `styles.css` — `.stat-tile`, `.stat-tile--hot`, `.stat-tile__*`

## Tests
- `src/streak.test.js` — tolerance engine (100%/95%/99% windows), tier calculations, HoF, lifetime 10k, goal resolution from scalar
- `src/streak-ui.test.js` — each tile's label/value/sub, pluralisation, clean-tolerance marker, best-run year span and goal, zero state, missing slots, failed compute, no emoji

## Notes
- Unified streak and `goal_history` per-date resolution have been replaced by the scalar step lens.
  `computeToleranceStreaks` is the primary computation primitive.
- Records are sorted by date and compared with `>=`; the current day is an in-progress exception
  for active streaks. Tolerance tiers apply near-miss leniency to past days (`>= round(0.95 × goal)`
  counts as met) while `actual` and the Hall of Fame keep the strict full-goal bar.
- The render layer is the **sole DOM writer** for the streak feature; nodes are built with
  `createElement`/`textContent` only (no `innerHTML`, no inline `onclick`).
- `_localDate` is imported from `src/date-utils.js` (not `src/goal.js`).
