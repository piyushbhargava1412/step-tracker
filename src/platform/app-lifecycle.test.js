import { describe, it, expect, vi } from 'vitest';
import { onAppResume } from './app-lifecycle.js';

describe('ST-021: onAppResume', () => {
  it('in the app, listens to Capacitor\'s resume event', () => {
    const app = { addListener: vi.fn() };
    const listener = vi.fn();

    onAppResume({ isNative: true, app, doc: document }, listener);

    expect(app.addListener).toHaveBeenCalledWith('resume', listener);
  });

  it('in the browser, fires when the page becomes visible again — not when it is hidden', () => {
    const listener = vi.fn();
    let state = 'hidden';
    const doc = new EventTarget();
    Object.defineProperty(doc, 'visibilityState', { get: () => state });

    onAppResume({ isNative: false, doc }, listener);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(listener).not.toHaveBeenCalled();

    state = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('logs, rather than throws, when the native listener cannot be added', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = { addListener: vi.fn().mockRejectedValue(new Error('no plugin')) };

    expect(() => onAppResume({ isNative: true, app, doc: document }, vi.fn())).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));

    expect(spy).toHaveBeenCalledWith('[app-lifecycle] resume listener failed', expect.any(Error));
    spy.mockRestore();
  });
});
