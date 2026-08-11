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
    it('button text includes remaining km (target - effectiveDistanceKm).toFixed(2)', async () => {
      mockEngine.findNearMisses.mockResolvedValue([
        { date: '2026-07-01', effectiveDistanceKm: 9.2, target: 10 },
      ]);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const card = doc.getElementById('search-nearmiss-card');
      const btn = card.querySelector('button[data-date]');
      // remaining = (10 - 9.2).toFixed(2) = '0.80'
      expect(btn.textContent).toContain('0.80');
      expect(btn.textContent).toContain('km remaining');
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
      { day: 'Mon', hitRate: 75,   avgSteps: 8500, totalDistanceKm: 12.50 },
      { day: 'Tue', hitRate: null, avgSteps: null, totalDistanceKm: null },
      { day: 'Wed', hitRate: 100,  avgSteps: 10200, totalDistanceKm: 20.00 },
      { day: 'Thu', hitRate: 50,   avgSteps: 7000,  totalDistanceKm: 9.00 },
      { day: 'Fri', hitRate: 0,    avgSteps: 5000,  totalDistanceKm: 7.00 },
      { day: 'Sat', hitRate: null, avgSteps: 9000,  totalDistanceKm: null },
      { day: 'Sun', hitRate: 33,   avgSteps: 6000,  totalDistanceKm: 5.50 },
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

    it('hitRate integer (e.g. 75) renders as "75.0%" — no ×100 applied', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const monRow = card.querySelector('[data-day="Mon"]');
      expect(monRow.textContent).toContain('75.0%');
    });

    it('hitRate of 50 renders "50.0%" (DoD: no double ×100)', async () => {
      const data = [{ day: 'Thu', hitRate: 50, avgSteps: 7000, totalDistanceKm: 9.00 }];
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(data);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const thuRow = card.querySelector('[data-day="Thu"]');
      expect(thuRow.textContent).toContain('50.0%');
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

    it('primarySlump row gets class search-insight-row--slump and label "Primary Slump Day"', async () => {
      const SLUMP_DATA_WITH_SLUMP = [
        { day: 'Mon', hitRate: 75,   avgSteps: 8500, totalDistanceKm: 12.50, primarySlump: false },
        { day: 'Tue', hitRate: null, avgSteps: null, totalDistanceKm: null,  primarySlump: false },
        { day: 'Wed', hitRate: 100,  avgSteps: 10200, totalDistanceKm: 20.00, primarySlump: false },
        { day: 'Thu', hitRate: 50,   avgSteps: 7000,  totalDistanceKm: 9.00,  primarySlump: false },
        { day: 'Fri', hitRate: 0,    avgSteps: 5000,  totalDistanceKm: 7.00,  primarySlump: false },
        { day: 'Sat', hitRate: null, avgSteps: 9000,  totalDistanceKm: null,  primarySlump: false },
        { day: 'Sun', hitRate: 33,   avgSteps: 6000,  totalDistanceKm: 5.50,  primarySlump: true  },
      ];
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA_WITH_SLUMP);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const sunRow = card.querySelector('[data-day="Sun"]');
      expect(sunRow.classList.contains('search-insight-row--slump')).toBe(true);
      expect(sunRow.textContent).toContain('Primary Slump Day');
    });

    it('non-primarySlump rows do not get slump class or label', async () => {
      const SLUMP_DATA_WITH_SLUMP = [
        { day: 'Mon', hitRate: 75,   avgSteps: 8500, totalDistanceKm: 12.50, primarySlump: false },
        { day: 'Sun', hitRate: 33,   avgSteps: 6000, totalDistanceKm: 5.50,  primarySlump: true  },
      ];
      mockEngine.findNearMisses.mockResolvedValue([]);
      mockEngine.computeDayOfWeekSlump.mockResolvedValue(SLUMP_DATA_WITH_SLUMP);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-slump-card');
      const monRow = card.querySelector('[data-day="Mon"]');
      expect(monRow.classList.contains('search-insight-row--slump')).toBe(false);
      expect(monRow.textContent).not.toContain('Primary Slump Day');
    });
  });

  // ── Task 8: Comparison card with native date inputs ──────────────────────────
  describe('Comparison card', () => {
    const COMPARE_RESULT = {
      periodA: { totalSteps: 50000, totalDistanceKm: 45.0, hitRate: 80 },
      periodB: { totalSteps: 55000, totalDistanceKm: 49.5, hitRate: 90 },
      deltas: { totalSteps: 10.0, totalDistanceKm: 10.0, hitRate: null },
    };

    function setupSlump() {
      mockEngine.computeDayOfWeekSlump.mockResolvedValue([]);
    }

    it('inserts #search-compare-card into #tab-search', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      setupSlump();
      mockEngine.comparePeriods.mockResolvedValue(COMPARE_RESULT);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      expect(doc.getElementById('search-compare-card')).not.toBeNull();
    });

    it('renders four <input type="date"> elements inside the card', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      setupSlump();
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-compare-card');
      const inputs = card.querySelectorAll('input[type="date"]');
      expect(inputs.length).toBe(4);
    });

    it('inputs have correct dataset tags: compare-a-start, compare-a-end, compare-b-start, compare-b-end', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      setupSlump();
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      const card = doc.getElementById('search-compare-card');
      const tags = ['compare-a-start', 'compare-a-end', 'compare-b-start', 'compare-b-end'];
      for (const tag of tags) {
        const input = card.querySelector(`[data-compare="${tag}"]`);
        expect(input, `missing input with data-compare="${tag}"`).not.toBeNull();
        expect(input.type).toBe('date');
      }
    });

    it('all four dates set → triggering compare calls engine.comparePeriods with correct args', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      setupSlump();
      mockEngine.comparePeriods.mockResolvedValue(COMPARE_RESULT);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const card = doc.getElementById('search-compare-card');
      card.querySelector('[data-compare="compare-a-start"]').value = '2026-06-01';
      card.querySelector('[data-compare="compare-a-end"]').value = '2026-06-30';
      card.querySelector('[data-compare="compare-b-start"]').value = '2026-07-01';
      card.querySelector('[data-compare="compare-b-end"]').value = '2026-07-31';

      const btn = card.querySelector('[data-action="compare-periods"]');
      btn.click();
      // Wait for async render
      await new Promise(r => setTimeout(r, 0));

      expect(mockEngine.comparePeriods).toHaveBeenCalledWith(
        { startDate: '2026-06-01', endDate: '2026-06-30' },
        { startDate: '2026-07-01', endDate: '2026-07-31' },
      );
    });

    it('results table rendered with period A / B aggregates after compare', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      setupSlump();
      mockEngine.comparePeriods.mockResolvedValue(COMPARE_RESULT);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const card = doc.getElementById('search-compare-card');
      card.querySelector('[data-compare="compare-a-start"]').value = '2026-06-01';
      card.querySelector('[data-compare="compare-a-end"]').value = '2026-06-30';
      card.querySelector('[data-compare="compare-b-start"]').value = '2026-07-01';
      card.querySelector('[data-compare="compare-b-end"]').value = '2026-07-31';

      const btn = card.querySelector('[data-action="compare-periods"]');
      btn.click();
      await new Promise(r => setTimeout(r, 0));

      const results = card.querySelector('[data-id="compare-results"]');
      expect(results).not.toBeNull();
      expect(results.textContent).toContain('50000');
      expect(results.textContent).toContain('55000');
    });

    it('null delta in engine response → "—" displayed in delta row', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      setupSlump();
      mockEngine.comparePeriods.mockResolvedValue(COMPARE_RESULT);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const card = doc.getElementById('search-compare-card');
      card.querySelector('[data-compare="compare-a-start"]').value = '2026-06-01';
      card.querySelector('[data-compare="compare-a-end"]').value = '2026-06-30';
      card.querySelector('[data-compare="compare-b-start"]').value = '2026-07-01';
      card.querySelector('[data-compare="compare-b-end"]').value = '2026-07-31';

      card.querySelector('[data-action="compare-periods"]').click();
      await new Promise(r => setTimeout(r, 0));

      const results = card.querySelector('[data-id="compare-results"]');
      // hitRate delta is null → should show —
      expect(results.textContent).toContain('—');
    });

    it('non-null delta displayed with sign and one decimal (e.g. "+10.0%")', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      setupSlump();
      mockEngine.comparePeriods.mockResolvedValue(COMPARE_RESULT);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const card = doc.getElementById('search-compare-card');
      card.querySelector('[data-compare="compare-a-start"]').value = '2026-06-01';
      card.querySelector('[data-compare="compare-a-end"]').value = '2026-06-30';
      card.querySelector('[data-compare="compare-b-start"]').value = '2026-07-01';
      card.querySelector('[data-compare="compare-b-end"]').value = '2026-07-31';

      card.querySelector('[data-action="compare-periods"]').click();
      await new Promise(r => setTimeout(r, 0));

      const results = card.querySelector('[data-id="compare-results"]');
      expect(results.textContent).toMatch(/[+\-]\d+\.\d+%/);
    });

    it('one date missing → zero-state prompt rendered; engine.comparePeriods NOT called', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      setupSlump();
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const card = doc.getElementById('search-compare-card');
      // Only set 3 of 4 dates
      card.querySelector('[data-compare="compare-a-start"]').value = '2026-06-01';
      card.querySelector('[data-compare="compare-a-end"]').value = '2026-06-30';
      card.querySelector('[data-compare="compare-b-start"]').value = '2026-07-01';
      // compare-b-end left blank

      card.querySelector('[data-action="compare-periods"]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(mockEngine.comparePeriods).not.toHaveBeenCalled();
      const results = card.querySelector('[data-id="compare-results"]');
      expect(results.textContent.length).toBeGreaterThan(0);
    });

    it('engine comparePeriods rejects → zero-state rendered; reporter.db called; no throw', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      setupSlump();
      mockEngine.comparePeriods.mockRejectedValue(new Error('compare fail'));
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      const card = doc.getElementById('search-compare-card');
      card.querySelector('[data-compare="compare-a-start"]').value = '2026-06-01';
      card.querySelector('[data-compare="compare-a-end"]').value = '2026-06-30';
      card.querySelector('[data-compare="compare-b-start"]').value = '2026-07-01';
      card.querySelector('[data-compare="compare-b-end"]').value = '2026-07-31';

      // Should not throw
      let threw = false;
      try {
        card.querySelector('[data-action="compare-periods"]').click();
        await new Promise(r => setTimeout(r, 10));
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      expect(mockReporter.db).toHaveBeenCalled();
    });

    it('second render() → only one #search-compare-card in DOM (idempotent)', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      setupSlump();
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();
      await ui.render();
      const cards = doc.querySelectorAll('#search-compare-card');
      expect(cards.length).toBe(1);
    });

    it('change listener from render-1 does not fire after render-2 (AbortController)', async () => {
      mockEngine.findNearMisses.mockResolvedValue([]);
      setupSlump();
      mockEngine.comparePeriods.mockResolvedValue(COMPARE_RESULT);
      const ui = createSearchLabUI(doc, mockEngine, mockReporter);
      await ui.render();

      // Capture button from render-1
      const card1 = doc.getElementById('search-compare-card');
      const btn1 = card1.querySelector('[data-action="compare-periods"]');

      // Fill in dates in render-1 card
      card1.querySelector('[data-compare="compare-a-start"]').value = '2026-06-01';
      card1.querySelector('[data-compare="compare-a-end"]').value = '2026-06-30';
      card1.querySelector('[data-compare="compare-b-start"]').value = '2026-07-01';
      card1.querySelector('[data-compare="compare-b-end"]').value = '2026-07-31';

      // Re-render → aborts render-1 controller
      await ui.render();

      // Reset call count after re-render
      mockEngine.comparePeriods.mockClear();

      // Clicking stale button from render-1 should NOT call comparePeriods
      btn1.click();
      await new Promise(r => setTimeout(r, 10));

      expect(mockEngine.comparePeriods).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: real computeDayOfWeekSlump output → render() → avg-steps cell
// ---------------------------------------------------------------------------
describe('createSearchLabUI — slump integration (real engine, DI db mock)', () => {
  it('avg-steps cell renders numeric value from real computeDayOfWeekSlump output (not em-dash)', async () => {
    // Import real factories
    const { createSearchLabUI } = await import('./search-lab-ui.js');
    const { createSearchLab } = await import('./search-lab.js');

    // Monday 2026-06-01 (index 0)
    const monday = '2026-06-01';

    // DI db mock with one Monday record
    const dbMock = {
      daily_records: {
        orderBy: () => ({ first: async () => ({ date: monday }) }),
        where: () => ({ between: () => ({ toArray: async () => [
          { date: monday, steps: 7500, effective_distance_km: 4.2 }
        ]})}),
      },
      goal_history: { toArray: async () => [] },
    };

    const goalMock = { getActiveGoal: async () => ({ steps_per_day: 6000 }) };

    const lab = createSearchLab(dbMock, goalMock);

    // Set up jsdom document
    const d = document.implementation.createHTMLDocument('integration');
    const tab = d.createElement('div');
    tab.id = 'tab-search';
    d.body.appendChild(tab);

    const reporter = { db: vi.fn(), auth: vi.fn() };
    const ui = createSearchLabUI(d, lab, reporter);
    await ui.render();

    const card = d.getElementById('search-slump-card');
    expect(card).not.toBeNull();

    // The slump card renders div rows with data-day attribute
    // Find the Monday row (data-day="Mon")
    const monRow = card.querySelector('[data-day="Mon"]');
    expect(monRow).not.toBeNull();

    // Find avg-steps span: text is numeric (not %, not 'km', not day label, not 'Primary Slump Day')
    // Row children: label, [optional badge], hitRate, avgSteps, dist
    const allSpans = Array.from(monRow.children);
    const avgStepsEl = allSpans.find(el => /^\d+$/.test(el.textContent.trim()));
    expect(avgStepsEl).not.toBeUndefined();
    // Should render "7500" (not em-dash) because engine now returns avgSteps key
    expect(avgStepsEl.textContent).toBe('7500');
  });
});

// ---------------------------------------------------------------------------
// Task 17: CSS classes applied in DOM writer
// ---------------------------------------------------------------------------
describe('createSearchLabUI — CSS class application (Task 17)', () => {
  let doc;
  let mockEngine;
  let mockReporter;

  beforeEach(async () => {
    const mod = await import('./search-lab-ui.js');
    createSearchLabUI = mod.createSearchLabUI;

    doc = document.implementation.createHTMLDocument('test');
    const tabSearch = doc.createElement('div');
    tabSearch.id = 'tab-search';
    doc.body.appendChild(tabSearch);

    mockEngine = {
      findNearMisses: vi.fn(),
      computeDayOfWeekSlump: vi.fn(),
      comparePeriods: vi.fn(),
    };
    mockReporter = { db: vi.fn(), auth: vi.fn() };
  });

  afterEach(() => vi.restoreAllMocks());

  it('#search-nearmiss-card has class search-lab-card', async () => {
    mockEngine.findNearMisses.mockResolvedValue([]);
    mockEngine.computeDayOfWeekSlump.mockResolvedValue([]);
    const ui = createSearchLabUI(doc, mockEngine, mockReporter);
    await ui.render();
    const card = doc.getElementById('search-nearmiss-card');
    expect(card.classList.contains('search-lab-card')).toBe(true);
  });

  it('#search-slump-card has class search-lab-card', async () => {
    mockEngine.findNearMisses.mockResolvedValue([]);
    mockEngine.computeDayOfWeekSlump.mockResolvedValue([]);
    const ui = createSearchLabUI(doc, mockEngine, mockReporter);
    await ui.render();
    const card = doc.getElementById('search-slump-card');
    expect(card.classList.contains('search-lab-card')).toBe(true);
  });

  it('#search-compare-card has class search-lab-card', async () => {
    mockEngine.findNearMisses.mockResolvedValue([]);
    mockEngine.computeDayOfWeekSlump.mockResolvedValue([]);
    const ui = createSearchLabUI(doc, mockEngine, mockReporter);
    await ui.render();
    const card = doc.getElementById('search-compare-card');
    expect(card.classList.contains('search-lab-card')).toBe(true);
  });

  it('near-miss buttons have class search-insight-row', async () => {
    mockEngine.findNearMisses.mockResolvedValue([
      { date: '2026-07-01', effectiveDistanceKm: 9.1, target: 10 },
    ]);
    mockEngine.computeDayOfWeekSlump.mockResolvedValue([]);
    const ui = createSearchLabUI(doc, mockEngine, mockReporter);
    await ui.render();
    const card = doc.getElementById('search-nearmiss-card');
    const btn = card.querySelector('button[data-date]');
    expect(btn.classList.contains('search-insight-row')).toBe(true);
  });

  it('slump rows have class search-insight-row', async () => {
    mockEngine.findNearMisses.mockResolvedValue([]);
    mockEngine.computeDayOfWeekSlump.mockResolvedValue([
      { day: 'Mon', hitRate: 75, avgSteps: 8500, totalDistanceKm: 12.5, primarySlump: false },
    ]);
    const ui = createSearchLabUI(doc, mockEngine, mockReporter);
    await ui.render();
    const card = doc.getElementById('search-slump-card');
    const row = card.querySelector('[data-day="Mon"]');
    expect(row.classList.contains('search-insight-row')).toBe(true);
  });

  it('primary slump row has data-slump="true"', async () => {
    mockEngine.findNearMisses.mockResolvedValue([]);
    mockEngine.computeDayOfWeekSlump.mockResolvedValue([
      { day: 'Tue', hitRate: 30, avgSteps: 5000, totalDistanceKm: 8.0, primarySlump: true },
    ]);
    const ui = createSearchLabUI(doc, mockEngine, mockReporter);
    await ui.render();
    const card = doc.getElementById('search-slump-card');
    const row = card.querySelector('[data-day="Tue"]');
    expect(row.dataset.slump).toBe('true');
  });

  it('compare results rows have class search-compare-table', async () => {
    mockEngine.findNearMisses.mockResolvedValue([]);
    mockEngine.computeDayOfWeekSlump.mockResolvedValue([]);
    mockEngine.comparePeriods.mockResolvedValue({
      periodA: { totalSteps: 100, totalDistanceKm: 5.0, hitRate: 80 },
      periodB: { totalSteps: 200, totalDistanceKm: 10.0, hitRate: 90 },
      deltas: { totalSteps: 100, totalDistanceKm: 100, hitRate: 12.5 },
    });
    const ui = createSearchLabUI(doc, mockEngine, mockReporter);
    await ui.render();

    // Trigger compare
    const card = doc.getElementById('search-compare-card');
    card.querySelector('[data-compare="compare-a-start"]').value = '2026-06-01';
    card.querySelector('[data-compare="compare-a-end"]').value = '2026-06-30';
    card.querySelector('[data-compare="compare-b-start"]').value = '2026-07-01';
    card.querySelector('[data-compare="compare-b-end"]').value = '2026-07-31';
    card.querySelector('[data-action="compare-periods"]').click();
    await new Promise(r => setTimeout(r, 20));

    const resultsEl = card.querySelector('[data-id="compare-results"]');
    const rows = resultsEl.querySelectorAll('div');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(row => {
      expect(row.classList.contains('search-compare-table')).toBe(true);
    });
  });
});

// ── Task 18: controller isolation ───────────────────────────────────────────
describe('controller isolation across instances', () => {
  it('re-rendering instance 1 does not abort instance 2 near-miss listeners', async () => {
    // Two separate documents / instances
    const doc1 = document.implementation.createHTMLDocument('doc1');
    const ts1 = doc1.createElement('div');
    ts1.id = 'tab-search';
    doc1.body.appendChild(ts1);

    const doc2 = document.implementation.createHTMLDocument('doc2');
    const ts2 = doc2.createElement('div');
    ts2.id = 'tab-search';
    doc2.body.appendChild(ts2);

    const day = { date: '2026-07-10', effectiveDistanceKm: 9.2, target: 10 };
    const engine1 = { findNearMisses: vi.fn().mockResolvedValue([day]), computeDayOfWeekSlump: vi.fn().mockResolvedValue([]), comparePeriods: vi.fn() };
    const engine2 = { findNearMisses: vi.fn().mockResolvedValue([day]), computeDayOfWeekSlump: vi.fn().mockResolvedValue([]), comparePeriods: vi.fn() };
    const rep = { db: vi.fn(), auth: vi.fn() };

    const ui1 = createSearchLabUI(doc1, engine1, rep);
    const ui2 = createSearchLabUI(doc2, engine2, rep);

    // Render both instances
    await ui1.render();
    await ui2.render();

    // Track clicks dispatched from instance 2's listener
    const fired2 = [];
    doc2.addEventListener('ui:open-day-drawer', e => fired2.push(e.detail.date));

    // Re-render instance 1 — this should only abort instance 1's controller
    await ui1.render();

    // Click near-miss button in instance 2 — listener should still be active
    const btn2 = doc2.getElementById('search-nearmiss-card').querySelector('[data-action="open-day-drawer"]');
    btn2.click();

    expect(fired2).toEqual(['2026-07-10']);
  });
});
