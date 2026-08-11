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
    executeQuery: vi.fn().mockResolvedValue([]),
    computeResultSummary: vi.fn().mockReturnValue({ count: 0, matchPct: null, totalDays: 0, cumulativeDistanceKm: 0, avgSteps: null }),
  };
}

function makeMockExporter() {
  return {
    exportCsv: vi.fn(),
    exportJson: vi.fn(),
  };
}

function makeMockGoal() {
  return { getActiveGoal: vi.fn().mockResolvedValue(null) };
}

function makeMockReporter() {
  return { db: vi.fn() };
}

describe('createSearchUI — render skeleton', () => {
  it('render() mounts children inside #tab-search', () => {
    const doc = buildDoc(makeSearchTab());
    const search = makeMockSearch();
    const exporter = makeMockExporter();
    const goal = makeMockGoal();
    const reporter = makeMockReporter();
    const { render } = createSearchUI(doc, search, exporter, goal, reporter);
    render();
    expect(doc.getElementById('tab-search').children.length).toBeGreaterThan(0);
  });

  it('all 7 data-field filter controls present with correct names', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
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
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
    render();
    const btn = doc.querySelector('[data-action="execute"]');
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('btn')).toBe(true);
    expect(btn.classList.contains('btn-primary')).toBe(true);
  });

  it('data-action="reset" button has .btn.btn-secondary', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
    render();
    const btn = doc.querySelector('[data-action="reset"]');
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('btn')).toBe(true);
    expect(btn.classList.contains('btn-secondary')).toBe(true);
  });

  it('data-action="export-csv" button has .btn.btn-primary', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
    render();
    const btn = doc.querySelector('[data-action="export-csv"]');
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('btn-primary')).toBe(true);
  });

  it('data-action="export-json" button has .btn.btn-secondary', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
    render();
    const btn = doc.querySelector('[data-action="export-json"]');
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('btn-secondary')).toBe(true);
  });

  it('empty results grid rendered in zero-state (no result rows)', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
    render();
    const grid = doc.querySelector('.search-results-table');
    expect(grid).not.toBeNull();
    expect(grid.querySelectorAll('[data-row]').length).toBe(0);
  });

  it('summary card rendered with .search-summary and .summary-cell structure', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
    render();
    const summary = doc.querySelector('.search-summary');
    expect(summary).not.toBeNull();
    expect(summary.querySelectorAll('.summary-cell').length).toBeGreaterThan(0);
  });

  it('missing #tab-search → console.warn called with [search] prefix; no throw', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = buildDoc('<div></div>');
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
    expect(() => render()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('[search]', 'Missing #tab-search — skipping render');
  });

  it('re-render is idempotent: second render replaces children, not appends', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
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
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
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
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
    render();
    expect(doc.querySelectorAll('[onclick]').length).toBe(0);
  });

  it('all panels wrapped in .card; export-controls wrapper present', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
    render();
    expect(doc.querySelector('.card')).not.toBeNull();
    expect(doc.querySelector('.export-controls')).not.toBeNull();
  });

  it('.search-filters class present on filter form container', () => {
    const doc = buildDoc(makeSearchTab());
    const { render } = createSearchUI(doc, makeMockSearch(), makeMockExporter(), makeMockGoal(), makeMockReporter());
    render();
    expect(doc.querySelector('.search-filters')).not.toBeNull();
  });
});
