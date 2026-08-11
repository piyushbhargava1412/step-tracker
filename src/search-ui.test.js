import fs from 'node:fs';
import path from 'node:path';
import { createSearchUI } from './search-ui.js';

const searchUiSource = fs.readFileSync(path.resolve(__dirname, 'search-ui.js'), 'utf8');

afterEach(() => vi.restoreAllMocks());

function buildDoc(html) {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = html;
  return doc;
}

function makeSearchTab() {
  return '<div id="tab-search"></div>';
}

function makeMockSearch() {
  return {
    executeQuery: vi.fn().mockResolvedValue({ records: [], preFilterSet: [] }),
    computeResultSummary: vi.fn().mockReturnValue({ count: 0, matchPct: null, totalDays: 0, cumulativeDistanceKm: 0, avgSteps: null }),
  };
}

function makeMockExporter() {
  return {
    exportCsv: vi.fn(),
    exportJson: vi.fn(),
  };
}


function makeMockReporter() {
  return { db: vi.fn() };
}

describe('createSearchUI — render skeleton', () => {
  it('render() mounts children inside #tab-search', () => {
    const doc = buildDoc(makeSearchTab());
    const search = makeMockSearch();
    const exporter = makeMockExporter();
    const reporter = makeMockReporter();
    const { render } = createSearchUI(doc, search, exporter, reporter);
    render();
    expect(doc.getElementById('tab-search').children.length).toBeGreaterThan(0);
  });

  it('all 7 data-field filter controls present with correct names', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    const fields = Array.from(doc.querySelectorAll('[data-field]')).map(el => el.dataset.field);
    expect(fields).toContain('start-date');
    expect(fields).toContain('end-date');
    expect(fields).toContain('min-steps');
    expect(fields).toContain('max-steps');
    expect(fields).toContain('min-distance');
    expect(fields).toContain('override-status');
    expect(fields).toContain('target-outcome');
    expect(fields.length).toBe(7);
  });

  it('data-action="execute" button has .btn.btn-primary', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    const btn = doc.querySelector('[data-action="execute"]');
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('btn')).toBe(true);
    expect(btn.classList.contains('btn-primary')).toBe(true);
  });

  it('data-action="reset" button has .btn.btn-secondary', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    const btn = doc.querySelector('[data-action="reset"]');
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('btn')).toBe(true);
    expect(btn.classList.contains('btn-secondary')).toBe(true);
  });

  it('data-action="export-csv" button has .btn.btn-primary', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    const btn = doc.querySelector('[data-action="export-csv"]');
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('btn-primary')).toBe(true);
  });

  it('data-action="export-json" button has .btn.btn-secondary', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    const btn = doc.querySelector('[data-action="export-json"]');
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('btn-secondary')).toBe(true);
  });

  it('empty results grid rendered in zero-state (no result rows)', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    const grid = doc.querySelector('.search-results-table');
    expect(grid).not.toBeNull();
    expect(grid.querySelectorAll('[data-row]').length).toBe(0);
  });

  it('summary card rendered with .search-summary and .summary-cell structure', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    const summary = doc.querySelector('.search-summary');
    expect(summary).not.toBeNull();
    expect(summary.querySelectorAll('.summary-cell').length).toBeGreaterThan(0);
  });

  it('missing #tab-search → console.warn called with [search] prefix; no throw', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = buildDoc('<div></div>');
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    expect(() => render()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('[search]', 'Missing #tab-search — skipping render');
  });

  it('re-render is idempotent: second render replaces children, not appends', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    const countAfterFirst = doc.getElementById('tab-search').children.length;
    render();
    const countAfterSecond = doc.getElementById('tab-search').children.length;
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('AbortController: first controller signal.aborted after second render()', () => {
    const doc = buildDoc(makeSearchTab());
    let capturedController = null;
    const OriginalAbortController = globalThis.AbortController;
    vi.stubGlobal('AbortController', class extends OriginalAbortController {
      constructor() {
        super();
        capturedController = this;
      }
    });
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    const firstController = capturedController;
    render();
    expect(firstController.signal.aborted).toBe(true);
    vi.unstubAllGlobals();
  });

  it('no innerHTML assignment in search-ui.js source', () => {
    expect(searchUiSource).not.toMatch(/innerHTML/);
  });

  it('no inline onclick attribute on any rendered element', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    expect(doc.querySelectorAll('[onclick]').length).toBe(0);
  });

  it('all panels wrapped in .card; export-controls wrapper present', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    expect(doc.querySelector('.card')).not.toBeNull();
    expect(doc.querySelector('.export-controls')).not.toBeNull();
  });

  it('.search-filters class present on filter form container', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    expect(doc.querySelector('.search-filters')).not.toBeNull();
  });
});

