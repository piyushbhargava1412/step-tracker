# Flow: Streak Calculation & Rendering

<!-- context-meta
verification-commit: a4e9d6fd1aeaab215e9ad706d637b8816f346474
generated-at: 2026-08-12T06:00:00Z
confidence: high
-->

## Overview
Reads persisted daily step records and the active step goal (a scalar integer), computes a
three-metric tolerance streak (100% / 95% / 90% windows), fixed-threshold tier streaks,
Hall of Fame periods, and lifetime 10k-day totals, then renders the Active Streaks card
(`#streak-card`) into the dashboard.

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
5. `streakUI.render()` replaces `#lifetime-banner` (first) and `#streak-card` (stale nodes are
   removed first) and reports a zero-state on data failure. The render consumes
   `{ tolerance, hallOfFame, lifetime, activeStepGoal }` from the compute result.

## Render Layout
Two dashboard nodes are injected, in order:
- **Lifetime compliance banner** — `#lifetime-banner` spans the full dashboard grid width on row 1:
  `${metDays} / ${totalDays} Days (${pct.toFixed(1)}% Lifetime)` (`.lifetime-count` holds the day counts).
- **Active Streaks card** — `#streak-card` (right column, rows 2–4), mirroring the mockup:
- **Header** — `.streak-header`: `.streak-title` "Active Streaks" + `.goal-badge` ("5k Goal",
  "7.5k Goal", "10k Goal", "15k Goal" derived from `activeStepGoal / 1000`).
- **Actual (100%)** — `.streak-actual`: `.streak-actual-label` "Actual (100%)" + `.streak-number`
  (headline `tolerance.actual`) above a `.streak-bar` with a 100%-wide `.streak-bar-fill`.
- **Allowances** — `.streak-allowances`: two `.streak-allowance` chips
  (`.streak-allowance-label` + `.streak-allowance-value`) for 95% and 90% tolerance.
- **Best Runs** — `.streak-runs`: `.streak-runs-title` "🏆 Best Runs at `<goal>`"
  (thousands-separated) then up to three `.streak-run` rows (`.streak-run-rank`, `.streak-run-days`,
  `.streak-run-range`). Ranges collapse to a single year for same-year runs ("2026") or
  "2021-2025" spans; an empty list renders `.streak-runs-empty`.

Tier chips are **not** rendered; `streak.compute()` still returns `tiers`, but the render layer ignores
them. The lifetime banner renders `lifetime` (met/total days + percentage).

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
- `src/streak-ui.js` — lifetime banner + Active Streaks card renderer; renders `tolerance`, `hallOfFame`, `lifetime`, `activeStepGoal`
- `src/main.js` — lifecycle wiring and post-sync / post-goal-change rendering
- `src/goal.js`, `src/db.js` — goal engine (step scalar) and schema
- `styles.css` — streak presentation (`.streak-header`, `.goal-badge`, `.streak-actual`, `.streak-bar`, `.streak-allowances`, `.streak-runs`)

## Tests
- `src/streak.test.js` — tolerance engine (100%/95%/90% windows), tier calculations, HoF, lifetime 10k, goal resolution from scalar
- `src/streak-ui.test.js` — render with full result, zero-state, idempotency, allowances build, best-runs build, goal badge

## Notes
- Unified streak and `goal_history` per-date resolution have been replaced by the scalar step lens.
  `computeToleranceStreaks` is the primary computation primitive.
- Records are sorted by date and compared with `>=`; the current day is an in-progress exception for active streaks.
- The render layer is the **sole DOM writer** for the streak feature; nodes are built with
  `createElement`/`textContent` only (no `innerHTML`, no inline `onclick`).
- `_localDate` is imported from `src/date-utils.js` (not `src/goal.js`).
