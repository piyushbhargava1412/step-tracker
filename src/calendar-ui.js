/**
 * Calendar UI render layer — sole DOM writer.
 * No Dexie reads; all data arrives via the calendar engine payload.
 *
 * Factory: createCalendarUI(doc, db, calendarEngine, reporter, records, processImage) → { render }
 * `db` is carried for contract parity with createStreakUI (streak-ui.js:125);
 * not used for reads here.
 */

import { computeCommitmentHitRate, CLASSIFICATION_MET, CLASSIFICATION_MISSED } from './calendar.js';
import { createOverrideForm, createProofLightbox } from './override-form.js';
import { createIcon } from './icons.js';
import { _localDate } from './date-utils.js';

/** Hour ticks under the day sheet's hourly chart. */
const HOUR_TICKS = ['12a', '6a', '12p', '6p', '11p'];

/**
 * @param {{ getElementById: Function, querySelector: Function, querySelectorAll: Function }} doc
 * @param {{}} db — carried for contract parity; not used for reads here
 * @param {{ loadMonth: Function, buildZeroState: Function }} calendarEngine
 * @param {{ db: Function }} reporter
 * @param {{ overrideRecord: Function, revertRecord: Function }} [records] — injected override capability
 * @param {Function} [processImage] — injected image processor
 * @param {{ render: Function }} [monthOverview] — reusable month overview renderer
 * @param {Function} [confirmFn] — injected confirmation dialog (defaults to window.confirm)
 * @returns {{ render: Function, openDay: Function }}
 */
