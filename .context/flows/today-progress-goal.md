# Flow: Today's Progress Card & Goal Commitment

<!-- context-meta
verification-commit: 9a0d42930ab13cb2f6ee855ffffcb01f1e964595
generated-at: 2026-08-10T15:55:56Z
confidence: medium
-->

## Overview
On page load the app reads today's step/distance record from Dexie and the user's active daily distance goal, computes progress metrics (percentage, remaining steps/distance, goal-met state), and renders a "Today's Progress" card with a goal-selector widget into `#tab-dashboard`. The user can change the active goal at any time via preset buttons or a custom km input; each change immediately re-renders the card.

## Entry Points
- **Type**: App lifecycle (browser) — automatic on load
  - `DOMContentLoaded` → `bootstrap()` → `progressUI.render()` (from `src/main.js`)
- **Type**: UI Event (browser) — post-sync re-render
  - `#sync-btn` click → after `stepSync.sync()` completes → `progressUI.render()`
- **Type**: UI Event (browser) — goal change
  - `#goal-selector` delegated click on `[data-goal-preset]` or `[data-goal-apply]` → `goal.setActiveGoal(km)` → `progressUI.render()`
- **File**: `src/main.js` (wiring), `src/progress-ui.js` (render + goal-selector), `src/progress.js` (computation), `src/goal.js` (goal engine)

## Core Path
1. `bootstrap()` in `src/main.js` instantiates `createGoal(db)`, `createStreak(db)`, `createStreakUI(...)`, and `createProgressUI(..., onGoalApplied)`, then awaits progress and streak rendering inside fail-open `try/catch` blocks.
2. `render()` (in `src/progress-ui.js`) calls `Promise.all([getTodayRecord(db), goal.getActiveGoal()])`:
   - `getTodayRecord(db)` fetches `db.daily_records.get(todayLocalDate)` — returns `undefined` if no record yet.
   - `goal.getActiveGoal()` reads `db.settings.get('active_goal')`:
     - Valid row → returns it.
     - Absent or corrupt row → lazily writes `{ key: 'active_goal', target_distance_km: 3.0, target_steps: 3937, effective_from: <today> }` and returns the default.
3. `computeProgress(todayRecord, activeGoal)` (pure function in `src/progress.js`) calculates:
   - `steps`, `distance_km` from record (0 if absent/corrupt).
   - `target_steps`, `target_km` from goal (defaults on non-finite/absent values, pct=0 on target≤0).
   - `pct = min(100, round(steps/target_steps × 100))`, `remaining_steps`, `remaining_m`, `remaining_km`, `goalMet = pct >= 100`.
4. `_buildCard(progress)` builds the card DOM (metric row, progress track+fill, `.goal-met-badge` or `.remaining-hint`).
5. `_buildSelector()` builds the goal-selector DOM with delegated click listener for preset buttons and custom Apply flow (validates input > 0, calls `goal.setActiveGoal(km)`, re-calls `render()`, and invokes the streak-render callback).
6. Old `#progress-card` and `#goal-selector` elements are removed before inserting the freshly-built ones (idempotent re-render).
7. On any data error, `reporter.db('❌ Progress load failed')` is called and `computeProgress(null, null)` produces a zero-state card; `render()` never throws.

## Data Touchpoints
- **Entities**:
  - `daily_records` row: `date` (PK, `YYYY-MM-DD` local), `effective_steps`, `effective_distance_km`
  - `settings` row: `key = 'active_goal'`, `target_distance_km`, `target_steps`, `effective_from`
  - `goal_history` rows: `effective_from`, `target_distance_km`, `target_steps`
- **Tables**: `daily_records` (Dexie, read-only in this flow); `settings` (Dexie, read + lazy-write default)

## Integrations
- **Type**: None — pure client-side DOM render from local Dexie data; no outbound API calls.

## Scope
- `src/goal.js` — Goal Commitment engine (`createGoal`, `getActiveGoal`, `setActiveGoal`, constants), including goal-history persistence
- `src/progress.js` — Pure computation (`getTodayRecord`, `computeProgress`)
- `src/progress-ui.js` — Render layer (`createProgressUI`, `render`, `_buildCard`, `_buildSelector`)
- `src/main.js` — Composition-root wiring (instantiation, load-time render, post-sync re-render)
- `styles.css` — `.card`, `.card-title`, `.metric-row`, `.metric-value`, `.metric-unit`, `.metric-sub`, `.progress-track`, `.progress-fill`, `.progress-fill--full`, `.goal-met-badge`, `.remaining-hint`, `.goal-selector`, `.goal-preset`, `.goal-input`, `.goal-apply`

## Tests
- `src/goal.test.js` — `createGoal` factory: `getActiveGoal` (valid row, absent, corrupt, DB read error), `setActiveGoal` (valid km, invalid km throws, DB write error graceful), `_localDate` helper.
- `src/progress.test.js` — `computeProgress` (zero record, normal record, goal-met, corrupt/absent goal, target≤0 guard); `getTodayRecord` passthrough.
- `src/progress-ui.test.js` — `createProgressUI`: render with data, render zero-state, idempotent re-render, goal preset click, custom apply click, validation error, DB error path.

## Notes
- Goal defaults: `3.0 km` / `3937 steps` (`KM_TO_STEPS = 1312.33`). Preset options: 1, 3, 5, 10 km.
- `_localDate` uses `getFullYear/getMonth/getDate` — never `toISOString()` — to stay timezone-safe (mirrors the `_formatLocalDate` convention in `src/steps.js`).
- `render()` is idempotent — safe to call multiple times (e.g. after each sync).
- The `settings` Dexie store was already declared at DB_VERSION 1 (`initial_backfill_complete` latch key); `active_goal` is a second key in the same store — no schema bump needed.
