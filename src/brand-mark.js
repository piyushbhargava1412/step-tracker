// brand-mark.js — the Walkaholic flame (ST-029), the heart of the logo
// (public/icons/icon.svg), drawn as an inline icon for the rendered screens.
// The same paths appear in index.html (the splash and the Today app bar mark);
// src/brand-mark.test.js keeps them identical.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The flame's outline, centred on 0,0 (about 33 × 52 units). */
export const BRAND_FLAME_PATH =
  'M0 -26 C10 -12 18 -4 16 10 C14 22 8 26 0 26 C-8 26 -15 21 -16 12 C-17 2 -11 -4 -8 -12 C-6 -4 -3 0 0 2 C-2 -8 -4 -18 0 -26 Z';

/** The lighter core at the flame's base. */
export const BRAND_CORE_PATH = 'M0 4 C5 9 8 13 7 18 C6 22 3 24 0 24 C-3 24 -6 22 -6 18 C-6 13 -2 9 0 4 Z';

const VIEW_BOX = { x: -17, y: -27, width: 34, height: 54 };

/**
 * @param {Document} doc
 * @param {{ size?: number, lit?: boolean }} [options]  size = height in px; an "out" flame is greyed (styles.css)
 * @returns {SVGSVGElement}
 */
export function createBrandFlame(doc, { size = 16, lit = true } = {}) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  const attrs = {
    class: `brand-flame brand-flame--${lit ? 'lit' : 'out'}`,
    viewBox: `${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`,
    width: Math.round((size * VIEW_BOX.width) / VIEW_BOX.height),
    height: size,
    'aria-hidden': 'true',
  };
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, String(value));

  for (const [part, d] of [['outer', BRAND_FLAME_PATH], ['core', BRAND_CORE_PATH]]) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', `brand-flame__${part}`);
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}
