import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createProgressUI } from './progress-ui.js';

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
 * Build a mock goal object.
 * @param {object|Error} activeGoalOrError  - value to resolve/reject with
 */
function makeGoal(activeGoalOrError, shouldReject = false) {
  return {
    getActiveGoal: shouldReject
      ? vi.fn().mockRejectedValue(activeGoalOrError)
      : vi.fn().mockResolvedValue(activeGoalOrError),
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

/**
 * Standard active goal: 5 km / 5000 steps (used in Scenario 3 + Goal Met).
 */
const GOAL_5K = {
  key: 'active_goal',
  target_distance_km: 5.0,
  target_steps: 5000,
  effective_from: '2026-08-10',
};

/**
 * Standard active goal: 3 km / 3937 steps (default).
 */
const GOAL_3K = {
  key: 'active_goal',
  target_distance_km: 3.0,
  target_steps: 3937,
  effective_from: '2026-08-10',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => vi.restoreAllMocks());

describe('createProgressUI', () => {
  // -------------------------------------------------------------------------
  // Factory guard — missing #tab-dashboard
  // -------------------------------------------------------------------------
  describe('missing #tab-dashboard', () => {
    it('logs console.warn and does not throw when #tab-dashboard absent', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const doc = buildDocNoTab();
      const goal = makeGoal(GOAL_3K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await expect(ui.render()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith('[progress]', expect.any(String));
    });

    it('does not inject #progress-card when #tab-dashboard is absent', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const doc = buildDocNoTab();
      const goal = makeGoal(GOAL_3K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.getElementById('progress-card')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3 — In-Progress state (3200 / 5000 steps)
  // -------------------------------------------------------------------------
  describe('Scenario 3: In-Progress (3200/5000 steps)', () => {
    let doc, goal, db, reporter;

    beforeEach(() => {
      doc = buildDoc();
      goal = makeGoal(GOAL_5K);
      db = makeDb({ effective_steps: 3200, effective_distance_km: 2.44 });
      reporter = { db: vi.fn() };
    });

    it('renders "64%" in .progress-pct', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const pctEl = doc.querySelector('.progress-pct');
      expect(pctEl).not.toBeNull();
      expect(pctEl.textContent).toBe('64%');
    });

    it('renders "3,200" step count with thousands separator', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const card = doc.getElementById('progress-card');
      expect(card.innerHTML).toContain('3,200');
    });

    it('renders "/ 5,000 steps" in .metric-unit', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const unitEl = doc.querySelector('.metric-unit');
      expect(unitEl).not.toBeNull();
      expect(unitEl.textContent).toContain('5,000 steps');
    });

    it('renders distance in .metric-sub (e.g. 2.44 / 5.00 km)', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const subEl = doc.querySelector('.metric-sub');
      expect(subEl).not.toBeNull();
      expect(subEl.textContent).toContain('2.44');
      expect(subEl.textContent).toContain('5.00 km');
    });

    it('fill has style width=64% and aria-valuenow="64"', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const fill = doc.querySelector('.progress-fill');
      expect(fill).not.toBeNull();
      expect(fill.getAttribute('aria-valuenow')).toBe('64');
      expect(fill.style.width).toBe('64%');
    });

    it('fill has role="progressbar", aria-valuemin="0", aria-valuemax="100"', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const fill = doc.querySelector('.progress-fill');
      expect(fill.getAttribute('role')).toBe('progressbar');
      expect(fill.getAttribute('aria-valuemin')).toBe('0');
      expect(fill.getAttribute('aria-valuemax')).toBe('100');
    });

    it('remaining-hint text matches expected format with ~1.37 km', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const hint = doc.querySelector('.remaining-hint');
      expect(hint).not.toBeNull();
      expect(hint.textContent).toContain('1,800');
      expect(hint.textContent).toContain('steps remaining to fulfill daily target');
      expect(hint.textContent).toContain('1.37 km');
    });

    it('.goal-met-badge is absent in In-Progress state', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.querySelector('.goal-met-badge')).toBeNull();
    });

    it('injected HTML contains no onclick= attributes', async () => {
      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const card = doc.getElementById('progress-card');
      expect(card.innerHTML).not.toMatch(/onclick=/);
    });
  });

  // -------------------------------------------------------------------------
  // Goal Met state (6800 / 5000 steps)
  // -------------------------------------------------------------------------
  describe('Goal Met state (6800/5000 steps)', () => {
    let doc, goal, db, reporter;

    beforeEach(() => {
      doc = buildDoc();
      goal = makeGoal(GOAL_5K);
      db = makeDb({ effective_steps: 6800, effective_distance_km: 5.18 });
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
  });

  // -------------------------------------------------------------------------
  // Idempotent re-render
  // -------------------------------------------------------------------------
  describe('idempotent re-render', () => {
    it('two render() calls produce exactly one #progress-card', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_3K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      await ui.render();
      expect(doc.querySelectorAll('#progress-card').length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Remaining distance units
  // -------------------------------------------------------------------------
  describe('remaining distance formatting', () => {
    it('remaining < 1 km → hint shows integer meters, not km', async () => {
      const doc = buildDoc();
      // 5000 target, 4800 steps done → 200 remaining → ~152 m
      const goal = makeGoal(GOAL_5K);
      const db = makeDb({ effective_steps: 4800, effective_distance_km: 3.66 });
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const hint = doc.querySelector('.remaining-hint');
      expect(hint.textContent).toContain('meters');
      expect(hint.textContent).not.toContain(' km');
    });

    it('remaining ≥ 1 km → hint shows X.XX km, not meters', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_5K);
      const db = makeDb({ effective_steps: 3200, effective_distance_km: 2.44 });
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const hint = doc.querySelector('.remaining-hint');
      expect(hint.textContent).toContain('km');
      expect(hint.textContent).not.toContain('meters');
    });
  });

  // -------------------------------------------------------------------------
  // Fail-open: getTodayRecord rejects
  // -------------------------------------------------------------------------
  describe('fail-open: getTodayRecord rejects', () => {
    it('calls console.error("[progress]", err) and reporter.db(…)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const doc = buildDoc();
      const goal = makeGoal(GOAL_3K);
      const db = makeDb(new Error('DB read failed'), /* shouldReject */ true);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await expect(ui.render()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('[progress]', expect.any(Error));
      expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('renders zero-state #progress-card on failure', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const doc = buildDoc();
      const goal = makeGoal(GOAL_3K);
      const db = makeDb(new Error('DB read failed'), true);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const card = doc.getElementById('progress-card');
      expect(card).not.toBeNull();
      // zero state: 0 steps
      expect(card.innerHTML).toContain('0%');
    });
  });

  // -------------------------------------------------------------------------
  // Fail-open: getActiveGoal rejects
  // -------------------------------------------------------------------------
  describe('fail-open: getActiveGoal rejects', () => {
    it('calls console.error("[progress]", err) and reporter.db(…)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const doc = buildDoc();
      const goal = makeGoal(new Error('Goal read failed'), /* shouldReject */ true);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await expect(ui.render()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('[progress]', expect.any(Error));
      expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('renders zero-state #progress-card on getActiveGoal failure', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const doc = buildDoc();
      const goal = makeGoal(new Error('Goal read failed'), true);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.getElementById('progress-card')).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Task 4: Goal Selector
  // -------------------------------------------------------------------------
  describe('goal selector — structure', () => {
    it('render() injects #goal-selector after the card', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_3K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.getElementById('goal-selector')).not.toBeNull();
    });

    it('four preset buttons with data-goal-preset 1,3,5,10 are present', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_3K);
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
      const goal = makeGoal(GOAL_3K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      expect(doc.getElementById('goal-input')).not.toBeNull();
      expect(doc.querySelector('[data-goal-apply]')).not.toBeNull();
      expect(doc.getElementById('goal-error')).not.toBeNull();
    });

    it('no onclick= attributes in #goal-selector HTML', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_3K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      const selector = doc.getElementById('goal-selector');
      expect(selector.innerHTML).not.toMatch(/onclick=/);
    });
  });

  describe('goal selector — preset click', () => {
    it('clicking preset "3 km" calls setActiveGoal(3) exactly once', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_3K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      const btn = doc.querySelector('[data-goal-preset="3"]');
      btn.click();
      // allow microtasks to settle
      await new Promise(r => setTimeout(r, 0));

      expect(goalObj.setActiveGoal).toHaveBeenCalledWith(3);
      expect(goalObj.setActiveGoal).toHaveBeenCalledTimes(1);
    });

    it('clicking preset "5 km" calls setActiveGoal(5)', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_5K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      doc.querySelector('[data-goal-preset="5"]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(goalObj.setActiveGoal).toHaveBeenCalledWith(5);
    });

    it('clicking preset "1 km" calls setActiveGoal(1)', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_3K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      doc.querySelector('[data-goal-preset="1"]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(goalObj.setActiveGoal).toHaveBeenCalledWith(1);
    });

    it('clicking preset "10 km" calls setActiveGoal(10)', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_3K);
      goalObj.setActiveGoal = vi.fn().mockResolvedValue(undefined);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      doc.querySelector('[data-goal-preset="10"]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(goalObj.setActiveGoal).toHaveBeenCalledWith(10);
    });

    it('preset click triggers re-render (card shows new target after preset)', async () => {
      const doc = buildDoc();
      // getActiveGoal returns 3K goal initially, then 5K after preset click
      const getActiveGoalFn = vi.fn()
        .mockResolvedValueOnce(GOAL_3K)
        .mockResolvedValue(GOAL_5K);
      const goalObj = {
        getActiveGoal: getActiveGoalFn,
        setActiveGoal: vi.fn().mockResolvedValue(undefined),
      };
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      doc.querySelector('[data-goal-preset="5"]').click();
      await new Promise(r => setTimeout(r, 20));

      const unitEl = doc.querySelector('.metric-unit');
      expect(unitEl.textContent).toContain('5,000 steps');
    });
  });

  describe('goal selector — custom input (valid)', () => {
    it('valid input "4.5" + apply calls setActiveGoal(4.5) and clears #goal-error', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_3K);
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
        const goalObj = makeGoal(GOAL_3K);
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
      const goalObj = makeGoal(GOAL_3K);
      goalObj.setActiveGoal = vi.fn().mockRejectedValue(new TypeError('bad value'));
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      doc.querySelector('[data-goal-preset="3"]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(doc.getElementById('goal-error').textContent).toBe(
        '⚠️ Enter a distance greater than 0'
      );
    });

    it('setActiveGoal throwing is caught and shown in #goal-error (apply path)', async () => {
      const doc = buildDoc();
      const goalObj = makeGoal(GOAL_3K);
      goalObj.setActiveGoal = vi.fn().mockRejectedValue(new TypeError('bad value'));
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goalObj, db, reporter);
      await ui.render();

      doc.getElementById('goal-input').value = '4.5';
      doc.querySelector('[data-goal-apply]').click();
      await new Promise(r => setTimeout(r, 0));

      expect(doc.getElementById('goal-error').textContent).toBe(
        '⚠️ Enter a distance greater than 0'
      );
    });
  });

  describe('goal selector — idempotent re-render', () => {
    it('two render() calls produce exactly one #goal-selector', async () => {
      const doc = buildDoc();
      const goal = makeGoal(GOAL_3K);
      const db = makeDb(null);
      const reporter = { db: vi.fn() };

      const ui = createProgressUI(doc, goal, db, reporter);
      await ui.render();
      await ui.render();
      expect(doc.querySelectorAll('#goal-selector').length).toBe(1);
    });

    it('stale listeners not accumulated: preset on re-rendered selector fires render once', async () => {
      const doc = buildDoc();
      const getActiveGoalFn = vi.fn().mockResolvedValue(GOAL_3K);
      const goalObj = {
        getActiveGoal: getActiveGoalFn,
        setActiveGoal: vi.fn().mockResolvedValue(undefined),
      };
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
});
