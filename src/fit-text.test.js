import { describe, it, expect, afterEach, vi } from 'vitest';
import { fitText, keepTextFitted, MIN_FIT_SCALE } from './fit-text.js';

/** A span whose rendered widths are faked (jsdom has no layout). */
function makeText({ available, needed }) {
  const el = document.createElement('span');
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => available });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => needed });
  return el;
}

const fit = (el) => el.style.getPropertyValue('--fit');

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('fitText', () => {
  it('leaves text that fits at full size', () => {
    const el = makeText({ available: 150, needed: 120 });
    expect(fitText(el)).toBe(1);
    expect(fit(el)).toBe('');
  });

  it('scales overflowing text down to the box, through --fit', () => {
    const el = makeText({ available: 150, needed: 180 });
    expect(fitText(el)).toBe(0.83);
    expect(fit(el)).toBe('0.83');
  });

  it('measures at full size, so a wider box lets the text grow back', () => {
    let available = 100;
    const el = document.createElement('span');
    Object.defineProperty(el, 'clientWidth', { get: () => available });
    // The natural width only reads as 200 while --fit is unset.
    Object.defineProperty(el, 'scrollWidth', { get: () => (fit(el) ? 100 : 200) });

    fitText(el);
    expect(fit(el)).toBe('0.5');
    available = 400;
    fitText(el);
    expect(fit(el)).toBe('');
  });

  it('never shrinks below the minimum scale', () => {
    const el = makeText({ available: 10, needed: 500 });
    expect(fitText(el)).toBe(MIN_FIT_SCALE);
  });

  it('does nothing while the box has no width (hidden screen, no layout)', () => {
    const el = makeText({ available: 0, needed: 180 });
    expect(fitText(el)).toBe(1);
    expect(fit(el)).toBe('');
  });

  it('tolerates a missing element', () => {
    expect(fitText(null)).toBe(1);
  });
});

describe('keepTextFitted', () => {
  it('re-fits whenever the box resizes, and stops when asked', () => {
    let callback;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', vi.fn(function (cb) {
      callback = cb;
      this.observe = observe;
      this.disconnect = disconnect;
    }));
    let needed = 120;
    const el = document.createElement('span');
    Object.defineProperty(el, 'clientWidth', { get: () => 150 });
    Object.defineProperty(el, 'scrollWidth', { get: () => needed });
    const box = document.createElement('div');
    box.appendChild(el);
    document.body.appendChild(box);

    const stop = keepTextFitted(el, box);
    expect(observe).toHaveBeenCalledWith(box);

    needed = 300;
    callback();
    expect(fit(el)).toBe('0.5');

    stop();
    expect(disconnect).toHaveBeenCalled();
  });

  it('without ResizeObserver, fits once and returns a no-op stop', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const el = makeText({ available: 150, needed: 300 });
    document.body.appendChild(el);

    const stop = keepTextFitted(el, el);
    expect(fit(el)).toBe('0.5');
    expect(() => stop()).not.toThrow();
  });

  it('tolerates a detached document (no window)', () => {
    const doc = document.implementation.createHTMLDocument('test');
    const el = doc.createElement('span');
    expect(() => keepTextFitted(el, el)()).not.toThrow();
  });
});
