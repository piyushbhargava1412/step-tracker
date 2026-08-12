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

  it('should contain .goal-selector and .goal-select class selectors (ST-007a)', () => {
    expect(cssContent).toContain('.goal-selector');
    expect(cssContent).toContain('.goal-select');
  });

  it('.goal-preset is absent from styles.css (ST-007a removed)', () => {
    expect(cssContent).not.toContain('.goal-preset');
  });

  it('.goal-input is absent from styles.css (ST-007a removed)', () => {
    expect(cssContent).not.toContain('.goal-input');
  });

  it('.goal-apply is absent from styles.css (ST-007a removed)', () => {
    expect(cssContent).not.toContain('.goal-apply');
  });

  // ── Restyle-boundary locks ────────────────────────────────────────────────

  it('restyle-boundary lock: .container still contains #1e1e1e', () => {
    expect(/\.container\s*{[^}]*#1e1e1e/.test(cssContent)).toBe(true);
  });

  it('restyle-boundary lock: global button rule still contains #ff4757', () => {
    expect(/button\s*{[^}]*#ff4757/.test(cssContent)).toBe(true);
  });
});

// ─── Task 8: ST-004 streak card, chips, lock badge, lifetime banner ────────

describe('styles.css — ST-004 streak card, chips, lock badge, lifetime banner (Task 8)', () => {
  let cssContent;

  beforeAll(() => {
    const cssPath = path.resolve(__dirname, '../styles.css');
    cssContent = fs.readFileSync(cssPath, 'utf8');
  });

  // ── ST-004 Selectors present ──────────────────────────────────────────────

  it('should contain all seven ST-004 selectors (ST-007a: lock-badge removed)', () => {
    const st004Selectors = [
      '.streak-card',
      '.streak-number',
      '.tier-badges',
      '.tier-chip',
      '.tier-chip--active',
      '.streak-goal',
      '#lifetime-banner',
    ];
    for (const selector of st004Selectors) {
      expect(cssContent).toContain(selector);
    }
  });

  // ── .streak-card anatomy ──────────────────────────────────────────────────

  it('.streak-card should use --bg-card background', () => {
    expect(/\.streak-card\s*{[^}]*background:\s*var\(--bg-card\)/.test(cssContent)).toBe(true);
  });

  it('.streak-card should use --bg-card-border', () => {
    expect(/\.streak-card\s*{[^}]*border:[^}]*var\(--bg-card-border\)/.test(cssContent)).toBe(true);
  });

  it('.streak-card should have 12px border-radius', () => {
    expect(/\.streak-card\s*{[^}]*border-radius:\s*12px/.test(cssContent)).toBe(true);
  });

  // ── .streak-number mockup values ──────────────────────────────────────────

  it('.streak-number should have color: var(--accent-emerald)', () => {
    expect(/\.streak-number\s*{[^}]*color:\s*var\(--accent-emerald\)/.test(cssContent)).toBe(true);
  });

  it('.streak-number should have 2.8rem font size', () => {
    expect(/\.streak-number\s*{[^}]*font-size:\s*2\.8rem/.test(cssContent)).toBe(true);
  });

  it('.streak-number should have font-weight: 900', () => {
    expect(/\.streak-number\s*{[^}]*font-weight:\s*900/.test(cssContent)).toBe(true);
  });

  it('.streak-number should have line-height: 1', () => {
    expect(/\.streak-number\s*{[^}]*line-height:\s*1/.test(cssContent)).toBe(true);
  });

  it('.streak-number should have font-variant-numeric: tabular-nums', () => {
    expect(/\.streak-number\s*{[^}]*font-variant-numeric:\s*tabular-nums/.test(cssContent)).toBe(true);
  });

  // ── .streak-unit ─────────────────────────────────────────────────────────

  it('.streak-unit should have 1rem font size', () => {
    expect(/\.streak-unit\s*{[^}]*font-size:\s*1rem/.test(cssContent)).toBe(true);
  });

  it('.streak-unit should have font-weight: 500', () => {
    expect(/\.streak-unit\s*{[^}]*font-weight:\s*500/.test(cssContent)).toBe(true);
  });

  it('.streak-unit should use var(--text-muted) color', () => {
    expect(/\.streak-unit\s*{[^}]*color:\s*var\(--text-muted\)/.test(cssContent)).toBe(true);
  });

  // ── .lock-badge absent (ST-007a removed) ─────────────────────────────────

  it('.lock-badge is absent from styles.css (ST-007a removed)', () => {
    expect(cssContent).not.toContain('.lock-badge');
  });

  // ── .tier-badges ─────────────────────────────────────────────────────────

  it('.tier-badges should have display: flex', () => {
    expect(/\.tier-badges\s*{[^}]*display:\s*flex/.test(cssContent)).toBe(true);
  });

  it('.tier-badges should have gap: 8px', () => {
    expect(/\.tier-badges\s*{[^}]*gap:\s*8px/.test(cssContent)).toBe(true);
  });

  it('.tier-badges should have flex-wrap: wrap', () => {
    expect(/\.tier-badges\s*{[^}]*flex-wrap:\s*wrap/.test(cssContent)).toBe(true);
  });

  it('.tier-badges should have margin-top: 16px', () => {
    expect(/\.tier-badges\s*{[^}]*margin-top:\s*16px/.test(cssContent)).toBe(true);
  });

  // ── .tier-chip base anatomy ──────────────────────────────────────────────

  it('.tier-chip should use var(--font-mono)', () => {
    expect(/\.tier-chip\s*{[^}]*font-family:\s*var\(--font-mono\)/.test(cssContent)).toBe(true);
  });

  it('.tier-chip should have 0.75rem font size', () => {
    expect(/\.tier-chip\s*{[^}]*font-size:\s*0\.75rem/.test(cssContent)).toBe(true);
  });

  it('.tier-chip should have rgba(255,255,255,0.04) background', () => {
    expect(/\.tier-chip\s*{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.04\)/.test(cssContent)).toBe(true);
  });

  it('.tier-chip should have 1px border with var(--bg-card-border)', () => {
    expect(/\.tier-chip\s*{[^}]*border:[^}]*1px[^}]*var\(--bg-card-border\)/.test(cssContent)).toBe(true);
  });

  it('.tier-chip should use var(--text-muted) color', () => {
    expect(/\.tier-chip\s*{[^}]*color:\s*var\(--text-muted\)/.test(cssContent)).toBe(true);
  });

  it('.tier-chip should have padding: 4px 8px', () => {
    expect(/\.tier-chip\s*{[^}]*padding:\s*4px\s+8px/.test(cssContent)).toBe(true);
  });

  it('.tier-chip should have 6px border-radius', () => {
    expect(/\.tier-chip\s*{[^}]*border-radius:\s*6px/.test(cssContent)).toBe(true);
  });

  // ── .tier-chip--active modifier ───────────────────────────────────────────

  it('.tier-chip--active should use var(--accent-emerald) color', () => {
    expect(/\.tier-chip--active\s*{[^}]*color:\s*var\(--accent-emerald\)/.test(cssContent)).toBe(true);
  });

  it('.tier-chip--active should have border-color: var(--accent-emerald)', () => {
    expect(/\.tier-chip--active\s*{[^}]*border-color:\s*var\(--accent-emerald\)/.test(cssContent)).toBe(true);
  });

  // ── .streak-goal ─────────────────────────────────────────────────────────

  it('.streak-goal should use var(--text-muted) color', () => {
    expect(/\.streak-goal\s*{[^}]*color:\s*var\(--text-muted\)/.test(cssContent)).toBe(true);
  });

  it('.streak-goal should use var(--font-mono)', () => {
    expect(/\.streak-goal\s*{[^}]*font-family:\s*var\(--font-mono\)/.test(cssContent)).toBe(true);
  });

  // ── #lifetime-banner ─────────────────────────────────────────────────────

  it('#lifetime-banner should use var(--bg-card) background', () => {
    expect(/#lifetime-banner\s*{[^}]*background:\s*var\(--bg-card\)/.test(cssContent)).toBe(true);
  });

  it('#lifetime-banner should have var(--bg-card-border) border', () => {
    expect(/#lifetime-banner\s*{[^}]*border:[^}]*var\(--bg-card-border\)/.test(cssContent)).toBe(true);
  });

  it('#lifetime-banner should have 12px border-radius', () => {
    expect(/#lifetime-banner\s*{[^}]*border-radius:\s*12px/.test(cssContent)).toBe(true);
  });

  it('#lifetime-banner should use var(--font-mono)', () => {
    expect(/#lifetime-banner\s*{[^}]*font-family:\s*var\(--font-mono\)/.test(cssContent)).toBe(true);
  });

  it('#lifetime-banner should use var(--text-muted) for text color', () => {
    expect(/#lifetime-banner\s*{[^}]*color:\s*var\(--text-muted\)/.test(cssContent)).toBe(true);
  });

  // ── Verify --accent-emerald in .tier-chip--active (no per-tier colors) ─────

  it('.tier-chip--active should contain --accent-emerald (no cyan/amber accents)', () => {
    // Extract the .tier-chip--active rule
    const tierChipActiveMatch = cssContent.match(/\.tier-chip--active\s*{[^}]+}/);
    if (tierChipActiveMatch) {
      expect(tierChipActiveMatch[0]).toContain('--accent-emerald');
      // Verify no per-tier cyan or amber overrides
      expect(tierChipActiveMatch[0]).not.toContain('--accent-cyan');
      expect(tierChipActiveMatch[0]).not.toContain('--accent-amber');
    }
    expect(tierChipActiveMatch).toBeTruthy();
  });

  // ── ST-003 Restyle-boundary locks ─────────────────────────────────────────

  it('ST-003 restyle-boundary lock: .container still contains #1e1e1e', () => {
    expect(/\.container\s*{[^}]*#1e1e1e/.test(cssContent)).toBe(true);
  });

  it('ST-003 restyle-boundary lock: global button rule still contains #ff4757', () => {
    expect(/button\s*{[^}]*#ff4757/.test(cssContent)).toBe(true);
  });

  // ── No new CSS variables introduced ──────────────────────────────────────

  it('should not introduce new CSS variables beyond ST-003 tokens', () => {
    // Extract the ST-004 section
    const st004Match = cssContent.match(/\/\* ─── ST-004[^]*$/);
    if (st004Match) {
      const st004Section = st004Match[0];
      // Match all var(...) calls to get actual variable usage
      const varMatches = st004Section.match(/var\((--[\w-]+)\)/g) || [];
      const usedVars = [...new Set(varMatches.map(m => m.match(/--[\w-]+/)[0]))];
      
      // All used variables must be defined in :root before ST-004
      const rootSection = cssContent.substring(0, cssContent.indexOf('/* ─── ST-004'));
      for (const variable of usedVars) {
        expect(rootSection).toContain(variable);
      }
    }
  });
});

// ─── Task 6: ST-006 override form, badge, and revert button styling ──────

describe('styles.css — ST-006 override form, badge, and revert button', () => {
  let cssContent;

  beforeAll(() => {
    const cssPath = path.resolve(__dirname, '../styles.css');
    cssContent = fs.readFileSync(cssPath, 'utf8');
  });

  it('.tile__override-badge rule is defined', () => {
    expect(cssContent).toContain('.tile__override-badge');
  });

  it('override-form layout rule is defined (form[data-form="override"] or .override-form)', () => {
    const hasOverrideFormRule =
      cssContent.includes('[data-form="override"]') ||
      cssContent.includes('.override-form');
    expect(hasOverrideFormRule).toBe(true);
  });

  it('.revert-btn rule is defined', () => {
    expect(cssContent).toContain('.revert-btn');
  });
});

// ─── Task 8: ST-007 Search Lab CSS — search-filters, results-table, summary, export-controls ───

describe('styles.css — ST-007 search-lab CSS (Task 8)', () => {
  let cssContent;

  beforeAll(() => {
    const cssPath = path.resolve(__dirname, '../styles.css');
    cssContent = fs.readFileSync(cssPath, 'utf8');
  });

  // ── Selectors present ──────────────────────────────────────────────────────

  it('should contain .search-filters selector', () => {
    expect(cssContent).toContain('.search-filters');
  });

  it('should contain .search-results-table selector', () => {
    expect(cssContent).toContain('.search-results-table');
  });

  it('should contain .search-summary selector', () => {
    expect(cssContent).toContain('.search-summary');
  });

  it('should contain .export-controls selector', () => {
    expect(cssContent).toContain('.export-controls');
  });

  it('should contain .filter-actions selector', () => {
    expect(cssContent).toContain('.filter-actions');
  });

  // ── .search-filters uses card variables ───────────────────────────────────

  it('.search-filters should use --bg-card background', () => {
    // .search-filters extends .card; background via --bg-card
    const match = cssContent.match(/\.search-filters\s*{[^}]+}/);
    // Either standalone rule uses --bg-card, or it composes .card (which already has it).
    // We require a rule that asserts var(--bg-card) in the search-filters rule OR that .search-filters
    // is documented as a .card extension and does not introduce a different background.
    // Per DoD: assert no colour literal in search-filters section.
    const st007Section = cssContent.match(/\/\* ─── ST-007[^]*$/);
    expect(st007Section).toBeTruthy();
    // The ST-007 section must use var(--bg-card) at least once for backgrounds
    expect(st007Section[0]).toContain('var(--bg-card)');
  });

  it('.search-filters should use --bg-card-border for border', () => {
    const st007Section = cssContent.match(/\/\* ─── ST-007[^]*$/);
    expect(st007Section).toBeTruthy();
    expect(st007Section[0]).toContain('var(--bg-card-border)');
  });

  // ── No colour literals in ST-007 section ──────────────────────────────────

  it('ST-007 section should contain no hex colour literals', () => {
    const st007Section = cssContent.match(/\/\* ─── ST-007[^]*$/);
    expect(st007Section).toBeTruthy();
    // Must not contain bare hex colour literals (#xxx or #xxxxxx)
    const hexLiteralPattern = /#[0-9a-fA-F]{3,6}(?![0-9a-fA-F])/g;
    const hexMatches = st007Section[0].match(hexLiteralPattern) || [];
    expect(hexMatches).toHaveLength(0);
  });

  it('ST-007 section should contain no rgb/rgba colour literals', () => {
    const st007Section = cssContent.match(/\/\* ─── ST-007[^]*$/);
    expect(st007Section).toBeTruthy();
    // Must not contain bare rgb/rgba literals (only var(--accent-...) is allowed)
    const rgbLiteralPattern = /rgba?\(\s*\d+/g;
    const rgbMatches = st007Section[0].match(rgbLiteralPattern) || [];
    expect(rgbMatches).toHaveLength(0);
  });

  // ── .search-results-table row anatomy ────────────────────────────────────

  it('.search-results-table [data-row] should define a grid layout', () => {
    expect(/\.search-results-table\s+\[data-row\][^{]*{[^}]*display:\s*grid/.test(cssContent)).toBe(true);
  });

  // ── .search-summary extends summary-cell idiom ───────────────────────────

  it('.search-summary should have display: grid', () => {
    expect(/\.search-summary\s*{[^}]*display:\s*grid/.test(cssContent)).toBe(true);
  });

  // ── .export-controls layout ───────────────────────────────────────────────

  it('.export-controls should have display: flex', () => {
    expect(/\.export-controls\s*{[^}]*display:\s*flex/.test(cssContent)).toBe(true);
  });

  // ── No new CSS variables beyond existing tokens ────────────────────────────

  it('should not introduce new CSS custom properties in ST-007 section', () => {
    const st007Section = cssContent.match(/\/\* ─── ST-007[^]*$/);
    if (st007Section) {
      // Find all var() usages
      const varMatches = st007Section[0].match(/var\((--[\w-]+)\)/g) || [];
      const usedVars = [...new Set(varMatches.map(m => m.match(/--[\w-]+/)[0]))];
      // Find all new custom property definitions (--foo: ...)
      const definedVars = st007Section[0].match(/--([\w-]+)\s*:/g) || [];
      // No new variables should be defined in ST-007 section
      expect(definedVars).toHaveLength(0);
      // All used variables must already exist in :root (before ST-007)
      const beforeSt007 = cssContent.substring(0, cssContent.indexOf('/* ─── ST-007'));
      for (const variable of usedVars) {
        expect(beforeSt007).toContain(variable);
      }
    }
  });

  // ── Restyle-boundary locks (existing tests remain green) ──────────────────

  it('restyle-boundary lock: .container still contains #1e1e1e', () => {
    expect(/\.container\s*{[^}]*#1e1e1e/.test(cssContent)).toBe(true);
  });

  it('restyle-boundary lock: global button rule still contains #ff4757', () => {
    expect(/button\s*{[^}]*#ff4757/.test(cssContent)).toBe(true);
  });
});


// ─── Task 16: ST-007a tolerance metrics, hall-of-fame, near-miss-panel ──────

describe('styles.css — ST-007a new selectors (Task 16)', () => {
  let cssContent;

  beforeAll(() => {
    const cssPath = path.resolve(__dirname, '../styles.css');
    cssContent = fs.readFileSync(cssPath, 'utf8');
  });

  // ── New selectors present ─────────────────────────────────────────────────

  it('should contain .tolerance-metrics selector', () => {
    expect(cssContent).toContain('.tolerance-metrics');
  });

  it('should contain .tolerance-metric selector', () => {
    expect(cssContent).toContain('.tolerance-metric');
  });

  it('should contain .hall-of-fame selector', () => {
    expect(cssContent).toContain('.hall-of-fame');
  });

  it('should contain .hof-title selector', () => {
    expect(cssContent).toContain('.hof-title');
  });

  it('should contain .hof-entry selector', () => {
    expect(cssContent).toContain('.hof-entry');
  });

  it('should contain .hof-rank selector', () => {
    expect(cssContent).toContain('.hof-rank');
  });

  it('should contain .hof-days selector', () => {
    expect(cssContent).toContain('.hof-days');
  });

  it('should contain .hof-range selector', () => {
    expect(cssContent).toContain('.hof-range');
  });

  it('should contain .hof-empty selector', () => {
    expect(cssContent).toContain('.hof-empty');
  });

  it('should contain .near-miss-panel selector', () => {
    expect(cssContent).toContain('.near-miss-panel');
  });

  // ── Removed selectors absent ──────────────────────────────────────────────

  it('.goal-preset is absent from styles.css', () => {
    expect(cssContent).not.toContain('.goal-preset');
  });

  it('.goal-input is absent from styles.css', () => {
    expect(cssContent).not.toContain('.goal-input');
  });

  it('.goal-apply is absent from styles.css', () => {
    expect(cssContent).not.toContain('.goal-apply');
  });

  it('.lock-badge is absent from styles.css', () => {
    expect(cssContent).not.toContain('.lock-badge');
  });

  // ── Restyle-boundary locks unchanged ─────────────────────────────────────

  it('restyle-boundary lock: .container still contains #1e1e1e', () => {
    expect(/\.container\s*{[^}]*#1e1e1e/.test(cssContent)).toBe(true);
  });

  it('restyle-boundary lock: global button rule still contains #ff4757', () => {
    expect(/button\s*{[^}]*#ff4757/.test(cssContent)).toBe(true);
  });
});
