# Flow: Group Challenge Tracker

<!-- context-meta
verification-commit: HEAD
generated-at: 2026-09-28T17:00:00Z
confidence: medium
-->

## Overview
Tracks progress against a user-configured group step challenge (a `start_date`/`end_date` window,
optional name). Since ST-025 it has two surfaces: a summary card on Today (name, "Day N of M · avg
X / day", progress bar) that opens the **Group challenge** screen, and that screen's card with four
metrics — Latest Day, Cumulative Total, Day Progress, Average Pace — computed from the local
`daily_records` table, the update text itself, and Copy / Share to group actions.

## Entry Points
- **Type**: App lifecycle (browser) — automatic on load / after sync / after data mutation
  - `DOMContentLoaded` → `bootstrap()` → `challengeUI.render()`
  - After `stepSync.sync()` completes → `challengeUI.render()`
  - `data:records:mutated` custom event → `challengeUI.render()`
- **Type**: UI Event (browser)
  - `#today-challenge .challenge-summary` (`data-go="challenge"`) click → navigation opens the Group challenge screen
  - `#challenge-card` → `[data-action="toggle-challenge-config"]` (pencil "Edit challenge" icon button) click → shows/hides the date-config section
  - `#challenge-card` → `[data-action="save-challenge"]` click → `challenge.setActiveChallenge({ name, start_date, end_date })` then re-`render()`
  - `#challenge-card` → `[data-action="copy-challenge"]` click → formats and copies the update text to the clipboard
  - `#challenge-card` → `[data-action="share-challenge"]` click → `share(text)` — the Android share sheet in the app, Web Share in a browser that has it (button absent otherwise)
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
3. `createChallengeUI(doc, challenge, db, reporter, { share }).render()` is idempotent (removes any
   existing `#challenge-card`; replaces `#today-challenge`'s content) and renders:
   - into `#today-challenge`: the summary card (default title "Group challenge"; "Set up a step
     challenge with friends" when none is configured);
   - into `#challenge-detail` (fallback `#tab-challenge`): header (title + range, pencil Edit button),
     four metric tiles, the update text (`.challenge-preview`), Copy (+ Share to group when `share`
     is set), and the collapsible date config (open when unconfigured, hidden once configured).
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
   `navigator.clipboard.writeText()`; on success a transient badge is appended
   ("Copied to clipboard") and removed after 2 seconds via `setTimeout`; a clipboard failure is caught and reported via
   `reporter.db('⚠️ Copy to clipboard failed')`.
8. **Share to group**: the same text goes to the injected `share(text)` (`selectShare({ isNative })`
   from `src/platform/share.js`); a failure or cancel → `reporter.db('⚠️ Could not share the update')`.
9. A single `AbortController`-scoped delegated click listener per render handles all four actions
   (`toggle-challenge-config` / `save-challenge` / `copy-challenge` / `share-challenge`) — re-rendering aborts the previous
   scope so listeners never accumulate.

## Data Touchpoints
- **Entities**: `settings` row `key = 'active_challenge'` (`name`, `start_date`, `end_date`, `created_at`); `daily_records` (`date`, `effective_steps`) read-only for metric computation.
- **Tables**: `settings` (Dexie, read + write); `daily_records` (Dexie, read-only). No new table — reuses existing schema.
- **UI Surface**: `.challenge-summary` in `#today-challenge` (Today) and `#challenge-card` in `#challenge-detail` (Group challenge screen); errors surfaced via `reporter.db()` → `#db-status`.

## Integrations
- **Type**: Browser API
- **Target**: Clipboard API (`navigator.clipboard.writeText`); `@capacitor/share` (app) / Web Share API (browser)
- **Channel**: N/A (in-browser only, no network)

## Error / Retry Surface
- `getActiveChallenge` / DB write in `setActiveChallenge`: caught, logged (`console.error('[challenge]', err)`), fail-open (absent-row semantics for reads, silent-drop for writes).
- `setActiveChallenge`'s `end_date < start_date` guard is the one error that propagates (thrown `RangeError`), surfaced by the UI as `reporter.db('❌ Failed to save challenge: …')`.
- `render()` data-load failure → zero-state card + `reporter.db('❌ Challenge data load failed')`; never throws.
- Clipboard write failure → `reporter.db('⚠️ Copy to clipboard failed')`; the copy action never rethrows.
- Fail-open at bootstrap: `console.error('[main] challengeUI.render failed, continuing', err)` wraps every call site in `src/main.js`.

## Scope
- `src/challenge.js` — engine (`createChallenge(db)` → `{ getActiveChallenge, setActiveChallenge }`; `ACTIVE_CHALLENGE_KEY`) and pure exports `computeChallengeMetrics(challenge, records)`, `formatChallengeUpdate(metrics, name)`
- `src/challenge-ui.js` — `createChallengeUI(doc, challenge, db, reporter, { share })` → `{ render() }`
- `src/platform/share.js` — `selectShare({ isNative, plugin, nav })`
- `src/main.js` — composition-root wiring (bootstrap render, post-sync render, `data:records:mutated` re-render)
- `styles.css` — `.challenge-summary*`, `.challenge-card`, `.challenge-metrics`, `.challenge-preview`, `.challenge-share`, `.challenge-config`

## Tests
- `src/challenge.test.js` — engine read/write (valid row, absent, corrupt, `RangeError` guard, `created_at` preservation), `computeChallengeMetrics` (active vs. completed, elapsed/total days, avg pace divide-by-zero guard), `formatChallengeUpdate` (name fallback, number formatting).
- `src/challenge-ui.test.js` — render (configured / unconfigured / zero-state), idempotent re-render, gear toggle, save handler (success + `RangeError` path), copy handler (clipboard success + failure), Today summary card, update preview, share (success, failure, absent), AbortController listener lifecycle; `src/platform/share.test.js`.

## Notes
- "Latest Day" intentionally lags one day behind "today" while the challenge is active, since today's
  own sync data is typically still incomplete; it snaps to the fixed `end_date` once the challenge has
  completed.
- No separate `goal_history`-style per-date resolution — challenge metrics read `effective_steps`
  directly off `daily_records`, consistent with the scalar-lens convention used elsewhere in the repo.
