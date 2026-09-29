import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createProgressUI, RING_CIRCUMFERENCE, RING_SIZE, RING_RADIUS, RING_STROKE } from './progress-ui.js';

const progressUiSource = fs.readFileSync(path.resolve(__dirname, 'progress-ui.js'), 'utf8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** jsdom document with the Today screen's progress mount and Distance tile. */
function buildDoc() {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = '<div id="today-progress"></div><div id="tile-distance" class="stat-tile"></div>';
  return doc;
}

const GOAL_10K = 10000;
const GOAL_4K = 4000;

function makeGoal(stepGoalOrError, shouldReject = false) {
  return {
    getActiveStepGoal: shouldReject
      ? vi.fn().mockRejectedValue(stepGoalOrError)
      : vi.fn().mockResolvedValue(stepGoalOrError),
    setActiveStepGoal: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDb(recordOrError, shouldReject = false) {
  return {
    daily_records: {
      get: shouldReject
        ? vi.fn().mockRejectedValue(recordOrError)
        : vi.fn().mockResolvedValue(recordOrError),
    },
  };
}

async function renderWith(record, goalValue = GOAL_10K, doc = buildDoc()) {
  const ui = createProgressUI(doc, makeGoal(goalValue), makeDb(record), { db: vi.fn() });
  await ui.render();
  return doc;
}

const text = (doc, selector) => doc.querySelector(selector)?.textContent;
const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('progress-ui.js — no innerHTML', () => {
  it('builds every node with createElement / textContent', () => {
    expect(progressUiSource).not.toMatch(/innerHTML/);
  });
});

describe('missing #today-progress', () => {
  it('warns and resolves without rendering', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = document.implementation.createHTMLDocument('test');
    const ui = createProgressUI(doc, makeGoal(GOAL_10K), makeDb(null), { db: vi.fn() });
    await expect(ui.render()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('[progress]', expect.any(String));
    expect(doc.querySelector('.ring')).toBeNull();
  });
});

describe('in progress (7,412 of 10,000 steps)', () => {
  const record = { effective_steps: 7412, effective_distance_km: 5.648 };

  it('shows the steps, the goal and the percentage inside the ring', async () => {
    const doc = await renderWith(record);
    expect(text(doc, '.ring__steps')).toBe('7,412');
    expect(text(doc, '.ring__goal')).toBe('of 10,000 steps');
    expect(text(doc, '.ring__pct')).toBe('74%');
  });

  it('exposes the ring as a progressbar', async () => {
    const doc = await renderWith(record);
    const ring = doc.querySelector('.ring');
    expect(ring.getAttribute('role')).toBe('progressbar');
    expect(ring.getAttribute('aria-valuenow')).toBe('74');
    expect(ring.getAttribute('aria-valuemin')).toBe('0');
    expect(ring.getAttribute('aria-valuemax')).toBe('100');
    expect(ring.getAttribute('aria-label')).toBe("Today's steps toward your goal");
  });

  it('draws the ring arc in proportion to the percentage', async () => {
    const doc = await renderWith(record);
    const arc = doc.querySelector('.ring__fill');
    const expected = ((74 / 100) * RING_CIRCUMFERENCE).toFixed(1);
    expect(arc.getAttribute('stroke-dasharray')).toBe(`${expected} ${RING_CIRCUMFERENCE.toFixed(1)}`);
    expect(arc.classList.contains('ring__fill--full')).toBe(false);
  });

  it('says how many steps are left', async () => {
    const doc = await renderWith(record);
    expect(text(doc, '.remaining-hint')).toBe('2,588 steps to go');
    expect(doc.querySelector('.goal-met-badge')).toBeNull();
  });

  it('fills the Distance tile with today\'s distance', async () => {
    const doc = await renderWith(record);
    const tile = doc.getElementById('tile-distance');
    expect(text(tile, '.stat-tile__label')).toBe('Distance');
    expect(text(tile, '.stat-tile__value')).toBe('5.6 km');
    expect(text(tile, '.stat-tile__sub')).toBe('today');
    expect(text(tile, '.stat-tile__num')).toBe('5.6');
    expect(text(tile, '.stat-tile__unit')).toBe('km');
  });

  it('uses no emoji', async () => {
    const doc = await renderWith(record);
    expect(doc.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('another goal (2,500 of 4,000 steps)', () => {
  it('is data-driven', async () => {
    const doc = await renderWith({ effective_steps: 2500 }, GOAL_4K);
    expect(text(doc, '.ring__goal')).toBe('of 4,000 steps');
    expect(text(doc, '.ring__pct')).toBe('63%');
    expect(text(doc, '.remaining-hint')).toBe('1,500 steps to go');
  });
});

describe('goal met (12,000 of 10,000 steps)', () => {
  it('caps at 100%, closes the ring and says the goal is met', async () => {
    const doc = await renderWith({ effective_steps: 12000 });
    expect(text(doc, '.ring__steps')).toBe('12,000');
    expect(text(doc, '.ring__pct')).toBe('100%');
    expect(doc.querySelector('.ring').getAttribute('aria-valuenow')).toBe('100');
    expect(doc.querySelector('.ring__fill').classList.contains('ring__fill--full')).toBe(true);
    expect(text(doc, '.goal-met-badge')).toBe('Goal met');
    expect(doc.querySelector('.remaining-hint')).toBeNull();
  });
});

describe('no record yet today', () => {
  it('renders a zero ring and 0 km', async () => {
    const doc = await renderWith(null);
    expect(text(doc, '.ring__steps')).toBe('0');
    expect(text(doc, '.ring__pct')).toBe('0%');
    expect(text(doc, '#tile-distance .stat-tile__value')).toBe('0.0 km');
  });
});

describe('idempotent re-render', () => {
  it('replaces the panel content instead of stacking it', async () => {
    const doc = buildDoc();
    const ui = createProgressUI(doc, makeGoal(GOAL_10K), makeDb({ effective_steps: 10 }), { db: vi.fn() });
    await ui.render();
    await ui.render();
    await ui.render();
    expect(doc.querySelectorAll('.ring')).toHaveLength(1);
    expect(doc.querySelectorAll('#goal-select')).toHaveLength(1);
    expect(doc.querySelectorAll('#tile-distance .stat-tile__value')).toHaveLength(1);
  });
});

describe('fail-open', () => {
  it('a failed record read logs, reports and renders the zero state', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const doc = buildDoc();
    const reporter = { db: vi.fn() };
    const err = new Error('db down');
    const ui = createProgressUI(doc, makeGoal(GOAL_10K), makeDb(err, true), reporter);
    await ui.render();
    expect(errSpy).toHaveBeenCalledWith('[progress]', err);
    expect(reporter.db).toHaveBeenCalledWith('❌ Progress load failed');
    expect(text(doc, '.ring__goal')).toBe('of 10,000 steps');
    expect(text(doc, '.ring__steps')).toBe('0');
  });

  it('a failed goal read does the same', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const doc = buildDoc();
    const reporter = { db: vi.fn() };
    const ui = createProgressUI(doc, makeGoal(new Error('x'), true), makeDb(null), reporter);
    await ui.render();
    expect(reporter.db).toHaveBeenCalledWith('❌ Progress load failed');
    expect(doc.querySelector('.ring')).not.toBeNull();
  });
});

describe('goal chip (the step goal selector)', () => {
  it('is a labelled select with the four goals, preset to the active one', async () => {
    const doc = await renderWith({ effective_steps: 10 }, GOAL_4K);
    const select = doc.getElementById('goal-select');
    expect([...select.options].map((o) => o.value)).toEqual(['4000', '6000', '8500', '10000']);
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Goal 4k · ~3 km',
      'Goal 6k · ~5 km',
      'Goal 8.5k · ~7 km',
      'Goal 10k · ~8 km',
    ]);
    expect(select.value).toBe('4000');
    expect(select.closest('label.goal-chip')).not.toBeNull();
    expect(select.getAttribute('aria-label')).toBe('Daily step goal');
    expect(doc.getElementById('goal-error')).not.toBeNull();
  });

  it('changing it saves the goal as a number, re-renders, then notifies — in that order', async () => {
    const doc = buildDoc();
    const callOrder = [];
    const goalObj = makeGoal(GOAL_10K);
    goalObj.setActiveStepGoal = vi.fn(async () => { callOrder.push('setActiveStepGoal'); });
    goalObj.getActiveStepGoal = vi.fn().mockResolvedValueOnce(GOAL_10K).mockResolvedValue(6000);
    let goalTextAtCallback = null;
    const onGoalApplied = vi.fn(() => {
      callOrder.push('onGoalApplied');
      goalTextAtCallback = text(doc, '.ring__goal');
    });

    const ui = createProgressUI(doc, goalObj, makeDb(null), { db: vi.fn() }, onGoalApplied);
    await ui.render();
    const select = doc.getElementById('goal-select');
    select.value = '6000';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    expect(goalObj.setActiveStepGoal).toHaveBeenCalledWith(6000);
    expect(callOrder).toEqual(['setActiveStepGoal', 'onGoalApplied']);
    expect(goalTextAtCallback).toBe('of 6,000 steps');
  });

  it('a failed save shows the error and does not notify', async () => {
    const doc = buildDoc();
    const goalObj = makeGoal(GOAL_10K);
    goalObj.setActiveStepGoal = vi.fn().mockRejectedValue(new TypeError('bad value'));
    const onGoalApplied = vi.fn();
    const ui = createProgressUI(doc, goalObj, makeDb(null), { db: vi.fn() }, onGoalApplied);
    await ui.render();

    const select = doc.getElementById('goal-select');
    select.value = '4000';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    expect(doc.getElementById('goal-error').textContent).toBe('⚠️ Failed to save goal — please try again');
    expect(onGoalApplied).not.toHaveBeenCalled();
  });

  it('a throwing onGoalApplied is logged, not thrown', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const doc = buildDoc();
    const ui = createProgressUI(doc, makeGoal(GOAL_10K), makeDb(null), { db: vi.fn() }, () => { throw new Error('boom'); });
    await ui.render();
    const select = doc.getElementById('goal-select');
    select.value = '8500';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(errSpy).toHaveBeenCalledWith('[progress]', expect.any(Error));
  });

  it('re-rendering does not accumulate change listeners', async () => {
    const doc = buildDoc();
    const goalObj = makeGoal(GOAL_10K);
    const ui = createProgressUI(doc, goalObj, makeDb(null), { db: vi.fn() });
    await ui.render();
    await ui.render();
    const select = doc.getElementById('goal-select');
    select.value = '6000';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(goalObj.setActiveStepGoal).toHaveBeenCalledTimes(1);
  });

  it('works without an onGoalApplied callback', async () => {
    const doc = buildDoc();
    const ui = createProgressUI(doc, makeGoal(GOAL_10K), makeDb(null), { db: vi.fn() });
    await ui.render();
    const select = doc.getElementById('goal-select');
    select.value = '6000';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await expect(tick()).resolves.toBeUndefined();
  });
});

describe('ST-023: goal chip for a viewer', () => {
  it('shows the goal but cannot change it', async () => {
    const doc = buildDoc();
    const goal = makeGoal(GOAL_10K);
    const ui = createProgressUI(doc, goal, makeDb({ effective_steps: 10 }), { db: vi.fn() }, () => {}, { canEdit: false });
    await ui.render();
    const select = doc.getElementById('goal-select');
    expect(select.disabled).toBe(true);
    expect(select.value).toBe(String(GOAL_10K));
  });

  it('editors can change it (the default)', async () => {
    const doc = await renderWith({ effective_steps: 10 });
    expect(doc.getElementById('goal-select').disabled).toBe(false);
  });
});

describe('ring geometry — room for a six-digit day (999,999)', () => {
  it('draws a thin stroke that stays inside the ring', () => {
    expect(RING_STROKE).toBeLessThanOrEqual(10);
    expect(RING_RADIUS + RING_STROKE / 2).toBeLessThanOrEqual(RING_SIZE / 2);
  });

  it('leaves at least 200px inside the stroke for the numbers', () => {
    expect(2 * (RING_RADIUS - RING_STROKE / 2)).toBeGreaterThanOrEqual(200);
  });

  it('scales from its viewBox, so a narrow screen shrinks the whole ring', async () => {
    const doc = await renderWith({ effective_steps: 999999 });
    const svg = doc.querySelector('.ring__svg');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${RING_SIZE} ${RING_SIZE}`);
    for (const circle of doc.querySelectorAll('.ring__svg circle')) {
      expect(circle.getAttribute('stroke-width')).toBe(String(RING_STROKE));
      expect(circle.getAttribute('r')).toBe(String(RING_RADIUS));
    }
    expect(doc.querySelector('.ring__steps').textContent).toBe('999,999');
  });
});
