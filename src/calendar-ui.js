/**
 * Calendar UI render layer — sole DOM writer.
 * No Dexie reads; all data arrives via the calendar engine payload.
 *
 * Factory: createCalendarUI(doc, db, calendarEngine, reporter) → { render }
 * `db` is carried for contract parity with createStreakUI (streak-ui.js:125);
 * not used for reads here.
 */

/**
 * @param {{ getElementById: Function, querySelector: Function, querySelectorAll: Function }} doc
 * @param {{}} db — carried for contract parity; not used for reads here
 * @param {{ loadMonth: Function, buildZeroState: Function }} calendarEngine
 * @param {{ db: Function }} reporter
 * @returns {{ render: Function }}
 */
export function createCalendarUI(doc, db, calendarEngine, reporter) {
  // Selected month (0-based), defaults to current local month (SF-9)
  let state = { year: new Date().getFullYear(), month: new Date().getMonth() };
  let controller = null;

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

    // Close any open drawer before rebuilding (SF-8)
    _closeDrawerInternal();

    // Build and append nav
    const navEl = _buildNav(payload);
    panel.appendChild(navEl);

    // Build and append summary
    const summaryEl = _buildSummary(payload);
    panel.appendChild(summaryEl);

    // Build and append grid (weekday header + tiles)
    const gridEl = _buildGrid(payload);
    gridEl._payload = payload; // Store payload for drawer access
    panel.appendChild(gridEl);

    // Attach delegated listeners
    _attachNavListeners(navEl, signal);
    _attachGridListeners(gridEl, signal);
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

    nav.appendChild(prevBtn);
    nav.appendChild(monthSelect);
    nav.appendChild(yearSelect);
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

    const cells = [
      { label: 'Total Steps', value: payload.aggregates.totalSteps },
      { label: 'Total Distance', value: payload.aggregates.totalDistanceKm != null
        ? payload.aggregates.totalDistanceKm.toFixed(2) + ' km' : null },
      { label: 'Avg Daily Steps', value: payload.aggregates.averageDailySteps },
      { label: 'Hit Rate', value: payload.aggregates.hitRatePct != null
        ? payload.aggregates.hitRatePct + '%' : null },
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

    // Weekday header (Mon-Sun)
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const headerRow = doc.createElement('div');
    headerRow.style.display = 'grid';
    headerRow.style.gridTemplateColumns = 'repeat(7, 1fr)';
    headerRow.style.fontSize = '0.7rem';
    headerRow.style.color = 'var(--text-muted)';
    headerRow.setAttribute('aria-hidden', 'true');
    for (const wd of weekdays) {
      const cell = doc.createElement('div');
      cell.className = 'calendar-tile';
      cell.textContent = wd;
      headerRow.appendChild(cell);
    }
    grid.appendChild(headerRow);

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
    drawer.innerHTML = '';

    // Date header
    const parts = day.date.split('-').map(Number);
    const headerDate = new Date(parts[0], parts[1] - 1, parts[2])
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const h2 = doc.createElement('h2');
    h2.id = 'day-drawer-title';
    h2.textContent = headerDate;
    drawer.appendChild(h2);

    if (day.record) {
      // Populated drawer
      const rows = [
        { label: 'Effective Steps', value: day.record.effective_steps },
        { label: 'Effective Distance', value: day.record.effective_distance_km },
        { label: 'Synced (Google Fit)', value: `${day.record.original_steps} / ${day.record.original_distance_km}` },
      ];

      // Verified Manual row: show effective values only if overridden
      if (day.record.is_overridden && day.record.override) {
        rows.push({ label: 'Verified Manual', value: day.record.effective_steps });
        rows.push({ label: 'Override note', value: day.record.override.note });
      } else {
        rows.push({ label: 'Verified Manual', value: null });
      }

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
    } else {
      // Zero-state: no synced data for this date
      const noDataText = doc.createElement('p');
      noDataText.textContent = 'No synced data for this date';
      drawer.appendChild(noDataText);

      const metricLabels = [
        'Effective Steps', 'Effective Distance',
        'Synced (Google Fit)', 'Verified Manual',
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

    // Edit / Override button (disabled until ST-006, SF-14)
    const editBtn = doc.createElement('button');
    editBtn.type = 'button';
    editBtn.dataset.action = 'edit-day';
    editBtn.disabled = true;
    editBtn.title = 'Editing arrives in ST-006';
    editBtn.textContent = 'Edit / Override';
    drawer.appendChild(editBtn);

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

  function _closeDrawer(tile) {
    const drawer = doc.getElementById('day-drawer');
    const overlay = doc.querySelector('.drawer-overlay');
    if (!drawer) return;

    drawer.classList.remove('drawer--open');
    drawer.setAttribute('hidden', '');
    const overlayEl = doc.querySelector('.drawer-overlay');
    if (overlayEl) overlayEl.setAttribute('hidden', '');

    // Clear content
    drawer.innerHTML = '';

    // Restore focus (guarded — tile may have been removed by re-render)
    if (tile && typeof tile.focus === 'function') {
      try { tile.focus(); } catch (_) { /* element may be removed from DOM */ }
    }
  }

  function _closeDrawerInternal() {
    const drawer = doc.getElementById('day-drawer');
    const overlay = doc.querySelector('.drawer-overlay');
    if (!drawer) return;

    drawer.classList.remove('drawer--open');
    drawer.setAttribute('hidden', '');
    if (overlay) overlay.setAttribute('hidden', '');
    drawer.innerHTML = '';
  }

  return { render };
}
