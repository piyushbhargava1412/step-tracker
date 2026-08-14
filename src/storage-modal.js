/**
 * Storage Persistence Modal — sole DOM writer for the interactive PWA
 * persistence guidance popup (ST-012 Task 9).
 *
 * createStorageModal(doc, reporter, nav) → { attach, open, close }
 *
 * Responsibilities:
 *  - Build the modal DOM entirely in JS (createElement/textContent only; never innerHTML).
 *  - attach(): bind a delegated AbortController-scoped click on the #db-status header
 *    badge that opens the modal only when the badge shows the "not persisted" state.
 *  - Modal explains browser eviction risk + "Add to Home Screen" guidance.
 *  - [ Request Persistent Storage ] calls nav.storage.persist() and re-reports the
 *    result through the injected reporter (refreshing the #db-status badge).
 *  - Close affordance; modal hidden by default; AbortController scoping so listeners
 *    never accumulate across open()/attach() cycles.
 *  - console.error('[storage-modal]', err) for developer diagnostics; never rethrows.
 */

export const NOT_PERSISTED_TEXT = '⚠️ Storage not persisted (browser may evict)';
export const PERSISTED_TEXT = '💾 Persistent storage granted';
const NOT_PERSISTED_MARKER = 'Storage not persisted';

export function createStorageModal(doc, reporter, nav) {
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
 * Construct the full modal overlay (dialog, guidance copy, action buttons) using
 * createElement/textContent only. Returns the overlay element, or null if the doc
 * cannot create elements.
 * @param {Document} doc
 * @returns {HTMLElement | null}
 */
function _buildOverlay(doc) {
  if (!doc?.createElement) return null;

  const overlay = doc.createElement('div');
  overlay.className = 'storage-modal-overlay';
  overlay.hidden = true;
  overlay.setAttribute('data-modal', 'storage');

  const dialog = doc.createElement('div');
  dialog.className = 'storage-modal-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Storage persistence');

  // ── Header ──
  const header = doc.createElement('div');
  header.className = 'storage-modal-header';

  const title = doc.createElement('h2');
  title.textContent = '💾 Storage Persistence';
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

  const evictionHeading = doc.createElement('h3');
  evictionHeading.textContent = 'Browser Eviction Risk';
  body.appendChild(evictionHeading);

  const evictionMsg = doc.createElement('p');
  evictionMsg.textContent =
    'Your step data is stored in the browser IndexedDB. Without persistent storage, ' +
    'the browser may automatically delete your data when device storage is low or ' +
    'after a period of inactivity.';
  body.appendChild(evictionMsg);

  const pwaHeading = doc.createElement('h3');
  pwaHeading.textContent = 'Add to Home Screen';
  body.appendChild(pwaHeading);

  const pwaMsg = doc.createElement('p');
  pwaMsg.textContent =
    'Installing this app to your Home Screen typically grants persistent storage ' +
    'automatically, protecting your data from eviction.';
  body.appendChild(pwaMsg);

  const persistBtn = doc.createElement('button');
  persistBtn.type = 'button';
  persistBtn.className = 'btn btn-primary';
  persistBtn.setAttribute('data-action', 'request-persist');
  persistBtn.textContent = 'Request Persistent Storage';
  body.appendChild(persistBtn);

  dialog.appendChild(body);
  overlay.appendChild(dialog);

  return overlay;
}
