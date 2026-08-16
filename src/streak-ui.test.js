/**
 * Tests for src/streak-ui.js — render layer.
 * Mirrors progress-ui.test.js style: buildDoc helper, mock streak object, no real Dexie.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStreakUI } from './streak-ui.js';
import { DEFAULT_STEP_GOAL } from './goal.js';

const streakUiSource = fs.readFileSync(path.resolve(__dirname, 'streak-ui.js'), 'utf8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal jsdom document with #tab-dashboard containing pre-existing
 * content (mirrors the context-pack pattern described in the task spec).
 */
function buildDoc() {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML =
    '<div id="tab-dashboard"><div id="existing-content"></div></div>';
  return doc;
}

/**
 * Build a minimal jsdom document WITHOUT #tab-dashboard.
 */
function buildDocNoTab() {
  return document.implementation.createHTMLDocument('test');
}

/**
 * Build a mock streak that resolves with the given result.
 * @param {object} result
 */
function makeStreak(result) {
  return { compute: vi.fn().mockResolvedValue(result) };
}

/**
 * Build a mock streak that rejects with the given error.
 * @param {Error} err
 */
function makeStreakReject(err) {
  return { compute: vi.fn().mockRejectedValue(err) };
}

/** Zero-state compute result (mirrors _zeroState()). */
const ZERO_RESULT = {
  tolerance: { actual: 0, allowance95: 0, allowance99: 0 },
  hallOfFame: [],
  lifetime: { metDays: 0, totalDays: 0, pct: 0 },
  activeStepGoal: DEFAULT_STEP_GOAL, // 10000
};

/** AC Scenario: 19 / 39 / 19 (story's worked tolerance example). */
const TOLERANCE_RESULT = {
  tolerance: { actual: 19, allowance95: 39, allowance99: 19 },
  hallOfFame: [],
  lifetime: { metDays: 40, totalDays: 100, pct: 40.0 },
  activeStepGoal: DEFAULT_STEP_GOAL,
};

/** Custom/legacy step goal not matching any preset. */
const GOAL_NO_MATCH_RESULT = {
  tolerance: { actual: 2, allowance95: 2, allowance99: 2 },
  hallOfFame: [],
  lifetime: { metDays: 5, totalDays: 10, pct: 50 },
  activeStepGoal: 6000,
};

/** Three podium entries, all within single calendar years. */
const HOF_THREE = [
  { startDate: '2026-05-01', endDate: '2026-06-10', days: 41 },
  { startDate: '2026-01-02', endDate: '2026-01-20', days: 19 },
  { startDate: '2025-11-01', endDate: '2025-11-08', days: 8 },
];

/** Single podium entry. */
const HOF_ONE = [{ startDate: '2026-03-01', endDate: '2026-03-05', days: 5 }];

/** Cross-year podium entry (mockup: 1,178 days spanning 2021–2025). */
const HOF_CROSS = [{ startDate: '2021-01-01', endDate: '2025-12-31', days: 1178 }];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => vi.restoreAllMocks());

