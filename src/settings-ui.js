/**
 * Settings UI DOM-writer.
 * Factory: createSettingsUI(doc, settings, reporter, confirmFn) → { render, open, close }
 *
 * Responsibilities:
 *  - Build the settings modal DOM (createElement/textContent only)
 *  - Populate date input from settings.getSyncAnchorDate() on open
 *  - On date change, persist the anchor (setSyncAnchorDate) and refresh impact preview
 *  - AbortController-scoped delegated listeners; event delegation via data-* attributes
 *  - Prune action with inline confirmation via injected confirmFn
 *  - Clear-All hazard mode (disables picker + counter, switches to wipe action)
 *  - Wipe action with inline confirmation via injected confirmFn
 *  - Dispatch data:records:mutated on successful mutation
 */

import { _formatReadableDate } from './date-utils.js';

export function createSettingsUI(doc, settings, reporter, confirmFn) {
  let controller = null;

  /**
   * (Re)build the modal content and attach delegated listeners.
   * Idempotent — re-calling aborts previous listeners and rebuilds DOM.
   */
  async function render() {
    const modal = doc.getElementById('settings-modal');
    if (!modal) {
      console.warn('[settings-ui]', 'Missing #settings-modal — skipping render');
      return;
    }

    // Abort previous listeners
    if (controller) {
      controller.abort();
    }
    controller = new (doc.defaultView?.AbortController ?? AbortController)();
    const { signal } = controller;

    // Clear existing content
    while (modal.firstChild) {
      modal.removeChild(modal.firstChild);
    }

    // Build content
    const dialog = doc.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.appendChild(_buildHeader());
    dialog.appendChild(_buildBody());
    modal.appendChild(dialog);

    // Attach delegated listeners to modal
    modal.addEventListener('click', _handleClick, { signal });
    modal.addEventListener('change', _handleChange, { signal });
  }

  function _buildHeader() {
    const header = doc.createElement('div');
    header.className = 'modal-header';

    const title = doc.createElement('h2');
    title.className = 'settings-title';
    title.textContent = '⚙️ Settings & Data Hygiene';
    header.appendChild(title);

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'settings-close-btn';
    closeBtn.dataset.action = 'close-settings';
    closeBtn.setAttribute('aria-label', 'Close settings');
    closeBtn.textContent = '✕';
    header.appendChild(closeBtn);

    return header;
  }

  function _buildBody() {
    const body = doc.createElement('div');
    body.className = 'settings-body';

    // ── Sync Boundary section ──
    const syncSection = doc.createElement('section');
    syncSection.className = 'settings-section sync-section';

    const syncTitle = doc.createElement('h3');
    syncTitle.className = 'settings-section-title';
    syncTitle.textContent = '📅 SYNC BOUNDARY';
    syncSection.appendChild(syncTitle);

    const label = doc.createElement('label');
    label.className = 'settings-label';
    label.setAttribute('for', 'settings-anchor-date');

    const labelText = doc.createElement('span');
    labelText.className = 'settings-label-text';
    labelText.textContent = 'Track History From:';
    label.appendChild(labelText);

    const dateInput = doc.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'settings-anchor-date';
    dateInput.className = 'settings-date-picker';
    dateInput.dataset.field = 'anchor-date';
    label.appendChild(dateInput);

    syncSection.appendChild(label);
    body.appendChild(syncSection);

    // ── Divider ──
    const divider = doc.createElement('div');
    divider.className = 'settings-divider';
    divider.setAttribute('role', 'separator');
    body.appendChild(divider);

    // ── Data Purge Options section ──
    const purgeSection = doc.createElement('section');
    purgeSection.className = 'settings-section purge-section';

    const purgeTitle = doc.createElement('h3');
    purgeTitle.className = 'settings-section-title';
    purgeTitle.textContent = '🗑️ DATA PURGE OPTIONS';
    purgeSection.appendChild(purgeTitle);

    // Clear-All checkbox row
    const clearAllLabel = doc.createElement('label');
    clearAllLabel.className = 'settings-clear-all-label';

    const clearAllCheckbox = doc.createElement('input');
    clearAllCheckbox.type = 'checkbox';
    clearAllCheckbox.className = 'settings-clear-all-checkbox';
    clearAllCheckbox.dataset.action = 'toggle-clear-all';
    clearAllLabel.appendChild(clearAllCheckbox);

    const clearAllText = doc.createElement('span');
    clearAllText.textContent = 'Clear All Local Data (Wipe entire database)';
    clearAllLabel.appendChild(clearAllText);

    purgeSection.appendChild(clearAllLabel);

    // Impact preview block
    const impactLabel = doc.createElement('span');
    impactLabel.className = 'settings-impact-label';
    impactLabel.textContent = '📊 Impact Preview:';
    purgeSection.appendChild(impactLabel);

    const preview = doc.createElement('div');
    preview.className = 'settings-impact-preview';
    preview.dataset.preview = 'impact';
    preview.textContent = 'Select a date to see impact preview.';
    purgeSection.appendChild(preview);

    // Primary action button (prune mode by default)
    const actionBtn = doc.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'btn btn-danger';
    actionBtn.dataset.action = 'prune';
    actionBtn.textContent = '🗑️ Prune Data Before Date';
    purgeSection.appendChild(actionBtn);

    body.appendChild(purgeSection);
    return body;
  }

  /**
   * Open the modal — make it visible and populate date input.
   */
  async function open() {
    const modal = doc.getElementById('settings-modal');
    if (!modal) return;

    modal.removeAttribute('hidden');

    // Pre-populate date input from settings
    try {
      const anchorDate = await settings.getSyncAnchorDate();
      const input = modal.querySelector('[data-field="anchor-date"]');
      if (input) {
        input.value = anchorDate;
      }
      await _refreshImpact(anchorDate);
    } catch (err) {
      console.error('[settings-ui]', err);
      reporter.db('❌ Failed to load anchor date');
    }
  }

  /**
   * Close the modal.
   */
  function close() {
    const modal = doc.getElementById('settings-modal');
    if (!modal) return;
    modal.setAttribute('hidden', '');
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function _handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    if (action === 'close-settings') {
      close();
    } else if (action === 'prune') {
      _handlePrune();
    } else if (action === 'wipe') {
      _handleWipe();
    }
  }

  async function _handleChange(event) {
    // Handle Clear-All toggle
    const toggleTarget = event.target.closest('[data-action="toggle-clear-all"]');
    if (toggleTarget) {
      await _applyHazardMode(toggleTarget.checked);
      return;
    }

    // Handle date change — persist anchor and refresh impact preview
    const dateTarget = event.target.closest('[data-field="anchor-date"]');
    if (!dateTarget) return;

    const date = dateTarget.value;
    if (!date) return;

    const modal = doc.getElementById('settings-modal');
    const toggle = modal && modal.querySelector('[data-action="toggle-clear-all"]');
    // Skip if hazard/wipe mode is active
    if (toggle && toggle.checked) return;

    try {
      await settings.setSyncAnchorDate(date);
    } catch (err) {
      console.error('[settings-ui]', err);
      reporter.db('❌ Failed to save anchor date');
      return;
    }
    await _refreshImpact(date);
  }

  /**
   * Refresh the impact preview and prune-button label for a given date.
   * Renders "<n> record(s) found prior to <date>" and the human-readable
   * button label "🗑️ Prune Data Before Jan 1, 2018".
   */
  async function _refreshImpact(date) {
    const modal = doc.getElementById('settings-modal');
    if (!modal) return;
    const preview = modal.querySelector('[data-preview="impact"]');
    if (!preview) return;

    if (!date) {
      preview.textContent = 'Select a date to see impact preview.';
      return;
    }

    try {
      const count = await settings.countRecordsBefore(date);
      preview.textContent = `${count} record${count === 1 ? '' : 's'} found prior to ${date}`;
      const actionBtn = modal.querySelector('[data-action="prune"]');
      if (actionBtn) {
        actionBtn.textContent = `🗑️ Prune Data Before ${_formatReadableDate(date)}`;
      }
    } catch (err) {
      console.error('[settings-ui]', err);
      reporter.db('❌ Failed to count records');
      preview.textContent = '⚠️ Could not compute impact.';
    }
  }

  /**
   * Apply or remove hazard mode based on the Clear-All checkbox state.
   */
  async function _applyHazardMode(enabled) {
    const modal = doc.getElementById('settings-modal');
    if (!modal) return;

    const dateInput = modal.querySelector('[data-field="anchor-date"]');
    const preview = modal.querySelector('[data-preview="impact"]');
    const actionBtn = modal.querySelector('[data-action="prune"], [data-action="wipe"]');

    if (enabled) {
      if (dateInput) {
        dateInput.classList.add('disabled-picker');
        dateInput.disabled = true;
      }
      // Switch button to wipe mode
      if (actionBtn) {
        actionBtn.dataset.action = 'wipe';
        actionBtn.textContent = '🔥 Clear Entire Database';
        actionBtn.className = 'btn btn-hazard';
      }
      // Show total-record impact
      if (preview) {
        preview.dataset.disabled = 'true';
        preview.setAttribute('aria-disabled', 'true');
        try {
          const total = await settings.countAllRecords();
          preview.textContent = `${total} total records will be deleted`;
        } catch (err) {
          console.error('[settings-ui]', err);
          reporter.db('❌ Failed to count records');
          preview.textContent = '⚠️ Could not compute impact.';
        }
      }
    } else {
      if (dateInput) {
        dateInput.classList.remove('disabled-picker');
        dateInput.disabled = false;
      }
      if (preview) {
        delete preview.dataset.disabled;
        preview.removeAttribute('aria-disabled');
      }
      if (actionBtn) {
        actionBtn.dataset.action = 'prune';
        actionBtn.className = 'btn btn-danger';
        actionBtn.textContent = '🗑️ Prune Data Before Date';
      }
      const input = modal.querySelector('[data-field="anchor-date"]');
      await _refreshImpact(input ? input.value : '');
    }
  }

  /**
   * Handle the prune action — confirm then prune and dispatch.
   */
  async function _handlePrune() {
    const modal = doc.getElementById('settings-modal');
    if (!modal) return;

    const input = modal.querySelector('[data-field="anchor-date"]');
    const date = input ? input.value : '';

    if (!date) {
      reporter.db('⚠️ Please select a date before pruning');
      return;
    }

    if (confirmFn && !confirmFn('Prune all records before ' + date + '?')) {
      return;
    }

    try {
      await settings.pruneRecordsBefore(date);
      doc.dispatchEvent(new CustomEvent('data:records:mutated', { bubbles: true, detail: { source: 'prune' } }));
    } catch (err) {
      console.error('[settings-ui]', err);
      reporter.db('❌ Failed to prune records');
    }
  }

  /**
   * Handle the wipe action — confirm then wipe and dispatch.
   */
  async function _handleWipe() {
    if (confirmFn && !confirmFn('Wipe entire database? This cannot be undone.')) {
      return;
    }

    try {
      await settings.wipeDatabase();
      doc.dispatchEvent(new CustomEvent('data:records:mutated', { bubbles: true, detail: { source: 'wipe' } }));
    } catch (err) {
      console.error('[settings-ui]', err);
      reporter.db('❌ Failed to wipe database');
    }
  }

  return { render, open, close };
}
