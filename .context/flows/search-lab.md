# Flow: Search Lab Behavioral Insights

> Added: ST-008 — 2026-08-11

<!-- context-meta
verification-commit: HEAD
generated-at: 2026-08-11T08:00:00Z
confidence: medium
-->

## Trigger Points

- `bootstrap()` in `src/main.js` — `searchLabUI.render()` called on page load (step 14, fail-open)
- `#sync-btn` click handler — `searchLabUI.render()` called after sync completion (fail-open via `src/main.js`)
- `data:records:mutated` custom DOM event → `searchLabUI.render()` (fail-open, registered in `src/main.js`)

## Entry Points

- `createSearchLabUI(doc, engine, reporter)` — DI factory; `render()` is the sole public rendering method
- `createSearchLab(db, goal)` — DI factory; exposes `{ findNearMisses, computeDayOfWeekSlump, comparePeriods }`

## Data Flow

```
searchLabUI.render()                    [src/search-lab-ui.js — createSearchLabUI factory]
  │
  ├─ AbortController abort (previous render cycle aborted)
  ├─ engine.findNearMisses()            [src/search-lab.js — createSearchLab factory]
  │    ├─ db.daily_records.orderBy('date').first()   ← earliest record date
  │    ├─ if no earliest → return []
  │    ├─ loadGoalContext()
  │    │    └─ Promise.all([db.goal_history.toArray(), goal.getActiveGoal()])
  │    │         ├─ buildEffectiveGoalHistory(rows, activeGoal)   [src/goal-history.js]
  │    │         └─ _prepareGoalHistory(effectiveHistory)         [src/goal-history.js]
  │    ├─ db.daily_records.where('date').between(earliest, endExclusive).toArray()
  │    └─ for each record: isNearMiss(effectiveDistanceKm, target) → filter + map + sort ascending
  │
  ├─ engine.computeDayOfWeekSlump()
  │    ├─ db.daily_records.orderBy('date').first()
  │    ├─ if no earliest → return 7 empty buckets (all hitRate/avgSteps/totalDistanceKm null)
  │    ├─ loadGoalContext()  (shared goal-context load — single IDB round-trip)
  │    ├─ db.daily_records.where('date').between(...).toArray()
  │    ├─ accumulate per Mon–Sun bucket (index 0=Mon … 6=Sun): sumSteps, sumDistanceKm, metCount, count
  │    ├─ compute per-bucket: hitRate = round(metCount/count×100), avgSteps, totalDistanceKm
  │    └─ mark primarySlump: lowest hitRate; tie-break on avgSteps (lowest wins), then lowest index
  │
  ├─ render near-miss card (#search-nearmiss-card) into #tab-search
  │    ├─ for each near-miss day: row button with date + distance, data-action="open-day-drawer"
  │    └─ delegated click (under AbortController signal): dispatch CustomEvent('ui:open-day-drawer', { detail: { date } })
  │
  ├─ render slump card (#search-slump-card) into #tab-search
  │    └─ for each bucket: row with day label, hitRate%, avgSteps; data-slump="true" on primarySlump bucket
  │
  └─ render compare card (#search-compare-card) into #tab-search
       ├─ four date inputs (compare-a-start, compare-a-end, compare-b-start, compare-b-end)
       ├─ [data-action="compare-periods"] button click:
       │    └─ engine.comparePeriods(rangeA, rangeB)
       │         ├─ loadGoalContext()  (single IDB round-trip)
       │         ├─ Promise.all([db.daily_records.where('date').between(...), ...])  ← both periods in parallel
       │         ├─ aggregatePeriodSync: totalSteps, totalDistanceKm, hitRate per period
       │         └─ deltas: computeComparisonDelta(a, b) for each metric (null on zero/null baseline)
       └─ result rows rendered into [data-id="compare-results"]: metric label | Period A | Period B | Δ%
            └─ delta cell CSS class: delta--positive / delta--negative / delta--neutral
```

## ui:open-day-drawer Cross-Tab Integration

```
searchLabUI near-miss row click
  └─ dispatch CustomEvent('ui:open-day-drawer', { detail: { date: 'YYYY-MM-DD' } })
       └─ src/main.js listener (registered in bootstrap)
            └─ calendarUI.openDrawerForDate(date)   [see calendar-heatmap flow]
```

## Key Modules

| Module | Role |
|---|---|
| `src/search-lab.js` | Pure analytics engine: `findNearMisses`, `computeDayOfWeekSlump`, `comparePeriods`; pure helpers: `isNearMiss`, `dayOfWeekIndex`, `dateBounds`, `computeComparisonDelta` |
| `src/search-lab-ui.js` | Sole DOM writer for `#tab-search`: near-miss card, slump card, compare card; dispatches `ui:open-day-drawer` |
| `src/goal-history.js` | Shared: per-date goal resolution (`_resolvePreparedGoalForDate`); used by all three engine methods |
| `src/main.js` | Wires `createSearchLab(db, goal)` + `createSearchLabUI(doc, searchLab, reporter)`; registers `ui:open-day-drawer` forwarding listener |

## Scope

- Entry Points: `searchLabUI.render()` (called from bootstrap, sync handler, `data:records:mutated` handler)
- Core Path: `src/search-lab-ui.js` → `src/search-lab.js` → `src/goal-history.js` → Dexie `daily_records` + `goal_history`
- Scope: `src/search-lab.js`, `src/search-lab-ui.js`, `src/search-lab.test.js`, `src/search-lab-ui.test.js`, `src/main.js` (wiring), `styles.css` (Search Lab card styles)

## Near-Miss Definition

`isNearMiss(effectiveDistanceKm, target)` returns `true` when `effectiveDistanceKm ∈ [target × 0.90, target)` — i.e. within 10% below goal but not meeting it. Non-finite inputs and `target ≤ 0` return `false`.

## Day-of-Week Slump — Bucket Shape

```
{ day: 'Mon'|'Tue'|…|'Sun', hitRate: number|null, avgSteps: number|null,
  totalDistanceKm: number|null, count: number, primarySlump: boolean }
```

Empty buckets (no records for that day-of-week): `hitRate`, `avgSteps`, `totalDistanceKm` = `null`, `count` = 0, `primarySlump` = `false`.
