/**
 * Storage Persistence Modal — sole DOM writer for the compact, centered
 * persistence-guidance popup (ST-012 Task 9, refreshed for friendlier UX).
 *
 * createStorageModal(doc, reporter, nav, storage) → { attach, open, close }
 *
 * Responsibilities:
 *  - Build the modal DOM entirely in JS (createElement/textContent only; never innerHTML).
 *  - attach(): bind a delegated AbortController-scoped click on the #db-status header
 *    pill that opens the modal only when the badge shows the "unprotected" state.
 *  - Modal explains, in plain language, why persistence matters — no scary jargon.
 *  - [ 🛡️ Protect My Data ] calls nav.storage.persist() and re-reports the result
 *    through the injected reporter (refreshing the #db-status badge). On success it
 *    also records the grant in `storage` (localStorage-shaped) so a future visit
 *    never needs to re-prompt.
 *  - Close affordance; modal hidden by default; AbortController scoping so listeners
 *    never accumulate across open()/attach() cycles.
 *  - console.error('[storage-modal]', err) for developer diagnostics; never rethrows.
 */

import { NOT_PERSISTED_TEXT, PERSISTED_TEXT } from './storage.js';

export { NOT_PERSISTED_TEXT, PERSISTED_TEXT };

/** localStorage key recording that the user has been granted persistent storage. */
export const STORAGE_PERSIST_GRANTED_KEY = 'storage_persist_granted';

const NOT_PERSISTED_MARKER = 'Unprotected';

export function createStorageModal(doc, reporter, nav, storage = null) {
  let badgeController = null;
  let modalController = null;

  const statusEl = doc?.getElementById?.('db-status');
  const overlay = _buildOverlay(doc);

  if (overlay && doc?.body) {
    doc.body.appendChild(overlay);
  }

  /**
   * Bind the #db-status badge click. Re-calling this re-scopes the listener via a
   * fresh AbortController so the handler is never registered twice.
   */
  function attach() {
    if (!statusEl || !overlay) return;

    if (badgeController) badgeController.abort();
    badgeController = new (doc.defaultView?.AbortController ?? AbortController)();
    const { signal } = badgeController;

    statusEl.addEventListener(
      'click',
      () => {
        if (statusEl.textContent.includes(NOT_PERSISTED_MARKER)) {
          open();
        }
      },
      { signal }
    );
  }

  /**
   * Show the modal and (re)scope its interaction listeners so rapid reopen does
   * not accumulate click handlers on the overlay.
   */
  function open() {
    if (!overlay) return;

    if (modalController) modalController.abort();
    modalController = new (doc.defaultView?.AbortController ?? AbortController)();
    const { signal } = modalController;

    overlay.hidden = false;
    overlay.addEventListener('click', _handleModalClick, { signal });
  }

  /** Hide the modal and tear down (abort) its interaction listeners. */
  function close() {
    if (modalController) {
      modalController.abort();
      modalController = null;
    }
    if (overlay) overlay.hidden = true;
  }

  function _handleModalClick(e) {
    const action = e.target?.closest?.('[data-action]')?.getAttribute?.('data-action');

    if (action === 'close-storage-modal') {
      close();
      return;
    }

    if (action === 'request-persist') {
      _requestPersist();
      return;
    }

    // Backdrop click (the overlay itself, outside the dialog).
    if (e.target === overlay) {
      close();
    }
  }

  async function _requestPersist() {
    try {
      const ok = await nav?.storage?.persist?.();
      if (ok) {
        reporter.db(PERSISTED_TEXT);
        storage?.setItem?.(STORAGE_PERSIST_GRANTED_KEY, '1');
        close();
      } else {
        reporter.db(NOT_PERSISTED_TEXT);
      }
    } catch (err) {
      console.error('[storage-modal]', err);
    }
  }

  return { attach, open, close };
}

/**
 * Construct the compact modal overlay (dialog, friendly copy, action button) using
 * createElement/textContent only. Returns the overlay element, or null if the doc
 * cannot create elements.
 * @param {Document} doc
 * @returns {HTMLElement | null}
 */
function _buildOverlay(doc) {
  if (!doc?.createElement) return null;

  const overlay = doc.createElement('div');
  overlay.className = 'modal-overlay storage-modal-overlay';
  overlay.hidden = true;
  overlay.setAttribute('data-modal', 'storage');

  const dialog = doc.createElement('div');
  dialog.className = 'storage-modal-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Protect your step history');

  // ── Header ──
  const header = doc.createElement('div');
  header.className = 'storage-modal-header';

  const title = doc.createElement('h2');
  title.textContent = '🛡️ Protect Your Step History';
  header.appendChild(title);

  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'storage-modal-close';
  closeBtn.setAttribute('data-action', 'close-storage-modal');
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  header.appendChild(closeBtn);

  dialog.appendChild(header);

  // ── Body ──
  const body = doc.createElement('div');
  body.className = 'storage-modal-body';

  const message = doc.createElement('p');
  message.textContent =
    'Browsers occasionally clear cached web data when your phone or laptop runs low ' +
    'on disk space. Enable data protection so your steps, streaks, and backup ' +
    'history are preserved.';
  body.appendChild(message);

  const persistBtn = doc.createElement('button');
  persistBtn.type = 'button';
  persistBtn.className = 'btn btn-primary';
  persistBtn.setAttribute('data-action', 'request-persist');
  persistBtn.textContent = '🛡️ Protect My Data';
  body.appendChild(persistBtn);

  dialog.appendChild(body);
  overlay.appendChild(dialog);

  return overlay;
}
