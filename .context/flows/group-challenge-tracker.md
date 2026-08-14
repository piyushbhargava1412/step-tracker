# Flow: Group Challenge Tracker

<!-- context-meta
verification-commit: 7e440b755ebfd852ef1e22508b0aa5bb0fe55c4a
generated-at: 2026-08-14T00:00:00Z
confidence: medium
-->

## Overview
A dashboard card (`#challenge-card`) that tracks progress against a user-configured group step
challenge (a `start_date`/`end_date` window, optional name). It surfaces four metrics — Latest Day,
Cumulative Total, Day Progress ("Day N of M"), and Average Pace — computed purely from the local
`daily_records` table, and offers a "Copy Update" action that formats a shareable plain-text summary
to the clipboard.

## Entry Points
- **Type**: App lifecycle (browser) — automatic on load / after sync / after data mutation
  - `DOMContentLoaded` → `bootstrap()` → `challengeUI.render()`
  - After `stepSync.sync()` completes → `challengeUI.render()`
  - `data:records:mutated` custom event → `challengeUI.render()`
- **Type**: UI Event (browser)
  - `#challenge-card` → `[data-action="toggle-challenge-config"]` (⚙️ gear) click → shows/hides the date-config section
  - `#challenge-card` → `[data-action="save-challenge"]` click → `challenge.setActiveChallenge({ name, start_date, end_date })` then re-`render()`
  - `#challenge-card` → `[data-action="copy-challenge"]` click → formats and copies the update text to the clipboard
- **File**: `src/challenge-ui.js` (renderer), `src/challenge.js` (engine + pure metric/format helpers), `src/main.js` (wiring)

## Core Path
1. `createChallenge(db)` → `{ getActiveChallenge, setActiveChallenge }`. `getActiveChallenge()` reads
   the `active_challenge` row (`ACTIVE_CHALLENGE_KEY`) from the Dexie `settings` store; returns `null`
   for an absent or structurally-invalid row (missing `start_date`/`end_date` strings) — read errors are
   logged and swallowed, never thrown.
2. `setActiveChallenge({ name, start_date, end_date })` guards `end_date < start_date` with a thrown
   `RangeError`; preserves the existing `created_at` on edit or sets a fresh ISO timestamp on first
   save; a DB write error is logged and swallowed (fail-open) while the `RangeError` guard still
   propagates to the caller.
3. `createChallengeUI(doc, challenge, db, reporter).render()` is idempotent (removes any existing
   `#challenge-card` before inserting a fresh one) and always renders the mockup metric layout: header
   (title + date-range subtitle, ⚙️ gear + Copy Update actions), four metric tiles, and a collapsible
   date-config section (open by default when unconfigured, hidden once a challenge exists — the gear
   toggles it either way).
4. On render, `getActiveChallenge()` is read; when present, `db.daily_records.toArray()` (or
   equivalent) supplies the records passed to the pure `computeChallengeMetrics(challenge, records)`
   (from `src/challenge.js`) to derive the four tile values. Any error during the load falls back to a
   zero-state card and `reporter.db('❌ Challenge data load failed')` — `render()` never throws.
5. **Latest Day** = the most recent *completed* day inside the challenge range: `today - 1` while the
   challenge is active (`end_date >= today`), or `end_date` once it has completed. **Cumulative Total**
   sums `effective_steps` over `[start_date, rangeEnd]`. **Day Progress** is `elapsedDays` of
   `totalDays` (`_daysBetween(start_date, end_date) + 1`). **Average Pace** = `cumulativeTotal /
   elapsedDays`, guarded against divide-by-zero.
6. **Save**: reads the `challenge-name` / `start-date` / `end-date` fields from the config section,
   calls `challenge.setActiveChallenge(...)`, and re-runs `render()` on success; a thrown `RangeError`
   (or other error) is caught, logged, and surfaced via `reporter.db('❌ Failed to save challenge: ' +
   err.message)`.
7. **Copy Update**: `formatChallengeUpdate(metrics, name)` (pure, from `src/challenge.js`) builds a
   multi-line plain-text summary (🚶 name Update / 📅 Latest Day / 📊 Cumulative Total / 📈 Average
   Pace, thousands-separated via `toLocaleString('en-US')`) and writes it via
   `navigator.clipboard.writeText()`; on success a transient "✅ Copied to Clipboard!" badge is appended
   and removed after 2 seconds via `setTimeout`; a clipboard failure is caught and reported via
   `reporter.db('⚠️ Copy to clipboard failed')`.
8. A single `AbortController`-scoped delegated click listener per render handles all three actions
   (`toggle-challenge-config` / `save-challenge` / `copy-challenge`) — re-rendering aborts the previous
   scope so listeners never accumulate.

## Data Touchpoints
- **Entities**: `settings` row `key = 'active_challenge'` (`name`, `start_date`, `end_date`, `created_at`); `daily_records` (`date`, `effective_steps`) read-only for metric computation.
- **Tables**: `settings` (Dexie, read + write); `daily_records` (Dexie, read-only). No new table — reuses existing schema.
- **UI Surface**: `#challenge-card`, mounted into `#tab-dashboard` stacked below the Today's Progress card; errors surfaced via `reporter.db()` → `#db-status`.

## Integrations
- **Type**: Browser API
- **Target**: Clipboard API (`navigator.clipboard.writeText`)
- **Channel**: N/A (in-browser only, no network)

## Error / Retry Surface
- `getActiveChallenge` / DB write in `setActiveChallenge`: caught, logged (`console.error('[challenge]', err)`), fail-open (absent-row semantics for reads, silent-drop for writes).
- `setActiveChallenge`'s `end_date < start_date` guard is the one error that propagates (thrown `RangeError`), surfaced by the UI as `reporter.db('❌ Failed to save challenge: …')`.
- `render()` data-load failure → zero-state card + `reporter.db('❌ Challenge data load failed')`; never throws.
- Clipboard write failure → `reporter.db('⚠️ Copy to clipboard failed')`; the copy action never rethrows.
- Fail-open at bootstrap: `console.error('[main] challengeUI.render failed, continuing', err)` wraps every call site in `src/main.js`.

## Scope
- `src/challenge.js` — engine (`createChallenge(db)` → `{ getActiveChallenge, setActiveChallenge }`; `ACTIVE_CHALLENGE_KEY`) and pure exports `computeChallengeMetrics(challenge, records)`, `formatChallengeUpdate(metrics, name)`
- `src/challenge-ui.js` — `createChallengeUI(doc, challenge, db, reporter)` → `{ render() }`
- `src/main.js` — composition-root wiring (bootstrap render, post-sync render, `data:records:mutated` re-render)
- `styles.css` — `#challenge-card` mockup layout (stacked below the progress card, left dashboard column, grid row 3)

## Tests
- `src/challenge.test.js` — engine read/write (valid row, absent, corrupt, `RangeError` guard, `created_at` preservation), `computeChallengeMetrics` (active vs. completed, elapsed/total days, avg pace divide-by-zero guard), `formatChallengeUpdate` (name fallback, number formatting).
- `src/challenge-ui.test.js` — render (configured / unconfigured / zero-state), idempotent re-render, gear toggle, save handler (success + `RangeError` path), copy handler (clipboard success + failure), AbortController listener lifecycle.

## Notes
- "Latest Day" intentionally lags one day behind "today" while the challenge is active, since today's
  own sync data is typically still incomplete; it snaps to the fixed `end_date` once the challenge has
  completed.
- No separate `goal_history`-style per-date resolution — challenge metrics read `effective_steps`
  directly off `daily_records`, consistent with the scalar-lens convention used elsewhere in the repo.
