/**
 * styles.css — the mobile design contract.
 *
 * Guards the pieces the app depends on (the Deep Blue palette, `hidden`
 * winning over layout rules, the app bar / bottom nav / sheet shell, touch
 * target size, reduced motion) and checks that every class the render modules
 * emit has a rule, so a renamed class cannot silently lose its styling.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

/** The declarations of the first rule whose selector list includes `selector`. */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(^|[},\\s])${escaped}\\s*(,[^{]*)?\\{([^}]*)\\}`, 'm'));
  return match ? match[3] : null;
}

describe('styles.css — Deep Blue palette (unchanged by the redesign)', () => {
  const ORIGINAL_TOKENS = {
    '--bg-body': '#020617',
    '--bg-card': 'rgba(15, 23, 42, 0.6)',
    '--bg-card-solid': '#0f172a',
    '--bg-card-border': 'rgba(56, 189, 248, 0.2)',
    '--text-primary': '#f1f5f9',
    '--text-muted': '#94a3b8',
    '--accent-sky': '#38bdf8',
    '--accent-sky-glow': 'rgba(56, 189, 248, 0.25)',
    '--accent-cyan': '#06b6d4',
    '--accent-amber': '#f59e0b',
    '--accent-amber-soft': 'rgba(245, 158, 11, 0.12)',
    '--accent-green': '#4ade80',
    '--accent-green-glow': 'rgba(74, 222, 128, 0.4)',
  };

  for (const [token, value] of Object.entries(ORIGINAL_TOKENS)) {
    it(`${token} is still ${value}`, () => {
      expect(rule(':root')).toContain(`${token}: ${value};`);
    });
  }

  it('the missed-day red is the original calendar red', () => {
    expect(rule(':root')).toContain('--accent-red: #f87171;');
  });

  it('body keeps the deep blue background and the radial glow', () => {
    expect(rule('body')).toContain('background-color: var(--bg-body)');
    expect(rule('body')).toContain('#0c4a6e');
  });
});

describe('styles.css — mobile shell', () => {
  it('[hidden] always wins over display rules (screens and sheets use it)', () => {
    expect(rule('[hidden]')).toMatch(/display:\s*none\s*!important/);
  });

  it('the app bar sticks to the top and respects the status-bar inset', () => {
    const appBar = rule('.app-bar');
    expect(appBar).toContain('position: sticky');
    expect(appBar).toContain('var(--safe-top)');
  });

  it('search and settings actions only show on Today', () => {
    expect(css).toMatch(/body:not\(\[data-active-screen="today"\]\) \.app-bar__actions\s*\{\s*display: none;/);
  });

  it('the bottom nav is fixed, clears the gesture bar and highlights the current tab', () => {
    const nav = rule('.bottom-nav');
    expect(nav).toContain('position: fixed');
    expect(nav).toContain('bottom: 0');
    expect(nav).toContain('var(--safe-bottom)');
    expect(css).toContain('.bottom-nav__item[aria-current="page"]');
  });

  it('screens leave room for the bottom nav', () => {
    expect(rule('.screens')).toContain('var(--bottom-nav-h)');
  });

  it('touch targets are at least 44px', () => {
    expect(rule(':root')).toContain('--tap: 44px;');
    expect(rule('.icon-btn')).toContain('width: var(--tap)');
    expect(rule('.btn')).toContain('min-height: 48px');
  });

  it('the day sheet slides up from the bottom', () => {
    const sheet = rule('.sheet');
    expect(sheet).toContain('position: fixed');
    expect(sheet).toContain('bottom: 0');
    expect(sheet).toContain('animation: sheet-in');
  });

  it('respects reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.screen \{ animation: none; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.sheet \{ animation: none; \}/);
  });

  it('uses the bundled fonts: Manrope for text, JetBrains Mono for numbers', () => {
    expect(rule(':root')).toContain("--font-sans: 'Manrope Variable'");
    expect(rule(':root')).toContain("--font-mono: 'JetBrains Mono'");
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).not.toMatch(/font-family:[^;]*Inter/);
  });
});

describe('styles.css — day states read apart without colour alone', () => {
  it('hit days are filled, missed days are outlined', () => {
    expect(rule('.heatmap-tile--missed')).toContain('border-color: var(--accent-red-line)');
    expect(css).toMatch(/\.heatmap-tile--met,\s*\.heatmap-tile--exceeded\s*\{[^}]*background: var\(--accent-sky\)/);
    expect(rule('.week-chart__bar--missed')).toContain('border:');
    expect(rule('.day-row__dot--missed')).toContain('background: transparent');
  });

  it('today in progress has its own look', () => {
    expect(rule('.week-chart__bar--today')).toContain('repeating-linear-gradient');
    expect(rule('.day-chip--today')).not.toBeNull();
  });
});

describe('styles.css — every emitted class is styled', () => {
  /**
   * Classes that are behaviour hooks or styled through a companion class
   * (e.g. `.challenge-copy-btn` is styled by `.btn`).
   */
  const HOOK_CLASSES = new Set([
    'backup-panel', 'backup-section', 'challenge-copy-btn', 'challenge-icon-btn', 'challenge-share-btn',
    'cloud-sync-account', 'cloud-sync-panel', 'cloud-sync-primary', 'cloud-sync-section',
    'odyssey-bar', 'odyssey-stop--start', 'rpg-level-card__titles', 'settings-city-select',
    'settings-clear-all-checkbox', 'settings-date-picker', 'settings-label-text', 'show-more-btn',
    'storage-health-action',
  ]);

  const sources = fs.readdirSync(path.join(root, 'src'))
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && !f.endsWith('.fixtures.js'))
    .map((f) => fs.readFileSync(path.join(root, 'src', f), 'utf8'))
    .join('\n');
  const emitted = new Set(
    [...sources.matchAll(/className = ['`]([^'`]+)['`]/g)]
      .flatMap((m) => m[1].split(/\s+/))
      .filter((c) => c && !c.includes('$') && !c.includes('{')),
  );

  it('finds the emitted classes', () => {
    expect(emitted.size).toBeGreaterThan(100);
  });

  it('has a rule for each one (or lists it as a hook)', () => {
    const missing = [...emitted].filter((c) => !HOOK_CLASSES.has(c) && !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    expect(missing).toEqual([]);
  });

  it('the hook list has no stale entries', () => {
    const stale = [...HOOK_CLASSES].filter((c) => !emitted.has(c));
    expect(stale).toEqual([]);
  });
});
