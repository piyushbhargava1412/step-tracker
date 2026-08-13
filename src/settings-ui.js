/**
 * Settings UI DOM-writer.
 * Factory: createSettingsUI(doc, settings, reporter) → { render, open, close }
 *
 * Responsibilities:
 *  - Build the settings modal DOM (createElement/textContent only)
 *  - Populate date input from settings.getSyncAnchorDate()
 *  - On date change, call settings.countRecordsBefore() and update impact preview
 *  - AbortController-scoped delegated listeners; event delegation via data-* attributes
 */

export function createSettingsUI(doc, settings, reporter) {
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
    modal.appendChild(_buildHeader());
    modal.appendChild(_buildBody());

    // Attach delegated listeners to modal
    modal.addEventListener('click', _handleClick, { signal });
    modal.addEventListener('change', _handleChange, { signal });
  }

  function _buildHeader() {
    const header = doc.createElement('div');
    header.className = 'settings-header';

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
    dateInput.className = 'settings-date-input';
    dateInput.dataset.field = 'anchor-date';
    label.appendChild(dateInput);

    section.appendChild(label);

    // Impact preview
    const preview = doc.createElement('div');
    preview.className = 'settings-impact-preview';
    preview.dataset.preview = 'impact';
    preview.textContent = 'Select a date to see how many records would be affected.';
    section.appendChild(preview);

    // Prune button
    const pruneBtn = doc.createElement('button');
    pruneBtn.type = 'button';
    pruneBtn.className = 'btn btn-danger';
    pruneBtn.dataset.action = 'prune';
    pruneBtn.textContent = 'Prune Records Before Date';
    section.appendChild(pruneBtn);

    body.appendChild(section);
    return body;
  }

  /**
   * Open the modal — make it visible and populate date input.
   */
  async function open() {
    const modal = doc.getElementById('settings-modal');
    if (!modal) return;

    modal.style.display = 'flex';

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
    modal.style.display = 'none';
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function _handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    if (action === 'close-settings') {
      close();
    }
  }

  async function _handleChange(event) {
    const target = event.target.closest('[data-field="anchor-date"]');
    if (!target) return;

    const date = target.value;
    if (!date) return;

    const modal = doc.getElementById('settings-modal');
    const preview = modal && modal.querySelector('[data-preview="impact"]');

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

  return { render, open, close };
}
