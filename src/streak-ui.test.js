/**
 * Tests for src/streak-ui.js — render layer.
 * Mirrors progress-ui.test.js style: buildDoc helper, mock streak object, no real Dexie.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStreakUI } from './streak-ui.js';
import { TIER_STEP_THRESHOLDS } from './streak.js';
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

/** Zero-tier ladder helper (fresh array per fixture). */
function zeroTiers() {
  return TIER_STEP_THRESHOLDS.map((t) => ({ threshold: t, active: 0, best: 0 }));
}

/** Zero-state compute result (mirrors _zeroState()). */
const ZERO_RESULT = {
  tolerance: { actual: 0, allowance95: 0, allowance90: 0 },
  tiers: zeroTiers(),
  hallOfFame: [],
  lifetime: { metDays: 0, totalDays: 0, pct: 0 },
  activeStepGoal: DEFAULT_STEP_GOAL, // 10000
};

/** AC Scenario 4: 40 out of 100 days met (40.0%). */
const SCENARIO_4_RESULT = {
  tolerance: { actual: 7, allowance95: 12, allowance90: 15 },
  tiers: TIER_STEP_THRESHOLDS.map((t) => ({ threshold: t, active: 5, best: 10 })),
  hallOfFame: [],
  lifetime: { metDays: 40, totalDays: 100, pct: 40.0 },
  activeStepGoal: DEFAULT_STEP_GOAL,
};

/** AC Scenario: 19 / 39 / 39 (story's worked tolerance example). */
const TOLERANCE_RESULT = {
  tolerance: { actual: 19, allowance95: 39, allowance90: 39 },
  tiers: zeroTiers(),
  hallOfFame: [],
  lifetime: { metDays: 30, totalDays: 40, pct: 75 },
  activeStepGoal: DEFAULT_STEP_GOAL,
};

/** Custom/legacy step goal not matching any tier rung. */
const GOAL_NO_MATCH_RESULT = {
  tolerance: { actual: 2, allowance95: 2, allowance90: 2 },
  tiers: TIER_STEP_THRESHOLDS.map((t) => ({ threshold: t, active: 1, best: 3 })),
  hallOfFame: [],
  lifetime: { metDays: 5, totalDays: 10, pct: 50 },
  activeStepGoal: 6000, // not a member of TIER_STEP_THRESHOLDS
};

/** Result with non-zero chip counts for chip-text test. */
const CHIP_TEXT_RESULT = {
  tolerance: { actual: 42, allowance95: 50, allowance90: 55 },
  tiers: [
    { threshold: 5000, active: 42, best: 60 },
    { threshold: 7500, active: 21, best: 30 },
    { threshold: 10000, active: 10, best: 15 },
    { threshold: 15000, active: 2, best: 5 },
  ],
  hallOfFame: [],
  lifetime: { metDays: 20, totalDays: 50, pct: 40 },
  activeStepGoal: 10000,
};

/** Three podium entries. */
const HOF_THREE = [
  { startDate: '2026-05-01', endDate: '2026-06-10', days: 41 },
  { startDate: '2026-01-02', endDate: '2026-01-20', days: 19 },
  { startDate: '2025-11-01', endDate: '2025-11-08', days: 8 },
];

