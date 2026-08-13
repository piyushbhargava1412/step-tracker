/**
 * Settings UI DOM-writer.
 * Factory: createSettingsUI(doc, settings, reporter, confirmFn) → { render, open, close }
 *
 * Responsibilities:
 *  - Build the settings modal DOM (createElement/textContent only)
 *  - Populate date input from settings.getSyncAnchorDate()
 *  - On date change, call settings.countRecordsBefore() and update impact preview
 *  - AbortController-scoped delegated listeners; event delegation via data-* attributes
 *  - Prune action with inline confirmation via injected confirmFn
 *  - Clear-All hazard mode (disables picker + counter, switches to wipe action)
 *  - Wipe action with inline confirmation via injected confirmFn
 *  - Dispatch data:records:mutated on successful mutation
 */

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
    title.textContent = 'Settings';
    header.appendChild(title);

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn settings-close-btn';
    closeBtn.dataset.action = 'close-settings';
    closeBtn.textContent = '✕';
    header.appendChild(closeBtn);

    return header;
  }

  function _buildBody() {
    const body = doc.createElement('div');
    body.className = 'settings-body';

    // Anchor date section
    const section = doc.createElement('section');
    section.className = 'settings-section';

    const sectionTitle = doc.createElement('h3');
    sectionTitle.className = 'settings-section-title';
    sectionTitle.textContent = 'Sync Horizon';
    section.appendChild(sectionTitle);

    const description = doc.createElement('p');
    description.className = 'settings-description';
    description.textContent = 'Records before this date can be pruned from the local database.';
    section.appendChild(description);

    // Date label + input
    const label = doc.createElement('label');
    label.className = 'settings-label';

    const labelText = doc.createElement('span');
    labelText.textContent = 'Anchor Date';
    label.appendChild(labelText);

    const dateInput = doc.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'settings-date-picker';
    dateInput.dataset.field = 'anchor-date';
    label.appendChild(dateInput);

    section.appendChild(label);

    // Impact preview
    const preview = doc.createElement('div');
    preview.className = 'settings-impact-preview';
    preview.dataset.preview = 'impact';
    preview.textContent = 'Select a date to see how many records would be affected.';
    section.appendChild(preview);

    // Save Anchor Date button
    const saveAnchorBtn = doc.createElement('button');
    saveAnchorBtn.type = 'button';
    saveAnchorBtn.className = 'btn btn-primary';
    saveAnchorBtn.dataset.action = 'save-anchor';
    saveAnchorBtn.textContent = 'Save Anchor Date';
    section.appendChild(saveAnchorBtn);

    // Clear-All checkbox row
    const clearAllRow = doc.createElement('div');
    clearAllRow.className = 'settings-clear-all-row';

    const clearAllLabel = doc.createElement('label');
    clearAllLabel.className = 'settings-clear-all-label';

    const clearAllCheckbox = doc.createElement('input');
    clearAllCheckbox.type = 'checkbox';
    clearAllCheckbox.className = 'settings-clear-all-checkbox';
    clearAllCheckbox.dataset.action = 'toggle-clear-all';
    clearAllLabel.appendChild(clearAllCheckbox);

    const clearAllText = doc.createElement('span');
    clearAllText.textContent = 'Clear All (Wipe entire database)';
    clearAllLabel.appendChild(clearAllText);

    clearAllRow.appendChild(clearAllLabel);
    section.appendChild(clearAllRow);

    // Primary action button (prune mode by default)
    const actionBtn = doc.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'btn btn-danger';
    actionBtn.dataset.action = 'prune';
    actionBtn.textContent = 'Prune Records Before Date';
    section.appendChild(actionBtn);

    body.appendChild(section);
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
    } else if (action === 'save-anchor') {
      _handleSaveAnchor();
    }
  }

  async function _handleChange(event) {
    // Handle Clear-All toggle
    const toggleTarget = event.target.closest('[data-action="toggle-clear-all"]');
    if (toggleTarget) {
      _applyHazardMode(toggleTarget.checked);
      return;
    }

    // Handle date change for impact preview
    const dateTarget = event.target.closest('[data-field="anchor-date"]');
    if (!dateTarget) return;

    const date = dateTarget.value;
    if (!date) return;

    const modal = doc.getElementById('settings-modal');
    const preview = modal && modal.querySelector('[data-preview="impact"]');

    // Skip count update if in hazard/wipe mode
    if (preview && preview.dataset.disabled === 'true') return;

    try {
      const count = await settings.countRecordsBefore(date);
      if (preview) {
        preview.textContent = `${count} record${count === 1 ? '' : 's'} would be affected.`;
      }
    } catch (err) {
      console.error('[settings-ui]', err);
      reporter.db('❌ Failed to count records');
      if (preview) {
        preview.textContent = '⚠️ Could not compute impact.';
      }
    }
  }

  /**
   * Apply or remove hazard mode based on the Clear-All checkbox state.
   */
  function _applyHazardMode(enabled) {
    const modal = doc.getElementById('settings-modal');
    if (!modal) return;

    const dateInput = modal.querySelector('[data-field="anchor-date"]');
    const preview = modal.querySelector('[data-preview="impact"]');
    const actionBtn = modal.querySelector('[data-action="prune"], [data-action="wipe"]');

    if (enabled) {
      // Disable date picker
      if (dateInput) {
        dateInput.classList.add('disabled-picker');
        dateInput.disabled = true;
      }
      // Disable impact counter
      if (preview) {
        preview.dataset.disabled = 'true';
        preview.setAttribute('aria-disabled', 'true');
        preview.classList.add('disabled');
      }
      // Switch button to wipe mode
      if (actionBtn) {
        actionBtn.dataset.action = 'wipe';
        actionBtn.textContent = '🔥 Clear Entire Database';
        actionBtn.className = 'btn btn-hazard';
      }
    } else {
      // Re-enable date picker
      if (dateInput) {
        dateInput.classList.remove('disabled-picker');
        dateInput.disabled = false;
      }
      // Re-enable impact counter
      if (preview) {
        delete preview.dataset.disabled;
        preview.removeAttribute('aria-disabled');
        preview.classList.remove('disabled');
      }
      // Restore prune button
      if (actionBtn) {
        actionBtn.dataset.action = 'prune';
        actionBtn.textContent = 'Prune Records Before Date';
        actionBtn.className = 'btn btn-danger';
      }
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


  /**
   * Handle the save-anchor action — validate date, persist via settings, report result.
   */
  async function _handleSaveAnchor() {
    const modal = doc.getElementById('settings-modal');
    if (!modal) return;

    const input = modal.querySelector('[data-field="anchor-date"]');
    const date = input ? input.value : '';

    if (!date) {
      reporter.db('⚠️ Please select an anchor date before saving');
      return;
    }

    try {
      await settings.setSyncAnchorDate(date);
      reporter.db('✅ Anchor date saved');
    } catch (err) {
      console.error('[settings-ui]', err);
      reporter.db('❌ Failed to save anchor date');
    }
  }

  return { render, open, close };
}
