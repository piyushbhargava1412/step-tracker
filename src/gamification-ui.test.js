/**
 * gamification-ui.test.js — Tests for the gamification DOM renderer.
 *
 * TDD: tests are written before implementation.
 * Pattern: createGamificationUI(doc, engine, reporter) factory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGamificationUI } from './gamification-ui.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDoc() {
  // jsdom document is available via the vitest jsdom environment.
  // We create a minimal DOM with #tab-lab > #lab-gamification.
  document.body.innerHTML = `
    <div id="tab-lab">
      <div id="lab-gamification"></div>
    </div>
  `;
  return document;
}

function makeEngine(overrides = {}) {
  return {
    compute: vi.fn().mockResolvedValue({
      xp: 250,
      level: 6,
      levelLabel: 'Park Wanderer',
      achievements: {
        centurion: true,
        marathoner: false,
        unstoppable: false,
        nightOwl: true,
      },
      ...overrides,
    }),
  };
}

function makeReporter() {
  return { db: vi.fn() };
}

// Level 6: levelFloor = 10 * (6-1)^2 = 250, nextLevelFloor = 10 * 6^2 = 360
// xp = 250, so progress = ((250 - 250) / (360 - 250) * 100) = 0
const LEVEL_6_XP = 250;
const LEVEL_6_FLOOR = 10 * (6 - 1) ** 2; // 250
const LEVEL_6_NEXT = 10 * 6 ** 2;         // 360
const LEVEL_6_PROGRESS_FLOAT =
  ((LEVEL_6_XP - LEVEL_6_FLOOR) / (LEVEL_6_NEXT - LEVEL_6_FLOOR)) * 100; // 0

/** Parse a CSS percentage string like '42.7%' or '42%' into a number. */
function parsePct(widthStr) {
  return parseFloat(widthStr.replace('%', ''));
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('createGamificationUI', () => {
  let doc, engine, reporter, ui;

  beforeEach(() => {
    doc = makeDoc();
    engine = makeEngine();
    reporter = makeReporter();
    ui = createGamificationUI(doc, engine, reporter);
  });

  // ── Happy Path: normal render ─────────────────────────────────────────────

  it('render() builds .rpg-level-card in the container', async () => {
    await ui.render();
    const container = doc.getElementById('lab-gamification');
    expect(container.querySelector('.rpg-level-card')).not.toBeNull();
  });

  it('level card shows correct rank label via textContent', async () => {
    await ui.render();
    const card = doc.querySelector('.rpg-level-card');
    expect(card.textContent).toContain('Park Wanderer');
  });

  it('level card shows correct level number via textContent', async () => {
    await ui.render();
    const card = doc.querySelector('.rpg-level-card');
    expect(card.textContent).toContain('6');
  });

  it('level card shows XP total via textContent', async () => {
    await ui.render();
    const card = doc.querySelector('.rpg-level-card');
    expect(card.textContent).toContain('250');
  });

  it('progress bar inner div style.width matches XP-to-next-level formula', async () => {
    await ui.render();
    const bar = doc.querySelector('.rpg-progress-bar');
    expect(bar).not.toBeNull();
    const inner = bar.firstElementChild;
    expect(inner).not.toBeNull();
    // jsdom normalizes CSS values (e.g. '0.0%' → '0%'); compare float value
    expect(parsePct(inner.style.width)).toBeCloseTo(LEVEL_6_PROGRESS_FLOAT, 1);
  });

  it('render() builds .trophy-grid with four .trophy-card children', async () => {
    await ui.render();
    const grid = doc.querySelector('.trophy-grid');
    expect(grid).not.toBeNull();
    expect(grid.querySelectorAll('.trophy-card').length).toBe(4);
  });

  it('unlocked trophy tile does not carry .trophy-card--locked', async () => {
    // centurion is true in the default mock
    await ui.render();
    const cards = [...doc.querySelectorAll('.trophy-card')];
    const centurion = cards.find((c) => c.textContent.includes('Centurion'));
    expect(centurion).not.toBeNull();
    expect(centurion.classList.contains('trophy-card--locked')).toBe(false);
  });

  it('locked trophy tile carries .trophy-card--locked', async () => {
    // marathoner is false in the default mock
    await ui.render();
    const cards = [...doc.querySelectorAll('.trophy-card')];
    const marathoner = cards.find((c) => c.textContent.includes('Marathoner'));
    expect(marathoner).not.toBeNull();
    expect(marathoner.classList.contains('trophy-card--locked')).toBe(true);
  });

  it('trophy card text is set via textContent (no innerHTML)', async () => {
    // Inject XSS payload via engine
    engine.compute.mockResolvedValueOnce({
      xp: 100,
      level: 4,
      levelLabel: '<script>alert(1)</script>',
      achievements: {
        centurion: false,
        marathoner: false,
        unstoppable: false,
        nightOwl: false,
      },
    });
    await ui.render();
    // The script tag should appear as literal text, not as an injected element
    expect(doc.querySelector('script')).toBeNull();
  });

  it('trophy definitions include correct emoji, title, and description', async () => {
    await ui.render();
    const container = doc.getElementById('lab-gamification');
    const text = container.textContent;
    expect(text).toContain('🏆');
    expect(text).toContain('Centurion');
    expect(text).toContain('Walk 100,000+ steps in a single ISO week');
    expect(text).toContain('🦸');
    expect(text).toContain('Marathoner');
    expect(text).toContain('Walk 55,000+ steps in a single day');
    expect(text).toContain('🔥');
    expect(text).toContain('Unstoppable');
    expect(text).toContain('Maintain a 30-day step streak');
    expect(text).toContain('🦉');
    expect(text).toContain('Night Owl');
    expect(text).toContain('Walk 2,000+ steps across midnight (11 PM–3 AM)');
  });

  // ── Edge Case: MAX level ──────────────────────────────────────────────────

  it('MAX level label shows "(MAX)" suffix in level card', async () => {
    engine = makeEngine({
      xp: 999_999,
      level: 50,
      levelLabel: 'Globe Trotter (MAX)',
      achievements: {
        centurion: true,
        marathoner: true,
        unstoppable: true,
        nightOwl: true,
      },
    });
    ui = createGamificationUI(doc, engine, reporter);
    await ui.render();
    const card = doc.querySelector('.rpg-level-card');
    expect(card.textContent).toContain('(MAX)');
  });

  it('MAX level progress bar is clamped to 100%', async () => {
    engine.compute = vi.fn().mockResolvedValue({
      xp: 999_999,
      level: 50,
      levelLabel: 'Globe Trotter (MAX)',
      achievements: {
        centurion: true,
        marathoner: true,
        unstoppable: true,
        nightOwl: true,
      },
    });
    ui = createGamificationUI(doc, engine, reporter);
    await ui.render();
    const bar = doc.querySelector('.rpg-progress-bar');
    const inner = bar.firstElementChild;
    // jsdom normalizes; compare float value
    expect(parsePct(inner.style.width)).toBeCloseTo(100, 1);
  });

  // ── Edge Case: progress bar mid-level ────────────────────────────────────

  it('progress bar reflects mid-level xp correctly', async () => {
    // Level 3: floor = 10*(2^2) = 40, next = 10*(3^2) = 90, xp = 65
    // progress = ((65-40)/(90-40)*100) = 50.0
    const xp = 65;
    const level = 3;
    const levelFloor = 10 * (level - 1) ** 2; // 40
    const nextFloor = 10 * level ** 2;          // 90
    const expectedPct = ((xp - levelFloor) / (nextFloor - levelFloor)) * 100; // 50

    engine.compute = vi.fn().mockResolvedValue({
      xp,
      level,
      levelLabel: 'Weekend Walker',
      achievements: {
        centurion: false,
        marathoner: false,
        unstoppable: false,
        nightOwl: false,
      },
    });
    ui = createGamificationUI(doc, engine, reporter);
    await ui.render();
    const bar = doc.querySelector('.rpg-progress-bar');
    const inner = bar.firstElementChild;
    // jsdom normalizes; compare float value
    expect(parsePct(inner.style.width)).toBeCloseTo(expectedPct, 1);
  });

  // ── Error Case ────────────────────────────────────────────────────────────

  it('engine compute() throws → reporter.db called with error message', async () => {
    engine.compute = vi.fn().mockRejectedValue(new Error('DB failure'));
    ui = createGamificationUI(doc, engine, reporter);
    await ui.render();
    expect(reporter.db).toHaveBeenCalledWith('⚠️ Could not render Gamification');
  });

  it('engine compute() throws → error <p> injected into container', async () => {
    engine.compute = vi.fn().mockRejectedValue(new Error('DB failure'));
    ui = createGamificationUI(doc, engine, reporter);
    await ui.render();
    const container = doc.getElementById('lab-gamification');
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('engine compute() throws → no rpg-level-card in container', async () => {
    engine.compute = vi.fn().mockRejectedValue(new Error('DB failure'));
    ui = createGamificationUI(doc, engine, reporter);
    await ui.render();
    const container = doc.getElementById('lab-gamification');
    expect(container.querySelector('.rpg-level-card')).toBeNull();
  });

  // ── Happy Path: idempotency ───────────────────────────────────────────────

  it('render() called twice does not duplicate level card', async () => {
    await ui.render();
    await ui.render();
    const container = doc.getElementById('lab-gamification');
    expect(container.querySelectorAll('.rpg-level-card').length).toBe(1);
  });

  it('render() called twice leaves exactly 4 trophy tiles', async () => {
    await ui.render();
    await ui.render();
    expect(doc.querySelectorAll('.trophy-card').length).toBe(4);
  });

  // ── Fallback container ────────────────────────────────────────────────────

  it('render() creates fallback container when #lab-gamification is missing', async () => {
    document.body.innerHTML = '<div id="tab-lab"></div>';
    ui = createGamificationUI(doc, engine, reporter);
    await ui.render();
    const tabLab = doc.getElementById('tab-lab');
    expect(tabLab.querySelector('.rpg-level-card')).not.toBeNull();
  });

  it('render() does not throw when both #tab-lab and #lab-gamification are missing', async () => {
    document.body.innerHTML = '';
    ui = createGamificationUI(doc, engine, reporter);
    await expect(ui.render()).resolves.not.toThrow();
  });

  // ── Task 14: CSS class fix ────────────────────────────────────────────────

  it('progress bar fill element carries class rpg-progress-bar__fill', async () => {
    await ui.render();
    const fill = doc.querySelector('.rpg-progress-bar__fill');
    expect(fill).not.toBeNull();
  });
});
