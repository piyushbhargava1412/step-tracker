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
    setActiveStepGoal: vi.fn(),
    getActiveGoal: vi.fn().mockResolvedValue({ target_steps: 3937, target_distance_km: 3.0 }),
    setActiveGoal: vi.fn(),
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
  // Goal Selector (km — replaced in Task 5)
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

    it('four preset buttons with data-goal-preset 1,3,5,10 are present', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const presets = doc.querySelectorAll('[data-goal-preset]');
      expect(presets.length).toBe(4);
      const values = Array.from(presets).map(b => b.dataset.goalPreset);
      expect(values).toEqual(['1', '3', '5', '10']);
    });

    it('#goal-input, data-goal-apply button, and #goal-error span are present', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.getElementById('goal-input')).not.toBeNull();
      expect(doc.querySelector('[data-goal-apply]')).not.toBeNull();
      expect(doc.getElementById('goal-error')).not.toBeNull();
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
  });

  describe('goal selector — preset click', () => {
    const PRESET_VALUES = [1, 3, 5, 10];

    it.each(PRESET_VALUES)(
      'clicking preset "%s km" calls setActiveGoal(%s) exactly once',
      async (preset) => {
        const doc = buildDoc();
        const goalObj = makeGoal(GOAL_10K);
        goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
        const db = makeDb(null);
        const reporter = { db: vi.fn() };

        const ui = createProgressUI(doc, goalObj, db, reporter);
        await ui.render();

        doc.querySelector(`[data-goal-preset="${preset}"]`).click();
        // allow microtasks to settle
        await new Promise(r => setTimeout(r, 0));

        expect(goalObj.setActiveGoal).toHaveBeenCalledWith(preset);
        expect(goalObj.setActiveGoal).toHaveBeenCalledTimes(1);
      }
    );

    it('preset click triggers re-render (card shows new target after preset)', async () => {
      const doc = buildDoc();
      // step goal is 10000 initially, then 5000 after the preset click
      const goalObj = makeGoal(GOAL_10K);
      goalObj.getActiveStepGoal = vi.fn()
        .mockResolvedValueOnce(GOAL_10K)
        .mockResolvedValue(GOAL_5K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();
      expect(doc.querySelector('.metric-unit').textContent).toBe('/ 10,000 steps');

      doc.querySelector('[data-goal-preset="5"]').click();
      await new Promise(r => setTimeout(r, 20));

      expect(doc.querySelector('.metric-unit').textContent).toBe('/ 5,000 steps');
    });
  });

  describe('goal selector — custom input (valid)', () => {
    it('valid input "4.5" + apply calls setActiveGoal(4.5) and clears #goal-error', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      doc.getElementById('goal-input').value = '4.5';
      doc.querySelector('[data-goal-apply]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(goalObj.setActiveGoal).toHaveBeenCalledWith(4.5);
      expect(doc.getElementById('goal-error').textContent).toBe('');
    });
  });

  describe('goal selector — custom input (invalid)', () => {
    const INVALID_INPUTS = ['', '0', '-2', 'abc', 'NaN', 'Infinity'];

    for (const badVal of INVALID_INPUTS) {
      it(`input "${badVal}" shows validation error, setActiveGoal not called`, async () => {
        const doc = buildDoc();
        const goalObj = makeGoal(GOAL_10K);
        goalObj.setActiveGoal = vi.fn();
        const db = makeDb(null);
        const reporter = { db: vi.fn() };

        const ui = createProgressUI(doc, goalObj, db, reporter);
        await ui.render();

        doc.getElementById('goal-input').value = badVal;
        doc.querySelector('[data-goal-apply]').click();
        await new Promise(r => setTimeout(r, 0));

        expect(doc.getElementById('goal-error').textContent).toBe(
          '⚠️ Enter a distance greater than 0'
        );
        expect(goalObj.setActiveGoal).not.toHaveBeenCalled();
      });
    }
  });

  describe('goal selector — setActiveGoal throws', () => {
    it('setActiveGoal throwing is caught and shown in #goal-error (preset path)', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockRejectedValue(new TypeError('bad value'));
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      doc.querySelector('[data-goal-preset="3"]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(doc.getElementById('goal-error').textContent).toBe(
        '⚠️ Failed to save goal — please try again'
      );
    });

    it('setActiveGoal throwing is caught and shown in #goal-error (apply path)', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockRejectedValue(new TypeError('bad value'));
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      doc.getElementById('goal-input').value = '4.5';
      doc.querySelector('[data-goal-apply]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(doc.getElementById('goal-error').textContent).toBe(
        '⚠️ Failed to save goal — please try again'
      );
    });
  });

  describe('goal selector — idempotent re-render', () => {
    it('two render() calls produce exactly one #goal-selector', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      await ui.render();
      expect(doc.querySelectorAll('#goal-selector').length).toBe(1);
    });

    it('stale listeners not accumulated: preset on re-rendered selector fires render once', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();
      await ui.render(); // second render — stale container replaced

      // clicking the preset on the freshly rendered selector
      doc.querySelector('[data-goal-preset="3"]').click();
      await new Promise(r => setTimeout(r, 20));

      // setActiveGoal called exactly once (not twice due to accumulated listeners)
      expect(goalObj.setActiveGoal).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Task 9: onGoalApplied callback
  // -------------------------------------------------------------------------
  describe('onGoalApplied callback — preset click', () => {
    it('preset click invokes onGoalApplied exactly once after re-render', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };
      const onGoalApplied = vi.fn();

      const ui = createProgressUI(doc, goalObj, db, reporter, onGoalApplied);
      await ui.render();

      doc.querySelector('[data-goal-preset="5"]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(onGoalApplied).toHaveBeenCalledTimes(1);
    });

    it('preset click does NOT invoke onGoalApplied when setActiveGoal rejects', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockRejectedValue(new Error('save failed'));
      const db = makeDb(null);
      const reporter = { db: vi.fn() };
      const onGoalApplied = vi.fn();

      const ui = createProgressUI(doc, goalObj, db, reporter, onGoalApplied);
      await ui.render();

      doc.querySelector('[data-goal-preset="3"]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(onGoalApplied).not.toHaveBeenCalled();
      expect(doc.getElementById('goal-error').textContent).toContain('Failed to save');
    });

    it('preset click — callback throws but does not break the apply flow', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };
      const onGoalApplied = vi.fn().mockImplementation(() => {
        throw new Error('callback error');
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const ui = createProgressUI(doc, goalObj, db, reporter, onGoalApplied);
      await ui.render();

      doc.querySelector('[data-goal-preset="5"]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(onGoalApplied).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('[progress]', expect.any(Error));
      expect(doc.getElementById('goal-error').textContent).toBe('');
    });
  });

  describe('onGoalApplied callback — custom apply', () => {
    it('valid custom input + apply invokes onGoalApplied exactly once after re-render', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };
      const onGoalApplied = vi.fn();

      const ui = createProgressUI(doc, goalObj, db, reporter, onGoalApplied);
      await ui.render();

      doc.getElementById('goal-input').value = '4.5';
      doc.querySelector('[data-goal-apply]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(onGoalApplied).toHaveBeenCalledTimes(1);
    });

    it('custom apply does NOT invoke onGoalApplied when setActiveGoal rejects', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockRejectedValue(new Error('save failed'));
      const db = makeDb(null);
      const reporter = { db: vi.fn() };
      const onGoalApplied = vi.fn();

      const ui = createProgressUI(doc, goalObj, db, reporter, onGoalApplied);
      await ui.render();

      doc.getElementById('goal-input').value = '4.5';
      doc.querySelector('[data-goal-apply]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(onGoalApplied).not.toHaveBeenCalled();
      expect(doc.getElementById('goal-error').textContent).toContain('Failed to save');
    });

    it('custom apply — callback throws but does not break the apply flow', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };
      const onGoalApplied = vi.fn().mockImplementation(() => {
        throw new Error('callback error');
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const ui = createProgressUI(doc, goalObj, db, reporter, onGoalApplied);
      await ui.render();

      doc.getElementById('goal-input').value = '4.5';
      doc.querySelector('[data-goal-apply]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(onGoalApplied).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('[progress]', expect.any(Error));
      expect(doc.getElementById('goal-error').textContent).toBe('');
    });

    it('custom apply — invalid input does NOT invoke onGoalApplied', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };
      const onGoalApplied = vi.fn();

      const ui = createProgressUI(doc, goalObj, db, reporter, onGoalApplied);
      await ui.render();

      doc.getElementById('goal-input').value = '-5';
      doc.querySelector('[data-goal-apply]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(onGoalApplied).not.toHaveBeenCalled();
      expect(doc.getElementById('goal-error').textContent).toContain('Enter a distance greater than 0');
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

    it('no callback provided — preset click succeeds without error', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      // Omit the 5th parameter
      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      doc.querySelector('[data-goal-preset="5"]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(doc.getElementById('goal-error').textContent).toBe('');
    });

    it('no callback provided — custom apply succeeds without error', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_10K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      // Omit the 5th parameter
      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      doc.getElementById('goal-input').value = '4.5';
      doc.querySelector('[data-goal-apply]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(doc.getElementById('goal-error').textContent).toBe('');
    });
  });
});
