import { describe, it, expect } from 'vitest';
import { fillStatTile } from './stat-tile.js';

function makeTile() {
  const el = document.createElement('div');
  el.className = 'stat-tile';
  return el;
}

const part = (el, name) => el.querySelector(`.stat-tile__${name}`);

describe('fillStatTile', () => {
  it('writes the label, the value as number + unit, and the sub line', () => {
    const el = makeTile();
    fillStatTile(document, el, { label: '99% tol', num: '1,910', unit: 'days', sub: '18 misses used' });

    expect(part(el, 'label').textContent).toBe('99% tol');
    expect(part(el, 'num').textContent).toBe('1,910');
    expect(part(el, 'unit').textContent).toBe('days');
    expect(part(el, 'sub').textContent).toBe('18 misses used');
  });

  it('keeps the whole value readable as one phrase', () => {
    const el = makeTile();
    fillStatTile(document, el, { label: 'Distance', num: '12.6', unit: 'km', sub: 'today' });
    expect(part(el, 'value').textContent).toBe('12.6 km');
  });

  it('a value without a unit is just the number', () => {
    const el = makeTile();
    fillStatTile(document, el, { label: 'Lifetime', num: '87%', sub: '2,771 of 3,193 days' });
    expect(part(el, 'value').textContent).toBe('87%');
    expect(part(el, 'unit')).toBeNull();
  });

  it('marks a good sub line', () => {
    const el = makeTile();
    fillStatTile(document, el, { label: '99% tol', num: '19', unit: 'days', sub: '0 misses used', good: true });
    expect(part(el, 'sub').classList.contains('stat-tile__sub--good')).toBe(true);
  });

  it('re-filling replaces the content', () => {
    const el = makeTile();
    fillStatTile(document, el, { label: 'A', num: '1', sub: 'x' });
    fillStatTile(document, el, { label: 'B', num: '2', sub: 'y' });
    expect(el.children).toHaveLength(3);
    expect(part(el, 'label').textContent).toBe('B');
  });
});
