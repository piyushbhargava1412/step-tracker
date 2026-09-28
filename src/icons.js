// icons.js — the app's line icons (24×24, stroked with currentColor), built
// with createElementNS so render modules never assign raw markup.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Each icon: a list of [tag, attributes] shapes. */
const ICONS = {
  trophy: [['path', { d: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3' }]],
  flame: [['path', { d: 'M12 22c4 0 7-2.7 7-6.8 0-3.2-2-5.6-3.6-7.2-.4 1.8-1.4 3-2.6 3.5.3-3.3-1-6.5-3.8-8.5-.3 3-1.7 5-3.3 6.8C4.6 11.2 5 13.2 5 15.2 5 19.3 8 22 12 22z' }]],
  moon: [['path', { d: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z' }]],
  shoe: [['path', { d: 'M3 16h18v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 16V7l4 1 2 4 5 1a4 4 0 0 1 4 3' }]],
  search: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'm20 20-3.5-3.5' }]],
  share: [['path', { d: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7 8l5-5 5 5' }]],
  copy: [['rect', { x: 8, y: 8, width: 12, height: 12, rx: 2 }], ['path', { d: 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3' }]],
  camera: [['path', { d: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z' }], ['circle', { cx: 12, cy: 13.5, r: 3.5 }]],
  pencil: [['path', { d: 'M4 20h4L19 9l-4-4L4 16z' }]],
  close: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
  lock: [['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }], ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }]],
  pin: [['path', { d: 'M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z' }], ['circle', { cx: 12, cy: 9.5, r: 2.5 }]],
  download: [['path', { d: 'M12 3v12m-5-5 5 5 5-5M4 21h16' }]],
  users: [['circle', { cx: 9, cy: 8, r: 3.5 }], ['path', { d: 'M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5' }]],
  chevronRight: [['path', { d: 'm9 6 6 6-6 6' }]],
  chevronLeft: [['path', { d: 'm15 6-6 6 6 6' }]],
};

export const ICON_NAMES = Object.keys(ICONS);

/**
 * @param {Document} doc
 * @param {string} name   one of ICON_NAMES
 * @param {{ size?: number }} [options]
 * @returns {SVGSVGElement}
 */
export function createIcon(doc, name, { size = 22 } = {}) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  const attrs = {
    class: 'icon',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  };
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, String(value));

  const shapes = ICONS[name];
  if (!shapes) {
    console.warn('[icons]', `Unknown icon: ${name}`);
    return svg;
  }
  for (const [tag, shapeAttrs] of shapes) {
    const shape = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(shapeAttrs)) shape.setAttribute(key, String(value));
    svg.appendChild(shape);
  }
  return svg;
}
