import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createProgressUI } from './progress-ui.js';

const progressUiSource = fs.readFileSync(path.resolve(__dirname, 'progress-ui.js'), 'utf8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal jsdom document with #tab-dashboard.
 */
function buildDoc() {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = '<div id="tab-dashboard"></div>';
  return doc;
}

/**
 * Build a minimal jsdom document WITHOUT #tab-dashboard.
 */
function buildDocNoTab() {
  return document.implementation.createHTMLDocument('test');
}

/**
 * Standard active step goal (the app default).
 */
const GOAL_10K = 10000;

/**
 * Alternate active step goal used to prove the denominator is data-driven.
 */
const GOAL_5K = 5000;

/**
 * Build a mock goal object exposing the step-lens surface consumed by render()
 * plus the legacy km surface still used by the (Task 5) goal selector.
 *
 * @param {number|Error} stepGoalOrError - value getActiveStepGoal resolves/rejects with
 * @param {boolean} shouldReject
 */
function makeGoal(stepGoalOrError, shouldReject = false) {
  return {
    getActiveStepGoal: shouldReject
      ? vi.fn().mockRejectedValue(stepGoalOrError)
      : vi.fn().mockResolvedValue(stepGoalOrError),
    setActiveStepGoal: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Build a mock db where daily_records.get resolves/rejects.
 */
function makeDb(recordOrError, shouldReject = false) {
  return {
    daily_records: {
      get: shouldReject
        ? vi.fn().mockRejectedValue(recordOrError)
        : vi.fn().mockResolvedValue(recordOrError),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => vi.restoreAllMocks());

describe('createProgressUI', () => {
  // -------------------------------------------------------------------------
  // Source-level regression — no innerHTML in the render layer
  // -------------------------------------------------------------------------
  describe('progress-ui.js — no innerHTML', () => {
    it('progress-ui.js contains no innerHTML strings', () => {
      expect(progressUiSource).not.toMatch(/innerHTML/);
    });
  });

  // -------------------------------------------------------------------------
  // Factory guard — missing #tab-dashboard
  // -------------------------------------------------------------------------
  describe('missing #tab-dashboard', () => {
    it('logs console.warn and does not throw when #tab-dashboard absent', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const doc = buildDocNoTab();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await expect(ui.render()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith('[progress]', expect.any(String));
    });

    it('does not inject #progress-card when #tab-dashboard is absent', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const doc = buildDocNoTab();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.getElementById('progress-card')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // In-Progress state (3200 / 10000 steps)
  // -------------------------------------------------------------------------
  describe('In-Progress state (3200/10000 steps)', () => {
    let doc, goal, db, reporter;

    beforeEach(() => {
      doc = buildDoc();
      goal = makeGoal(GOAL_10K);
      db = makeDb({ effective_steps: 3200 });
      reporter = { db: vi.fn() };
    });

    it('reads the goal via getActiveStepGoal (not the legacy km getter)', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(goal.getActiveStepGoal).toHaveBeenCalledTimes(1);
    });

    it('renders "32%" in .progress-pct', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const pctEl = doc.querySelector('.progress-pct');
      expect(pctEl).not.toBeNull();
      expect(pctEl.textContent).toBe('32%');
    });

    it('metric value reads "3,200 / 10,000 steps"', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const valueEl = doc.querySelector('.metric-value');
      expect(valueEl).not.toBeNull();
      expect(valueEl.textContent).toBe('3,200 / 10,000 steps');
    });

    it('renders "/ 10,000 steps" in .metric-unit', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const unitEl = doc.querySelector('.metric-unit');
      expect(unitEl).not.toBeNull();
      expect(unitEl.textContent).toBe('/ 10,000 steps');
    });

    it('no .metric-sub node exists anywhere in the card', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.querySelector('.metric-sub')).toBeNull();
    });

    it('fill has style width=32% and aria-valuenow="32"', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const fill = doc.querySelector('.progress-fill');
      expect(fill).not.toBeNull();
      expect(fill.getAttribute('aria-valuenow')).toBe('32');
      expect(fill.style.width).toBe('32%');
    });

    it('fill has role="progressbar", aria-valuemin="0", aria-valuemax="100"', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const fill = doc.querySelector('.progress-fill');
      expect(fill.getAttribute('role')).toBe('progressbar');
      expect(fill.getAttribute('aria-valuemin')).toBe('0');
      expect(fill.getAttribute('aria-valuemax')).toBe('100');
    });

    it('remaining-hint text is the exact step-lens string', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const hint = doc.querySelector('.remaining-hint');
      expect(hint).not.toBeNull();
      expect(hint.textContent).toBe(
        '⏱️ 6,800 steps remaining to fulfill daily target'
      );
    });

    it('remaining-hint contains no km / meters distance substring', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const hint = doc.querySelector('.remaining-hint');
      expect(hint.textContent).not.toContain('km');
      expect(hint.textContent).not.toContain('meters');
    });

    it('.goal-met-badge is absent in In-Progress state', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.querySelector('.goal-met-badge')).toBeNull();
    });

    it('injected card contains no onclick= attributes', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const card = doc.getElementById('progress-card');
      expect(card.outerHTML).not.toMatch(/onclick=/);
    });
  });

  // -------------------------------------------------------------------------
  // Denominator is data-driven — a 5,000 step goal
  // -------------------------------------------------------------------------
  describe('alternate step goal (2500/5000 steps)', () => {
    it('renders "2,500 / 5,000 steps" and 50%', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_5K);
      const db = makeDb({ effective_steps: 2500 });
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();

      expect(doc.querySelector('.metric-value').textContent).toBe('2,500 / 5,000 steps');
      expect(doc.querySelector('.progress-pct').textContent).toBe('50%');
    });
  });

  // -------------------------------------------------------------------------
  // Goal Met state (12000 / 10000 steps)
  // -------------------------------------------------------------------------
  describe('Goal Met state (12000/10000 steps)', () => {
    let doc, goal, db, reporter;

    beforeEach(() => {
      doc = buildDoc();
      goal = makeGoal(GOAL_10K);
      db = makeDb({ effective_steps: 12000 });
      reporter = { db: vi.fn() };
    });

    it('renders "100%" in .progress-pct', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.querySelector('.progress-pct').textContent).toBe('100%');
    });

    it('.goal-met-badge present with "✅ Daily Commitment Met"', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const badge = doc.querySelector('.goal-met-badge');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('✅ Daily Commitment Met');
    });

    it('.progress-fill--full class applied on fill element', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const fill = doc.querySelector('.progress-fill');
      expect(fill.classList.contains('progress-fill--full')).toBe(true);
    });

    it('.remaining-hint absent in Goal Met state', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.querySelector('.remaining-hint')).toBeNull();
    });

    it('aria-valuenow is "100" in Goal Met state', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const fill = doc.querySelector('.progress-fill');
      expect(fill.getAttribute('aria-valuenow')).toBe('100');
    });

    it('no inline width style on fill in Goal Met state (CSS class drives it)', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const fill = doc.querySelector('.progress-fill');
      // style.width should be empty — the .progress-fill--full class handles it
      expect(fill.style.width).toBe('');
    });

    it('no .metric-sub node in Goal Met state either', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.querySelector('.metric-sub')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Idempotent re-render
  // -------------------------------------------------------------------------
  describe('idempotent re-render', () => {
    it('two render() calls produce exactly one #progress-card', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      await ui.render();
      expect(doc.querySelectorAll('#progress-card').length).toBe(1);
    });

    it('three render() calls still produce exactly one #progress-card', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb({ effective_steps: 4000 });
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      await ui.render();
      await ui.render();
      expect(doc.querySelectorAll('#progress-card').length).toBe(1);
      expect(doc.querySelectorAll('.metric-value').length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Fail-open: getTodayRecord rejects
  // -------------------------------------------------------------------------
  describe('fail-open: getTodayRecord rejects', () => {
    it('calls console.error("[progress]", err) and reporter.db(…)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(new Error('DB read failed'), /* shouldReject */ true);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await expect(ui.render()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('[progress]', expect.any(Error));
      expect(reporter.db).toHaveBeenCalledWith('❌ Progress load failed');
    });

    it('renders zero-state #progress-card on failure', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(new Error('DB read failed'), true);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const card = doc.getElementById('progress-card');
      expect(card).not.toBeNull();
      // zero state: 0 steps against the default step goal
      expect(doc.querySelector('.progress-pct').textContent).toBe('0%');
      expect(doc.querySelector('.metric-value').textContent).toBe('0 / 10,000 steps');
    });
  });

  // -------------------------------------------------------------------------
  // Fail-open: getActiveStepGoal rejects
  // -------------------------------------------------------------------------
  describe('fail-open: getActiveStepGoal rejects', () => {
    it('calls console.error("[progress]", err) and reporter.db("❌ Progress load failed")', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const doc = buildDoc();
      const goal = makeGoal(new Error('Goal read failed'), /* shouldReject */ true);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await expect(ui.render()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('[progress]', expect.any(Error));
      expect(reporter.db).toHaveBeenCalledWith('❌ Progress load failed');
    });

    it('renders a zero-state #progress-card on getActiveStepGoal failure', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const doc = buildDoc();
      const goal = makeGoal(new Error('Goal read failed'), true);
      const db = makeDb({ effective_steps: 4321 });
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();

      expect(doc.getElementById('progress-card')).not.toBeNull();
      expect(doc.querySelector('.metric-value').textContent).toBe('0 / 10,000 steps');
      expect(doc.querySelector('.progress-pct').textContent).toBe('0%');
    });
  });

  // -------------------------------------------------------------------------
  // Goal Selector — Step Target <select> (Task 5)
  // -------------------------------------------------------------------------
  describe('goal selector — structure', () => {
    it('render() injects #goal-selector after the card', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.getElementById('goal-selector')).not.toBeNull();
    });

    it('exactly one #goal-select with 4 options valued 5000/7500/10000/15000', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();

      const selects = doc.querySelectorAll('#goal-select');
      expect(selects.length).toBe(1);
      expect(selects[0].tagName).toBe('SELECT');
      expect(selects[0].className).toBe('goal-select');

      const options = selects[0].querySelectorAll('option');
      expect(options.length).toBe(4);
      expect(Array.from(options).map((o) => o.value)).toEqual([
        '5000',
        '7500',
        '10000',
        '15000',
      ]);
    });

    it('option labels are comma-formatted step counts', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();

      const options = doc.querySelectorAll('#goal-select option');
      expect(Array.from(options).map((o) => o.textContent)).toEqual([
        '5,000 steps',
        '7,500 steps',
        '10,000 steps',
        '15,000 steps',
      ]);
    });

    it('#goal-error span is present', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.getElementById('goal-error')).not.toBeNull();
    });

    it('no legacy .goal-preset / .goal-input / .goal-apply nodes exist anywhere in the DOM', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();

      expect(doc.querySelector('.goal-preset')).toBeNull();
      expect(doc.querySelector('.goal-input')).toBeNull();
      expect(doc.querySelector('.goal-apply')).toBeNull();
    });

    it('no onclick= attributes in #goal-selector markup', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const selector = doc.getElementById('goal-selector');
      expect(selector.outerHTML).not.toMatch(/onclick=/);
    });

    it("select's value is preset to the active goal (target_steps) on render", async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_5K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();

      expect(doc.getElementById('goal-select').value).toBe('5000');
    });
  });

  describe('goal selector — change event', () => {
    it('dispatching change with value 7500 calls setActiveStepGoal(7500) as a number, then re-renders, then invokes onGoalApplied exactly once, in that order', async () => {
      const doc = buildDoc();
      const callOrder = [];
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveStepGoal = vi.fn().mockImplementation(async () => {
        callOrder.push('setActiveStepGoal');
      });
      goalObj.getActiveStepGoal = vi.fn()
        .mockResolvedValueOnce(GOAL_10K)
        .mockResolvedValue(7500);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };
      let renderedTargetAtCallback = null;
      const onGoalApplied = vi.fn().mockImplementation(() => {
        callOrder.push('onGoalApplied');
        renderedTargetAtCallback = doc.querySelector('.metric-unit').textContent;
      });

      const ui = createProgressUI(doc, goalObj, db, reporter, onGoalApplied);
      await ui.render();

      const select = doc.getElementById('goal-select');
      select.value = '7500';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));

      expect(goalObj.setActiveStepGoal).toHaveBeenCalledWith(7500);
      expect(goalObj.setActiveStepGoal).toHaveBeenCalledTimes(1);
      expect(onGoalApplied).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['setActiveStepGoal', 'onGoalApplied']);
      // Re-render happened before the callback fired
      expect(renderedTargetAtCallback).toBe('/ 7,500 steps');
    });

    it('setActiveStepGoal rejection sets #goal-error to the save-error text and does not invoke onGoalApplied', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveStepGoal = vi.fn().mockRejectedValue(new TypeError('bad value'));
      const db = makeDb(null);
      const reporter = { db: vi.fn() };
      const onGoalApplied = vi.fn();

      const ui = createProgressUI(doc, goalObj, db, reporter, onGoalApplied);
      await ui.render();

      const select = doc.getElementById('goal-select');
      select.value = '5000';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));

      expect(doc.getElementById('goal-error').textContent).toBe(
        '⚠️ Failed to save goal — please try again'
      );
      expect(onGoalApplied).not.toHaveBeenCalled();
      // No re-render occurred: getActiveStepGoal only called by the initial render
      expect(goalObj.getActiveStepGoal).toHaveBeenCalledTimes(1);
    });

    it('an onGoalApplied that throws is caught and logged; render() still resolves', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveStepGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };
      const onGoalApplied = vi.fn().mockImplementation(() => {
        throw new Error('callback error');
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const ui = createProgressUI(doc, goalObj, db, reporter, onGoalApplied);
      await ui.render();

      const select = doc.getElementById('goal-select');
      select.value = '15000';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));

      expect(onGoalApplied).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('[progress]', expect.any(Error));
      expect(doc.getElementById('goal-error').textContent).toBe('');
    });

    it('after re-render the <select> value equals the persisted goal', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveStepGoal = vi.fn().mockResolvedValue(undefined);
      goalObj.getActiveStepGoal = vi.fn()
        .mockResolvedValueOnce(GOAL_10K)
        .mockResolvedValue(15000);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      const select = doc.getElementById('goal-select');
      select.value = '15000';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));

      expect(doc.getElementById('goal-select').value).toBe('15000');
    });
  });

  describe('goal selector — idempotent re-render', () => {
    it('two render() calls produce exactly one #goal-selector and one #goal-select', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      await ui.render();
      expect(doc.querySelectorAll('#goal-selector').length).toBe(1);
      expect(doc.querySelectorAll('#goal-select').length).toBe(1);
    });

    it('stale listeners not accumulated: change on the re-rendered select fires setActiveStepGoal once', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveStepGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();
      await ui.render(); // second render — stale container replaced

      const select = doc.getElementById('goal-select');
      select.value = '7500';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));

      expect(goalObj.setActiveStepGoal).toHaveBeenCalledTimes(1);
    });
  });

  describe('onGoalApplied callback — Liskov compatibility (default no-op)', () => {
    it('no callback provided (5th param omitted) — render() succeeds', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      // Omit the 5th parameter entirely
      const ui = createProgressUI(doc, goal, db, reporter);
      await expect(ui.render()).resolves.toBeUndefined();
    });

    it('no callback provided — change event succeeds without error', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveStepGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      // Omit the 5th parameter
      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      const select = doc.getElementById('goal-select');
      select.value = '5000';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));

      expect(doc.getElementById('goal-error').textContent).toBe('');
    });
  });
});
