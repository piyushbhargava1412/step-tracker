import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSplash, SPLASH_MIN_MS, SPLASH_MAX_MS, SPLASH_LEAVE_MS } from './splash.js';

/** The splash as index.html ships it — the welcome panel inside it — plus the app behind it. */
function mountSplash() {
  document.body.innerHTML = `
    <div id="splash" class="splash" aria-hidden="true">
      <p id="splash-tagline">Every step. Every streak.</p>
      <section id="onboarding" class="splash__welcome" hidden><button id="onboarding-skip">Not now</button></section>
    </div>
    <main></main>`;
  return document.getElementById('splash');
}

describe('splash — the launch surface', () => {
  let clock;
  const now = () => clock;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  /** Advance both the injected clock and the fake timers. */
  const advance = (ms) => {
    clock += ms;
    vi.advanceTimersByTime(ms);
  };
  const tap = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));

  describe('dismiss — straight into the app', () => {
    it('lets the animation finish before leaving when the app is ready early', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: false });

      advance(400);
      splash.dismiss();
      expect(el.classList.contains('splash--leaving')).toBe(false);

      advance(SPLASH_MIN_MS - 400);
      expect(el.classList.contains('splash--leaving')).toBe(true);
    });

    it('leaves straight away when the app is ready after the animation', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: false });

      advance(SPLASH_MIN_MS + 500);
      splash.dismiss();
      expect(el.classList.contains('splash--leaving')).toBe(true);
    });

    it('hides once it has faded out', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: false });

      advance(SPLASH_MIN_MS);
      splash.dismiss();
      expect(el.hidden).toBe(false);
      expect(splash.isShowing()).toBe(true);

      advance(SPLASH_LEAVE_MS);
      expect(el.hidden).toBe(true);
      expect(splash.isShowing()).toBe(false);
    });

    it('announces "splash:gone" on the document once it is hidden', () => {
      mountSplash();
      const gone = vi.fn();
      document.addEventListener('splash:gone', gone);
      const splash = createSplash({ doc: document, now, reducedMotion: true });

      splash.dismiss();
      expect(gone).not.toHaveBeenCalled();
      advance(SPLASH_LEAVE_MS);
      expect(gone).toHaveBeenCalledTimes(1);
      document.removeEventListener('splash:gone', gone);
    });

    it('a hold during the fade-out cancels the announcement', () => {
      mountSplash();
      const gone = vi.fn();
      document.addEventListener('splash:gone', gone);
      const splash = createSplash({ doc: document, now, reducedMotion: true });

      splash.dismiss();
      splash.hold();
      advance(SPLASH_LEAVE_MS);
      expect(gone).not.toHaveBeenCalled();
      document.removeEventListener('splash:gone', gone);
    });

    it('does not wait for the animation under reduced motion', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: true });

      splash.dismiss();
      expect(el.classList.contains('splash--leaving')).toBe(true);
    });

    it('is idempotent', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: true });

      splash.dismiss();
      splash.dismiss();
      advance(SPLASH_LEAVE_MS);
      expect(el.hidden).toBe(true);
      expect(() => splash.dismiss()).not.toThrow();
    });
  });

  describe('hold — the welcome needs the user', () => {
    it('stays after the animation and reveals the welcome panel', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: false });

      advance(300);
      splash.hold();
      expect(el.classList.contains('splash--welcome')).toBe(false);

      advance(SPLASH_MIN_MS - 300);
      expect(el.classList.contains('splash--welcome')).toBe(true);
      expect(el.classList.contains('splash--leaving')).toBe(false);
    });

    it('is no longer subject to the safety limit', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: false });

      splash.hold();
      advance(SPLASH_MAX_MS * 3);
      expect(el.hidden).toBe(false);
      expect(el.classList.contains('splash--leaving')).toBe(false);
    });

    it('becomes a dialog people can use, labelled by the catchline', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: true });

      splash.hold();
      expect(el.hasAttribute('aria-hidden')).toBe(false);
      expect(el.getAttribute('role')).toBe('dialog');
      expect(el.getAttribute('aria-modal')).toBe('true');
      expect(el.getAttribute('aria-labelledby')).toBe('splash-tagline');
    });

    it('taps on the welcome are for its buttons, not for skipping', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: true });

      splash.hold();
      tap(document.getElementById('onboarding-skip'));
      expect(el.classList.contains('splash--leaving')).toBe(false);
    });

    it('closing the welcome leaves into the app', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: false });

      splash.hold();
      advance(SPLASH_MIN_MS + 5000);
      splash.dismiss();
      expect(el.classList.contains('splash--leaving')).toBe(true);
      advance(SPLASH_LEAVE_MS);
      expect(el.hidden).toBe(true);
    });

    it('comes back with the welcome if it had already left (a slow first start)', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: false });

      advance(SPLASH_MAX_MS + SPLASH_LEAVE_MS);
      expect(el.hidden).toBe(true);

      splash.hold();
      expect(el.hidden).toBe(false);
      expect(el.classList.contains('splash--leaving')).toBe(false);
      expect(el.classList.contains('splash--welcome')).toBe(true);
    });

    it('a hold during the fade-out is not undone by it', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: true });

      splash.dismiss();
      splash.hold();
      advance(SPLASH_LEAVE_MS);
      expect(el.hidden).toBe(false);
      expect(el.classList.contains('splash--welcome')).toBe(true);
    });
  });

  describe('never blocks the app', () => {
    it('leaves on its own after the safety limit when the app never reports ready', () => {
      const el = mountSplash();
      createSplash({ doc: document, now, reducedMotion: false });

      advance(SPLASH_MAX_MS - 1);
      expect(el.classList.contains('splash--leaving')).toBe(false);

      advance(1);
      expect(el.classList.contains('splash--leaving')).toBe(true);
      advance(SPLASH_LEAVE_MS);
      expect(el.hidden).toBe(true);
    });

    it('counts the safety limit from page start, not from when it was created', () => {
      const el = mountSplash();
      clock = SPLASH_MAX_MS - 100;
      createSplash({ doc: document, now, reducedMotion: false });

      advance(100);
      expect(el.classList.contains('splash--leaving')).toBe(true);
    });

    it('a tap skips the rest of the animation', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: false });

      advance(200);
      splash.dismiss();
      tap(el);
      expect(el.classList.contains('splash--leaving')).toBe(true);
    });

    it('a tap before the app is ready means no waiting once it is', () => {
      const el = mountSplash();
      const splash = createSplash({ doc: document, now, reducedMotion: false });

      tap(el);
      expect(el.classList.contains('splash--leaving')).toBe(false);
      advance(100);
      splash.hold();
      expect(el.classList.contains('splash--welcome')).toBe(true);
    });

    it('does nothing when the page has no splash', () => {
      document.body.innerHTML = '<main></main>';
      const splash = createSplash({ doc: document, now, reducedMotion: false });

      expect(splash.isShowing()).toBe(false);
      expect(() => splash.dismiss()).not.toThrow();
      expect(() => splash.hold()).not.toThrow();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('defaults', () => {
    it('reads reduced motion from the document\'s window', () => {
      const el = mountSplash();
      const matchMedia = vi.fn(() => ({ matches: true }));
      const doc = { getElementById: (id) => document.getElementById(id), defaultView: { matchMedia } };
      const splash = createSplash({ doc, now });

      splash.dismiss();
      expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
      expect(el.classList.contains('splash--leaving')).toBe(true);
    });

    it('treats a window without matchMedia as full motion', () => {
      const el = mountSplash();
      const doc = { getElementById: (id) => document.getElementById(id), defaultView: {} };
      const splash = createSplash({ doc, now });

      splash.dismiss();
      expect(el.classList.contains('splash--leaving')).toBe(false);
    });

    it('the animation fits well inside the safety limit', () => {
      expect(SPLASH_MIN_MS).toBeLessThan(SPLASH_MAX_MS);
      expect(SPLASH_MIN_MS).toBeLessThanOrEqual(2000);
    });
  });
});
