/**
 * Tests for src/streak-ui.js — render layer.
 * Mirrors progress-ui.test.js style: buildDoc helper, mock streak object, no real Dexie.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStreakUI } from './streak-ui.js';
import { TIER_STEP_THRESHOLDS } from './streak.js';
import { DEFAULT_GOAL_KM, DEFAULT_STEP_GOAL } from './goal.js';

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

/** Zero-state compute result (mirrors spec). */
const ZERO_RESULT = {
  unified: 0,
  tiers: TIER_STEP_THRESHOLDS.map((t) => ({ threshold: t, active: 0, best: 0 })),
  hallOfFame: [],
  lifetime: { total10k: 0, totalDays: 0, pct: 0 },
  activeGoalKm: DEFAULT_GOAL_KM, // 3.0
  activeStepGoal: DEFAULT_STEP_GOAL, // 10000
};

/** AC Scenario 4: 40 out of 100 days at 10k+ (40.0%). */
const SCENARIO_4_RESULT = {
  unified: 7,
  tiers: TIER_STEP_THRESHOLDS.map((t) => ({ threshold: t, active: 5, best: 10 })),
  hallOfFame: [],
  lifetime: { total10k: 40, totalDays: 100, pct: 40.0 },
  activeGoalKm: 3.0,
  activeStepGoal: DEFAULT_STEP_GOAL,
};

/** Custom/legacy step goal not matching any tier rung. */
const GOAL_NO_MATCH_RESULT = {
  unified: 2,
  tiers: TIER_STEP_THRESHOLDS.map((t) => ({ threshold: t, active: 1, best: 3 })),
  hallOfFame: [],
  lifetime: { total10k: 5, totalDays: 10, pct: 50 },
  activeGoalKm: 4.5,
  activeStepGoal: 6000, // not a member of TIER_STEP_THRESHOLDS
};

/** Result with non-zero chip counts for chip-text test. */
const CHIP_TEXT_RESULT = {
  unified: 42,
  tiers: [
    { threshold: 5000, active: 42, best: 60 },
    { threshold: 7500, active: 21, best: 30 },
    { threshold: 10000, active: 10, best: 15 },
    { threshold: 15000, active: 2, best: 5 },
  ],
  hallOfFame: [],
  lifetime: { total10k: 20, totalDays: 50, pct: 40 },
  activeGoalKm: 3.0,
  activeStepGoal: 10000,
};

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
  // Banner string (SF-5)
  // -------------------------------------------------------------------------
  describe('lifetime banner (SF-5)', () => {
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
        lifetime: { total10k: 1_200, totalDays: 3_000, pct: 40.0 },
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
  // Card anatomy (SF-15)
  // -------------------------------------------------------------------------
  describe('card anatomy (SF-15)', () => {
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

    it('card has title "Unified Active Streak"', () => {
      const card = doc.getElementById('streak-card');
      expect(card.innerHTML).toContain('Unified Active Streak');
    });

    it('.lock-badge contains "🔒 Effective Date Lock"', () => {
      const badge = doc.querySelector('.lock-badge');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('🔒 Effective Date Lock');
    });

    it('.streak-number shows the unified streak count', () => {
      const num = doc.querySelector('.streak-number');
      expect(num).not.toBeNull();
      expect(num.textContent).toBe('0');
    });

    it('.streak-unit reads "Days"', () => {
      const unit = doc.querySelector('.streak-unit');
      expect(unit).not.toBeNull();
      expect(unit.textContent).toBe('Days');
    });

    it('.streak-goal reads "Goal: 3.0 km" (default 3.0)', () => {
      const goal = doc.querySelector('.streak-goal');
      expect(goal).not.toBeNull();
      expect(goal.textContent).toBe('Goal: 3.0 km');
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
  });

  // -------------------------------------------------------------------------
  // Goal label (SF-6)
  // -------------------------------------------------------------------------
  describe('goal label (SF-6)', () => {
    it.each([
      [5.0, 'Goal: 5.0 km'],
      [1.0, 'Goal: 1.0 km'],
    ])('activeGoalKm %s → ".streak-goal" reads "%s"', async (goalKm, expected) => {
      const doc = buildDoc();
      const streak = makeStreak({ ...ZERO_RESULT, activeGoalKm: goalKm });
      const reporter = { db: vi.fn() };

      const ui = createStreakUI(doc, streak, reporter);
      await ui.render();

      const goalEl = doc.querySelector('.streak-goal');
      expect(goalEl.textContent).toBe(expected);
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

    it('compute() rejecting → reporter.db called with string containing "❌"', async () => {
      await expect(ui.render()).resolves.toBeUndefined();
      expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
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

    it('compute() rejecting → zero-state Goal: 3.0 km (DEFAULT_GOAL_KM)', async () => {
      await ui.render();
      const goalEl = doc.querySelector('.streak-goal');
      expect(goalEl.textContent).toBe(`Goal: ${DEFAULT_GOAL_KM.toFixed(1)} km`);
    });

    it('render() resolves (never rejects) even when compute() throws', async () => {
      await expect(ui.render()).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // No onclick= attributes
  // -------------------------------------------------------------------------
  describe('no onclick= in injected HTML', () => {
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
