# Flow: Persistent Storage Guidance Modal

> Added: ST-012 — 2026-08-14

<!-- context-meta
verification-commit: 7e440b755ebfd852ef1e22508b0aa5bb0fe55c4a
generated-at: 2026-08-14T00:00:00Z
confidence: medium
-->

## Overview
An interactive popup explaining browser storage-eviction risk and offering a one-click
`navigator.storage.persist()` request, opened by clicking the `#db-status` badge whenever it is
showing the "not persisted" warning state. This gives the existing `requestPersistentStorage`
capability (`src/storage.js`, requested automatically at bootstrap) a discoverable, user-triggerable
retry path with explanatory copy, instead of only the one silent bootstrap-time attempt.

## Entry Points
- **Type**: UI Event (browser)
- **Path/Topic**: Click on the `#db-status` header badge, only when its text contains
  `"Storage not persisted"` → opens the modal
- **File**: `src/storage-modal.js` (modal + badge binding), `src/main.js` (wiring), `src/storage.js` (underlying `requestPersistentStorage` capability reused by the modal's action button)

## Core Path
1. `createStorageModal(doc, reporter, nav)` builds the full modal overlay DOM up front
   (`createElement`/`textContent` only, never `innerHTML`) and appends it to `doc.body`; the overlay
   starts `hidden`.
2. `attach()` binds an AbortController-scoped delegated click listener on `#db-status`: a click opens
   the modal **only if** `statusEl.textContent` currently includes `"Storage not persisted"` — clicking
   the badge while storage is already persisted is a no-op. Re-calling `attach()` re-scopes the
   listener so it is never registered twice.
3. `open()` un-hides the overlay and (re-)scopes a fresh AbortController-bound click listener on the
   overlay for close/backdrop/action clicks — repeated `open()` calls never accumulate listeners.
4. The modal body explains "Browser Eviction Risk" (IndexedDB data may be evicted under storage
   pressure or inactivity) and "Add to Home Screen" guidance (installing as a PWA typically grants
   persistence automatically), plus a `[ Request Persistent Storage ]` button
   (`data-action="request-persist"`).
5. Clicking Request Persistent Storage calls `nav.storage.persist()`; on `true` it reports
   `PERSISTED_TEXT` ("💾 Persistent storage granted") via the injected `reporter.db(...)` and closes the
   modal; on `false` it reports `NOT_PERSISTED_TEXT` ("⚠️ Storage not persisted (browser may evict)")
   and leaves the modal open. Errors are caught, logged (`console.error('[storage-modal]', err)`), and
   never rethrown.
6. `close()` (via the `✕` button, a backdrop click, or after a successful persist) aborts the modal's
   listener scope and re-hides the overlay.
7. Wired in `src/main.js` at bootstrap: `createStorageModal(doc, reporter, navigator)` then
   `storageModal.attach()`, both fail-open (each wrapped in its own `try/catch` so a failure here never
   blocks the rest of bootstrap).

## Data Touchpoints
- **Entities**: None persisted by this flow itself — it is a UI wrapper around the browser's
  `navigator.storage` Storage API. `#db-status` badge text is both the trigger condition and the
  post-action feedback surface (set by `src/ui-status.js`'s `db(text)` method, reused here via the
  injected `reporter`).
- **Tables**: None (no Dexie reads/writes).
- **UI Surface**: `#db-status` badge (trigger), a body-appended `.storage-modal-overlay` (dialog).

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
- `src/storage-modal.js` — `createStorageModal(doc, reporter, nav)` → `{ attach, open, close }`; exports `NOT_PERSISTED_TEXT`, `PERSISTED_TEXT`
- `src/storage.js` — `requestPersistentStorage(reporter, nav)` (the original bootstrap-time request this modal supplements; unchanged by this flow)
- `src/ui-status.js` — `#db-status` badge text set via `reporter.db(text)` (read by the modal's open-trigger guard)
- `src/main.js` — composition-root wiring (`createStorageModal` + `attach()`, fail-open)

## Tests
- `src/storage-modal.test.js` — modal build (no-innerHTML contract), badge-click open-guard (only opens on the "not persisted" text), open/close listener scoping (AbortController re-scope on repeated open/attach), request-persist success/denied/error paths, backdrop/close-button dismissal.

## Notes
- This flow does not change when or how `requestPersistentStorage` is invoked automatically at
  bootstrap (`src/storage.js`, unchanged) — it adds a discoverable, repeatable manual retry surface for
  the same browser capability.
- The `#db-status` badge itself, and its "not persisted" vs. "persisted" text states, are owned by
  `src/ui-status.js` / `src/storage.js` — not duplicated here; the modal only reads the badge's
  `textContent` to decide whether to open.
