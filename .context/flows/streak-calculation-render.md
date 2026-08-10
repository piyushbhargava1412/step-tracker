# Flow: Streak Calculation & Rendering

<!-- context-meta
verification-commit: 9a0d42930ab13cb2f6ee855ffffcb01f1e964595
generated-at: 2026-08-10T15:55:56Z
confidence: high
-->

## Overview
Reads persisted daily step records and goal history, computes unified and tier streak metrics plus lifetime 10k-day totals, and renders the streak card and lifetime banner into the dashboard.

> **Implementation status**: Implemented by the pure computation functions in `src/streak.js` and the DOM render layer in `src/streak-ui.js`, wired from `src/main.js`.

## Entry Points
- **Type**: App lifecycle (browser) — automatic on load and after sync/goal changes
- **Path/Topic**: `DOMContentLoaded` → `bootstrap()` → `streakUI.render()`
- **File**: `src/main.js`, `src/streak.js`, `src/streak-ui.js`

## Core Path
1. `createStreak(db).compute()` reads `daily_records`, `settings.active_goal`, and optional `goal_history`; history falls back to the active goal or the 3.0 km default.
2. Future-dated records are excluded, then pure functions evaluate unified and fixed 1/3/5/10 km tier streaks, Hall of Fame periods, and lifetime 10k-step metrics.
3. Missing or below-goal today is in progress for active streaks; missing or failing past days terminate the run, and non-finite values fail the day.
4. `streakUI.render()` replaces `#lifetime-banner` and `#streak-card` and reports a zero-state on data failure.

## Data Touchpoints
- **Entities**: Daily records, effective goal history, streak metrics, Hall of Fame periods, lifetime 10k metrics
- **Tables**: `daily_records`, `settings`, `goal_history`

## Integrations
- **Type**: None (pure client-side computation + DOM render)
- **Target**: `#tab-dashboard`, `#lifetime-banner`, `#streak-card`
- **Channel**: N/A

## Scope
- `src/streak.js` — pure calculations and Dexie read orchestration
- `src/streak-ui.js` — streak card and lifetime banner renderer
- `src/main.js` — lifecycle wiring and post-sync rendering
- `src/goal.js`, `src/db.js` — goal-history writes and schema migration
- `styles.css` — streak presentation

## Tests
- `src/streak.test.js` — calculation, goal resolution, filtering, and metrics
- `src/streak-ui.test.js` — render, zero-state, idempotency, and dashboard output

## Notes
- Unified streak uses the goal effective on each date; fixed tier thresholds are 1, 3, 5, and 10 km.
- Records are sorted by date and compared with `>=`; the current day is an in-progress exception for active streaks.
- Goal-tier streaks, 10k-day counters, and override/audit logic described in the PRD (`.arcus/plans/PRD.md`) are not implemented.
- The computation remains pure at its calculation boundary and the separate render layer owns DOM writes.