describe('createSearchUI — behaviour', () => {
  function makeRecord(overrides = {}) {
    return {
      date: '2026-01-15',
      effective_steps: 8000,
      effective_distance_km: 6.5,
      is_overridden: false,
      override: null,
      ...overrides,
    };
  }

  async function clickAction(doc, action) {
    const btn = doc.querySelector(`[data-action="${action}"]`);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  }

  it('clicking Execute calls search.executeQuery with filters object from form values', async () => {
    const doc = buildDoc(makeSearchTab());
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockResolvedValue({ records: [], preFilterSet: [] });
    const { render } = createSearchUI(doc, search, makeMockExporter(), makeMockReporter());
    render();
    doc.querySelector('[data-field="min-steps"]').value = '5000';
    doc.querySelector('[data-field="max-steps"]').value = '10000';
    await clickAction(doc, 'execute');
    expect(search.executeQuery).toHaveBeenCalledTimes(1);
    const filters = search.executeQuery.mock.calls[0][0];
    expect(filters.minSteps).toBe(5000);
    expect(filters.maxSteps).toBe(10000);
  });

  it('blank filter inputs omitted from filters object passed to executeQuery', async () => {
    const doc = buildDoc(makeSearchTab());
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockResolvedValue({ records: [], preFilterSet: [] });
    const { render } = createSearchUI(doc, search, makeMockExporter(), makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    const filters = search.executeQuery.mock.calls[0][0];
    const keys = Object.keys(filters);
    expect(keys.length).toBe(0);
  });

  it('Execute renders a grid row per returned record', async () => {
    const doc = buildDoc(makeSearchTab());
    const records = [makeRecord(), makeRecord({ date: '2026-01-14' }), makeRecord({ date: '2026-01-13' })];
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockResolvedValue({ records, preFilterSet: Array.from({ length: 3 }, () => ({})) });
    search.computeResultSummary = vi.fn().mockReturnValue({ count: 3, matchPct: 100, cumulativeDistanceKm: 19.5, avgSteps: 8000 });
    const { render } = createSearchUI(doc, search, makeMockExporter(), makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    const grid = doc.querySelector('.search-results-table');
    expect(grid.querySelectorAll('[data-row]').length).toBe(3);
  });

  it('override-note preview cell uses textContent (not innerHTML)', async () => {
    const doc = buildDoc(makeSearchTab());
    const record = makeRecord({ is_overridden: true, override: { note: '<b>hi</b>' } });
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockResolvedValue({ records: [record], preFilterSet: [{}] });
    search.computeResultSummary = vi.fn().mockReturnValue({ count: 1, matchPct: 100, cumulativeDistanceKm: 6.5, avgSteps: 8000 });
    const { render } = createSearchUI(doc, search, makeMockExporter(), makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    const noteCell = doc.querySelector('[data-row] [data-cell="override-note"]');
    expect(noteCell.textContent).toBe('<b>hi</b>');
  });

  it('non-overridden record shows — in override cell', async () => {
    const doc = buildDoc(makeSearchTab());
    const record = makeRecord({ is_overridden: false });
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockResolvedValue({ records: [record], preFilterSet: [{}] });
    search.computeResultSummary = vi.fn().mockReturnValue({ count: 1, matchPct: 100, cumulativeDistanceKm: 6.5, avgSteps: 8000 });
    const { render } = createSearchUI(doc, search, makeMockExporter(), makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    const noteCell = doc.querySelector('[data-row] [data-cell="override-note"]');
    expect(noteCell.textContent).toBe('—');
  });

  it('summary card updated with values from computeResultSummary after Execute', async () => {
    const doc = buildDoc(makeSearchTab());
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockResolvedValue({ records: [makeRecord(), makeRecord(), makeRecord()], preFilterSet: Array.from({ length: 5 }, () => ({})) });
    search.computeResultSummary = vi.fn().mockReturnValue({ count: 3, matchPct: 60, cumulativeDistanceKm: 13.5, avgSteps: 8000 });
    const { render } = createSearchUI(doc, search, makeMockExporter(), makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    const cells = doc.querySelectorAll('.summary-cell .value');
    const texts = Array.from(cells).map((c) => c.textContent);
    expect(texts).toContain('3');
    expect(texts).toContain('60%');
    expect(texts).toContain('13.5 km');
    expect(texts).toContain('8000');
  });

  it('null matchPct rendered as — in summary', async () => {
    const doc = buildDoc(makeSearchTab());
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockResolvedValue({ records: [], preFilterSet: [] });
    search.computeResultSummary = vi.fn().mockReturnValue({ count: 0, matchPct: null, cumulativeDistanceKm: 0, avgSteps: null });
    const { render } = createSearchUI(doc, search, makeMockExporter(), makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    const cells = doc.querySelectorAll('.summary-cell .value');
    const texts = Array.from(cells).map((c) => c.textContent);
    expect(texts).toContain('—');
  });

  it('Export CSV calls exporter.exportCsv with the current result array', async () => {
    const doc = buildDoc(makeSearchTab());
    const records = [makeRecord()];
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockResolvedValue({ records, preFilterSet: [{}] });
    search.computeResultSummary = vi.fn().mockReturnValue({ count: 1, matchPct: 100, cumulativeDistanceKm: 6.5, avgSteps: 8000 });
    const exporter = makeMockExporter();
    const { render } = createSearchUI(doc, search, exporter, makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    await clickAction(doc, 'export-csv');
    expect(exporter.exportCsv).toHaveBeenCalledTimes(1);
    expect(exporter.exportCsv).toHaveBeenCalledWith(records);
  });

  it('Export JSON calls exporter.exportJson with the current result array', async () => {
    const doc = buildDoc(makeSearchTab());
    const records = [makeRecord()];
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockResolvedValue({ records, preFilterSet: [{}] });
    search.computeResultSummary = vi.fn().mockReturnValue({ count: 1, matchPct: 100, cumulativeDistanceKm: 6.5, avgSteps: 8000 });
    const exporter = makeMockExporter();
    const { render } = createSearchUI(doc, search, exporter, makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    await clickAction(doc, 'export-json');
    expect(exporter.exportJson).toHaveBeenCalledTimes(1);
    expect(exporter.exportJson).toHaveBeenCalledWith(records);
  });

  it('Export CSV no-op when no Execute has been run', async () => {
    const doc = buildDoc(makeSearchTab());
    const exporter = makeMockExporter();
    const { render } = createSearchUI(doc, makeMockSearch(), exporter, makeMockReporter());
    render();
    await clickAction(doc, 'export-csv');
    expect(exporter.exportCsv).not.toHaveBeenCalled();
  });

  it('Export JSON no-op when no Execute has been run', async () => {
    const doc = buildDoc(makeSearchTab());
    const exporter = makeMockExporter();
    const { render } = createSearchUI(doc, makeMockSearch(), exporter, makeMockReporter());
    render();
    await clickAction(doc, 'export-json');
    expect(exporter.exportJson).not.toHaveBeenCalled();
  });

  it('Export uses result of last Execute, not stale prior result', async () => {
    const doc = buildDoc(makeSearchTab());
    const records1 = [makeRecord({ date: '2026-01-15' })];
    const records2 = [makeRecord({ date: '2026-01-10' }), makeRecord({ date: '2026-01-09' })];
    const search = makeMockSearch();
    search.executeQuery = vi.fn()
      .mockResolvedValueOnce({ records: records1, preFilterSet: [{}] })
      .mockResolvedValueOnce({ records: records2, preFilterSet: [{}, {}] });
    search.computeResultSummary = vi.fn().mockReturnValue({ count: 2, matchPct: 100, cumulativeDistanceKm: 13, avgSteps: 8000 });
    const exporter = makeMockExporter();
    const { render } = createSearchUI(doc, search, exporter, makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    await clickAction(doc, 'execute');
    await clickAction(doc, 'export-csv');
    expect(exporter.exportCsv).toHaveBeenCalledWith(records2);
  });

  it('Reset clears all data-field input values', async () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockReporter());
    render();
    doc.querySelector('[data-field="min-steps"]').value = '5000';
    doc.querySelector('[data-field="max-steps"]').value = '10000';
    await clickAction(doc, 'reset');
    const fields = doc.querySelectorAll('[data-field]');
    fields.forEach((f) => expect(f.value).toBe(''));
  });

  it('Reset re-renders zero-state results grid', async () => {
    const doc = buildDoc(makeSearchTab());
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockResolvedValue({ records: [makeRecord(), makeRecord()], preFilterSet: [{}, {}] });
    search.computeResultSummary = vi.fn().mockReturnValue({ count: 2, matchPct: 100, cumulativeDistanceKm: 13, avgSteps: 8000 });
    const { render } = createSearchUI(doc, search, makeMockExporter(), makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    expect(doc.querySelector('.search-results-table').querySelectorAll('[data-row]').length).toBe(2);
    await clickAction(doc, 'reset');
    expect(doc.querySelector('.search-results-table').querySelectorAll('[data-row]').length).toBe(0);
  });

  it('query rejection → reporter.db called with ❌ Search query failed', async () => {
    const doc = buildDoc(makeSearchTab());
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockRejectedValue(new Error('db fail'));
    const reporter = makeMockReporter();
    const { render } = createSearchUI(doc, search, makeMockExporter(), reporter);
    render();
    await clickAction(doc, 'execute');
    expect(reporter.db).toHaveBeenCalledWith('❌ Search query failed');
  });

  it('query rejection → zero-state grid shown', async () => {
    const doc = buildDoc(makeSearchTab());
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockRejectedValue(new Error('db fail'));
    const { render } = createSearchUI(doc, search, makeMockExporter(), makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    expect(doc.querySelector('.search-results-table').querySelectorAll('[data-row]').length).toBe(0);
  });

  it('query rejection → console.error called with [search] prefix', async () => {
    const doc = buildDoc(makeSearchTab());
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('db fail');
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockRejectedValue(err);
    const { render } = createSearchUI(doc, search, makeMockExporter(), makeMockReporter());
    render();
    await clickAction(doc, 'execute');
    expect(errSpy).toHaveBeenCalledWith('[search]', err);
  });

  it('query rejection does not propagate (no unhandled rejection)', async () => {
    const doc = buildDoc(makeSearchTab());
    const search = makeMockSearch();
    search.executeQuery = vi.fn().mockRejectedValue(new Error('db fail'));
    const { render } = createSearchUI(doc, search, makeMockExporter(), makeMockReporter());
    render();
    await expect(clickAction(doc, 'execute')).resolves.toBeUndefined();
  });
});

describe('createSearchUI — stale data guard after query error', () => {
  function makeRecord(overrides = {}) {
    return {
      date: '2026-01-15',
      effective_steps: 8000,
      effective_distance_km: 6.5,
      is_overridden: false,
      override: null,
      ...overrides,
    };
  }

  async function clickAction(doc, action) {
    const btn = doc.querySelector(`[data-action="${action}"]`);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  }

  it('succeed → fail → Export CSV is no-op (stale records cleared on error)', async () => {
    const doc = buildDoc(makeSearchTab());
    const records = [makeRecord()];
    const search = makeMockSearch();
    search.executeQuery = vi.fn()
      .mockResolvedValueOnce({ records, preFilterSet: [{}] })
      .mockRejectedValueOnce(new Error('second query failed'));
    search.computeResultSummary = vi.fn().mockReturnValue({ count: 1, matchPct: 100, cumulativeDistanceKm: 6.5, avgSteps: 8000 });
    const exporter = makeMockExporter();
    const reporter = makeMockReporter();
    const { render } = createSearchUI(doc, search, exporter, reporter);
    render();
    await clickAction(doc, 'execute');
    await clickAction(doc, 'execute');
    await clickAction(doc, 'export-csv');
    expect(exporter.exportCsv).not.toHaveBeenCalled();
  });

  it('succeed → fail → Export JSON is no-op (stale records cleared on error)', async () => {
    const doc = buildDoc(makeSearchTab());
    const records = [makeRecord()];
    const search = makeMockSearch();
    search.executeQuery = vi.fn()
      .mockResolvedValueOnce({ records, preFilterSet: [{}] })
      .mockRejectedValueOnce(new Error('second query failed'));
    search.computeResultSummary = vi.fn().mockReturnValue({ count: 1, matchPct: 100, cumulativeDistanceKm: 6.5, avgSteps: 8000 });
    const exporter = makeMockExporter();
    const reporter = makeMockReporter();
    const { render } = createSearchUI(doc, search, exporter, reporter);
    render();
    await clickAction(doc, 'execute');
    await clickAction(doc, 'execute');
    await clickAction(doc, 'export-json');
    expect(exporter.exportJson).not.toHaveBeenCalled();
  });
});