describe('createStreakUI', () => {
  // -------------------------------------------------------------------------
  // Factory / signature
  // -------------------------------------------------------------------------
  describe('factory signature', () => {
    it('accepts (doc, streak, reporter) and returns { render }', () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      expect(typeof ui.render).toBe('function');
    });

    it('render() returns a Promise (is async / thenable)', () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      const result = ui.render();
      expect(result).toBeInstanceOf(Promise);
      return result; // settle the promise
    });
  });

  // -------------------------------------------------------------------------
  // Missing #tab-dashboard
  // -------------------------------------------------------------------------
  describe('missing #tab-dashboard', () => {
    it('logs console.warn("[streak]", …) and does not throw', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const doc = buildDocNoTab();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await expect(ui.render()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith('[streak]', expect.any(String));
    });

    it('does not inject anything when #tab-dashboard is absent', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const doc = buildDocNoTab();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.getElementById('streak-card')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Card anatomy
  // -------------------------------------------------------------------------
  describe('card anatomy', () => {
    let doc, ui;

    beforeEach(async () => {
      doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };
      ui = createStreakUI(doc, streak, reporter);
      await ui.render();
    });

    it('#streak-card is present, prepended after the lifetime banner', () => {
      const dashboard = doc.getElementById('tab-dashboard');
      const card = doc.getElementById('streak-card');
      expect(card).not.toBeNull();
      expect(dashboard.firstElementChild.id).toBe('lifetime-banner');
      expect(dashboard.children[1]).toBe(card);
    });

    it('renders card sections in order: header, actual, allowances, runs', () => {
      const card = doc.getElementById('streak-card');
      const order = Array.from(card.children).map((el) => el.className);
      expect(order).toEqual([
        'streak-header',
        'streak-actual',
        'streak-allowances',
        'streak-runs',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Lifetime compliance banner (SF-4d)
  // -------------------------------------------------------------------------
  describe('lifetime banner (SF-4d)', () => {
    it('renders #lifetime-banner as the first dashboard child', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const banner = doc.getElementById('lifetime-banner');
      expect(banner).not.toBeNull();
      expect(doc.getElementById('tab-dashboard').firstElementChild).toBe(banner);
    });

    it('reads "${metDays} / ${totalDays} Days (${pct}% Lifetime)" from result.lifetime', async () => {
      const doc = buildDoc();
      const streak = makeStreak({
        ...ZERO_RESULT,
        lifetime: { metDays: 40, totalDays: 100, pct: 40.0 },
      });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const banner = doc.getElementById('lifetime-banner');
      expect(banner.textContent).toBe('40 / 100 Days (40.0% Lifetime)');
    });

    it('the met/total day counts live in the .lifetime-count span', async () => {
      const doc = buildDoc();
      const streak = makeStreak({
        ...ZERO_RESULT,
        lifetime: { metDays: 1, totalDays: 3, pct: (1 / 3) * 100 },
      });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const count = doc.querySelector('.lifetime-count');
      expect(count).not.toBeNull();
      expect(count.textContent).toBe('1 / 3');
    });

    it('formats large counts with thousands separators', async () => {
      const doc = buildDoc();
      const streak = makeStreak({
        ...ZERO_RESULT,
        lifetime: { metDays: 1200, totalDays: 3000, pct: 40.0 },
      });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const banner = doc.getElementById('lifetime-banner');
      expect(banner.querySelector('.lifetime-count').textContent).toBe('1,200 / 3,000');
      expect(banner.textContent).toBe('1,200 / 3,000 Days (40.0% Lifetime)');
    });

    it('a missing lifetime result fails open to the zero-state banner', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, lifetime: undefined });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.getElementById('lifetime-banner').textContent).toBe(
        '0 / 0 Days (0.0% Lifetime)',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Header: title + goal badge (SF-6 — steps, not km)
  // -------------------------------------------------------------------------
  describe('card header', () => {
    it('.streak-title reads "Active Streaks"', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const title = doc.querySelector('.streak-title');
      expect(title).not.toBeNull();
      expect(title.textContent).toBe('Active Streaks');
    });

    it.each([
      [5000, '5k Goal'],
      [7500, '7.5k Goal'],
      [10000, '10k Goal'],
      [15000, '15k Goal'],
    ])('activeStepGoal %s → .goal-badge reads "%s"', async (stepGoal, expected) => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, activeStepGoal: stepGoal });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const badge = doc.querySelector('.goal-badge');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe(expected);
    });

    it('a custom goal like 6000 → .goal-badge reads "6k Goal"', async () => {
      const doc = buildDoc();
      const streak = makeStreak(GOAL_NO_MATCH_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelector('.goal-badge').textContent).toBe('6k Goal');
    });

    it('no "km" substring anywhere in the rendered #streak-card', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, activeStepGoal: 7500 });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const card = doc.getElementById('streak-card');
      expect(card.textContent).not.toContain('km');
      expect(card.innerHTML).not.toContain('km');
    });
  });

  // -------------------------------------------------------------------------
  // Actual (100%) streak block
  // -------------------------------------------------------------------------
  describe('actual (100%) streak block', () => {
    it('.streak-actual-label reads "Actual (100%)"', async () => {
      const doc = buildDoc();
      const streak = makeStreak(TOLERANCE_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelector('.streak-actual-label').textContent).toBe('Actual (100%)');
    });

    it('the headline .streak-number equals tolerance.actual (19)', async () => {
      const doc = buildDoc();
      const streak = makeStreak(TOLERANCE_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelector('.streak-actual .streak-number').textContent).toBe('19');
    });

    it('the bar is a .streak-bar holding a .streak-bar-fill filled to 100%', async () => {
      const doc = buildDoc();
      const streak = makeStreak(TOLERANCE_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const bar = doc.querySelector('.streak-actual .streak-bar');
      expect(bar).not.toBeNull();
      const fill = bar.querySelector('.streak-bar-fill');
      expect(fill).not.toBeNull();
      expect(fill.style.width).toBe('100%');
    });
  });

  // -------------------------------------------------------------------------
  // Tolerance allowances (SF-7 render)
  // -------------------------------------------------------------------------
  describe('tolerance allowances (SF-7)', () => {
    it('renders exactly two .streak-allowance nodes inside .streak-allowances', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const container = doc.querySelector('.streak-allowances');
      expect(container).not.toBeNull();
      expect(container.querySelectorAll('.streak-allowance').length).toBe(2);
    });

    it('allowance labels read "95% Tolerance" then "99% Tolerance"', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const labels = Array.from(
        doc.querySelectorAll('.streak-allowance .streak-allowance-label'),
      ).map((el) => el.textContent);
      expect(labels).toEqual(['95% Tolerance', '99% Tolerance']);
    });

    it('allowance values come from result.tolerance (39 / 19)', async () => {
      const doc = buildDoc();
      const streak = makeStreak(TOLERANCE_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const values = Array.from(
        doc.querySelectorAll('.streak-allowance .streak-allowance-value'),
      ).map((el) => el.textContent);
      expect(values).toEqual(['39', '19']);
    });

    it('zero-state allowances both read 0', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const values = Array.from(
        doc.querySelectorAll('.streak-allowance .streak-allowance-value'),
      ).map((el) => el.textContent);
      expect(values).toEqual(['0', '0']);
    });
  });

  // -------------------------------------------------------------------------
  // Best Runs podium (SF-4c render)
  // -------------------------------------------------------------------------
  describe('best runs (SF-4c)', () => {
    it('.streak-runs block lives inside #streak-card', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const card = doc.getElementById('streak-card');
      expect(card.querySelector('.streak-runs')).not.toBeNull();
    });

    it('.streak-runs-title names the active step goal with a thousands separator', async () => {
      const doc = buildDoc();
      const streak = makeStreak({
        ...ZERO_RESULT,
        hallOfFame: HOF_THREE,
        activeStepGoal: 7500,
      });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const title = doc.querySelector('.streak-runs-title');
      expect(title).not.toBeNull();
      expect(title.textContent).toBe('🏆 Best Runs at 7,500');
    });

    it('three entries render three .streak-run nodes', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelectorAll('.streak-run').length).toBe(3);
      expect(doc.querySelector('.streak-runs-empty')).toBeNull();
    });

    it('.streak-run-rank reads #1, #2, #3 in podium order', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const ranks = Array.from(doc.querySelectorAll('.streak-run-rank')).map(
        (el) => el.textContent,
      );
      expect(ranks).toEqual(['#1', '#2', '#3']);
    });

    it('.streak-run-days reads "N days" per entry', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const days = Array.from(doc.querySelectorAll('.streak-run-days')).map(
        (el) => el.textContent,
      );
      expect(days).toEqual(['41 days', '19 days', '8 days']);
    });

    it('.streak-run-range collapses same-year entries to the year', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const ranges = Array.from(doc.querySelectorAll('.streak-run-range')).map(
        (el) => el.textContent,
      );
      expect(ranges).toEqual(['2026', '2026', '2025']);
    });

    it('a cross-year run renders "1,178 days" and "2021-2025" (mockup format)', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_CROSS });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelectorAll('.streak-run').length).toBe(1);
      expect(doc.querySelector('.streak-run-rank').textContent).toBe('#1');
      expect(doc.querySelector('.streak-run-days').textContent).toBe('1,178 days');
      expect(doc.querySelector('.streak-run-range').textContent).toBe('2021-2025');
    });

    it('a single-entry result renders exactly one .streak-run', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_ONE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const entries = doc.querySelectorAll('.streak-run');
      expect(entries.length).toBe(1);
      expect(entries[0].querySelector('.streak-run-rank').textContent).toBe('#1');
      expect(entries[0].querySelector('.streak-run-days').textContent).toBe('5 days');
      expect(entries[0].querySelector('.streak-run-range').textContent).toBe('2026');
      expect(doc.querySelector('.streak-runs-empty')).toBeNull();
    });

    it('an empty result renders .streak-runs-empty and zero .streak-run', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelectorAll('.streak-run').length).toBe(0);
      const empty = doc.querySelector('.streak-runs-empty');
      expect(empty).not.toBeNull();
      expect(empty.textContent).toBe('No qualifying streak periods yet');
    });

    it('a non-array hallOfFame fails open to .streak-runs-empty', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: undefined });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelectorAll('.streak-run').length).toBe(0);
      expect(doc.querySelector('.streak-runs-empty')).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Removed features regression (lock badge / tier chips / banner / hof block)
  // -------------------------------------------------------------------------
  describe('removed features regression', () => {
    it('no .lock-badge node is rendered', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelector('.lock-badge')).toBeNull();
    });

    it('no "Effective Date Lock" substring in #tab-dashboard', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const dashboard = doc.getElementById('tab-dashboard');
      expect(dashboard.textContent).not.toContain('Effective Date Lock');
      expect(dashboard.innerHTML).not.toContain('lock-badge');
    });

    it('no tier chips are rendered', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelectorAll('.tier-chip').length).toBe(0);
      expect(doc.querySelector('.tier-badges')).toBeNull();
      expect(doc.querySelector('.streak-goal')).toBeNull();
    });

    it('no legacy tolerance-box / hall-of-fame block is rendered', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelector('.tolerance-metrics')).toBeNull();
      expect(doc.querySelector('.tolerance-metric')).toBeNull();
      expect(doc.querySelector('.hall-of-fame')).toBeNull();
      expect(doc.querySelector('.hof-entry')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Idempotent re-render
  // -------------------------------------------------------------------------
  describe('idempotent re-render', () => {
    it('two render() calls → exactly one #streak-card', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();
      await ui.render();

      expect(doc.querySelectorAll('#streak-card').length).toBe(1);
    });

    it('two render() calls → exactly one #lifetime-banner, still first', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();
      await ui.render();

      expect(doc.querySelectorAll('#lifetime-banner').length).toBe(1);
      expect(doc.getElementById('tab-dashboard').firstElementChild.id).toBe(
        'lifetime-banner',
      );
    });

    it('two render() calls → exactly one .streak-header and one .streak-actual', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();
      await ui.render();

      expect(doc.querySelectorAll('.streak-header').length).toBe(1);
      expect(doc.querySelectorAll('.streak-actual').length).toBe(1);
    });

    it('two render() calls → exactly three .streak-run nodes', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();
      await ui.render();

      expect(doc.querySelectorAll('.streak-run').length).toBe(3);
    });

    it('a stale #lifetime-banner injected earlier is replaced by exactly one fresh one', async () => {
      const doc = buildDoc();
      doc.getElementById('tab-dashboard').innerHTML =
        '<div id="lifetime-banner">stale</div>';
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelectorAll('#lifetime-banner').length).toBe(1);
      expect(doc.getElementById('lifetime-banner').textContent).toBe(
        '0 / 0 Days (0.0% Lifetime)',
      );
      expect(doc.querySelectorAll('#streak-card').length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Fail-open: compute() rejects
  // -------------------------------------------------------------------------
  describe('fail-open: compute() rejects', () => {
    let doc, streak, reporter, errorSpy, ui;

    beforeEach(() => {
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      doc = buildDoc();
      streak = makeStreakReject(new Error('DB error'));
      reporter = { db: vi.fn() };
      ui = createStreakUI(doc, streak, reporter);
    });

    it('compute() rejecting → reporter.db("❌ Streak load failed")', async () => {
      await expect(ui.render()).resolves.toBeUndefined();
      expect(reporter.db).toHaveBeenCalledWith('❌ Streak load failed');
    });

    it('compute() rejecting → console.error("[streak]", err) called', async () => {
      await ui.render();
      expect(errorSpy).toHaveBeenCalledWith('[streak]', expect.any(Error));
    });

    it('compute() rejecting → zero-state still renders #streak-card and #lifetime-banner', async () => {
      await ui.render();
      expect(doc.getElementById('streak-card')).not.toBeNull();
      expect(doc.getElementById('lifetime-banner')).not.toBeNull();
    });

    it('compute() rejecting → zero-state banner reads "0 / 0 Days (0.0% Lifetime)"', async () => {
      await ui.render();
      expect(doc.getElementById('lifetime-banner').textContent).toBe(
        '0 / 0 Days (0.0% Lifetime)',
      );
    });

    it('compute() rejecting → zero-state headline number reads 0', async () => {
      await ui.render();
      expect(doc.querySelector('.streak-actual .streak-number').textContent).toBe('0');
    });

    it('compute() rejecting → zero-state allowances both read 0', async () => {
      await ui.render();
      const values = Array.from(
        doc.querySelectorAll('.streak-allowance .streak-allowance-value'),
      ).map((el) => el.textContent);
      expect(values).toEqual(['0', '0']);
    });

    it('compute() rejecting → zero-state best runs renders .streak-runs-empty', async () => {
      await ui.render();
      expect(doc.querySelector('.streak-runs')).not.toBeNull();
      expect(doc.querySelectorAll('.streak-run').length).toBe(0);
      expect(doc.querySelector('.streak-runs-empty').textContent).toBe(
        'No qualifying streak periods yet',
      );
    });

    it('compute() rejecting → zero-state goal badge uses DEFAULT_STEP_GOAL', async () => {
      await ui.render();
      const badge = doc.querySelector('.goal-badge');
      expect(badge.textContent).toBe(`${DEFAULT_STEP_GOAL / 1000}k Goal`);
    });

    it('render() resolves (never rejects) even when compute() throws', async () => {
      await expect(ui.render()).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // No innerHTML / no onclick=
  // -------------------------------------------------------------------------
  describe('no innerHTML in the render layer', () => {
    it('streak-ui.js source contains no innerHTML', () => {
      expect(streakUiSource).not.toMatch(/innerHTML/);
    });

    it('#streak-card innerHTML contains no onclick= attributes', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const card = doc.getElementById('streak-card');
      expect(card.innerHTML).not.toMatch(/onclick=/);
    });

    it('#lifetime-banner innerHTML contains no onclick= attributes', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const banner = doc.getElementById('lifetime-banner');
      expect(banner.innerHTML).not.toMatch(/onclick=/);
    });
  });

  // -------------------------------------------------------------------------
  // streak.compute() is the only method consumed (DB carried for contract)
  // -------------------------------------------------------------------------
  describe('boundary contract', () => {
    it('streak.compute() is called exactly once per render()', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(streak.compute).toHaveBeenCalledTimes(1);
    });
  });
});
