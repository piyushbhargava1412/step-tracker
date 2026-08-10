# Flow: Streak Calculation & Rendering

<!-- context-meta
verification-commit: 8eac5589e7fe87b00de879dba314b4bf7691a8e0
generated-at: 2026-08-10T06:36:28Z
confidence: medium
-->

## Overview
Reduces stitched daily step buckets into per-day totals, computes the current unbroken streak against a fixed daily goal, and renders the streak plus raw totals to the page.

> **Implementation status**: `parseAndCalculateStreak()` and its DOM targets (`#streak-display`, `#output`) were in `app.js` and `index.html` respectively, both of which were removed during the modular refactor (ST-001). No equivalent module exists yet in `src/`. This flow documents the intended design for reference until it is re-introduced.

## Entry Points
- **Type**: Internal function — **not yet implemented in modular structure**
- **Path/Topic**: `parseAndCalculateStreak(data)` (was in `app.js`, now deleted)
- **File**: N/A — no current implementation in `src/`

## Core Path
> Prior implementation (in deleted `app.js`) — preserved for re-implementation reference:
1. `parseAndCalculateStreak(data) -> dailyBuckets = data.bucket || []` extracts buckets.
2. For each bucket, read `dataset[0].point[0].value[0].intVal` (default 0) into `dailyTotals[]`.
3. Iterate `dailyTotals` from newest (end) to oldest, incrementing `currentStreak` while `steps >= DAILY_STEP_GOAL` (3900), breaking on the first miss.
4. Render `Current Streak: <n> Days` into `#streak-display` and the raw `dailyTotals` JSON into `#output`.

## Data Touchpoints
- **Entities**: In-memory `dailyTotals` array, `currentStreak` counter (`app.js`)
- **Tables**: None

## Integrations
- **Type**: None (pure client-side computation + DOM render)
- **Target**: DOM elements `#streak-display`, `#output`
- **Channel**: N/A

## Scope
- `app.js` (`parseAndCalculateStreak` function) — **deleted in modular refactor**
- `index.html` (`#streak-display`, `#output`) — **both elements removed from index.html**
- `styles.css` (presentation — tab/panel layout now applies)
- Future: a `src/streak.js` (or similar) module in the `src/` structure

## Tests
- None found in repository.

## Notes
- `DAILY_STEP_GOAL = 3900` (~3 km) was hardcoded in `parseAndCalculateStreak` (now deleted with `app.js`).
- Streak logic assumed `combinedBuckets` are ordered oldest-first (as produced by the Historical Step Sync flow), so the last array element is the most recent day.
- Goal-tier streaks, 10k-day counters, and override/audit logic described in the PRD (`.arcus/plans/PRD.md`) are not implemented.
- When re-introduced in the `src/` structure, streak calculation should be a pure function (no DOM writes) and a separate thin render layer should write to the DOM — this separation is now explicitly recommended by the updated design-and-coding-patterns.