export function createCalendarUI(doc, db, calendarEngine, reporter, records, processImage, monthOverview, confirmFn = window.confirm) {
  // Selected month (0-based), defaults to current local month (SF-9)
  let state = { year: new Date().getFullYear(), month: new Date().getMonth() };
  let controller = null;

  // Shared proof lightbox + shared override form (extracted to override-form.js)
  const proofLightbox = createProofLightbox(doc);
  const overrideForm = createOverrideForm(doc, records, processImage, reporter, {
    onViewProof: (src) => proofLightbox.open(src, doc.getElementById('tab-calendar') || doc.body),
  });
  const _lightboxPanel = () => doc.getElementById('tab-calendar') || doc.body;

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

    // The Month view's own mount inside the Calendar screen (Week / Month
    // switch); older shells without it render straight into #tab-calendar.
    const panel = doc.getElementById('calendar-month') || doc.getElementById('tab-calendar');
    if (!panel) {
      console.warn('[calendar]', 'Missing #calendar-month / #tab-calendar — skipping render');
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
        showTitle: false,
        showLegend: true,
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
    prevBtn.className = 'icon-btn';
    prevBtn.dataset.nav = 'prev';
    prevBtn.setAttribute('aria-label', 'Previous month');
    prevBtn.appendChild(createIcon(doc, 'chevronLeft', { size: 20 }));
    if (!payload.navBounds.canGoPrev) prevBtn.disabled = true;

    const nextBtn = doc.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'icon-btn';
    nextBtn.dataset.nav = 'next';
    nextBtn.setAttribute('aria-label', 'Next month');
    nextBtn.appendChild(createIcon(doc, 'chevronRight', { size: 20 }));
    if (!payload.navBounds.canGoNext) nextBtn.disabled = true;

    // Month select (0-based)
    const monthSelect = doc.createElement('select');
    monthSelect.dataset.monthSelect = 'true';
    monthSelect.setAttribute('aria-label', 'Month');
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
    yearSelect.setAttribute('aria-label', 'Year');
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
    summary.className = 'summary-tiles';

    const hitRate = computeCommitmentHitRate(
      payload.days,
      payload.today,
      payload.activeStepGoal,
    );
    const cells = [
      { label: 'Total', value: payload.aggregates.totalSteps },
      { label: 'Daily avg', value: payload.aggregates.averageDailySteps },
      { label: 'Hit rate', value: hitRate != null ? hitRate + '%' : null },
    ];

    for (const cell of cells) {
      const div = doc.createElement('div');
      div.className = 'summary-cell summary-tile';
      const label = doc.createElement('span');
      label.className = 'summary-tile__label';
      label.textContent = cell.label;
      const value = doc.createElement('span');
      value.className = 'value summary-tile__value';
      value.textContent = _formatMetric(cell.value);
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

    if (day.record) {
      const headline = doc.createElement('div');
      headline.className = 'day-headline';
      const steps = doc.createElement('span');
      steps.className = 'day-headline__steps';
      steps.textContent = _formatMetric(day.record.effective_steps);
      const unit = doc.createElement('span');
      unit.className = 'day-headline__unit';
      unit.textContent = 'steps';
      headline.append(steps, unit);
      const state = day.classification?.state;
      if (state >= CLASSIFICATION_MISSED) {
        const hit = state >= CLASSIFICATION_MET;
        // Today is not over yet: below the goal it is in progress, not missed.
        const inProgress = !hit && day.date === _localDate();
        const chip = doc.createElement('span');
        chip.className = hit ? 'day-chip day-chip--hit' : inProgress ? 'day-chip day-chip--today' : 'day-chip day-chip--missed';
        chip.textContent = hit ? 'Goal hit' : inProgress ? 'In progress' : 'Missed goal';
        headline.appendChild(chip);
      }
      drawer.appendChild(headline);
    }

    // Action row — Edit / Override always; Revert to Synced when overridden
    const actionRow = doc.createElement('div');
    actionRow.className = 'drawer-actions';

    if (day.record) {
      // Populated drawer
      const rows = [
        { label: 'Counted steps', value: day.record.effective_steps },
        { label: 'Synced steps', value: day.record.original_steps },
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
        valueSpan.textContent = row.value != null ? _formatMetric(row.value) : '—';
        rowDiv.appendChild(labelSpan);
        rowDiv.appendChild(valueSpan);
        drawer.appendChild(rowDiv);
      }

      const hourly = _buildHourlyChart(day.record.hourly_steps);
      if (hourly) drawer.insertBefore(hourly, drawer.querySelector('.metric-row'));

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
          proofLightbox.open(day.record.override.proof_image_base64, _lightboxPanel());
        }, { signal: controller.signal });
        drawer.appendChild(thumbWrap);
      }

      // Revert button — only when record is overridden and records module is available
      if (day.record.is_overridden && records) {
        const revertBtn = doc.createElement('button');
        revertBtn.type = 'button';
        revertBtn.className = 'revert-btn btn btn-secondary';
        revertBtn.dataset.action = 'revert-day';
        revertBtn.textContent = 'Revert to synced';
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
        'Counted steps',
        'Synced steps',
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
    editBtn.className = 'btn btn-primary';
    editBtn.textContent = 'Correct steps';
    if (records) {
      editBtn.addEventListener('click', () => {
        editBtn.remove();
        overrideForm.mount(drawer, day, { signal: controller.signal });
      }, { signal: controller.signal });
    }
    actionRow.appendChild(editBtn);
    drawer.appendChild(actionRow);

    // Close button
    const closeBtn = doc.createElement('button');
    closeBtn.className = 'close-btn icon-btn';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.appendChild(createIcon(doc, 'close', { size: 20 }));
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
   * Override form and full-size proof lightbox are provided by the shared
   * src/override-form.js module — see the factory-created `overrideForm` and
   * `proofLightbox` collaborators above.
   */

  function _closeDrawer(tile) {
    const drawer = doc.getElementById('day-drawer');
    const overlayEl = doc.querySelector('.drawer-overlay');
    if (!drawer) return;

    proofLightbox.close();
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

    proofLightbox.close();
    drawer.classList.remove('drawer--open');
    drawer.setAttribute('hidden', '');
    if (overlay) overlay.setAttribute('hidden', '');
    drawer.replaceChildren();
  }

  /**
   * Hourly bar chart for the day sheet; null when the record has no hourly
   * breakdown (older syncs) or it is all zero.
   *
   * @param {number[]|null|undefined} hourly  24 values
   * @returns {HTMLElement|null}
   */
  function _buildHourlyChart(hourly) {
    if (!Array.isArray(hourly) || hourly.length !== 24) return null;
    const peak = Math.max(...hourly.map((v) => (Number.isFinite(v) ? v : 0)));
    if (peak <= 0) return null;

    const wrap = doc.createElement('div');
    wrap.className = 'day-hourly';
    const label = doc.createElement('span');
    label.className = 'label';
    label.textContent = 'By hour';
    const bars = doc.createElement('div');
    bars.className = 'day-hourly__bars';
    bars.setAttribute('role', 'img');
    const busiest = hourly.indexOf(peak);
    bars.setAttribute('aria-label', `Steps by hour; busiest hour starts at ${busiest}:00`);
    for (const value of hourly) {
      const bar = doc.createElement('span');
      const steps = Number.isFinite(value) ? value : 0;
      bar.className = steps > 0 ? 'day-hourly__bar' : 'day-hourly__bar day-hourly__bar--empty';
      bar.style.height = `${Math.max(4, Math.round((steps / peak) * 100))}%`;
      bars.appendChild(bar);
    }
    const ticks = doc.createElement('div');
    ticks.className = 'day-hourly__ticks';
    ticks.setAttribute('aria-hidden', 'true');
    for (const tick of HOUR_TICKS) {
      const t = doc.createElement('span');
      t.textContent = tick;
      ticks.appendChild(t);
    }
    wrap.append(label, bars, ticks);
    return wrap;
  }

  /**
   * Open the day sheet for a day from another view (the Week view). `day`
   * carries `date` and `record` like the month payload's days.
   *
   * @param {{ date: string, record: object|null }} day
   */
  function openDay(day) {
    if (!day || !day.date) return;
    if (!controller) controller = new AbortController();
    _openDrawer(day, doc.activeElement);
  }

  return { render, openDay };
}
