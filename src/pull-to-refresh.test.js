import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPullToRefresh, PULL_THRESHOLD_PX } from './pull-to-refresh.js';

function touch(doc, type, y) {
  const event = new Event(type, { bubbles: true });
  event.touches = type === 'touchend' ? [] : [{ clientY: y }];
  doc.dispatchEvent(event);
}

describe('createPullToRefresh', () => {
  let doc;
  let indicator;
  let scrollTop;
  let isEnabled;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('test');
    indicator = doc.createElement('div');
    doc.body.appendChild(indicator);
    scrollTop = 0;
    isEnabled = true;
  });

  function setup(onRefresh) {
    return createPullToRefresh(doc, {
      indicator,
      onRefresh,
      getScrollTop: () => scrollTop,
      isEnabled: () => isEnabled,
    });
  }

  it('refreshes when pulled down past the threshold from the top of the page', () => {
    const onRefresh = vi.fn();
    setup(onRefresh);
    touch(doc, 'touchstart', 100);
    touch(doc, 'touchmove', 100 + PULL_THRESHOLD_PX * 2 + 10);
    expect(indicator.classList.contains('ptr--armed')).toBe(true);
    touch(doc, 'touchend');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on a short pull', () => {
    const onRefresh = vi.fn();
    setup(onRefresh);
    touch(doc, 'touchstart', 100);
    touch(doc, 'touchmove', 120);
    touch(doc, 'touchend');
    expect(onRefresh).not.toHaveBeenCalled();
    expect(indicator.classList.contains('ptr--armed')).toBe(false);
  });

  it('does not refresh when the page is scrolled down', () => {
    const onRefresh = vi.fn();
    setup(onRefresh);
    scrollTop = 200;
    touch(doc, 'touchstart', 100);
    touch(doc, 'touchmove', 500);
    touch(doc, 'touchend');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not refresh when disabled (e.g. on a screen without sync)', () => {
    const onRefresh = vi.fn();
    setup(onRefresh);
    isEnabled = false;
    touch(doc, 'touchstart', 100);
    touch(doc, 'touchmove', 500);
    touch(doc, 'touchend');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('moves the indicator with the finger and resets it afterwards', () => {
    setup(vi.fn());
    touch(doc, 'touchstart', 100);
    touch(doc, 'touchmove', 160);
    expect(indicator.style.transform).toBe('translateY(30px)');
    touch(doc, 'touchend');
    expect(indicator.style.transform).toBe('');
  });

  it('logs a failed refresh instead of throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup(() => Promise.reject(new Error('offline')));
    touch(doc, 'touchstart', 0);
    touch(doc, 'touchmove', 400);
    touch(doc, 'touchend');
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledWith('[pull-to-refresh]', expect.any(Error));
    spy.mockRestore();
  });

  it('destroy() removes the listeners', () => {
    const onRefresh = vi.fn();
    const ptr = setup(onRefresh);
    ptr.destroy();
    touch(doc, 'touchstart', 0);
    touch(doc, 'touchmove', 400);
    touch(doc, 'touchend');
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
