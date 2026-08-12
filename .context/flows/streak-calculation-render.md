# Flow: Streak Calculation & Rendering

<!-- context-meta
verification-commit: a4e9d6fd1aeaab215e9ad706d637b8816f346474
generated-at: 2026-08-12T06:00:00Z
confidence: high
-->

## Overview
Reads persisted daily step records and the active step goal (a scalar integer), computes a
three-metric tolerance streak (100% / 95% / 90% windows), four fixed-threshold tier streaks,
Hall of Fame periods, and lifetime 10k-day totals, then renders the streak card and lifetime banner
into the dashboard.

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
   also evaluates four fixed-threshold tier streaks (5 000 / 7 500 / 10 000 / 15 000 steps), Hall of
   Fame periods, and lifetime 10k-step metrics.
3. Tolerance engine constants (from `src/streak.js`):
   - `ALLOWANCE_WINDOW_95 = 20` — 95% tier: `floor(d / 20)` misses allowed in `d`-day window.
   - `ALLOWANCE_WINDOW_90 = 10` — 90% tier: `floor(d / 10)` misses allowed in `d`-day window.
4. Missing or below-goal today is "in progress" for active streaks; missing or failing past days
   terminate the run; non-finite values fail the day.
5. `streakUI.render()` replaces `#lifetime-banner` and `#streak-card` and reports a zero-state on
   data failure. The render result object shape:
   `{ tolerance, tiers, hallOfFame, lifetime, activeStepGoal }`.

## Data Touchpoints
- **Entities**: Daily step records (`effective_steps`), active step goal (`target_steps` integer),
  streak metrics, Hall of Fame periods, lifetime 10k metrics.
- **Tables**: `daily_records` (Dexie, read-only), `settings` key `'active_step_goal'` (read via `goal.getActiveStepGoal()`).
- **No `goal_history` table** — dropped at DB_VERSION 4.

## Integrations
- **Type**: None (pure client-side computation + DOM render)
- **Target**: `#tab-dashboard`, `#lifetime-banner`, `#streak-card`
- **Channel**: N/A

## Scope
- `src/streak.js` — pure calculations and Dexie read orchestration; exports `ALLOWANCE_WINDOW_95`, `ALLOWANCE_WINDOW_90`, `computeToleranceStreaks`
- `src/streak-ui.js` — streak card and lifetime banner renderer; renders `tolerance`, `tiers`, `hallOfFame`, `activeStepGoal`
- `src/main.js` — lifecycle wiring and post-sync / post-goal-change rendering
- `src/goal.js`, `src/db.js` — goal engine (step scalar) and schema
- `styles.css` — streak presentation (`.tolerance-metrics`, `.tolerance-metric`, `.tolerance-value`, `.tolerance-label`, tier chips)

## Tests
- `src/streak.test.js` — tolerance engine (100%/95%/90% windows), tier calculations, HoF, lifetime 10k, goal resolution from scalar
- `src/streak-ui.test.js` — render with full result, zero-state, idempotency, tolerance block build, tier badges, `activeStepGoal` label

## Notes
- Unified streak and `goal_history` per-date resolution have been replaced by the scalar step lens.
  `computeToleranceStreaks` is the primary computation primitive.
- Records are sorted by date and compared with `>=`; the current day is an in-progress exception for active streaks.
- The tier badge for the currently-active goal is highlighted in `_buildTierBadges`
  (`tier.threshold === activeStepGoal`).
- `_localDate` is imported from `src/date-utils.js` (not `src/goal.js`).
