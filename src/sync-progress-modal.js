/**
 * Long-running sync progress modal.
 *
 * A single shared `#sync-progress-modal` popup, lazily created and appended
 * to <body> on first use (mirrors toast.js), that surfaces the multi-minute
 * full-history-sync banner without disturbing the header/button layout that
 * `#sync-status` sits in. `showSyncProgressModal` (re)renders the message and
 * makes the modal visible; `hideSyncProgressModal` hides it. Dismissible via
 * the close button or backdrop click — dismissing only hides the modal, it
 * never cancels the in-flight sync.
 */

export function showSyncProgressModal(doc = document, message) {
  const modal = _ensureModal(doc);
  const body = modal.querySelector('[data-role="message"]');
  if (body) body.textContent = message;
  modal.removeAttribute('hidden');
}

export function hideSyncProgressModal(doc = document) {
  const modal = doc.getElementById('sync-progress-modal');
  if (!modal) return;
  modal.setAttribute('hidden', '');
}

function _ensureModal(doc) {
  const existing = doc.getElementById('sync-progress-modal');
  if (existing) return existing;

  const modal = doc.createElement('div');
  modal.id = 'sync-progress-modal';
  modal.className = 'modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'sync-progress-title');
  modal.hidden = true;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) hideSyncProgressModal(doc);
  });

  const dialog = doc.createElement('div');
  dialog.className = 'sync-modal-dialog';

  const header = doc.createElement('div');
  header.className = 'sync-modal-header';

  const title = doc.createElement('h2');
  title.id = 'sync-progress-title';
  title.textContent = '⏳ Sync in progress';
  header.appendChild(title);

  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'settings-close-btn';
  closeBtn.setAttribute('aria-label', 'Dismiss (sync continues in the background)');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => hideSyncProgressModal(doc));
  header.appendChild(closeBtn);

  const body = doc.createElement('p');
  body.className = 'sync-modal-message';
  body.dataset.role = 'message';
  body.setAttribute('aria-live', 'polite');

  dialog.appendChild(header);
  dialog.appendChild(body);
  modal.appendChild(dialog);

  (doc.body || doc.documentElement).appendChild(modal);
  return modal;
}
