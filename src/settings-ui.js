/**
 * Settings UI DOM-writer — the data part of the Settings screen (#settings-panel).
 * Factory: createSettingsUI(doc, settings, reporter, confirmFn) → { render, open }
 *
 * Responsibilities:
 *  - Build the panel's grouped rows (createElement/textContent only):
 *      Journey › Home city · History › Track history from ·
 *      Danger zone › erase-all switch, impact preview, delete / erase button
 *  - open() runs each time the Settings screen is shown (navigation.js hook)
 *  - Populate date input from settings.getSyncAnchorDate() on open
 *  - On date change, persist the anchor (setSyncAnchorDate) and refresh impact preview
 *  - AbortController-scoped delegated listeners; event delegation via data-* attributes
 *  - Prune action with inline confirmation via injected confirmFn
 *  - Clear-All hazard mode (disables picker + counter, switches to wipe action)
 *  - Wipe action with inline confirmation via injected confirmFn
 *  - Dispatch data:records:mutated on successful mutation
 */

import { _formatReadableDate } from './date-utils.js';
import { HOME_BASE_CITIES } from './odyssey.js';

const PANEL_ID = 'settings-panel';
const PRUNE_LABEL = 'Delete days before this date';
const WIPE_LABEL = 'Erase all data on this device';

