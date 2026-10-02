import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createBrandFlame, BRAND_FLAME_PATH, BRAND_CORE_PATH } from './brand-mark.js';

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('createBrandFlame — the Walkaholic flame as an inline icon', () => {
  it('draws the flame and its core, decorative, at the asked height', () => {
    const svg = createBrandFlame(document, { size: 18 });
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('height')).toBe('18');
    expect(svg.querySelector('.brand-flame__outer').getAttribute('d')).toBe(BRAND_FLAME_PATH);
    expect(svg.querySelector('.brand-flame__core').getAttribute('d')).toBe(BRAND_CORE_PATH);
  });

  it('keeps the flame\'s proportions', () => {
    const svg = createBrandFlame(document, { size: 52 });
    expect(svg.getAttribute('viewBox')).toBe('-17 -27 34 54');
    expect(Number(svg.getAttribute('width'))).toBeCloseTo(52 * (34 / 54), 0);
  });

  it('is lit by default, and can be out', () => {
    expect(createBrandFlame(document).getAttribute('class')).toBe('brand-flame brand-flame--lit');
    expect(createBrandFlame(document, { lit: false }).getAttribute('class')).toBe('brand-flame brand-flame--out');
  });

  it('defaults to 16px', () => {
    expect(createBrandFlame(document).getAttribute('height')).toBe('16');
  });

  it('is the same flame as the logo, the splash and the app bar mark', () => {
    for (const file of ['public/icons/icon.svg', 'index.html']) {
      const source = read(file);
      expect(source, file).toContain(BRAND_FLAME_PATH);
      expect(source, file).toContain(BRAND_CORE_PATH);
    }
    const html = read('index.html');
    expect(html.split(BRAND_FLAME_PATH)).toHaveLength(3); // the splash and the app bar mark
  });
});