/** Single podium entry. */
const HOF_ONE = [{ startDate: '2026-03-01', endDate: '2026-03-05', days: 5 }];

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
      expect(doc.getElementById('lifetime-banner')).toBeNull();
      expect(doc.getElementById('streak-card')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Happy path — prepend order (SF-4)
  // -------------------------------------------------------------------------
  describe('prepend order (SF-4)', () => {
    it('banner + card are the first two children of #tab-dashboard in order', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const dashboard = doc.getElementById('tab-dashboard');
      const children = Array.from(dashboard.children);
      expect(children[0].id).toBe('lifetime-banner');
      expect(children[1].id).toBe('streak-card');
    });

    it('pre-existing content is pushed down, not removed', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const existing = doc.getElementById('existing-content');
      expect(existing).not.toBeNull();
    });

    it('banner is the first child (order: banner, card, existing)', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const dashboard = doc.getElementById('tab-dashboard');
      expect(dashboard.firstElementChild.id).toBe('lifetime-banner');
    });
  });

  // -------------------------------------------------------------------------
  // Banner string (SF-4d)
  // -------------------------------------------------------------------------
  describe('lifetime banner (SF-4d)', () => {
    it('AC Scenario 4: banner reads "40 / 100 Days (40.0% Lifetime)"', async () => {
      const doc = buildDoc();
      const streak = makeStreak(SCENARIO_4_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const banner = doc.getElementById('lifetime-banner');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toBe('40 / 100 Days (40.0% Lifetime)');
    });

    it('metDays / totalDays live in the .lifetime-count span', async () => {
      const doc = buildDoc();
      const streak = makeStreak(SCENARIO_4_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const count = doc.querySelector('.lifetime-count');
      expect(count).not.toBeNull();
      expect(count.textContent).toBe('40 / 100');
    });

    it('pct renders with exactly one decimal', async () => {
      const doc = buildDoc();
      const streak = makeStreak({
        ...ZERO_RESULT,
        lifetime: { metDays: 1, totalDays: 3, pct: (1 / 3) * 100 },
      });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const banner = doc.getElementById('lifetime-banner');
      expect(banner.textContent).toBe('1 / 3 Days (33.3% Lifetime)');
    });

    it('zero-state banner reads "0 / 0 Days (0.0% Lifetime)"', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const banner = doc.getElementById('lifetime-banner');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toBe('0 / 0 Days (0.0% Lifetime)');
    });

    it('banner uses toLocaleString("en-US") separators for large numbers', async () => {
      const doc = buildDoc();
      const result = {
        ...ZERO_RESULT,
        lifetime: { metDays: 1_200, totalDays: 3_000, pct: 40.0 },
      };
      const streak = makeStreak(result);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const banner = doc.getElementById('lifetime-banner');
      expect(banner.textContent).toBe('1,200 / 3,000 Days (40.0% Lifetime)');
    });
  });

  // -------------------------------------------------------------------------
  // Tolerance metrics (SF-7 render)
  // -------------------------------------------------------------------------
  describe('tolerance metrics (SF-7)', () => {
    it('renders exactly three .tolerance-metric nodes inside .tolerance-metrics', async () => {
      const doc = buildDoc();
      const streak = makeStreak(TOLERANCE_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const container = doc.querySelector('.tolerance-metrics');
      expect(container).not.toBeNull();
      expect(container.querySelectorAll('.tolerance-metric').length).toBe(3);
    });

    it('.tolerance-metrics lives inside #streak-card', async () => {
      const doc = buildDoc();
      const streak = makeStreak(TOLERANCE_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const card = doc.getElementById('streak-card');
      expect(card.querySelector('.tolerance-metrics')).not.toBeNull();
    });

    it('the three metric labels are Actual (100%), 95% Tolerance, 90% Tolerance in order', async () => {
      const doc = buildDoc();
      const streak = makeStreak(TOLERANCE_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const labels = Array.from(doc.querySelectorAll('.tolerance-metric .tolerance-label')).map(
        (el) => el.textContent,
      );
      expect(labels).toEqual(['Actual Streak (100%)', '95% Tolerance', '90% Tolerance']);
    });

    it('the three metric values come from result.tolerance (19 / 39 / 39)', async () => {
      const doc = buildDoc();
      const streak = makeStreak(TOLERANCE_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const values = Array.from(doc.querySelectorAll('.tolerance-metric .tolerance-value')).map(
        (el) => el.textContent,
      );
      expect(values).toEqual(['19', '39', '39']);
    });

    it('the headline .streak-number is the Actual (100%) streak', async () => {
      const doc = buildDoc();
      const streak = makeStreak(TOLERANCE_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const headline = doc.querySelectorAll('.streak-number');
      expect(headline.length).toBe(1);
      expect(headline[0].textContent).toBe('19');
    });

    it('zero-state renders three metrics all reading 0', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const values = Array.from(doc.querySelectorAll('.tolerance-metric .tolerance-value')).map(
        (el) => el.textContent,
      );
      expect(values).toEqual(['0', '0', '0']);
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

    it('#streak-card is present', () => {
      expect(doc.getElementById('streak-card')).not.toBeNull();
    });

    it('card has a .card-title', () => {
      const card = doc.getElementById('streak-card');
      const title = card.querySelector('.card-title');
      expect(title).not.toBeNull();
      expect(title.textContent.length).toBeGreaterThan(0);
    });

    it('four .tier-chip elements are present (one per threshold)', () => {
      const chips = doc.querySelectorAll('.tier-chip');
      expect(chips.length).toBe(TIER_STEP_THRESHOLDS.length);
    });

    it('zero-state chips read >5k: 0d (best 0d), >7.5k: 0d (best 0d), >10k: 0d (best 0d), >15k: 0d (best 0d)', () => {
      const chips = Array.from(doc.querySelectorAll('.tier-chip'));
      const texts = chips.map((c) => c.textContent);
      expect(texts).toEqual([
        '>5k: 0d (best 0d)',
        '>7.5k: 0d (best 0d)',
        '>10k: 0d (best 0d)',
        '>15k: 0d (best 0d)',
      ]);
    });

    it('renders card sections in order: title, tolerance metrics, goal, tiers, hall of fame', () => {
      const card = doc.getElementById('streak-card');
      const order = Array.from(card.children).map((el) => el.className);
      expect(order).toEqual([
        'card-title',
        'tolerance-metrics',
        'streak-goal',
        'tier-badges',
        'hall-of-fame',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Goal label (SF-6) — steps, not km
  // -------------------------------------------------------------------------
  describe('goal label (SF-6)', () => {
    it.each([
      [5000, 'Goal: 5,000 steps'],
      [7500, 'Goal: 7,500 steps'],
      [10000, 'Goal: 10,000 steps'],
      [15000, 'Goal: 15,000 steps'],
    ])('activeStepGoal %s → ".streak-goal" reads "%s"', async (stepGoal, expected) => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, activeStepGoal: stepGoal });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const goalEl = doc.querySelector('.streak-goal');
      expect(goalEl.textContent).toBe(expected);
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
  // Hall of Fame (SF-4c render)
  // -------------------------------------------------------------------------
  describe('hall of fame (SF-4c)', () => {
    it('.hall-of-fame block lives inside #streak-card', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const card = doc.getElementById('streak-card');
      expect(card.querySelector('.hall-of-fame')).not.toBeNull();
    });

    it('.hof-title names the active step goal with a thousands separator', async () => {
      const doc = buildDoc();
      const streak = makeStreak({
        ...ZERO_RESULT,
        hallOfFame: HOF_THREE,
        activeStepGoal: 7500,
      });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const title = doc.querySelector('.hof-title');
      expect(title).not.toBeNull();
      expect(title.textContent).toBe('Hall of Fame — best runs at 7,500 steps');
    });

    it('three entries render three .hof-entry nodes', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelectorAll('.hof-entry').length).toBe(3);
      expect(doc.querySelector('.hof-empty')).toBeNull();
    });

    it('.hof-rank reads #1, #2, #3 in podium order', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const ranks = Array.from(doc.querySelectorAll('.hof-rank')).map((el) => el.textContent);
      expect(ranks).toEqual(['#1', '#2', '#3']);
    });

    it('.hof-days reads "N days" per entry', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const days = Array.from(doc.querySelectorAll('.hof-days')).map((el) => el.textContent);
      expect(days).toEqual(['41 days', '19 days', '8 days']);
    });

    it('.hof-range reads "start → end" per entry', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const ranges = Array.from(doc.querySelectorAll('.hof-range')).map((el) => el.textContent);
      expect(ranges).toEqual([
        '2026-05-01 → 2026-06-10',
        '2026-01-02 → 2026-01-20',
        '2025-11-01 → 2025-11-08',
      ]);
    });

    it('a single-entry result renders exactly one .hof-entry', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_ONE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const entries = doc.querySelectorAll('.hof-entry');
      expect(entries.length).toBe(1);
      expect(entries[0].querySelector('.hof-rank').textContent).toBe('#1');
      expect(entries[0].querySelector('.hof-days').textContent).toBe('5 days');
      expect(entries[0].querySelector('.hof-range').textContent).toBe('2026-03-01 → 2026-03-05');
      expect(doc.querySelector('.hof-empty')).toBeNull();
    });

    it('an empty result renders .hof-empty and zero .hof-entry', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelectorAll('.hof-entry').length).toBe(0);
      const empty = doc.querySelector('.hof-empty');
      expect(empty).not.toBeNull();
      expect(empty.textContent).toBe('No qualifying streak periods yet');
    });

    it('a non-array hallOfFame fails open to .hof-empty', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: undefined });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      expect(doc.querySelectorAll('.hof-entry').length).toBe(0);
      expect(doc.querySelector('.hof-empty')).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Lock badge removal (regression)
  // -------------------------------------------------------------------------
  describe('lock badge removal (regression)', () => {
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
  });

  // -------------------------------------------------------------------------
  // Tier chip active highlighting (SF-3 / SF-4b × SF-10 invariant)
  // -------------------------------------------------------------------------
  describe('tier chip active highlighting (SF-3)', () => {
    it.each([
      [5000, '>5k'],
      [7500, '>7.5k'],
      [10000, '>10k'],
      [15000, '>15k'],
    ])('activeStepGoal %s → exactly one .tier-chip--active on the %s chip', async (stepGoal, chipText) => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, activeStepGoal: stepGoal });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const activeChips = doc.querySelectorAll('.tier-chip--active');
      expect(activeChips.length).toBe(1);
      expect(activeChips[0].textContent).toContain(chipText);
    });

    it('a step goal outside the enum → no .tier-chip--active (no exact match)', async () => {
      const doc = buildDoc();
      const streak = makeStreak(GOAL_NO_MATCH_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const activeChips = doc.querySelectorAll('.tier-chip--active');
      expect(activeChips.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Chip text format
  // -------------------------------------------------------------------------
  describe('chip text format (SF-8 verbatim mockup)', () => {
    it('non-zero counts render as >5k: 42d (best 60d), >7.5k: 21d (best 30d), >10k: 10d (best 15d), >15k: 2d (best 5d)', async () => {
      const doc = buildDoc();
      const streak = makeStreak(CHIP_TEXT_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const chips = Array.from(doc.querySelectorAll('.tier-chip'));
      const texts = chips.map((c) => c.textContent);
      expect(texts).toEqual([
        '>5k: 42d (best 60d)',
        '>7.5k: 21d (best 30d)',
        '>10k: 10d (best 15d)',
        '>15k: 2d (best 5d)',
      ]);
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

    it('two render() calls → exactly one #lifetime-banner', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();
      await ui.render();

      expect(doc.querySelectorAll('#lifetime-banner').length).toBe(1);
    });

    it('two render() calls → exactly one .hall-of-fame', async () => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, hallOfFame: HOF_THREE });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();
      await ui.render();

      expect(doc.querySelectorAll('.hall-of-fame').length).toBe(1);
      expect(doc.querySelectorAll('.hof-entry').length).toBe(3);
    });

    it('after two renders, banner is still the first child', async () => {
      const doc = buildDoc();
      const streak = makeStreak(ZERO_RESULT);
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();
      await ui.render();

      const dashboard = doc.getElementById('tab-dashboard');
      expect(dashboard.firstElementChild.id).toBe('lifetime-banner');
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

    it('compute() rejecting → zero-state banner "0 / 0 Days (0.0% Lifetime)"', async () => {
      await ui.render();
      const banner = doc.getElementById('lifetime-banner');
      expect(banner.textContent).toBe('0 / 0 Days (0.0% Lifetime)');
    });

    it('compute() rejecting → zero-state tolerance metrics all read 0', async () => {
      await ui.render();
      const values = Array.from(doc.querySelectorAll('.tolerance-metric .tolerance-value')).map(
        (el) => el.textContent,
      );
      expect(values).toEqual(['0', '0', '0']);
    });

    it('compute() rejecting → zero-state chips >5k: 0d (best 0d), etc.', async () => {
      await ui.render();
      const chips = Array.from(doc.querySelectorAll('.tier-chip'));
      expect(chips.length).toBe(TIER_STEP_THRESHOLDS.length);
      const texts = chips.map((c) => c.textContent);
      expect(texts).toEqual([
        '>5k: 0d (best 0d)',
        '>7.5k: 0d (best 0d)',
        '>10k: 0d (best 0d)',
        '>15k: 0d (best 0d)',
      ]);
    });

    it('compute() rejecting → zero-state hall of fame renders .hof-empty', async () => {
      await ui.render();
      expect(doc.querySelector('.hall-of-fame')).not.toBeNull();
      expect(doc.querySelectorAll('.hof-entry').length).toBe(0);
      expect(doc.querySelector('.hof-empty').textContent).toBe(
        'No qualifying streak periods yet',
      );
    });

    it('compute() rejecting → zero-state goal label uses DEFAULT_STEP_GOAL', async () => {
      await ui.render();
      const goalEl = doc.querySelector('.streak-goal');
      expect(goalEl.textContent).toBe(
        `Goal: ${DEFAULT_STEP_GOAL.toLocaleString('en-US')} steps`,
      );
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
