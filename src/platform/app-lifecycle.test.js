import { describe, it, expect, vi } from 'vitest';
import { onAppResume, onBackButton } from './app-lifecycle.js';

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

describe('onBackButton', () => {
  it('in the app, runs the handler on the Android back button', () => {
    let registered;
    const app = { addListener: vi.fn((event, fn) => { registered = fn; }), exitApp: vi.fn() };
    const handler = vi.fn(() => true);

    onBackButton({ isNative: true, app }, handler);
    expect(app.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));

    registered();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(app.exitApp).not.toHaveBeenCalled();
  });

  it('leaves the app when the handler has nothing left to go back to', () => {
    let registered;
    const app = { addListener: vi.fn((event, fn) => { registered = fn; }), exitApp: vi.fn() };

    onBackButton({ isNative: true, app }, () => false);
    registered();

    expect(app.exitApp).toHaveBeenCalledTimes(1);
  });

  it('does nothing in the browser (the browser owns its back button)', () => {
    const app = { addListener: vi.fn(), exitApp: vi.fn() };
    onBackButton({ isNative: false, app }, vi.fn());
    expect(app.addListener).not.toHaveBeenCalled();
  });

  it('logs, rather than throws, when the native listener cannot be added', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = { addListener: vi.fn().mockRejectedValue(new Error('no plugin')), exitApp: vi.fn() };

    expect(() => onBackButton({ isNative: true, app }, vi.fn())).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));

    expect(spy).toHaveBeenCalledWith('[app-lifecycle] back button listener failed', expect.any(Error));
    spy.mockRestore();
  });
});
