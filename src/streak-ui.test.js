/**
 * Tests for src/streak-ui.js — the Today panel's five streak tiles.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createStreakUI } from './streak-ui.js';
import { DEFAULT_STEP_GOAL } from './goal.js';

const streakUiSource = fs.readFileSync(path.resolve(__dirname, 'streak-ui.js'), 'utf8');

const TILE_IDS = ['tile-strict', 'tile-lifetime', 'tile-tol99', 'tile-tol95', 'tile-best'];

function buildDoc() {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = TILE_IDS.map((id) => `<div id="${id}" class="stat-tile"></div>`).join('');
  return doc;
}

const ZERO_RESULT = {
  tolerance: { actual: 0, allowance95: 0, allowance99: 0, misses95: 0, misses99: 0 },
  hallOfFame: [],
  lifetime: { metDays: 0, totalDays: 0, pct: 0 },
  activeStepGoal: DEFAULT_STEP_GOAL,
};

const RESULT = {
  tolerance: { actual: 1, allowance95: 39, allowance99: 19, misses95: 1, misses99: 0 },
  hallOfFame: [
    { startDate: '2024-03-01', endDate: '2024-03-11', days: 11 },
    { startDate: '2025-01-02', endDate: '2025-01-11', days: 10 },
  ],
  lifetime: { metDays: 488, totalDays: 900, pct: 54.22 },
  activeStepGoal: DEFAULT_STEP_GOAL,
};

async function renderWith(result, doc = buildDoc()) {
  const ui = createStreakUI(doc, { compute: vi.fn().mockResolvedValue(result) }, { db: vi.fn() });
  await ui.render();
  return doc;
}

function tile(doc, id) {
  const el = doc.getElementById(id);
  const part = (name) => el.querySelector(`.stat-tile__${name}`)?.textContent;
  return { label: part('label'), value: part('value'), sub: part('sub'), el };
}

afterEach(() => vi.restoreAllMocks());

describe('streak-ui.js — source', () => {
  it('uses no innerHTML', () => {
    expect(streakUiSource).not.toMatch(/innerHTML/);
  });
});

describe('streak tiles', () => {
  it('Strict streak: the 100% run, with its rule', async () => {
    const t = tile(await renderWith(RESULT), 'tile-strict');
    expect(t).toMatchObject({ label: 'Strict', value: '1 day', sub: 'every day at 100%' });
  });

  it('pluralises days', async () => {
    const t = tile(await renderWith({ ...RESULT, tolerance: { ...RESULT.tolerance, actual: 12 } }), 'tile-strict');
    expect(t.value).toBe('12 days');
  });

  it('99% and 95% tolerance: day counts and the misses they used', async () => {
    const doc = await renderWith(RESULT);
    expect(tile(doc, 'tile-tol99')).toMatchObject({ label: '99% tol', value: '19 days', sub: '0 misses used' });
    expect(tile(doc, 'tile-tol95')).toMatchObject({ label: '95% tol', value: '39 days', sub: '1 miss used' });
  });

  it('marks a tolerance tile that used no misses as clean', async () => {
    const doc = await renderWith(RESULT);
    expect(doc.querySelector('#tile-tol99 .stat-tile__sub').classList.contains('stat-tile__sub--good')).toBe(true);
    expect(doc.querySelector('#tile-tol95 .stat-tile__sub').classList.contains('stat-tile__sub--good')).toBe(false);
  });

  it('Lifetime: share of days on goal, and the counts', async () => {
    const t = tile(await renderWith(RESULT), 'tile-lifetime');
    expect(t).toMatchObject({ label: 'Lifetime', value: '54%', sub: '488 of 900 days' });
  });

  it('Best run: the longest strict run, its goal and its year span', async () => {
    const t = tile(await renderWith(RESULT), 'tile-best');
    expect(t).toMatchObject({ label: 'Best run', value: '11 days', sub: 'at 10k · 2024' });
  });

  it('Best run spanning years shows the span', async () => {
    const result = { ...RESULT, hallOfFame: [{ startDate: '2025-12-20', endDate: '2026-01-05', days: 17 }] };
    expect(tile(await renderWith(result), 'tile-best').sub).toBe('at 10k · 2025–2026');
  });

  it('Best run uses the active goal, e.g. 8.5k', async () => {
    const result = { ...RESULT, activeStepGoal: 8500 };
    expect(tile(await renderWith(result), 'tile-best').sub).toBe('at 8.5k · 2024');
  });

  it('no qualifying run yet', async () => {
    const t = tile(await renderWith(ZERO_RESULT), 'tile-best');
    expect(t).toMatchObject({ value: '—', sub: 'no run yet' });
  });

  it('zero state reads sensibly', async () => {
    const doc = await renderWith(ZERO_RESULT);
    expect(tile(doc, 'tile-strict').value).toBe('0 days');
    expect(tile(doc, 'tile-lifetime')).toMatchObject({ value: '0%', sub: '0 of 0 days' });
  });

  it('uses no emoji', async () => {
    const doc = await renderWith(RESULT);
    expect(doc.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('robustness', () => {
  it('re-rendering replaces tile content', async () => {
    const doc = buildDoc();
    const ui = createStreakUI(doc, { compute: vi.fn().mockResolvedValue(RESULT) }, { db: vi.fn() });
    await ui.render();
    await ui.render();
    for (const id of TILE_IDS) {
      expect(doc.getElementById(id).querySelectorAll('.stat-tile__value'), id).toHaveLength(1);
    }
  });

  it('missing tiles are skipped without throwing', async () => {
    const doc = document.implementation.createHTMLDocument('test');
    doc.body.innerHTML = '<div id="tile-strict"></div>';
    await expect(renderWith(RESULT, doc)).resolves.toBeDefined();
    expect(tile(doc, 'tile-strict').value).toBe('1 day');
  });

  it('a failed compute logs, reports and renders the zero state', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const doc = buildDoc();
    const reporter = { db: vi.fn() };
    const err = new Error('boom');
    const ui = createStreakUI(doc, { compute: vi.fn().mockRejectedValue(err) }, reporter);
    await expect(ui.render()).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith('[streak]', err);
    expect(reporter.db).toHaveBeenCalledWith('❌ Streak load failed');
    expect(tile(doc, 'tile-strict').value).toBe('0 days');
  });

  it('tolerates a result without lifetime or hall of fame', async () => {
    const doc = await renderWith({ tolerance: RESULT.tolerance, activeStepGoal: 10000 });
    expect(tile(doc, 'tile-lifetime').value).toBe('0%');
    expect(tile(doc, 'tile-best').value).toBe('—');
  });
});
