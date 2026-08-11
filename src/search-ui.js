export function createSearchUI(doc, search, exporter, goal, reporter) {
  let controller = null;

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

    while (panel.firstChild) {
      panel.removeChild(panel.firstChild);
    }

    panel.appendChild(_buildFilters());
    panel.appendChild(_buildResultsGrid());
    panel.appendChild(_buildSummary());
    panel.appendChild(_buildExportControls());
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