export function createSettingsUI(doc, settings, reporter, confirmFn) {
  let controller = null;
  const _panel = () => doc.getElementById(PANEL_ID);

  /**
   * (Re)build the panel content and attach delegated listeners.
   * Idempotent — re-calling aborts previous listeners and rebuilds DOM.
   */
  async function render() {
    const modal = _panel();
    if (!modal) {
      console.warn('[settings-ui]', 'Missing #settings-panel — skipping render');
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

    modal.appendChild(_buildBody());

    // Pre-select stored home base city
    try {
      const storedCity = await settings.getHomeBaseCity();
      const citySelect = modal.querySelector('#home-base-city-select');
      if (citySelect && storedCity) {
        citySelect.value = storedCity.name;
      }
    } catch (err) {
      console.error('[settings-ui]', err);
    }

    // Attach delegated listeners to modal
    modal.addEventListener('click', _handleClick, { signal });
    modal.addEventListener('change', _handleChange, { signal });
  }

  /** A labelled group heading + its rounded list container. */
  function _group(title, extraClass = '') {
    const heading = doc.createElement('h2');
    heading.className = extraClass ? `list-label ${extraClass}` : 'list-label';
    heading.textContent = title;
    const group = doc.createElement('div');
    group.className = extraClass ? `list-group list-group--${extraClass}` : 'list-group';
    return { heading, group };
  }

  /** A list row: title + optional subtitle on the left, a control on the right. */
  function _row({ title, sub, control, htmlFor, className = '' }) {
    const row = doc.createElement(htmlFor ? 'label' : 'div');
    row.className = className ? `list-row ${className}` : 'list-row';
    if (htmlFor) row.setAttribute('for', htmlFor);
    const text = doc.createElement('span');
    text.className = 'list-row__text';
    const titleEl = doc.createElement('span');
    titleEl.className = 'list-row__title settings-label-text';
    titleEl.textContent = title;
    text.appendChild(titleEl);
    if (sub) {
      const subEl = doc.createElement('span');
      subEl.className = 'list-row__sub';
      subEl.textContent = sub;
      text.appendChild(subEl);
    }
    row.appendChild(text);
    if (control) row.appendChild(control);
    return row;
  }

  function _buildBody() {
    const body = doc.createElement('div');
    body.className = 'settings-body';

    // ── Journey › Home city ──
    const citySelect = doc.createElement('select');
    citySelect.id = 'home-base-city-select';
    citySelect.className = 'settings-city-select row-select';
    citySelect.dataset.action = 'change-home-base';
    for (const city of HOME_BASE_CITIES) {
      const option = doc.createElement('option');
      option.value = city.name;
      option.textContent = `${city.name}, ${city.country}`;
      citySelect.appendChild(option);
    }
    const journey = _group('Journey');
    journey.group.classList.add('home-base-city-section');
    journey.group.appendChild(_row({
      title: 'Home city',
      sub: 'Where your virtual expedition starts',
      control: citySelect,
      htmlFor: 'home-base-city-select',
    }));
    body.append(journey.heading, journey.group);

    // ── History › Track history from ──
    const dateInput = doc.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'settings-anchor-date';
    dateInput.className = 'settings-date-picker row-input';
    dateInput.dataset.field = 'anchor-date';
    const history = _group('History');
    history.group.classList.add('sync-section');
    history.group.appendChild(_row({
      title: 'Track history from',
      sub: 'The oldest day to sync',
      control: dateInput,
      htmlFor: 'settings-anchor-date',
    }));
    body.append(history.heading, history.group);

    // ── Danger zone ──
    const danger = _group('Danger zone', 'danger');
    danger.group.classList.add('purge-section');

    const clearAll = doc.createElement('input');
    clearAll.type = 'checkbox';
    clearAll.id = 'settings-clear-all';
    clearAll.className = 'settings-clear-all-checkbox switch';
    clearAll.setAttribute('role', 'switch');
    clearAll.dataset.action = 'toggle-clear-all';
    danger.group.appendChild(_row({
      title: 'Erase everything instead',
      sub: 'Switch to wiping the whole database',
      control: clearAll,
      htmlFor: 'settings-clear-all',
      className: 'settings-clear-all-label',
    }));

    const actionRow = doc.createElement('div');
    actionRow.className = 'list-row list-row--stack';
    const preview = doc.createElement('p');
    preview.className = 'settings-impact-preview';
    preview.dataset.preview = 'impact';
    preview.setAttribute('aria-live', 'polite');
    preview.textContent = 'Select a date to see impact preview.';
    const actionBtn = doc.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'btn btn-danger btn-block';
    actionBtn.dataset.action = 'prune';
    actionBtn.textContent = PRUNE_LABEL;
    actionRow.append(preview, actionBtn);
    danger.group.appendChild(actionRow);
    body.append(danger.heading, danger.group);

    return body;
  }

  /**
   * The Settings screen was shown — load the stored anchor date and refresh
   * the impact preview.
   */
  async function open() {
    const modal = _panel();
    if (!modal) return;

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

  // ── Event handlers ────────────────────────────────────────────────────────

  function _handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    if (action === 'prune') {
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

    // Handle home base city change
    const cityTarget = event.target.closest('[data-action="change-home-base"]');
    if (cityTarget) {
      const selectedName = cityTarget.value;
      const matchedCity = HOME_BASE_CITIES.find(c => c.name === selectedName);
      if (matchedCity) {
        try {
          await settings.setHomeBaseCity(matchedCity);
          doc.dispatchEvent(new CustomEvent('data:records:mutated', { bubbles: true, detail: { source: 'home-base-city' } }));
        } catch (err) {
          console.error('[settings-ui]', err);
          reporter.db('❌ Failed to save home base city');
        }
      }
      return;
    }

    // Handle date change — persist anchor and refresh impact preview
    const dateTarget = event.target.closest('[data-field="anchor-date"]');
    if (!dateTarget) return;

    const date = dateTarget.value;
    if (!date) return;

    const modal = _panel();
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
   * button label "Delete days before Jan 1, 2018".
   */
  async function _refreshImpact(date) {
    const modal = _panel();
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
        actionBtn.textContent = `Delete days before ${_formatReadableDate(date)}`;
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
    const modal = _panel();
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
        actionBtn.textContent = WIPE_LABEL;
        actionBtn.className = 'btn btn-hazard btn-block';
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
        actionBtn.className = 'btn btn-danger btn-block';
        actionBtn.textContent = PRUNE_LABEL;
      }
      const input = modal.querySelector('[data-field="anchor-date"]');
      await _refreshImpact(input ? input.value : '');
    }
  }

  /**
   * Handle the prune action — confirm then prune and dispatch.
   */
  async function _handlePrune() {
    const modal = _panel();
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

  return { render, open };
}
