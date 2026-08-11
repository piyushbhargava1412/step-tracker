export function createSearchUI(doc, search, exporter, reporter) {
  let controller = null;
  let currentRecords = null;

  function render() {
    const panel = doc.getElementById('tab-search');
    if (!panel) {
      console.warn('[search]', 'Missing #tab-search — skipping render');
      return;
    }

    if (controller) {
      controller.abort();
    }
    controller = new AbortController();
    const { signal } = controller;

    while (panel.firstChild) {
      panel.removeChild(panel.firstChild);
    }

    panel.appendChild(_buildFilters());
    panel.appendChild(_buildResultsGrid());
    panel.appendChild(_buildSummary());
    panel.appendChild(_buildExportControls());

    panel.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'execute') await _handleExecute(panel);
      else if (action === 'reset') _handleReset(panel);
      else if (action === 'export-csv') _handleExportCsv();
      else if (action === 'export-json') _handleExportJson();
    }, { signal });
  }

  async function _handleExecute(panel) {
    const filters = _readFilters(panel);
    try {
      const result = await search.executeQuery(filters);
      currentRecords = result.records;
      _renderGrid(panel, result.records);
      const summary = search.computeResultSummary(result.records, result.totalDays);
      _renderSummary(panel, summary);
    } catch (err) {
      currentRecords = null;
      console.error('[search]', err);
      reporter.db('❌ Search query failed');
      _renderGrid(panel, []);
    }
  }

  function _handleReset(panel) {
    currentRecords = null;
    panel.querySelectorAll('[data-field]').forEach((el) => {
      el.value = '';
    });
    _renderGrid(panel, []);
    _renderSummary(panel, { count: 0, matchPct: null, cumulativeDistanceKm: 0, avgSteps: null });
  }

  function _handleExportCsv() {
    if (!currentRecords || currentRecords.length === 0) return;
    exporter.exportCsv(currentRecords);
  }

  function _handleExportJson() {
    if (!currentRecords || currentRecords.length === 0) return;
    exporter.exportJson(currentRecords);
  }

  function _readFilters(panel) {
    const filters = {};
    panel.querySelectorAll('[data-field]').forEach((el) => {
      const field = el.dataset.field;
      const val = el.value.trim();
      if (!val) return;
      if (field === 'start-date') filters.startDate = val;
      else if (field === 'end-date') filters.endDate = val;
      else if (field === 'min-steps') {
        const n = Number(val);
        if (Number.isFinite(n)) filters.minSteps = n;
      } else if (field === 'max-steps') {
        const n = Number(val);
        if (Number.isFinite(n)) filters.maxSteps = n;
      } else if (field === 'min-distance') {
        const n = Number(val);
        if (Number.isFinite(n)) filters.minDistance = n;
      } else if (field === 'override-status' && val !== 'all') {
        filters.overrideStatus = val;
      } else if (field === 'target-outcome' && val !== 'all') {
        filters.targetOutcome = val;
      }
    });
    return filters;
  }

  function _renderGrid(panel, records) {
    const grid = panel.querySelector('.search-results-table');
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    for (const record of records) {
      const row = doc.createElement('div');
      row.dataset.row = record.date;

      const dateCell = doc.createElement('span');
      dateCell.dataset.cell = 'date';
      dateCell.textContent = record.date;
      row.appendChild(dateCell);

      const stepsCell = doc.createElement('span');
      stepsCell.dataset.cell = 'effective-steps';
      stepsCell.textContent = String(record.effective_steps);
      row.appendChild(stepsCell);

      const distCell = doc.createElement('span');
      distCell.dataset.cell = 'effective-distance';
      distCell.textContent = Number.isFinite(record.effective_distance_km)
        ? String(record.effective_distance_km)
        : '—';
      row.appendChild(distCell);

      const noteCell = doc.createElement('span');
      noteCell.dataset.cell = 'override-note';
      noteCell.textContent = record.is_overridden ? (record.override?.note ?? '') : '—';
      row.appendChild(noteCell);

      grid.appendChild(row);
    }
  }

  function _renderSummary(panel, summary) {
    const summaryEl = panel.querySelector('.search-summary');
    while (summaryEl.firstChild) summaryEl.removeChild(summaryEl.firstChild);

    const cells = [
      { label: 'Matches', value: String(summary.count ?? 0) },
      { label: 'Match %', value: summary.matchPct !== null && summary.matchPct !== undefined ? `${summary.matchPct}%` : '—' },
      { label: 'Cumulative Distance', value: summary.cumulativeDistanceKm !== undefined ? `${summary.cumulativeDistanceKm} km` : '—' },
      { label: 'Avg Steps', value: summary.avgSteps !== null && summary.avgSteps !== undefined ? String(summary.avgSteps) : '—' },
    ];

    for (const cell of cells) {
      const div = doc.createElement('div');
      div.className = 'summary-cell';
      const labelSpan = doc.createElement('span');
      labelSpan.textContent = cell.label;
      const valueSpan = doc.createElement('span');
      valueSpan.className = 'value';
      valueSpan.textContent = cell.value;
      div.appendChild(labelSpan);
      div.appendChild(valueSpan);
      summaryEl.appendChild(div);
    }
  }

  function _buildFilters() {
    const card = doc.createElement('div');
    card.className = 'card search-filters';

    const fieldDefs = [
      { field: 'start-date', label: 'Start Date', type: 'date' },
      { field: 'end-date', label: 'End Date', type: 'date' },
      { field: 'min-steps', label: 'Min Steps', type: 'number' },
      { field: 'max-steps', label: 'Max Steps', type: 'number' },
      { field: 'min-distance', label: 'Min Distance (km)', type: 'number' },
    ];

    for (const def of fieldDefs) {
      const label = doc.createElement('label');
      const labelText = doc.createElement('span');
      labelText.textContent = def.label;
      const input = doc.createElement('input');
      input.type = def.type;
      input.dataset.field = def.field;
      label.appendChild(labelText);
      label.appendChild(input);
      card.appendChild(label);
    }

    const overrideLabel = doc.createElement('label');
    const overrideLabelText = doc.createElement('span');
    overrideLabelText.textContent = 'Override Status';
    const overrideSelect = doc.createElement('select');
    overrideSelect.dataset.field = 'override-status';
    for (const [val, text] of [['all', 'All'], ['overridden', 'Overridden'], ['not-overridden', 'Not Overridden']]) {
      const opt = doc.createElement('option');
      opt.value = val;
      opt.textContent = text;
      overrideSelect.appendChild(opt);
    }
    overrideLabel.appendChild(overrideLabelText);
    overrideLabel.appendChild(overrideSelect);
    card.appendChild(overrideLabel);

    const outcomeLabel = doc.createElement('label');
    const outcomeLabelText = doc.createElement('span');
    outcomeLabelText.textContent = 'Target Outcome';
    const outcomeSelect = doc.createElement('select');
    outcomeSelect.dataset.field = 'target-outcome';
    for (const [val, text] of [['all', 'All'], ['met', 'Met'], ['missed', 'Missed']]) {
      const opt = doc.createElement('option');
      opt.value = val;
      opt.textContent = text;
      outcomeSelect.appendChild(opt);
    }
    outcomeLabel.appendChild(outcomeLabelText);
    outcomeLabel.appendChild(outcomeSelect);
    card.appendChild(outcomeLabel);

    const btnRow = doc.createElement('div');
    btnRow.className = 'filter-actions';

    const executeBtn = doc.createElement('button');
    executeBtn.type = 'button';
    executeBtn.className = 'btn btn-primary';
    executeBtn.dataset.action = 'execute';
    executeBtn.textContent = 'Search';

    const resetBtn = doc.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-secondary';
    resetBtn.dataset.action = 'reset';
    resetBtn.textContent = 'Reset';

    btnRow.appendChild(executeBtn);
    btnRow.appendChild(resetBtn);
    card.appendChild(btnRow);

    return card;
  }

  function _buildResultsGrid() {
    const card = doc.createElement('div');
    card.className = 'card search-results-table';
    return card;
  }

  function _buildSummary() {
    const card = doc.createElement('div');
    card.className = 'card search-summary';

    const cells = [
      { label: 'Matches', value: '—' },
      { label: 'Match %', value: '—' },
      { label: 'Cumulative Distance', value: '—' },
      { label: 'Avg Steps', value: '—' },
    ];

    for (const cell of cells) {
      const div = doc.createElement('div');
      div.className = 'summary-cell';
      const labelSpan = doc.createElement('span');
      labelSpan.textContent = cell.label;
      const valueSpan = doc.createElement('span');
      valueSpan.className = 'value';
      valueSpan.textContent = cell.value;
      div.appendChild(labelSpan);
      div.appendChild(valueSpan);
      card.appendChild(div);
    }

    return card;
  }

  function _buildExportControls() {
    const card = doc.createElement('div');
    card.className = 'card export-controls';

    const csvBtn = doc.createElement('button');
    csvBtn.type = 'button';
    csvBtn.className = 'btn btn-primary';
    csvBtn.dataset.action = 'export-csv';
    csvBtn.textContent = 'Export CSV';

    const jsonBtn = doc.createElement('button');
    jsonBtn.type = 'button';
    jsonBtn.className = 'btn btn-secondary';
    jsonBtn.dataset.action = 'export-json';
    jsonBtn.textContent = 'Export JSON';

    card.appendChild(csvBtn);
    card.appendChild(jsonBtn);

    return card;
  }

  return { render };
}
