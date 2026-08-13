# Flow: Today's Progress Card & Goal Commitment

<!-- context-meta
verification-commit: a4e9d6fd1aeaab215e9ad706d637b8816f346474
generated-at: 2026-08-12T06:00:00Z
confidence: high
-->

## Overview
On page load the app reads today's step record from Dexie and the user's active step goal (a scalar
integer, no km), computes progress metrics (percentage, remaining steps, goal-met state), and renders
a "Today's Progress" card with a step-target `<select>` into `#tab-dashboard`. The user can change
the active goal at any time via the `<select>` drop-down; each change immediately re-renders the
card, streak, calendar, and month-overview.

## Entry Points
- **Type**: App lifecycle (browser) — automatic on load
  - `DOMContentLoaded` → `bootstrap()` → `progressUI.render()` (from `src/main.js`)
- **Type**: UI Event (browser) — post-sync re-render
  - `#sync-btn` click → after `stepSync.sync()` completes → `progressUI.render()`
- **Type**: UI Event (browser) — goal change
  - `#goal-select` `change` event → `goal.setActiveStepGoal(steps)` → `progressUI.render()` → fan-out: `streakUI.render()`, `calendarUI.render()`, `monthOverview.render()`
- **File**: `src/main.js` (wiring), `src/progress-ui.js` (render + goal selector), `src/progress.js` (computation), `src/goal.js` (goal engine)

## Core Path
1. `bootstrap()` in `src/main.js` instantiates `createGoal(db)`, `createStreak(db)`, `createStreakUI(...)`, `createProgressUI(doc, goal, db, reporter, onGoalApplied)`, then calls `progressUI.render()` (fail-open).
2. `render()` (in `src/progress-ui.js`) calls `Promise.all([getTodayRecord(db), goal.getActiveStepGoal()])`:
   - `getTodayRecord(db)` fetches `db.daily_records.get(todayLocalDate)` — returns `undefined` if no record yet.
   - `goal.getActiveStepGoal()` reads `db.settings.get('active_step_goal')`:
     - Valid row with `target_steps` in `STEP_GOAL_OPTIONS` → returns the integer.
     - Absent or corrupt row → lazily writes `{ key: 'active_step_goal', target_steps: DEFAULT_STEP_GOAL }` and returns `DEFAULT_STEP_GOAL`.
3. `computeProgress(todayRecord, stepGoal)` (pure function in `src/progress.js`) calculates:
   - `steps` from record (0 if absent/corrupt).
   - `target_steps` from the integer `stepGoal` (defaults to `DEFAULT_STEP_GOAL` on non-finite/absent values, pct=0 on target≤0).
   - `pct = min(100, round(steps / target_steps × 100))`, `remaining_steps`, `goalMet = pct >= 100`.
4. `_buildCard(progress)` builds the card DOM (metric row, progress track+fill, `.goal-met-badge` or `.remaining-hint`).
5. `_buildSelector(progress)` builds the goal-selector DOM: a `<select id="goal-select">` populated from `STEP_GOAL_OPTIONS` (imported from `src/goal.js`). The `change` listener calls `goal.setActiveStepGoal(Number(e.target.value))` and invokes the `onGoalApplied` callback (which triggers `streakUI.render()`, `calendarUI.render()`, and `monthOverview.render()` in `main.js`).
6. Old `#progress-card` and `#goal-selector` elements are removed before inserting the freshly-built ones (idempotent re-render).
7. On any data error, `reporter.db('❌ Progress load failed')` is called and `computeProgress(null, null)` produces a zero-state card; `render()` never throws.

## Data Touchpoints
- **Entities**:
  - `daily_records` row: `date` (PK, `YYYY-MM-DD` local), `effective_steps`, `effective_distance_km`
  - `settings` row: `key = 'active_step_goal'`, `target_steps` (integer, member of `STEP_GOAL_OPTIONS`)
- **Tables**: `daily_records` (Dexie, read-only in this flow); `settings` (Dexie, read + lazy-write default)

## Integrations
- **Type**: None — pure client-side DOM render from local Dexie data; no outbound API calls.

## Scope
- `src/goal.js` — Goal Commitment engine (`createGoal`, `getActiveStepGoal`, `setActiveStepGoal`, `STEP_GOAL_OPTIONS`, `DEFAULT_STEP_GOAL`). Scalar step-only lens; no km fields, no `effective_from` date-scoping, no `goal_history` write.
- `src/progress.js` — Pure computation (`getTodayRecord`, `computeProgress`)
- `src/progress-ui.js` — Render layer (`createProgressUI`, `render`, `_buildCard`, `_buildSelector`)
- `src/main.js` — Composition-root wiring (instantiation, load-time render, post-sync re-render, goal-change three-renderer fan-out)
- `styles.css` — `.card`, `.card-title`, `.metric-row`, `.metric-value`, `.metric-unit`, `.metric-sub`, `.progress-track`, `.progress-fill`, `.progress-fill--full`, `.goal-met-badge`, `.remaining-hint`, `.goal-selector`, `.goal-select`

## Tests
- `src/goal.test.js` — `createGoal` factory: `getActiveStepGoal` (valid row, absent, corrupt, DB read error), `setActiveStepGoal` (valid steps from `STEP_GOAL_OPTIONS`, invalid steps throws `TypeError`, DB write error graceful).
- `src/progress.test.js` — `computeProgress` (zero record, normal record, goal-met, corrupt/absent goal, target≤0 guard); `getTodayRecord` passthrough.
- `src/progress-ui.test.js` — `createProgressUI`: render with data, render zero-state, idempotent re-render, goal `<select>` change event, `onGoalApplied` callback invoked, validation error, DB error path.

## Notes
- Goal constants: `STEP_GOAL_OPTIONS = [4000, 6000, 8500, 10000]`; `DEFAULT_STEP_GOAL = 10000`; `STEP_GOAL_KM_HINTS = { 4000: 3, 6000: 5, 8500: 7, 10000: 8 }` (display-only km hints). No km presets beyond the hint labels.
- `_localDate` is imported from `src/date-utils.js` (extracted utility, not inline in `goal.js`).
- `render()` is idempotent — safe to call multiple times (e.g. after each sync).
- The `settings` store uses key `'active_step_goal'` (not the legacy `'active_goal'`). No `goal_history` table is read or written in this flow; it was dropped in DB_VERSION 4.
- Goal change triggers a three-renderer fan-out in `src/main.js`: `streakUI.render()`, `calendarUI.render()`, `monthOverview.render()` — all fail-open.
