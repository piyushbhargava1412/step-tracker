import { describe, it, expect, vi } from 'vitest';
import { createIcon, ICON_NAMES } from './icons.js';

describe('createIcon', () => {
  it('builds a decorative stroke SVG sized as asked', () => {
    const svg = createIcon(document, 'trophy', { size: 20 });
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('class')).toBe('icon');
    expect(svg.querySelectorAll('path, circle, rect').length).toBeGreaterThan(0);
  });

  it('defaults to 22px', () => {
    expect(createIcon(document, 'search').getAttribute('height')).toBe('22');
  });

  it('knows every icon the app draws', () => {
    for (const name of ['trophy', 'flame', 'share', 'copy', 'camera', 'pencil', 'close', 'lock', 'pin', 'download']) {
      expect(ICON_NAMES, name).toContain(name);
    }
  });

  it('warns and returns an empty SVG for an unknown name', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const svg = createIcon(document, 'nope');
    expect(svg.childNodes).toHaveLength(0);
    expect(spy).toHaveBeenCalledWith('[icons]', 'Unknown icon: nope');
    spy.mockRestore();
  });
});
