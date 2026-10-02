import { createBrandFlame } from './brand-mark.js';

/**
 * Stat tile content — the small label / value / sub-line cards of the Today
 * panel's stat grid, shared by progress-ui.js (Distance) and streak-ui.js.
 *
 * The value is a number plus an optional unit ("1,910" + "days") in separate
 * spans, so a narrow tile wraps the unit under the number instead of letting
 * the value overflow the card. A tile may lead its value with the brand flame
 * (ST-029) — 'lit' or 'out'.
 */

/**
 * Replace a tile's content.
 * @param {Document} doc
 * @param {HTMLElement} el
 * @param {{ label: string, num: string, unit?: string, sub: string, good?: boolean, flame?: 'lit'|'out' }} tile
 */
export function fillStatTile(doc, el, { label, num, unit, sub, good = false, flame }) {
  const span = (className, text) => {
    const node = doc.createElement('span');
    node.className = className;
    node.textContent = text;
    return node;
  };

  const value = span('stat-tile__value');
  if (flame) {
    const icon = createBrandFlame(doc, { size: 17, lit: flame === 'lit' });
    icon.classList.add('stat-tile__flame');
    value.appendChild(icon);
  }
  value.appendChild(span('stat-tile__num', num));
  if (unit) value.append(' ', span('stat-tile__unit', unit));

  el.replaceChildren(
    span('stat-tile__label', label),
    value,
    span(good ? 'stat-tile__sub stat-tile__sub--good' : 'stat-tile__sub', sub),
  );
}
