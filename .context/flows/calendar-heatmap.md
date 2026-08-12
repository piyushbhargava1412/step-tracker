# Flow: Calendar Heatmap Grid and Day Detail Drawer

> Added: ST-005 — 2026-08-11 | Updated: ST-007a — 2026-08-12

<!-- context-meta
verification-commit: a4e9d6fd1aeaab215e9ad706d637b8816f346474
generated-at: 2026-08-12T06:00:00Z
confidence: high
-->

## Trigger Points

- `bootstrap()` in `src/main.js` — `calendarUI.render()` called after `streakUI.render()` (step 12)
- `#sync-btn` click handler — `calendarUI.render()` called after `streakUI.render()`
- Calendar navigation (Prev/Next buttons, month/year selects) — re-render within the `calendar-ui.js` closure
- `data:records:mutated` custom DOM event (dispatched by override form submit / revert button) → `calendarUI.render()` (plus `progressUI.render()` + `streakUI.render()`, all fail-open via `src/main.js`)
- Goal `<select>` `change` event → `goal.setActiveStepGoal()` → fan-out in `main.js` includes `calendarUI.render()`

## Data Flow

```
calendarUI.render(year, month)          [src/calendar-ui.js — createCalendarUI factory]
  │
  ├─ calendar.loadMonth(year, month)    [src/calendar.js — createCalendar factory]
  │    ├─ monthBounds(year, month)  →   { start: 'YYYY-MM-01', endExclusive }
  │    └─ Promise.all([
  │         db.daily_records.where('date').between(start, endExclusive, true, false).toArray(),
  │         goal.getActiveStepGoal(),                  ← scalar integer (no goal_history)
  │         db.daily_records.orderBy('date').first()   ← SF-6 lower nav bound
  │       ])
  │    ├─ buildMonthGrid(year, month, today)
  │    │    → { leadingPad, trailingPad, days: [{ date, dayOfMonth, isFuture }] }
  │    ├─ per day: classifyDay(record, activeStepGoal, isFuture) → { state, isOverridden }
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
       ├─ populate #day-drawer: date h2, metric rows, Edit/Override button, optional Revert button
       ├─ if record.is_overridden && records injected → show "Revert to Synced" button
       │    └─ revert click: window.confirm → records.revertRecord(date) → dispatch data:records:mutated
       ├─ if records injected → Edit / Override button is active (click → _mountOverrideForm)
       │    else → Edit button disabled (title: 'Editing arrives in ST-006')
       ├─ if record == null: zero-state ("No synced data for this date", all metrics → '—')
       ├─ drawer.classList.add('drawer--open'), remove hidden from drawer + overlay
       ├─ closeBtn.focus()
       └─ register (under { signal }):
            closeBtn click   → _closeDrawer(tile)
            overlay click    → _closeDrawer(tile)
            doc keydown Escape → _closeDrawer(tile)

_mountOverrideForm(drawer, day)
  ├─ removes Edit button from drawer
  ├─ builds <form data-form="override"> with:
  │    ├─ <input type="number" data-field="effective-steps"> (required, ≥0 integer)
  │    ├─ <input type="number" data-field="effective-distance"> (optional float ≥0)
  │    ├─ <textarea data-field="note"> (required, non-empty)
  │    ├─ <input type="file" data-field="proof-image"> (optional; accept PNG/JPEG/WebP)
  │    └─ <button type="submit"> Save Override
  └─ submit handler (under controller.signal):
       ├─ guard clauses: steps integer ≥0, note non-empty
       ├─ if file && processImage injected → proofBase64 = await processImage(file)
       ├─ await records.overrideRecord(date, { effective_steps, effective_distance_km, note, proof_image_base64 })
       ├─ dispatch CustomEvent('data:records:mutated', { detail: { date } })
       └─ on error: reporter.db('❌ Override failed') + console.error('[calendar-ui]', err)

_closeDrawer(tile)
  ├─ drawer.classList.remove('drawer--open'), set hidden on drawer + overlay
  ├─ drawer.replaceChildren()  ← clears content without innerHTML
  └─ tile.focus()  ← restores focus (guarded against removed tile)
```

## Key Modules

| Module | Role |
|---|---|
| `src/calendar.js` | Pure engine: grid arithmetic, step-based classification, aggregates, nav clamping, I/O surface |
| `src/calendar-ui.js` | Sole DOM writer: renders nav/summary/grid, manages drawer lifecycle, mounts override form |
| `src/records.js` | Override/revert capability: `createRecords(db)` → `{ overrideRecord, revertRecord }` |
| `src/image-processor.js` | Proof-image resize: `processImage(file)` → JPEG base64 data URL ≤1024 px |
| `src/month-overview.js` | Reusable month overview renderer: heatmap tiles + commitment hit-rate card for both dashboard and calendar tabs |
| `src/main.js` | Wires `createCalendar(db, goal)` + `createCalendarUI(doc, db, calendar, reporter, records, processImage, monthOverview)`; registers `data:records:mutated` listener |

## Classification Ladder (SF-2)

| Condition | State constant | CSS class |
|---|---|---|
| Future date OR no record | `CLASSIFICATION_NO_DATA` (0) | `tile--empty` |
| `ratio < 1.0` | `CLASSIFICATION_MISSED` (1) | `tile--missed` |
| `1.0 ≤ ratio < EXCEEDED_RATIO` | `CLASSIFICATION_MET` (2) | `tile--met` |
| `ratio ≥ EXCEEDED_RATIO` | `CLASSIFICATION_EXCEEDED` (3) | `tile--exceeded` |

`ratio = effective_steps / stepGoal` (step-only; no km division).
`EXCEEDED_RATIO = 1.5` (exported constant in `src/calendar.js`).
`isOverridden` is orthogonal — adds `tile__override-badge` regardless of state.

## Goal Change → Re-render Path

When the user changes the active step goal via the `<select>`:
1. `goal.setActiveStepGoal(steps)` persists the new scalar to `settings.active_step_goal`.
2. The `onGoalApplied` callback in `src/main.js` triggers a fail-open fan-out:
   `streakUI.render()` → `calendarUI.render()` → `monthOverview.render()`.
3. `calendarUI.render()` re-reads `goal.getActiveStepGoal()` via `calendar.loadMonth()` — the new
   goal takes effect immediately for all months.

## Security Boundary

All drawer content is written with `textContent` — no `innerHTML` assignment anywhere in `calendar-ui.js`. This is enforced by a `fs.readFileSync` assertion in `src/calendar-ui.test.js`. The `override.note` field (user-authored, persisted by ST-006) is the primary injection surface this guard protects.

## Navigation Bounds (SF-6)

- Lower: parsed from `daily_records.orderBy('date').first()` — the earliest stored record date.
- Upper: current local month (`_localDate()` from `src/date-utils.js`).
- `null` earliest (empty store or load failure): both `canGoPrev` and `canGoNext` forced to `false`.
- Navigation state lives in the `calendar-ui.js` render closure; the engine is stateless.
