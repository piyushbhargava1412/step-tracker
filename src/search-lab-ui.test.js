/**
 * Tests for createSearchLabUI — Near-Miss card (Task 6)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// We'll import the module under test after it exists
let createSearchLabUI;

describe('createSearchLabUI', () => {
  let doc;
  let tabSearch;
  let mockEngine;
  let mockReporter;

  beforeEach(async () => {
    // Dynamic import so tests can run before file exists (will fail with import error)
    const mod = await import('./search-lab-ui.js');
    createSearchLabUI = mod.createSearchLabUI;

    doc = document.implementation.createHTMLDocument('test');
    tabSearch = doc.createElement('div');
    tabSearch.id = 'tab-search';
    doc.body.appendChild(tabSearch);

    mockEngine = {
      findNearMisses: vi.fn(),
      computeDayOfWeekSlump: vi.fn(),
      comparePeriods: vi.fn(),
    };

    mockReporter = {
      db: vi.fn(),
      auth: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Near-Miss card', () => {
    it('inserts #search-nearmiss-card into #tab-search', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      expect(doc.getElementById('search-nearmiss-card')).not.toBeNull();
    });

    it('renders one button per near-miss day with correct dataset.date', async () => {
      const days = [
        { date: '2026-07-01', effectiveDistanceKm: 9.1, target: 10 },
        { date: '2026-07-05', effectiveDistanceKm: 9.5, target: 10 },
      ];
      mockEngine.findNearMisses.mockResolvedValue(days);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const card = doc.getElementById('search-nearmiss-card');
      const buttons = card.querySelectorAll('button[data-date]');
      expect(buttons.length).toBe(2);
      expect(buttons[0].dataset.date).toBe('2026-07-01');
      expect(buttons[1].dataset.date).toBe('2026-07-05');
    });

    it('button text contains the date', async () => {
      mockEngine.findNearMisses.mockResolvedValue([
        { date: '2026-07-01', effectiveDistanceKm: 9.1, target: 10 },
      ]);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const card = doc.getElementById('search-nearmiss-card');
      const btn = card.querySelector('button[data-date]');
      expect(btn.textContent).toContain('2026-07-01');
    });

    it('clicking a near-miss button dispatches ui:open-day-drawer on doc', async () => {
      mockEngine.findNearMisses.mockResolvedValue([
        { date: '2026-07-01', effectiveDistanceKm: 9.1, target: 10 },
      ]);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const eventSpy = vi.fn();
      doc.addEventListener('ui:open-day-drawer', eventSpy);

      const card = doc.getElementById('search-nearmiss-card');
      const btn = card.querySelector('button[data-date="2026-07-01"]');
      btn.click();

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail.date).toBe('2026-07-01');
    });

    it('ui:open-day-drawer dispatched once per click (not twice)', async () => {
      mockEngine.findNearMisses.mockResolvedValue([
        { date: '2026-07-01', effectiveDistanceKm: 9.1, target: 10 },
      ]);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const eventSpy = vi.fn();
      doc.addEventListener('ui:open-day-drawer', eventSpy);

      const card = doc.getElementById('search-nearmiss-card');
      const btn = card.querySelector('button[data-date]');
      btn.click();

      expect(eventSpy).toHaveBeenCalledTimes(1);
    });

    it('engine returns [] → zero-state "No near-miss days" rendered', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const card = doc.getElementById('search-nearmiss-card');
      expect(card).not.toBeNull();
      expect(card.querySelectorAll('button[data-date]').length).toBe(0);
      expect(card.textContent).toContain('No near-miss days');
    });

    it('engine rejects → zero-state rendered; reporter.db called once', async () => {
      const err = new Error('DB error');
      mockEngine.findNearMisses.mockRejectedValue(err);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const card = doc.getElementById('search-nearmiss-card');
      expect(card).not.toBeNull();
      expect(mockReporter.db).toHaveBeenCalledTimes(1);
      expect(mockReporter.db.mock.calls[0][0]).toMatch(/^❌/);
    });

    it('engine rejects → console.error called with [search-lab] prefix', async () => {
      const err = new Error('DB error');
      mockEngine.findNearMisses.mockRejectedValue(err);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toBe('[search-lab]');
    });

    it('render() never throws even on engine rejection', async () => {
      mockEngine.findNearMisses.mockRejectedValue(new Error('fail'));
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await expect(ui.render()).resolves.not.toThrow();
    });

    it('second render() → only one #search-nearmiss-card in DOM', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      await ui.render();

      const cards = doc.querySelectorAll('#search-nearmiss-card');
      expect(cards.length).toBe(1);
    });

    it('prior AbortController aborted on re-render — old click listener fires 0 times', async () => {
      const days = [{ date: '2026-07-01', effectiveDistanceKm: 9.1, target: 10 }];
      mockEngine.findNearMisses.mockResolvedValue(days);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      // Capture button from first render
      const card1 = doc.getElementById('search-nearmiss-card');
      const btn1 = card1.querySelector('button[data-date]');

      // Re-render with empty results — replaces the card
      mockEngine.findNearMisses.mockResolvedValue([]);
      await ui.render();

      // Clicking the stale button from render-1 should NOT dispatch the event
      // because the controller was aborted and the listener was removed
      const eventSpy = vi.fn();
      doc.addEventListener('ui:open-day-drawer', eventSpy);
      btn1.click();

      expect(eventSpy).toHaveBeenCalledTimes(0);
    });

    it('missing #tab-search container → render is a no-op (no throw)', async () => {
      // Remove the tab-search from this doc
      tabSearch.remove();
      mockEngine.findNearMisses.mockResolvedValue([]);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await expect(ui.render()).resolves.not.toThrow();
    });

    it('no innerHTML usage in search-lab-ui.js source', () => {
      const src = fs.readFileSync(
        path.resolve(process.cwd(), 'src/search-lab-ui.js'),
        'utf8',
      );
      const count = (src.match(/innerHTML/g) || []).length;
      expect(count).toBe(0);
    });
  });


  // ── Task 7: Day-of-Week Slump card ──────────────────────────────────────────
  describe('Day-of-Week Slump card', () => {
    const SLUMP_DATA = [
      { day: 'Mon', hitRate: 0.75, avgSteps: 8500, totalDistanceKm: 12.50 },
      { day: 'Tue', hitRate: null,  avgSteps: null, totalDistanceKm: null },
      { day: 'Wed', hitRate: 1.0,   avgSteps: 10200, totalDistanceKm: 20.00 },
      { day: 'Thu', hitRate: 0.5,   avgSteps: 7000,  totalDistanceKm: 9.00 },
      { day: 'Fri', hitRate: 0.0,   avgSteps: 5000,  totalDistanceKm: 7.00 },
      { day: 'Sat', hitRate: null,  avgSteps: 9000,  totalDistanceKm: null },
      { day: 'Sun', hitRate: 0.333, avgSteps: 6000,  totalDistanceKm: 5.50 },
    ];

    it('inserts #search-slump-card into #tab-search', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      expect(doc.getElementById('search-slump-card')).not.toBeNull();
    });

    it('renders exactly 7 rows (one per weekday Mon..Sun)', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const rows = card.querySelectorAll('[data-day]');
      expect(rows.length).toBe(7);
    });

    it('row labels match Mon Tue Wed Thu Fri Sat Sun in order', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const rows = card.querySelectorAll('[data-day]');
      const days = Array.from(rows).map(r => r.dataset.day);
      expect(days).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });

    it('non-null hitRate renders as percentage string (e.g. "75.0%")', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const monRow = card.querySelector('[data-day="Mon"]');
      expect(monRow.textContent).toContain('75.0%');
    });

    it('null hitRate renders em-dash (—)', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const tueRow = card.querySelector('[data-day="Tue"]');
      expect(tueRow.textContent).toContain('—');
    });

    it('non-null totalDistanceKm renders as ".toFixed(2) km" (e.g. "12.50 km")', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const monRow = card.querySelector('[data-day="Mon"]');
      expect(monRow.textContent).toContain('12.50 km');
    });

    it('null totalDistanceKm renders em-dash (—)', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const tueRow = card.querySelector('[data-day="Tue"]');
      // Tue has null for both hitRate and totalDistanceKm — at least 2 em-dashes
      const dashes = (tueRow.textContent.match(/—/g) || []).length;
      expect(dashes).toBeGreaterThanOrEqual(2);
    });

    it('non-null avgSteps renders as integer string', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const monRow = card.querySelector('[data-day="Mon"]');
      expect(monRow.textContent).toContain('8500');
    });

    it('null avgSteps renders em-dash (—)', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const tueRow = card.querySelector('[data-day="Tue"]');
      expect(tueRow.textContent).toContain('—');
    });

    it('second render() → only one #search-slump-card in DOM (idempotent)', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      await ui.render();
      const cards = doc.querySelectorAll('#search-slump-card');
      expect(cards.length).toBe(1);
    });

    it('computeDayOfWeekSlump rejects → renders card with zero rows (no throw)', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockRejectedValue(new Error('fail'));
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await expect(ui.render()).resolves.not.toThrow();
      const card = doc.getElementById('search-slump-card');
      expect(card).not.toBeNull();
      const rows = card.querySelectorAll('[data-day]');
      expect(rows.length).toBe(0);
    });
  });

});