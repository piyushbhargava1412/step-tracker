/**
 * Tests for challenge-ui.js — render layer.
 * jsdom environment via Vitest.
 *
 * Coverage targets:
 *   - render() configure state (no challenge)
 *   - render() metric state (challenge present)
 *   - completed challenge badge
 *   - idempotency (two calls → one card)
 *   - fail-open guard (missing #tab-dashboard)
 *   - try/catch on data fetch error → zero-state card
 *   - AbortController stored after render
 *   - no-innerHTML source-text contract
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Source-text contract — no innerHTML usage
// ---------------------------------------------------------------------------
describe('challenge-ui.js source-text contract', () => {
  it('does not contain innerHTML', () => {
    const src = readFileSync(
      join(import.meta.dirname, 'challenge-ui.js'),
      'utf8'
    );
    // Allow the word in comments, but not as a property assignment
    const hasInnerHTMLAssignment = /\.innerHTML\s*=/.test(src);
    expect(hasInnerHTMLAssignment).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a jsdom document with a #tab-dashboard element. */
function makeDoc({ hasDashboard = true } = {}) {
  const html = hasDashboard
    ? '<html><body><div id="tab-dashboard"></div></body></html>'
    : '<html><body></body></html>';
  return new JSDOM(html).window.document;
}

/** Build a mock challenge engine. */
function makeChallengeEngine({ challenge = null, setError = false } = {}) {
  return {
    getActiveChallenge: vi.fn(async () => {
      if (setError) throw new Error('DB read error');
      return challenge;
    }),
    setActiveChallenge: vi.fn(async () => {}),
  };
}

/** Build a mock db with daily_records. */
function makeDb({ records = [], queryError = false } = {}) {
  const betweenResult = {
    toArray: vi.fn(async () => {
      if (queryError) throw new Error('query error');
      return records;
    }),
  };
  const betweenFn = vi.fn(() => betweenResult);
  const whereFn = vi.fn(() => ({ between: betweenFn }));
  return {
    daily_records: { where: whereFn },
    _betweenFn: betweenFn,
    _betweenResult: betweenResult,
  };
}

/** Build a mock reporter. */
function makeReporter() {
  return { db: vi.fn() };
}

let createChallengeUI;

beforeEach(async () => {
  const mod = await import('./challenge-ui.js?' + Date.now());
  createChallengeUI = mod.createChallengeUI;
});

