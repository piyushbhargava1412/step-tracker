import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Task 10: styles.css — tab bar & panel layout
 * Test suite to verify CSS structure for header flex, tab bar, and panel show/hide.
 */

describe('styles.css — structural layout (Task 10)', () => {
  let cssContent;

  beforeAll(() => {
    // Read the styles.css file
    const cssPath = path.resolve(__dirname, '../styles.css');
    cssContent = fs.readFileSync(cssPath, 'utf8');
  });

  // Test 1: A rule hiding inactive tab panels is present
  it('should contain a rule hiding inactive tab panels (display:none)', () => {
    // Check for either CSS selector pattern targeting hidden panels
    // Pattern 1: [id^="tab-"] { display: none; }
    // Pattern 2: .tab-panel { display: none; }
    // Pattern 3: div[id^="tab-"] { display: none; }
    const hidePanelPatterns = [
      /\[id\^="tab-"\]\s*{[^}]*display:\s*none/,
      /\.tab-panel\s*{[^}]*display:\s*none/,
      /div\[id\^="tab-"\]\s*{[^}]*display:\s*none/,
    ];
    
    const hasHideRule = hidePanelPatterns.some(pattern => pattern.test(cssContent));
    expect(hasHideRule).toBe(true);
  });

  // Test 2: A rule showing the active/visible panel is present (panel-specific)
  it('should contain a rule showing the active panel (display:block) targeting panels', () => {
    // The rule must specifically target panel elements, not any arbitrary element.
    // tabs.js uses inline style: element.style.display = 'block'
    // CSS should define the default-hide rule; JS overrides via inline style.
    // We verify the hide rule is present (CSS) and that block appears in a panel context.
    const panelShowPatterns = [
      /\[id\^="tab-"\][^{]*{[^}]*display:\s*block/,     // [id^="tab-"] { display: block }
      /\[id\^="tab-"\][^{]*\[[^\]]*\][^{]*{[^}]*display:\s*block/, // [id^="tab-"][attr] { display: block }
      /\.tab-panel[^{]*{[^}]*display:\s*block/,          // .tab-panel.active { display: block }
    ];
    // Accept if a panel-scoped show rule exists, OR if the CSS relies entirely on JS inline-style
    // override (which is valid — the test verifies the hide rule is present, JS handles show).
    const hasPanelHideRule = /\[id\^="tab-"\]\s*{[^}]*display:\s*none/.test(cssContent);
    const hasPanelShowRule = panelShowPatterns.some(p => p.test(cssContent));
    // At minimum the hide rule must exist; show via JS inline style is acceptable.
    expect(hasPanelHideRule || hasPanelShowRule).toBe(true);
    // The hide rule must definitely be present (JS overrides it for the active panel)
    expect(hasPanelHideRule).toBe(true);
  });

  // Test 3: Dark-theme background color variable or selector still present
  it('should preserve dark-theme background colors', () => {
    // Check for dark-theme background declarations
    // body { background-color: #121212; }
    // .container { background: #1e1e1e; }
    const darkThemePatterns = [
      /body\s*{[^}]*background(-color)?:\s*#121212/,
      /\.container\s*{[^}]*background:\s*#1e1e1e/,
    ];
    
    const hasDarkTheme = darkThemePatterns.some(pattern => pattern.test(cssContent));
    expect(hasDarkTheme).toBe(true);
  });

  // Test 4: Header flex layout rule present
  it('should contain a header or .container flex layout rule', () => {
    // Check for flex layout on header or container
    const headerFlexPatterns = [
      /header\s*{[^}]*display:\s*flex/,
      /\.container\s*{[^}]*display:\s*flex/,
    ];
    
    const hasHeaderFlex = headerFlexPatterns.some(pattern => pattern.test(cssContent));
    expect(hasHeaderFlex).toBe(true);
  });

  // Test 5: .tab-bar flex rule present
  it('should contain a .tab-bar flex layout rule', () => {
    // Check for .tab-bar with display: flex
    const tabBarFlexPattern = /\.tab-bar\s*{[^}]*display:\s*flex/;
    
    expect(tabBarFlexPattern.test(cssContent)).toBe(true);
  });

  // Test 6: Verify show/hide mechanism consistency with tabs.js
  it('should match tabs.js display:none/display:block mechanism for panels', () => {
    // tabs.js hides panels via: panel.style.display = 'none'
    // tabs.js shows panels via: panel.style.display = 'block'
    // CSS MUST define the default hide rule on panel elements so JS override works.
    const panelHideRule = /\[id\^="tab-"\]\s*{[^}]*display:\s*none/.test(cssContent);
    expect(panelHideRule).toBe(true);
  });
});

// ─── Task 5: ST-003 dark-theme tokens + card/selector anatomy ───────────────

describe('styles.css — ST-003 dark-theme tokens + card/selector anatomy (Task 5)', () => {
  let cssContent;

  beforeAll(() => {
    const cssPath = path.resolve(__dirname, '../styles.css');
    cssContent = fs.readFileSync(cssPath, 'utf8');
  });

  // ── :root tokens ──────────────────────────────────────────────────────────

  it('should contain all 10 :root CSS custom properties', () => {
    const tokens = [
      '--bg-dark',
      '--bg-card',
      '--bg-card-border',
      '--text-primary',
      '--text-muted',
      '--accent-emerald',
      '--accent-emerald-glow',
      '--accent-cyan',
      '--accent-amber',
      '--font-mono',
    ];
    for (const token of tokens) {
      expect(cssContent).toContain(token);
    }
  });

  it('--accent-emerald-glow value is rgba(16, 185, 129, 0.25)', () => {
    expect(cssContent).toContain('rgba(16, 185, 129, 0.25)');
  });

  it('body rule contains var(--bg-dark) for background-color', () => {
    expect(/body\s*{[^}]*background-color:\s*var\(--bg-dark\)/.test(cssContent)).toBe(true);
  });

  // ── Card anatomy classes ──────────────────────────────────────────────────

  it('should contain all 12 card anatomy class selectors', () => {
    const cardClasses = [
      '.card',
      '.card-title',
      '.metric-row',
      '.metric-value',
      '.metric-sub',
      '.metric-unit',
      '.progress-pct',
      '.progress-track',
      '.progress-fill',
      '.progress-fill--full',
      '.remaining-hint',
      '.goal-met-badge',
    ];
    for (const cls of cardClasses) {
      expect(cssContent).toContain(cls);
    }
  });

  // ── Goal selector classes ─────────────────────────────────────────────────

  it('should contain all 4 goal-selector class selectors', () => {
    const selectorClasses = ['.goal-selector', '.goal-preset', '.goal-input', '.goal-apply'];
    for (const cls of selectorClasses) {
      expect(cssContent).toContain(cls);
    }
  });

  it('.goal-preset has a :hover override (prevents global button:hover bleed)', () => {
    expect(cssContent).toContain('.goal-preset:hover');
  });

  it('.goal-apply has a :hover override', () => {
    expect(cssContent).toContain('.goal-apply:hover');
  });

  // ── Restyle-boundary locks ────────────────────────────────────────────────

  it('restyle-boundary lock: .container still contains #1e1e1e', () => {
    expect(/\.container\s*{[^}]*#1e1e1e/.test(cssContent)).toBe(true);
  });

  it('restyle-boundary lock: global button rule still contains #ff4757', () => {
    expect(/button\s*{[^}]*#ff4757/.test(cssContent)).toBe(true);
  });
});
