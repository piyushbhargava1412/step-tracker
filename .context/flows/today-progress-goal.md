# Flow: Today's Progress Panel & Goal Commitment

<!-- context-meta
verification-commit: HEAD
generated-at: 2026-09-28T17:00:00Z
confidence: high
-->

## Overview
The Today screen's progress panel (ST-025) combines today's progress and the streaks in one card:
a heading with the goal chip, a progress ring (steps / goal / percentage), "N steps to go" or "Goal
met", and a 3 × 2 grid of tiles — Distance, Strict, Lifetime / 99% tol, 95% tol, Best run.
`progress-ui.js` owns the heading, the ring and the Distance tile; `streak-ui.js` fills the other
five tiles (see `streak-calculation-render.md`). Changing the goal chip re-scores the streaks and
the calendar immediately.

## Entry Points
- **Type**: App lifecycle — `DOMContentLoaded` → `bootstrap()` → first `_renderViews(...)` pass → `progressUI.render()` (`src/main.js`)
- **Type**: UI Event — every sync (sync button, pull-to-refresh, connect, resume) → `_renderViews(dataViews(), 'sync')`
- **Type**: UI Event — goal change: `#goal-select` `change` → `goal.setActiveStepGoal(steps)` → `progressUI.render()` → `onGoalApplied` → `streakUI`, `calendarUI`, `weekUI` re-render
- **Type**: Custom event — `data:records:mutated` → every data view re-renders
- **File**: `src/main.js` (wiring), `src/progress-ui.js` (render + goal chip), `src/progress.js` (computation), `src/goal.js` (goal engine)

## Core Path
1. `render()` (in `src/progress-ui.js`) calls `Promise.all([getTodayRecord(db), goal.getActiveStepGoal()])`:
   - `getTodayRecord(db)` fetches `db.daily_records.get(todayLocalDate)` — `undefined` if no record yet.
   - `goal.getActiveStepGoal()` reads `settings.active_step_goal` (lazily writes `DEFAULT_STEP_GOAL` when absent or corrupt).
2. `computeProgress(todayRecord, stepGoal)` (pure, `src/progress.js`) returns `steps`, `target_steps`,
   `pct = min(100, round(steps / target × 100))`, `remaining_steps`, `goalMet`, and `distance_km`
   (today's `effective_distance_km`; 0 when absent, corrupt or negative).
3. The panel is rebuilt into `#today-progress` with `replaceChildren` (idempotent):
   - `.today-head`: "Today's progress" label + `label.goal-chip > select#goal-select` (`aria-label`
     "Daily step goal"), options from `STEP_GOAL_OPTIONS` labelled "Goal 10k · ~8 km".
   - `.ring[role=progressbar]` (`aria-valuenow` = pct): SVG track + `.ring__fill` arc whose
     `stroke-dasharray` is `pct% × RING_CIRCUMFERENCE` (`.ring__fill--full` when met), centre text
     `.ring__steps`, `.ring__goal` ("of 10,000 steps"), `.ring__pct`.
   - `.remaining-hint` "2,588 steps to go" or `.goal-met-badge` "Goal met"; `#goal-error[role=alert]`.
4. `#tile-distance` gets Distance / "5.6 km" / "today".
5. On any data error: `reporter.db('❌ Progress load failed')`, zero-state panel; `render()` never throws.
6. The goal chip's `change` listener (on the freshly built `<select>`, so re-renders never stack
   listeners) saves the goal as a number, re-renders, then calls `onGoalApplied` (errors logged);
   a failed save writes "⚠️ Failed to save goal — please try again" into `#goal-error`.

## Data Touchpoints
- `daily_records` row: `date`, `effective_steps`, `effective_distance_km` (read-only here)
- `settings` row `active_step_goal` (read + lazy default write)

## Integrations
- None — local Dexie data only.

## Scope
- `src/goal.js` — `createGoal`, `getActiveStepGoal`, `setActiveStepGoal`, `STEP_GOAL_OPTIONS`, `STEP_GOAL_KM_HINTS`, `DEFAULT_STEP_GOAL`
- `src/progress.js` — `getTodayRecord`, `computeProgress`
- `src/progress-ui.js` — `createProgressUI`, `RING_CIRCUMFERENCE`, `_goalOptionLabel`
- `src/main.js` — wiring; goal-change fan-out (`streakUI`, `calendarUI`, `weekUI`)
- `index.html` — `.today-card` with `#today-progress` and the six tile slots (`#tile-distance`, `#tile-strict`, `#tile-lifetime`, `#tile-tol99`, `#tile-tol95`, `#tile-best`)
- `styles.css` — `.today-card`, `.today-head`, `.goal-chip`, `.ring*`, `.remaining-hint`, `.goal-met-badge`, `.today-tiles`, `.stat-tile*`

## Tests
- `src/goal.test.js`, `src/progress.test.js` (incl. `distance_km`), `src/progress-ui.test.js` (ring values and arc, goal met, zero state, Distance tile, goal chip options / change order / failed save / no stacked listeners, no emoji)

## Notes
- Goal constants: `STEP_GOAL_OPTIONS = [4000, 6000, 8500, 10000]`; `DEFAULT_STEP_GOAL = 10000`; `STEP_GOAL_KM_HINTS = { 4000: 3, 6000: 5, 8500: 7, 10000: 8 }`.
- The old header "Active Lens" dropdown, the Today month-overview card and the separate streak card were removed in ST-025.
