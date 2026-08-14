# Flow: Persistent Storage Guidance Modal

> Added: ST-012 — 2026-08-14

<!-- context-meta
verification-commit: 74fa46903f2fe0d51e91869ea7a846be7edfadcf
generated-at: 2026-08-14T13:00:00Z
confidence: medium
-->

## Overview
An interactive popup explaining, in plain language, why persisting storage matters, and offering a
one-click `navigator.storage.persist()` request, opened by clicking the `#db-status` badge whenever
it is showing the "⚠️ Unprotected" pill state. This gives the existing `requestPersistentStorage`
capability (`src/storage.js`, requested automatically at bootstrap) a discoverable, user-triggerable
retry path with explanatory copy, instead of only the one silent bootstrap-time attempt. A successful
grant is also recorded in `localStorage` so the badge reads "🛡️ Storage Safe" on return visits without
needing to re-request.

## Entry Points
- **Type**: UI Event (browser)
- **Path/Topic**: Click on the `#db-status` header pill, only when its text contains
  `"Unprotected"` → opens the modal
- **File**: `src/storage-modal.js` (modal + badge binding), `src/main.js` (wiring), `src/storage.js` (underlying `requestPersistentStorage` capability + `NOT_PERSISTED_TEXT`/`PERSISTED_TEXT` badge copy reused by the modal's action button)

## Core Path
1. `createStorageModal(doc, reporter, nav, storage = null)` builds the full modal overlay DOM up front
   (`createElement`/`textContent` only, never `innerHTML`) and appends it to `doc.body`; the overlay
   starts `hidden`. The optional `storage` collaborator (a `localStorage`-shaped object, wired to
   `window.localStorage` in `main.js`) records a successful persistence grant.
2. `attach()` binds an AbortController-scoped delegated click listener on `#db-status`: a click opens
   the modal **only if** `statusEl.textContent` currently includes `"Unprotected"` — clicking the
   badge while storage is already persisted (showing "Storage Safe") is a no-op. Re-calling `attach()`
   re-scopes the listener so it is never registered twice.
3. `open()` un-hides the overlay and (re-)scopes a fresh AbortController-bound click listener on the
   overlay for close/backdrop/action clicks — repeated `open()` calls never accumulate listeners.
4. The modal body ("🛡️ Protect Your Step History") explains, in a single friendly paragraph, that
   browsers occasionally clear cached web data when the device runs low on disk space, plus a
   `[ 🛡️ Protect My Data ]` button (`data-action="request-persist"`).
5. Clicking Protect My Data calls `nav.storage.persist()`; on `true` it reports `PERSISTED_TEXT`
   ("🛡️ Storage Safe") via the injected `reporter.db(...)`, records the grant via
   `storage?.setItem?.(STORAGE_PERSIST_GRANTED_KEY, '1')` (best-effort — no throw if `storage` is
   omitted or the write fails), and closes the modal; on `false` it reports `NOT_PERSISTED_TEXT`
   ("⚠️ Unprotected") and leaves the modal open. Errors are caught, logged
   (`console.error('[storage-modal]', err)`), and never rethrown.
6. `close()` (via the `✕` button, a backdrop click, or after a successful persist) aborts the modal's
   listener scope and re-hides the overlay.
7. Wired in `src/main.js` at bootstrap: `createStorageModal(doc, reporter, navigator, storage)`
   (`storage` = the injected `window.localStorage`-shaped collaborator, the same one threaded through
   `bootstrap(doc, storage)`) then `storageModal.attach()`, both fail-open (each wrapped in its own
   `try/catch` so a failure here never blocks the rest of bootstrap).

## Data Touchpoints
- **Entities**: None persisted by this flow itself — it is a UI wrapper around the browser's
  `navigator.storage` Storage API. `#db-status` badge text is both the trigger condition and the
  post-action feedback surface (set by `src/ui-status.js`'s `db(text)` method, reused here via the
  injected `reporter`).
- **Tables**: None (no Dexie reads/writes).
- **UI Surface**: `#db-status` badge/pill (trigger), a body-appended `.modal-overlay.storage-modal-overlay` (dialog, reusing the shared `.modal-overlay` fixed/centered/dimmed pattern also used by Settings).
- **Local Storage**: `storage_persist_granted` (`STORAGE_PERSIST_GRANTED_KEY`) — set to `'1'` in the injected `storage` collaborator on a successful persist grant (best-effort, not read back by this flow).

## Integrations
- **Type**: Browser API
- **Target**: `navigator.storage.persist()` (Storage API)
- **Channel**: N/A (in-browser only, no network)

## Error / Retry Surface
- `nav?.storage?.persist?.()` failures (rejected promise, or `navigator.storage` unavailable) are
  caught and logged; the modal stays open with no status change so the user can retry.
- Missing `#db-status` element or a `doc` that cannot `createElement`: `attach()`/`_buildOverlay` guard
  clauses fail open (no throw, no binding).

## Scope
- `src/storage-modal.js` — `createStorageModal(doc, reporter, nav, storage = null)` → `{ attach, open, close }`; re-exports `NOT_PERSISTED_TEXT`, `PERSISTED_TEXT` from `src/storage.js`; exports `STORAGE_PERSIST_GRANTED_KEY`
- `src/storage.js` — `requestPersistentStorage(reporter, nav)` (the original bootstrap-time request this modal supplements; unchanged by this flow) plus the single-source-of-truth badge-copy exports `NOT_PERSISTED_TEXT` ("⚠️ Unprotected"), `PERSISTED_TEXT` ("🛡️ Storage Safe")
- `src/ui-status.js` — `#db-status` badge text set via `reporter.db(text)` (read by the modal's open-trigger guard)
- `src/main.js` — composition-root wiring (`createStorageModal(doc, reporter, navigator, storage)` + `attach()`, fail-open)

## Tests
- `src/storage-modal.test.js` — modal build (no-innerHTML contract, `.modal-overlay` class), badge-click open-guard (only opens on the "Unprotected" text), open/close listener scoping (AbortController re-scope on repeated open/attach), request-persist success/denied/error paths (including the `storage.setItem` grant-recording best-effort write), backdrop/close-button dismissal.

## Notes
- This flow does not change when or how `requestPersistentStorage` is invoked automatically at
  bootstrap (`src/storage.js`, unchanged) — it adds a discoverable, repeatable manual retry surface for
  the same browser capability.
- The `#db-status` badge itself, and its "Unprotected" vs. "Storage Safe" text states, are owned by
  `src/ui-status.js` / `src/storage.js` — not duplicated here; the modal only reads the badge's
  `textContent` to decide whether to open.
