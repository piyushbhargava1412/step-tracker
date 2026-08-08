# Flow: Streak Calculation & Rendering

<!-- context-meta
verification-commit: 87a2be210c32952fad49351243445601b3564a97
generated-at: 2026-08-08T11:16:42.345+05:30
confidence: high
-->

## Overview
Reduces stitched daily step buckets into per-day totals, computes the current unbroken streak against a fixed daily goal, and renders the streak plus raw totals to the page.

## Entry Points
- **Type**: Internal function (invoked by Historical Step Sync flow)
- **Path/Topic**: `parseAndCalculateStreak(data)`
- **File**: `app.js`

## Core Path
1. `parseAndCalculateStreak(data) -> dailyBuckets = data.bucket || []` extracts buckets (`app.js`).
2. For each bucket, read `dataset[0].point[0].value[0].intVal` (default 0) into `dailyTotals[]` (`app.js`).
3. Iterate `dailyTotals` from newest (end) to oldest, incrementing `currentStreak` while `steps >= DAILY_STEP_GOAL` (3900), breaking on the first miss (`app.js`).
4. Render `Current Streak: <n> Days` into `#streak-display` and the raw `dailyTotals` JSON into `#output` (`app.js`).

## Data Touchpoints
- **Entities**: In-memory `dailyTotals` array, `currentStreak` counter (`app.js`)
- **Tables**: None

## Integrations
- **Type**: None (pure client-side computation + DOM render)
- **Target**: DOM elements `#streak-display`, `#output`
- **Channel**: N/A

## Scope
- `app.js` (`parseAndCalculateStreak` function)
- `index.html` (`#streak-display`, `#output`)
- `styles.css` (presentation)

## Tests
- None found in repository.

## Notes
- `DAILY_STEP_GOAL = 3900` (~3 km) is hardcoded in `parseAndCalculateStreak`.
- Streak logic assumes `combinedBuckets` are ordered oldest-first (as produced by the Historical Step Sync flow), so the last array element is the most recent day.
- Goal-tier streaks, 10k-day counters, and override/audit logic described in the PRD (`.arcus/plans/PRD.md`) are not implemented; current logic is a single fixed-goal streak.
