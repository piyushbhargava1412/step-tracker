/**
 * Calendar UI render layer — sole DOM writer.
 * No Dexie reads; all data arrives via the calendar engine payload.
 *
 * Factory: createCalendarUI(doc, db, calendarEngine, reporter, records, processImage) → { render }
 * `db` is carried for contract parity with createStreakUI (streak-ui.js:125);
 * not used for reads here.
 */

import { computeCommitmentHitRate } from './calendar.js';

/**
 * @param {{ getElementById: Function, querySelector: Function, querySelectorAll: Function }} doc
 * @param {{}} db — carried for contract parity; not used for reads here
 * @param {{ loadMonth: Function, buildZeroState: Function }} calendarEngine
 * @param {{ db: Function }} reporter
 * @param {{ overrideRecord: Function, revertRecord: Function }} [records] — injected override capability
 * @param {Function} [processImage] — injected image processor
 * @param {{ render: Function }} [monthOverview] — reusable month overview renderer
 * @param {Function} [confirmFn] — injected confirmation dialog (defaults to window.confirm)
 * @returns {{ render: Function }}
 */
export function createCalendarUI(doc, db, calendarEngine, reporter, records, processImage, monthOverview, confirmFn = window.confirm) {
  // Selected month (0-based), defaults to current local month (SF-9)
  let state = { year: new Date().getFullYear(), month: new Date().getMonth() };
  let controller = null;

  // Currently-open proof lightbox element (null when closed)
  let lightboxEl = null;

  /**
   * Idempotent render: aborts previous listeners, loads month data,
   * builds nav + summary + grid, re-attaches delegated listeners.
   * Never throws — errors are logged and fail-open to a zero-state grid.
   *
   * @param {number} year
   * @param {number} month - 0-based
   * @returns {Promise<void>}
   */
  async function render(year = state.year, month = state.month) {
    // Persist selected month
    state.year = year;
    state.month = month;

    // AbortController for listener lifecycle (aborted on re-render)
    if (controller) {
      controller.abort();
    }
    controller = new AbortController();
    const signal = controller.signal;

    const panel = doc.getElementById('tab-calendar');
    if (!panel) {
      console.warn('[calendar]', 'Missing #tab-calendar — skipping render');
      return;
    }

    // Load month data (may reject)
    let payload;
    try {
      payload = await calendarEngine.loadMonth(year, month);
    } catch (err) {
      console.error('[calendar]', err);
      reporter.db('\u274C Calendar load failed');
      payload = calendarEngine.buildZeroState(year, month);
    }

    // Remove dynamic children (idempotency) — never remove #day-drawer or .drawer-overlay
    const existingNav = panel.querySelector('#calendar-nav');
    const existingSummary = panel.querySelector('#calendar-summary');
    const existingGrid = panel.querySelector('#calendar-grid');
    if (existingNav) existingNav.remove();
    if (existingSummary) existingSummary.remove();
    if (existingGrid) existingGrid.remove();
    panel.querySelector('#calendar-month-overview-card')?.remove();

    // Close any open drawer before rebuilding (SF-8)
    _closeDrawerInternal();

    // Build and append nav
    const navEl = _buildNav(payload);
    panel.appendChild(navEl);

    // Build and append summary
    const summaryEl = _buildSummary(payload);
    panel.appendChild(summaryEl);

    if (monthOverview) {
      const monthMount = doc.createElement('div');
      monthMount.id = 'calendar-grid';
      monthMount.classList.add('month-overview-mount');
      panel.appendChild(monthMount);
      await monthOverview.render({
        slot: monthMount,
        year,
        month,
        payload,
        cardId: 'calendar-month-overview-card',
        showHistoryHint: false,
        onDayClick: (day, tileEl) => _openDrawer(day, tileEl),
      });
    }

    // Keep the legacy interactive grid for callers that have not adopted the
    // reusable month overview renderer yet.
    if (!monthOverview) {
      const gridEl = _buildGrid(payload);
      gridEl._payload = payload;
      panel.appendChild(gridEl);
    }

    // Attach delegated listeners
    _attachNavListeners(navEl, signal);
    if (!monthOverview) {
      _attachGridListeners(panel.querySelector('#calendar-grid'), signal);
    }
  }

  // ── Navigation panel ────────────────────────────────────────────────────

  function _buildNav(payload) {
    const nav = doc.createElement('div');
    nav.id = 'calendar-nav';

    const prevBtn = doc.createElement('button');
    prevBtn.type = 'button';
    prevBtn.dataset.nav = 'prev';
    prevBtn.textContent = '\u25C0';
    if (!payload.navBounds.canGoPrev) prevBtn.disabled = true;

    const nextBtn = doc.createElement('button');
    nextBtn.type = 'button';
    nextBtn.dataset.nav = 'next';
    nextBtn.textContent = '\u25B6';
    if (!payload.navBounds.canGoNext) nextBtn.disabled = true;

    // Month select (0-based)
    const monthSelect = doc.createElement('select');
    monthSelect.dataset.monthSelect = 'true';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let m = 0; m < 12; m += 1) {
      const opt = doc.createElement('option');
      opt.value = m;
      opt.textContent = monthNames[m];
      if (m === payload.month) opt.selected = true;
      monthSelect.appendChild(opt);
    }

    // Year select
    const yearSelect = doc.createElement('select');
    yearSelect.dataset.yearSelect = 'true';
    for (let y = payload.navBounds.minYear; y <= payload.navBounds.maxYear; y += 1) {
      const opt = doc.createElement('option');
      opt.value = y;
      opt.textContent = String(y);
      if (y === payload.year) opt.selected = true;
      yearSelect.appendChild(opt);
    }

    const period = doc.createElement('div');
    period.className = 'calendar-period';
    period.appendChild(monthSelect);
    period.appendChild(yearSelect);

    nav.appendChild(prevBtn);
    nav.appendChild(period);
    nav.appendChild(nextBtn);

    return nav;
  }

  function _attachNavListeners(navEl, signal) {
    // Prev/Next click
    navEl.addEventListener('click', (e) => {
      const navBtn = e.target.closest('[data-nav]');
      if (!navBtn || navBtn.disabled) return;
      const direction = navBtn.dataset.nav === 'prev' ? -1 : 1;
      let nextYear = state.year;
      let nextMonth = state.month + direction;

      // Month rollover
      if (nextMonth < 0) { nextMonth = 11; nextYear -= 1; }
      if (nextMonth > 11) { nextMonth = 0; nextYear += 1; }

      render(nextYear, nextMonth);
    }, { signal });

    // Select change
    navEl.addEventListener('change', (e) => {
      const sel = e.target.closest('select');
      if (!sel) return;
      const yearSel = navEl.querySelector('[data-year-select]');
      const monthSel = navEl.querySelector('[data-month-select]');
      const y = parseInt(yearSel.value, 10);
      let m = parseInt(monthSel.value, 10);

      // Clamp to current month if beyond upper bound
      const todayY = new Date().getFullYear();
      const todayM = new Date().getMonth();
      if (y > todayY || (y === todayY && m > todayM)) {
        m = todayM;
      }

      render(y, m);
    }, { signal });
  }

  // ── Summary panel ────────────────────────────────────────────────────────

  function _buildSummary(payload) {
    const summary = doc.createElement('div');
    summary.id = 'calendar-summary';

    // Caption: "August 2026"
    const caption = new Date(payload.year, payload.month, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const hitRate = computeCommitmentHitRate(
      payload.days,
      payload.today,
      payload.activeStepGoal,
    );
    const cells = [
      { label: 'Total Steps', value: payload.aggregates.totalSteps },
      { label: 'Avg Daily Steps', value: payload.aggregates.averageDailySteps },
      { label: 'Hit Rate', value: hitRate != null ? hitRate + '%' : null },
    ];

    // Create caption cell
    const captionCell = doc.createElement('div');
    captionCell.className = 'summary-cell';
    const captionText = doc.createElement('span');
    captionText.className = 'caption';
    captionText.textContent = caption;
    captionCell.appendChild(captionText);
    summary.appendChild(captionCell);

    for (const cell of cells) {
      const div = doc.createElement('div');
      div.className = 'summary-cell';
      const label = doc.createElement('span');
      label.textContent = cell.label;
      const valueText = _formatMetric(cell.value);
      const value = doc.createElement('span');
      value.className = 'value';
      value.textContent = valueText;
      div.appendChild(label);
      div.appendChild(value);
      summary.appendChild(div);
    }

    return summary;
  }

  function _formatMetric(value) {
    if (value == null) return '\u2014'; // em dash
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '\u2014';
      return value.toLocaleString('en-US');
    }
    return String(value);
  }

  // ── Grid panel ───────────────────────────────────────────────────────────

  function _buildGrid(payload) {
    const grid = doc.createElement('div');
    grid.id = 'calendar-grid';
    grid.className = 'calendar-grid';

    // Weekday header (Mon-Sun) — 7 cells placed directly in the grid
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const wd of weekdays) {
      const cell = doc.createElement('div');
      cell.className = 'calendar-header-cell';
      cell.setAttribute('aria-hidden', 'true');
      cell.textContent = wd;
      grid.appendChild(cell);
    }

    // Tiles
    const classMap = {
      [0]: 'tile--empty',
      [1]: 'tile--missed',
      [2]: 'tile--met',
      [3]: 'tile--exceeded',
    };

    // Leading padding
    for (let i = 0; i < payload.leadingPad; i += 1) {
      const padCell = doc.createElement('div');
      padCell.className = 'calendar-tile calendar-tile--pad';
      padCell.setAttribute('aria-hidden', 'true');
      grid.appendChild(padCell);
    }

    // Real day tiles
    for (const day of payload.days) {
      const tile = doc.createElement('button');
      tile.type = 'button';
      tile.className = `calendar-tile ${classMap[day.classification.state] || 'tile--empty'}`;
      tile.dataset.date = day.date;
      tile.textContent = String(day.dayOfMonth);

      if (day.isFuture) {
        tile.disabled = true;
      }

      // Override badge
      if (day.classification.isOverridden) {
        const badge = doc.createElement('span');
        badge.className = 'tile__override-badge';
        badge.setAttribute('aria-label', 'Manually overridden');
        badge.textContent = '*';
        tile.appendChild(badge);
      }

      grid.appendChild(tile);
    }

    // Trailing padding
    for (let i = 0; i < payload.trailingPad; i += 1) {
      const padCell = doc.createElement('div');
      padCell.className = 'calendar-tile calendar-tile--pad';
      padCell.setAttribute('aria-hidden', 'true');
      grid.appendChild(padCell);
    }

    return grid;
  }

  function _attachGridListeners(gridEl, signal) {
    gridEl.addEventListener('click', (e) => {
      const tile = e.target.closest('[data-date]');
      if (!tile) return;

      // Find the day in the current payload
      const dateStr = tile.dataset.date;
      const payload = gridEl._payload;
      if (!payload) return;

      const day = payload.days.find((d) => d.date === dateStr);
      if (!day) return;

      // Future tiles are disabled, so they won't reach here
      // Padding cells carry no data-date, so they won't reach here
      _openDrawer(day, tile);
    }, { signal });
  }

  // ── Drawer ───────────────────────────────────────────────────────────────

  function _openDrawer(day, tile) {
    const drawer = doc.getElementById('day-drawer');
    const overlay = doc.querySelector('.drawer-overlay');
    if (!drawer || !overlay) return;

    // Store invoking tile for focus restoration
    const previousFocus = doc.activeElement;

    // Clear previous content
    drawer.replaceChildren();

    // Date header
    const parts = day.date.split('-').map(Number);
    const headerDate = new Date(parts[0], parts[1] - 1, parts[2])
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const h2 = doc.createElement('h2');
    h2.id = 'day-drawer-title';
    h2.textContent = headerDate;
    drawer.appendChild(h2);

    // Action row — Edit / Override always; Revert to Synced when overridden
    const actionRow = doc.createElement('div');
    actionRow.className = 'drawer-actions';

    if (day.record) {
      // Populated drawer
      const rows = [
        { label: 'Effective Steps', value: day.record.effective_steps },
        { label: 'Synced (Google Fit)', value: day.record.original_steps },
      ];

      // Override status
      if (day.record.is_overridden) {
        rows.push({ label: 'Override status', value: 'Yes' });
      }

      for (const row of rows) {
        const rowDiv = doc.createElement('div');
        rowDiv.className = 'metric-row';
        const labelSpan = doc.createElement('span');
        labelSpan.textContent = row.label;
        const valueSpan = doc.createElement('span');
        valueSpan.className = 'value';
        valueSpan.textContent = row.value != null ? String(row.value) : '—';
        rowDiv.appendChild(labelSpan);
        rowDiv.appendChild(valueSpan);
        drawer.appendChild(rowDiv);
      }

      // Saved proof thumbnail — clickable to open the full-size lightbox
      if (day.record.override && day.record.override.proof_image_base64) {
        const thumbWrap = doc.createElement('button');
        thumbWrap.type = 'button';
        thumbWrap.className = 'proof-thumb-wrap';
        thumbWrap.dataset.action = 'view-proof';
        thumbWrap.setAttribute('aria-label', 'View full-size proof image');
        const thumb = doc.createElement('img');
        thumb.className = 'proof-thumb';
        thumb.src = day.record.override.proof_image_base64;
        thumb.alt = 'Proof image thumbnail';
        thumbWrap.appendChild(thumb);
        thumbWrap.addEventListener('click', () => {
          _openLightbox(day.record.override.proof_image_base64);
        }, { signal: controller.signal });
        drawer.appendChild(thumbWrap);
      }

      // Revert button — only when record is overridden and records module is available
      if (day.record.is_overridden && records) {
        const revertBtn = doc.createElement('button');
        revertBtn.type = 'button';
        revertBtn.className = 'revert-btn';
        revertBtn.dataset.action = 'revert-day';
        revertBtn.textContent = 'Revert to Synced';
        revertBtn.addEventListener('click', async () => {
          const confirmed = confirmFn('Are you sure you want to revert to the original synced values? This will undo your manual override.');
          if (!confirmed) return;
          try {
            await records.revertRecord(day.date);
            doc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: { date: day.date } }));
          } catch (err) {
            reporter.db('\u274C Revert failed');
            console.error('[calendar-ui]', err);
          }
          }, { signal: controller.signal });
        actionRow.appendChild(revertBtn);
      }
    } else {
      // Zero-state: no synced data for this date
      const noDataText = doc.createElement('p');
      noDataText.textContent = 'No synced data for this date';
      drawer.appendChild(noDataText);

      const metricLabels = [
        'Effective Steps',
        'Synced (Google Fit)',
      ];
      for (const label of metricLabels) {
        const rowDiv = doc.createElement('div');
        rowDiv.className = 'metric-row';
        const labelSpan = doc.createElement('span');
        labelSpan.textContent = label;
        const valueSpan = doc.createElement('span');
        valueSpan.className = 'value';
        valueSpan.textContent = '\u2014';
        rowDiv.appendChild(labelSpan);
        rowDiv.appendChild(valueSpan);
        drawer.appendChild(rowDiv);
      }
    }

    // Edit / Override button — enabled when records module is available
    const editBtn = doc.createElement('button');
    editBtn.type = 'button';
    editBtn.dataset.action = 'edit-day';
    if (!records) {
      editBtn.disabled = true;
      editBtn.title = 'Editing arrives in ST-006';
    }
    editBtn.textContent = 'Edit / Override';
    if (records) {
      editBtn.addEventListener('click', () => {
        _mountOverrideForm(drawer, day);
      }, { signal: controller.signal });
    }
    actionRow.appendChild(editBtn);
    drawer.appendChild(actionRow);

    // Close button
    const closeBtn = doc.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.type = 'button';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', () => _closeDrawer(tile || previousFocus), { once: true });
    drawer.insertBefore(closeBtn, drawer.firstChild.nextSibling);

    // Overlay click and Escape key dismissal — use module-level controller signal so
    // both listeners are automatically removed when render() aborts the controller on re-render.
    overlay.addEventListener('click', () => _closeDrawer(tile), { signal: controller.signal });
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') _closeDrawer(tile); }, { signal: controller.signal });

    // Show drawer
    drawer.classList.add('drawer--open');
    drawer.removeAttribute('hidden');
    overlay.removeAttribute('hidden');

    // Focus close button
    closeBtn.focus();
  }

  /**
   * Mount the override form inside the drawer, replacing the Edit button.
   * All content built via createElement/textContent only — no dynamic string injection.
   */
  function _mountOverrideForm(drawer, day) {
    // Remove the Edit button (last button with data-action="edit-day")
    const editBtn = drawer.querySelector('[data-action="edit-day"]');
    if (editBtn) editBtn.remove();

    const form = doc.createElement('form');
    form.dataset.form = 'override';

    // Effective steps input (required)
    const stepsLabel = doc.createElement('label');
    stepsLabel.textContent = 'Effective Steps';
    const stepsInput = doc.createElement('input');
    stepsInput.type = 'number';
    stepsInput.min = '0';
    stepsInput.step = '1';
    stepsInput.dataset.field = 'effective-steps';
    stepsInput.required = true;
    if (day.record) {
      stepsInput.value = String(day.record.effective_steps);
    }
    stepsLabel.appendChild(stepsInput);
    form.appendChild(stepsLabel);

    // Proof image — mandatory. An existing proof is reused when re-editing; a
    // newly selected file replaces it. Removing the proof re-disables Save.
    const existingProof = day.record && day.record.override && day.record.override.proof_image_base64
      ? day.record.override.proof_image_base64
      : null;
    let currentProof = existingProof;
    let processing = false;

    const proofLabel = doc.createElement('label');
    proofLabel.textContent = 'Proof Image (required)';
    const fileInput = doc.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/webp';
    fileInput.dataset.field = 'proof-image';
    proofLabel.appendChild(fileInput);
    form.appendChild(proofLabel);

    // Proof preview area: empty hint, clickable thumbnail, remove button
    const proofArea = doc.createElement('div');
    proofArea.className = 'proof-area';

    const proofHint = doc.createElement('span');
    proofHint.className = 'proof-area__hint';
    proofHint.textContent = 'No proof image uploaded';

    const thumbWrap = doc.createElement('button');
    thumbWrap.type = 'button';
    thumbWrap.className = 'proof-thumb-wrap';
    thumbWrap.dataset.action = 'view-proof';
    thumbWrap.setAttribute('aria-label', 'View full-size proof image');
    const thumb = doc.createElement('img');
    thumb.className = 'proof-thumb';
    thumb.alt = 'Proof image thumbnail';
    thumbWrap.appendChild(thumb);

    const deleteBtn = doc.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'proof-delete-btn';
    deleteBtn.dataset.action = 'delete-proof';
    deleteBtn.textContent = 'Remove image';

    proofArea.appendChild(proofHint);
    proofArea.appendChild(thumbWrap);
    proofArea.appendChild(deleteBtn);
    form.appendChild(proofArea);

    // Submit button
    const submitBtn = doc.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Save Override';
    form.appendChild(submitBtn);

    function updateProofUI() {
      proofHint.hidden = currentProof != null;
      thumbWrap.hidden = currentProof == null;
      deleteBtn.hidden = currentProof == null;
      if (currentProof) thumb.src = currentProof;
    }

    function updateSaveState() {
      submitBtn.disabled = processing || currentProof == null;
      submitBtn.textContent = processing ? 'Processing\u2026' : 'Save Override';
    }

    updateProofUI();
    updateSaveState();

    // File change → downsize immediately (≤1024 px) so the thumbnail reflects
    // exactly what will be stored; Save stays disabled while processing.
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      if (!file) return;
      if (!processImage) {
        reporter.db('\u274C Image processing unavailable');
        fileInput.value = '';
        return;
      }
      const previousProof = currentProof;
      processing = true;
      updateSaveState();
      try {
        currentProof = await processImage(file);
      } catch (err) {
        reporter.db('\u274C Image processing failed');
        console.error('[calendar-ui]', err);
        currentProof = previousProof;
        fileInput.value = '';
      } finally {
        processing = false;
        updateProofUI();
        updateSaveState();
      }
    }, { signal: controller.signal });

    // Remove current proof → no proof state, Save disabled until re-upload
    deleteBtn.addEventListener('click', () => {
      currentProof = null;
      fileInput.value = '';
      updateProofUI();
      updateSaveState();
    }, { signal: controller.signal });

    // Click thumbnail → full-size lightbox
    thumbWrap.addEventListener('click', () => {
      if (currentProof) _openLightbox(currentProof);
    }, { signal: controller.signal });

    // Submit handler registered under controller.signal
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const stepsRaw = stepsInput.value.trim();
      const stepsNum = stepsRaw !== '' ? Number(stepsRaw) : NaN;
      const stepsVal = stepsNum;

      // Guard-clause: validate inputs before calling overrideRecord
      // steps: required, must be a finite integer >= 0 (empty string, floats, negatives all rejected)
      if (stepsRaw === '' || !Number.isFinite(stepsNum) || !Number.isInteger(stepsNum) || stepsNum < 0) {
        stepsInput.setCustomValidity('Steps must be a whole number ≥ 0');
        stepsInput.reportValidity();
        return;
      }
      stepsInput.setCustomValidity('');

      // Proof is mandatory — button is normally disabled, but implicit form
      // submission (e.g. Enter key) can bypass that, so guard here too.
      if (currentProof == null) {
        fileInput.setCustomValidity('A proof image is required');
        fileInput.reportValidity();
        return;
      }
      fileInput.setCustomValidity('');

      try {
        await records.overrideRecord(day.date, {
          effective_steps: stepsVal,
          proof_image_base64: currentProof,
        });
        doc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: { date: day.date } }));
      } catch (err) {
        reporter.db('\u274C Override failed');
        console.error('[calendar-ui]', err);
      }
    }, { signal: controller.signal });

    drawer.appendChild(form);
  }

  /**
   * Open a full-size proof image in a modal lightbox.
   * @param {string} src - data URL of the stored proof image
   */
  function _openLightbox(src) {
    _closeLightbox();
    const panel = doc.getElementById('tab-calendar') || doc.body;
    if (!panel) return;

    const overlay = doc.createElement('div');
    overlay.className = 'proof-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Full-size proof image');

    const frame = doc.createElement('div');
    frame.className = 'proof-lightbox__frame';

    const img = doc.createElement('img');
    img.className = 'proof-lightbox__img';
    img.src = src;
    img.alt = 'Proof image';

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'proof-lightbox__close';
    closeBtn.textContent = '\u00D7';
    closeBtn.setAttribute('aria-label', 'Close proof image');

    frame.appendChild(img);
    frame.appendChild(closeBtn);
    overlay.appendChild(frame);
    panel.appendChild(overlay);
    lightboxEl = overlay;

    closeBtn.addEventListener('click', _closeLightbox, { once: true });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) _closeLightbox();
    }, { once: true });
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') _closeLightbox();
    }, { once: true });

    closeBtn.focus();
  }

  function _closeLightbox() {
    if (lightboxEl) {
      lightboxEl.remove();
      lightboxEl = null;
    }
  }

  function _closeDrawer(tile) {
    const drawer = doc.getElementById('day-drawer');
    const overlayEl = doc.querySelector('.drawer-overlay');
    if (!drawer) return;

    _closeLightbox();
    drawer.classList.remove('drawer--open');
    drawer.setAttribute('hidden', '');
    if (overlayEl) overlayEl.setAttribute('hidden', '');

    // Clear content
    drawer.replaceChildren();

    // Restore focus (guarded — tile may have been removed by re-render)
    if (tile && typeof tile.focus === 'function') {
      try { tile.focus(); } catch (_) { /* element may be removed from DOM */ }
    }
  }

  function _closeDrawerInternal() {
    const drawer = doc.getElementById('day-drawer');
    const overlay = doc.querySelector('.drawer-overlay');
    if (!drawer) return;

    _closeLightbox();
    drawer.classList.remove('drawer--open');
    drawer.setAttribute('hidden', '');
    if (overlay) overlay.setAttribute('hidden', '');
    drawer.replaceChildren();
  }

  return { render };
}
