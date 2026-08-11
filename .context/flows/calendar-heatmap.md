# Flow: Calendar Heatmap Grid and Day Detail Drawer

> Added: ST-005 — 2026-08-11

## Trigger Points

- `bootstrap()` in `src/main.js` — `calendarUI.render()` called after `streakUI.render()` (step 12)
- `#sync-btn` click handler — `calendarUI.render()` called after `streakUI.render()`
- Calendar navigation (Prev/Next buttons, month/year selects) — re-render within the `calendar-ui.js` closure

## Data Flow

```
calendarUI.render(year, month)          [src/calendar-ui.js — createCalendarUI factory]
  │
  ├─ calendar.loadMonth(year, month)    [src/calendar.js — createCalendar factory]
  │    ├─ monthBounds(year, month)  →   { start: 'YYYY-MM-01', endExclusive }
  │    └─ Promise.all([
  │         db.daily_records.where('date').between(start, endExclusive, true, false).toArray(),
  │         db.goal_history.toArray(),
  │         goal.getActiveGoal(),
  │         db.daily_records.orderBy('date').first()   ← SF-6 lower nav bound
  │       ])
  │    ├─ buildEffectiveGoalHistory(history, activeGoal)   [src/goal-history.js]
  │    │    → populated history | synthetic [{ effective_from, target_distance_km }] | []
  │    ├─ _prepareGoalHistory(goalHistory)                  [src/goal-history.js]
  │    ├─ buildMonthGrid(year, month, today)
  │    │    → { leadingPad, trailingPad, days: [{ date, dayOfMonth, isFuture }] }
  │    ├─ per day: _resolvePreparedGoalForDate(prepared, date) → targetDistanceKm
  │    ├─ per day: classifyDay(record, targetDistanceKm, isFuture) → { state, isOverridden }
  │    ├─ computeMonthlyAggregates(days) → { daysEvaluated, targetMetDays, totalSteps, ... }
  │    └─ computeNavBounds(earliestRecordDate, today, year, month)
  │         → { canGoPrev, canGoNext, minYear, maxYear }
  │
  ├─ catch(err) → console.error('[calendar]', err)
  │               reporter.db('❌ Calendar load failed')
  │               payload = calendarEngine.buildZeroState(year, month)   ← fail-open
  │
  ├─ _closeDrawerInternal()   ← SF-8: re-render always closes open drawer first
  ├─ remove #calendar-nav / #calendar-summary / #calendar-grid children
  └─ append fresh nav + summary + grid + re-attach listeners under new AbortController
```

## Drawer Sub-flow

```
tile <button data-date="YYYY-MM-DD"> click (delegated listener on #calendar-grid)
  └─ _openDrawer(day)
       ├─ store doc.activeElement for focus restoration
       ├─ populate #day-drawer: date h2, metric rows, override fields, Edit button (disabled)
       ├─ if record == null: zero-state ("No synced data for this date", all metrics → '—')
       ├─ drawer.classList.add('drawer--open'), remove hidden from drawer + overlay
       ├─ closeBtn.focus()
       └─ register (under { signal }):
            closeBtn click   → _closeDrawer(tile)
            overlay click    → _closeDrawer(tile)
            doc keydown Escape → _closeDrawer(tile)

_closeDrawer(tile)
  ├─ drawer.classList.remove('drawer--open'), set hidden on drawer + overlay
  ├─ drawer.replaceChildren()  ← clears content without innerHTML
  └─ tile.focus()  ← restores focus (guarded against removed tile)
```

## Key Modules

| Module | Role |
|---|---|
| `src/calendar.js` | Pure engine: grid arithmetic, classification, aggregates, nav clamping, I/O surface |
| `src/calendar-ui.js` | Sole DOM writer: renders nav/summary/grid, manages drawer lifecycle |
| `src/goal-history.js` | Shared: per-date goal resolution and synthetic fallback (shared with streak.js) |
| `src/main.js` | Wires `createCalendar(db, goal)` + `createCalendarUI(doc, db, calendar, reporter)` |

## Classification Ladder (SF-2)

| Condition | State constant | CSS class |
|---|---|---|
| Future date OR no record | `CLASSIFICATION_NO_DATA` (0) | `tile--empty` |
| `ratio < 1.0` | `CLASSIFICATION_MISSED` (1) | `tile--missed` |
| `1.0 ≤ ratio < 2.0` | `CLASSIFICATION_MET` (2) | `tile--met` |
| `ratio ≥ 2.0` | `CLASSIFICATION_EXCEEDED` (3) | `tile--exceeded` |

`ratio = effective_distance_km / targetDistanceKm`. `isOverridden` is orthogonal — adds `tile__override-badge` regardless of state.

## Security Boundary

All drawer content is written with `textContent` — no `innerHTML` assignment anywhere in `calendar-ui.js`. This is enforced by a `fs.readFileSync` assertion in `src/calendar-ui.test.js`. The `override.note` field (user-authored, persisted by ST-006) is the primary injection surface this guard protects.

## Navigation Bounds (SF-6)

- Lower: parsed from `daily_records.orderBy('date').first()` — the earliest stored record date.
- Upper: current local month (`_localDate()` from `goal.js`).
- `null` earliest (empty store or load failure): both `canGoPrev` and `canGoNext` forced to `false`.
- Navigation state lives in the `calendar-ui.js` render closure; the engine is stateless.