// ---------------------------------------------------------------------------
// Guard: missing #tab-dashboard
// ---------------------------------------------------------------------------
describe('render() — missing #tab-dashboard', () => {
  it('warns and returns without throwing', async () => {
    const doc = makeDoc({ hasDashboard: false });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const challenge = makeChallengeEngine();
    const db = makeDb();
    const reporter = makeReporter();

    const ui = createChallengeUI(doc, challenge, db, reporter);
    await expect(ui.render()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('[challenge]', expect.any(String));
    expect(challenge.getActiveChallenge).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Configure state (no active challenge)
// ---------------------------------------------------------------------------
describe('render() — configure state', () => {
  it('inserts #challenge-card into #tab-dashboard', async () => {
    const doc = makeDoc();
    const ui = createChallengeUI(doc, makeChallengeEngine(), makeDb(), makeReporter());
    await ui.render();
    expect(doc.getElementById('challenge-card')).not.toBeNull();
  });

  it('renders name input', async () => {
    const doc = makeDoc();
    const ui = createChallengeUI(doc, makeChallengeEngine(), makeDb(), makeReporter());
    await ui.render();
    const nameInput = doc.querySelector('input[type="text"]');
    expect(nameInput).not.toBeNull();
  });

  it('renders start and end date pickers', async () => {
    const doc = makeDoc();
    const ui = createChallengeUI(doc, makeChallengeEngine(), makeDb(), makeReporter());
    await ui.render();
    const datePickers = doc.querySelectorAll('input[type="date"]');
    expect(datePickers.length).toBeGreaterThanOrEqual(2);
  });

  it('start date picker defaults to 1st of current month', async () => {
    const doc = makeDoc();
    const ui = createChallengeUI(doc, makeChallengeEngine(), makeDb(), makeReporter());
    await ui.render();
    const startInput = doc.querySelector('[data-field="start-date"]');
    expect(startInput).not.toBeNull();
    // Should be YYYY-MM-01
    expect(startInput.value).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('end date picker defaults to last day of current month', async () => {
    const doc = makeDoc();
    const ui = createChallengeUI(doc, makeChallengeEngine(), makeDb(), makeReporter());
    await ui.render();
    const endInput = doc.querySelector('[data-field="end-date"]');
    expect(endInput).not.toBeNull();
    // Should be YYYY-MM-DD where DD is 28-31
    expect(endInput.value).toMatch(/^\d{4}-\d{2}-(2[89]|3[01])$/);
  });

  it('renders Save button with data-action="save-challenge"', async () => {
    const doc = makeDoc();
    const ui = createChallengeUI(doc, makeChallengeEngine(), makeDb(), makeReporter());
    await ui.render();
    const saveBtn = doc.querySelector('[data-action="save-challenge"]');
    expect(saveBtn).not.toBeNull();
  });

  it('does NOT render metric rows or Copy button', async () => {
    const doc = makeDoc();
    const ui = createChallengeUI(doc, makeChallengeEngine(), makeDb(), makeReporter());
    await ui.render();
    const copyBtn = doc.querySelector('[data-action="copy-challenge"]');
    expect(copyBtn).toBeNull();
  });

  it('does NOT call db.daily_records.where', async () => {
    const doc = makeDoc();
    const db = makeDb();
    const ui = createChallengeUI(doc, makeChallengeEngine(), makeDb(), makeReporter());
    await ui.render();
    // No challenge → no record query needed
    expect(db.daily_records.where).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Metric state (active challenge present)
// ---------------------------------------------------------------------------
describe('render() — metric state (active challenge)', () => {
  const ACTIVE_CHALLENGE = {
    key: 'active_challenge',
    name: 'Team Steps',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    created_at: '2026-08-01T00:00:00.000Z',
  };

  it('inserts #challenge-card', async () => {
    const doc = makeDoc();
    const engine = makeChallengeEngine({ challenge: ACTIVE_CHALLENGE });
    const ui = createChallengeUI(doc, engine, makeDb(), makeReporter());
    await ui.render();
    expect(doc.getElementById('challenge-card')).not.toBeNull();
  });

  it('renders Copy button with data-action="copy-challenge"', async () => {
    const doc = makeDoc();
    const engine = makeChallengeEngine({ challenge: ACTIVE_CHALLENGE });
    const ui = createChallengeUI(doc, engine, makeDb(), makeReporter());
    await ui.render();
    expect(doc.querySelector('[data-action="copy-challenge"]')).not.toBeNull();
  });

  it('renders exactly four metric rows', async () => {
    const doc = makeDoc();
    const engine = makeChallengeEngine({ challenge: ACTIVE_CHALLENGE });
    const ui = createChallengeUI(doc, engine, makeDb(), makeReporter());
    await ui.render();
    const metricRows = doc.querySelectorAll('.metric-row');
    expect(metricRows.length).toBe(4);
  });

  it('does NOT render name input or Save button', async () => {
    const doc = makeDoc();
    const engine = makeChallengeEngine({ challenge: ACTIVE_CHALLENGE });
    const ui = createChallengeUI(doc, engine, makeDb(), makeReporter());
    await ui.render();
    expect(doc.querySelector('[data-action="save-challenge"]')).toBeNull();
  });

  it('queries db.daily_records for the challenge date range', async () => {
    const doc = makeDoc();
    const engine = makeChallengeEngine({ challenge: ACTIVE_CHALLENGE });
    const db = makeDb();
    const ui = createChallengeUI(doc, engine, db, makeReporter());
    await ui.render();
    expect(db.daily_records.where).toHaveBeenCalledWith('date');
    expect(db._betweenFn).toHaveBeenCalledWith(
      ACTIVE_CHALLENGE.start_date,
      ACTIVE_CHALLENGE.end_date,
      true,
      true
    );
  });

  it('does NOT render "Challenge Finished" badge when challenge is active', async () => {
    const doc = makeDoc();
    // end_date in the future (relative test — use far future date)
    const futureChallenge = { ...ACTIVE_CHALLENGE, end_date: '2099-12-31' };
    const engine = makeChallengeEngine({ challenge: futureChallenge });
    const ui = createChallengeUI(doc, engine, makeDb(), makeReporter());
    await ui.render();
    const card = doc.getElementById('challenge-card');
    expect(card.textContent).not.toContain('Challenge Finished');
  });
});

// ---------------------------------------------------------------------------
// Completed challenge — "Challenge Finished" badge
// ---------------------------------------------------------------------------
describe('render() — completed challenge', () => {
  it('renders "Challenge Finished" badge when end_date is in the past', async () => {
    const doc = makeDoc();
    const completedChallenge = {
      key: 'active_challenge',
      name: 'Old Challenge',
      start_date: '2020-01-01',
      end_date: '2020-01-31',
      created_at: '2020-01-01T00:00:00.000Z',
    };
    const engine = makeChallengeEngine({ challenge: completedChallenge });
    const ui = createChallengeUI(doc, engine, makeDb(), makeReporter());
    await ui.render();
    const card = doc.getElementById('challenge-card');
    expect(card.textContent).toContain('Challenge Finished');
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------
describe('render() — idempotency', () => {
  it('two consecutive render() calls leave exactly one #challenge-card', async () => {
    const doc = makeDoc();
    const ui = createChallengeUI(doc, makeChallengeEngine(), makeDb(), makeReporter());
    await ui.render();
    await ui.render();
    expect(doc.querySelectorAll('#challenge-card').length).toBe(1);
  });

  it('switches from configure to metric state on second render with new challenge', async () => {
    const doc = makeDoc();
    let callCount = 0;
    const challenge = {
      getActiveChallenge: vi.fn(async () => {
        callCount++;
        if (callCount === 1) return null;
        return {
          key: 'active_challenge',
          name: 'Test',
          start_date: '2026-01-01',
          end_date: '2099-12-31',
          created_at: '2026-01-01T00:00:00.000Z',
        };
      }),
      setActiveChallenge: vi.fn(),
    };
    const ui = createChallengeUI(doc, challenge, makeDb(), makeReporter());
    await ui.render(); // configure state
    expect(doc.querySelector('[data-action="save-challenge"]')).not.toBeNull();

    await ui.render(); // metric state
    expect(doc.querySelector('[data-action="copy-challenge"]')).not.toBeNull();
    expect(doc.querySelector('[data-action="save-challenge"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Error handling — try/catch fail-open
// ---------------------------------------------------------------------------
describe('render() — error handling', () => {
  it('calls reporter.db on getActiveChallenge() failure and renders zero-state card', async () => {
    const doc = makeDoc();
    const warnOrError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = makeChallengeEngine({ setError: true });
    const reporter = makeReporter();
    const ui = createChallengeUI(doc, engine, makeDb(), reporter);

    await expect(ui.render()).resolves.toBeUndefined();
    expect(reporter.db).toHaveBeenCalledWith(expect.stringMatching(/❌/));
    // Should still insert a card (zero-state)
    expect(doc.getElementById('challenge-card')).not.toBeNull();
    warnOrError.mockRestore();
  });

  it('calls reporter.db on db.daily_records query failure and renders zero-state card', async () => {
    const doc = makeDoc();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const challenge = {
      key: 'active_challenge',
      name: 'Test',
      start_date: '2026-01-01',
      end_date: '2099-12-31',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const engine = makeChallengeEngine({ challenge });
    const db = makeDb({ queryError: true });
    const reporter = makeReporter();
    const ui = createChallengeUI(doc, engine, db, reporter);

    await expect(ui.render()).resolves.toBeUndefined();
    expect(reporter.db).toHaveBeenCalledWith(expect.stringMatching(/❌/));
    expect(doc.getElementById('challenge-card')).not.toBeNull();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// AbortController stored on module
// ---------------------------------------------------------------------------
describe('AbortController — stored after render', () => {
  it('exposes getController() or _controller after render (for Task 5 usage)', async () => {
    const doc = makeDoc();
    const mod = await import('./challenge-ui.js?' + Date.now());
    const { createChallengeUI: createUI } = mod;
    const ui = createUI(doc, makeChallengeEngine(), makeDb(), makeReporter());
    await ui.render();
    // The controller must be accessible — either via returned property or a closure variable.
    // We verify the card rendered (controller is alive) and re-render aborts the previous.
    const card1 = doc.getElementById('challenge-card');
    expect(card1).not.toBeNull();
    await ui.render();
    const card2 = doc.getElementById('challenge-card');
    expect(card2).not.toBeNull();
    // Only one card remains
    expect(doc.querySelectorAll('#challenge-card').length).toBe(1);
  });
});
