/**
 * odyssey-ui.test.js — Tests for the odyssey DOM renderer.
 *
 * TDD: tests are written before implementation.
 * Pattern: createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter) factory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MILESTONES } from './odyssey.js';
import { createOdysseyUI } from './odyssey-ui.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDoc() {
  document.body.innerHTML = `
    <div id="tab-lab">
      <div id="lab-odyssey"></div>
    </div>
  `;
  return document;
}

function makeAnalyticsEngine(totalDistanceKm = 0) {
  return {
    compute: vi.fn().mockResolvedValue({
      lifetimeMetrics: { totalDistanceKm },
    }),
  };
}

function makeReporter() {
  return { db: vi.fn() };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('createOdysseyUI', () => {
  // ── All-locked state ───────────────────────────────────────────────────────

  it('zero-distance state: first leg (Goa) is active at 0% width, remaining 5 legs are locked', async () => {
    const doc = makeDoc();
    // At 0 km, no milestones unlocked, Goa is active leg
    const odysseyEngine = {
      computeOdysseyProgress: vi.fn().mockReturnValue({
        unlockedLegs: [],
        activeLeg: MILESTONES[0], // Goa
        progressPct: 0,
        remainingKm: 650,
      }),
    };
    const analyticsEngine = makeAnalyticsEngine(0);
    const reporter = makeReporter();

    const ui = createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter);
    await ui.render();

    const legs = doc.querySelectorAll('.odyssey-leg');
    expect(legs).toHaveLength(MILESTONES.length);

    // First leg is active (since no unlocked legs), rest are locked
    // At 0 km: unlockedLegs=[], activeLeg=Goa → first leg active, rest locked
    const states = Array.from(legs).map(el => el.getAttribute('data-state'));
    // active is index 0 (Goa), indices 1-5 are locked
    expect(states[0]).toBe('active');
    expect(states.slice(1).every(s => s === 'locked')).toBe(true);
  });

  it('zero-distance state: active leg has style.width of 0%', async () => {
    const doc = makeDoc();
    const odysseyEngine = {
      computeOdysseyProgress: vi.fn().mockReturnValue({
        unlockedLegs: [],
        activeLeg: MILESTONES[0],
        progressPct: 0,
        remainingKm: 650,
      }),
    };
    const analyticsEngine = makeAnalyticsEngine(0);
    const reporter = makeReporter();

    const ui = createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter);
    await ui.render();

    const legs = doc.querySelectorAll('.odyssey-leg');
    expect(legs[0].getAttribute('data-state')).toBe('active');
    expect(legs[0].style.width).toBe('0%');
  });

  // ── Partially-unlocked state ───────────────────────────────────────────────

  it('partially-unlocked state: first leg unlocked, second active, rest locked', async () => {
    const doc = makeDoc();
    // Goa unlocked (>= 650 km), Mumbai is active leg
    const odysseyEngine = {
      computeOdysseyProgress: vi.fn().mockReturnValue({
        unlockedLegs: [MILESTONES[0]], // Goa
        activeLeg: MILESTONES[1],      // Mumbai
        progressPct: 50,
        remainingKm: 355,
      }),
    };
    const analyticsEngine = makeAnalyticsEngine(680);
    const reporter = makeReporter();

    const ui = createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter);
    await ui.render();

    const legs = doc.querySelectorAll('.odyssey-leg');
    expect(legs).toHaveLength(MILESTONES.length);
    expect(legs[0].getAttribute('data-state')).toBe('unlocked');
    expect(legs[1].getAttribute('data-state')).toBe('active');
    expect(legs[2].getAttribute('data-state')).toBe('locked');
    expect(legs[3].getAttribute('data-state')).toBe('locked');
    expect(legs[4].getAttribute('data-state')).toBe('locked');
    expect(legs[5].getAttribute('data-state')).toBe('locked');
  });

  it('active leg style.width reflects progressPct from engine', async () => {
    const doc = makeDoc();
    const odysseyEngine = {
      computeOdysseyProgress: vi.fn().mockReturnValue({
        unlockedLegs: [MILESTONES[0]],
        activeLeg: MILESTONES[1],
        progressPct: 50,
        remainingKm: 355,
      }),
    };
    const analyticsEngine = makeAnalyticsEngine(680);
    const reporter = makeReporter();

    const ui = createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter);
    await ui.render();

    const activeLeg = doc.querySelector('.odyssey-leg[data-state="active"]');
    expect(activeLeg).not.toBeNull();
    expect(activeLeg.style.width).toBe('50%');
  });

  it('active leg textContent includes remaining km indicator', async () => {
    const doc = makeDoc();
    const odysseyEngine = {
      computeOdysseyProgress: vi.fn().mockReturnValue({
        unlockedLegs: [MILESTONES[0]],
        activeLeg: MILESTONES[1], // Mumbai
        progressPct: 50,
        remainingKm: 355,
      }),
    };
    const analyticsEngine = makeAnalyticsEngine(680);
    const reporter = makeReporter();

    const ui = createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter);
    await ui.render();

    const activeLeg = doc.querySelector('.odyssey-leg[data-state="active"]');
    expect(activeLeg).not.toBeNull();
    // textContent should include remaining km as a number
    expect(activeLeg.textContent).toContain('355');
  });

  // ── All-unlocked state ─────────────────────────────────────────────────────

  it('all-unlocked state: all 6 legs have data-state="unlocked" when totalDistanceKm >= 12500', async () => {
    const doc = makeDoc();
    const odysseyEngine = {
      computeOdysseyProgress: vi.fn().mockReturnValue({
        unlockedLegs: [...MILESTONES], // all 6
        activeLeg: undefined,
        progressPct: 100,
        remainingKm: 0,
      }),
    };
    const analyticsEngine = makeAnalyticsEngine(12500);
    const reporter = makeReporter();

    const ui = createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter);
    await ui.render();

    const legs = doc.querySelectorAll('.odyssey-leg');
    expect(legs).toHaveLength(MILESTONES.length);
    const states = Array.from(legs).map(el => el.getAttribute('data-state'));
    expect(states.every(s => s === 'unlocked')).toBe(true);
  });

  // ── Error path ─────────────────────────────────────────────────────────────

  it('analytics engine error: reporter.db called and error <p> rendered, no rethrow', async () => {
    const doc = makeDoc();
    const odysseyEngine = {
      computeOdysseyProgress: vi.fn(),
    };
    const analyticsEngine = {
      compute: vi.fn().mockRejectedValue(new Error('analytics failure')),
    };
    const reporter = makeReporter();

    const ui = createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter);
    await expect(ui.render()).resolves.toBeUndefined();

    expect(reporter.db).toHaveBeenCalledWith('⚠️ Could not render Odyssey');
    const errP = doc.querySelector('#lab-odyssey p');
    expect(errP).not.toBeNull();
  });

  it('odyssey engine error: reporter.db called and error <p> rendered, no rethrow', async () => {
    const doc = makeDoc();
    const odysseyEngine = {
      computeOdysseyProgress: vi.fn().mockImplementation(() => {
        throw new Error('odyssey engine failure');
      }),
    };
    const analyticsEngine = makeAnalyticsEngine(100);
    const reporter = makeReporter();

    const ui = createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter);
    await expect(ui.render()).resolves.toBeUndefined();

    expect(reporter.db).toHaveBeenCalledWith('⚠️ Could not render Odyssey');
    const errP = doc.querySelector('#lab-odyssey p');
    expect(errP).not.toBeNull();
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('render() called twice does not duplicate .odyssey-leg elements', async () => {
    const doc = makeDoc();
    const odysseyEngine = {
      computeOdysseyProgress: vi.fn().mockReturnValue({
        unlockedLegs: [],
        activeLeg: MILESTONES[0],
        progressPct: 0,
        remainingKm: 650,
      }),
    };
    const analyticsEngine = makeAnalyticsEngine(0);
    const reporter = makeReporter();

    const ui = createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter);
    await ui.render();
    await ui.render();

    const legs = doc.querySelectorAll('.odyssey-leg');
    expect(legs).toHaveLength(MILESTONES.length);
  });

  // ── analyticsEngine.compute() provides totalDistanceKm ────────────────────

  it('passes totalDistanceKm from analyticsEngine to odysseyEngine', async () => {
    const doc = makeDoc();
    const odysseyEngine = {
      computeOdysseyProgress: vi.fn().mockReturnValue({
        unlockedLegs: [],
        activeLeg: MILESTONES[0],
        progressPct: 30,
        remainingKm: 455,
      }),
    };
    const analyticsEngine = makeAnalyticsEngine(195);
    const reporter = makeReporter();

    const ui = createOdysseyUI(doc, odysseyEngine, analyticsEngine, reporter);
    await ui.render();

    expect(odysseyEngine.computeOdysseyProgress).toHaveBeenCalledWith(195);
  });
});
