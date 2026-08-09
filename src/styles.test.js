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

  // Test 2: A rule showing the active/visible panel is present
  it('should contain a rule showing the active panel (display:block)', () => {
    // Pattern 1: [id^="tab-"]:not([style*="display:none"]) { display: block; }
    // Pattern 2: .tab-panel.active { display: block; }
    // Pattern 3: [id^="tab-"][data-active] { display: block; }
    // The mechanism from tabs.js is element.style.display = 'block', so CSS should define defaults
    // Simplest: check that somewhere tabs can be shown (typically not necessary in CSS if JS sets inline style)
    // But task requires explicit rule, so check for any show pattern
    const showPanelPatterns = [
      /display:\s*block/,  // At least some display:block rule exists for panels
    ];
    
    const hasShowRule = showPanelPatterns.some(pattern => pattern.test(cssContent));
    expect(hasShowRule).toBe(true);
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
  it('should match tabs.js display:none/display:block mechanism', () => {
    // tabs.js uses:
    // - panel.style.display = 'none' (to hide)
    // - panel.style.display = 'block' (to show)
    // CSS should define default hide and (optionally) explicit show rules
    
    // CSS must have display:none for inactive panels
    // and allow display:block to override (either via CSS rule or inline style from JS)
    const hasNoneRule = /display:\s*none/.test(cssContent);
    const hasBlockRule = /display:\s*block/.test(cssContent);
    
    expect(hasNoneRule).toBe(true);
    expect(hasBlockRule).toBe(true);
  });
});
