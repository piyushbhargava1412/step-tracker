/**
 * "💾 Storage & Data Health" panel — sole DOM writer for the Backup tab's
 * storage-health section.
 *
 * createStorageHealthUI(doc, settings, reporter, nav = navigator)
 *   render(container): builds the panel showing Drive Cloud Backup status,
 *     Local Browser Storage status, and a "Request Browser Storage
 *     Protection" button that calls navigator.storage.persist() directly —
 *     no confirmation modal, per the redesigned protection flow.
 *
 * `settings` doubles as the metadata store: getDriveBackupEnabled() drives the
 * Drive row, getLastDriveSync() supplies the backup size. Both reads are
 * individually fail-open (default disabled / no size) so a Dexie error never
 * blocks the panel from rendering.
 *
 * The protection button re-reads the true post-request state via
 * refreshStorageProtectionBadge (storage-health.js) so the header pill and
 * this panel's Local Browser Storage row never disagree.
 *
 * No innerHTML — all DOM via createElement/textContent.
 * AbortController cleanup on re-render so listeners never accumulate.
 */

import { formatBytes } from './backup-format.js';
import { refreshStorageProtectionBadge } from './storage-health.js';

const PROTECT_BUTTON_TEXT = '🛡️ Request Browser Storage Protection';

const DECLINED_HINT =
  'Not granted this time — this is common and does not affect your data. Browsers often grant ' +
  'it automatically after you use the app a bit more, or once it is added to your Home Screen.';
const ERROR_HINT = 'Something went wrong requesting protection. Please try again in a moment.';

export function createStorageHealthUI(doc, settings, reporter, nav = navigator) {
  let controller = null;
  let driveStatusEl = null;
  let localStatusEl = null;
  let hintEl = null;

  /**
   * (Re)build the storage-health panel inside the given container element.
   * Idempotent: calling a second time aborts previous listeners and rebuilds DOM.
   * @param {HTMLElement} container
   */
  async function render(container) {
    if (controller) {
      controller.abort();
    }
    controller = new (doc.defaultView?.AbortController ?? AbortController)();
    const { signal } = controller;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const panel = doc.createElement('div');
    panel.className = 'storage-health-panel data-panel';

    const heading = doc.createElement('h2');
    heading.textContent = '💾 Storage & Data Health';
    panel.appendChild(heading);

    const driveRow = _buildRow(doc, 'Google Drive Cloud Backup:', 'drive-status');
    panel.appendChild(driveRow.row);
    driveStatusEl = driveRow.value;

    const localRow = _buildRow(doc, 'Local Browser Storage:', 'local-status');
    panel.appendChild(localRow.row);
    localStatusEl = localRow.value;

    const protectBtn = doc.createElement('button');
    protectBtn.type = 'button';
    protectBtn.className = 'btn btn-secondary storage-health-action';
    protectBtn.setAttribute('data-action', 'request-storage-protection');
    protectBtn.textContent = PROTECT_BUTTON_TEXT;
    panel.appendChild(protectBtn);

    hintEl = doc.createElement('p');
    hintEl.className = 'storage-health-hint';
    hintEl.hidden = true;
    panel.appendChild(hintEl);

    container.appendChild(panel);

    await _refreshStatuses();

    container.addEventListener(
      'click',
      async (e) => {
        const action = e.target.closest('[data-action]')?.getAttribute('data-action');
        if (action === 'request-storage-protection') {
          await _handleRequestProtection(protectBtn);
        }
      },
      { signal }
    );
  }

  /**
   * Reads current drive/persisted state and paints the two status rows.
   * Each read is independently fail-open (Task-level guard clauses inside
   * the individual _read* helpers keep one failure from blocking the other).
   */
  async function _refreshStatuses() {
    let driveEnabled = false;
    try {
      driveEnabled = (await settings?.getDriveBackupEnabled?.()) === true;
    } catch (err) {
      console.error('[storage-health-ui]', err);
    }

    let lastSync = null;
    if (driveEnabled) {
      try {
        lastSync = (await settings?.getLastDriveSync?.()) ?? null;
      } catch (err) {
        console.error('[storage-health-ui]', err);
      }
    }

    if (driveStatusEl) {
      driveStatusEl.textContent = driveEnabled
        ? lastSync?.bytes != null
          ? `🟢 Active (${formatBytes(lastSync.bytes)})`
          : '🟢 Active'
        : '⚪ Disabled';
    }

    let persisted = false;
    try {
      if (typeof nav?.storage?.persisted === 'function') {
        persisted = (await nav.storage.persisted()) === true;
      }
    } catch (err) {
      console.error('[storage-health-ui]', err);
    }

    if (localStatusEl) {
      localStatusEl.textContent = persisted ? '🟢 Protected' : '🟡 Unpersisted';
    }
  }

  /**
   * Handles the "Request Browser Storage Protection" button: calls
   * navigator.storage.persist() directly (no modal), updates the local row
   * instantly on a grant, and refreshes the shared header badge either way
   * so it always reflects the true current state.
   *
   * A grant is self-evident from the status row updating, but a decline or an
   * error leaves nothing else on the page visibly different — browsers decline
   * silently far more often than they grant, especially on a first click — so
   * both paths surface a small inline hint (never a popup) explaining what
   * happened, instead of the click looking like it did nothing.
   * @param {HTMLButtonElement} btn
   */
  async function _handleRequestProtection(btn) {
    btn.disabled = true;
    _setHint('');
    try {
      const granted = await nav?.storage?.persist?.();
      if (granted && localStatusEl) {
        localStatusEl.textContent = '🟢 Protected';
      } else if (!granted) {
        _setHint(DECLINED_HINT);
      }
    } catch (err) {
      console.error('[storage-health-ui]', err);
      _setHint(ERROR_HINT);
    } finally {
      try {
        await refreshStorageProtectionBadge(reporter, settings, nav);
      } catch (err) {
        console.error('[storage-health-ui]', err);
      }
      btn.disabled = false;
    }
  }

  function _setHint(text) {
    if (!hintEl) return;
    hintEl.textContent = text;
    hintEl.hidden = !text;
  }

  return { render };
}

/**
 * Builds a single "Label: Value" row and returns both elements so the
 * caller can keep a live reference to the value span for in-place updates.
 * @param {Document} doc
 * @param {string} labelText
 * @param {string} fieldName - data-field marker for test/CSS targeting
 * @returns {{ row: HTMLElement, value: HTMLElement }}
 */
function _buildRow(doc, labelText, fieldName) {
  const row = doc.createElement('div');
  row.className = 'storage-health-row';

  const label = doc.createElement('span');
  label.className = 'storage-health-label';
  label.textContent = labelText;
  row.appendChild(label);

  const value = doc.createElement('span');
  value.className = 'storage-health-value';
  value.setAttribute('data-field', fieldName);
  row.appendChild(value);

  return { row, value };
}
