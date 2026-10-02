import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGoalCelebration, CELEBRATED_KEY, GOAL_FLAME_MS } from './goal-celebration.js';

function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: vi.fn((k) => (k in data ? data[k] : null)),
    setItem: vi.fn((k, v) => { data[k] = String(v); }),
  };
}

/** Today's panel with its step count, as progress-ui renders it. */
function mountToday() {
  document.body.innerHTML = '<div id="today-progress"><div class="ring"><span class="ring__steps">10,250</span></div></div>';
  const steps = document.querySelector('.ring__steps');
  steps.getBoundingClientRect = () => ({ left: 100, top: 300, width: 120, height: 40, right: 220, bottom: 340 });
  return steps;
}

const flame = () => document.querySelector('.goal-flame');

describe('goal celebration — the flame that drops onto a met goal', () => {
  let storage;
  let canPlay;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = makeStorage();
    canPlay = vi.fn(() => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  const create = (options = {}) => createGoalCelebration({
    doc: document, storage, canPlay, today: () => '2026-10-02', reducedMotion: false, ...options,
  });

  describe('plays', () => {
    it('drops a decorative, lit brand flame onto the step count', () => {
      mountToday();
      create().goalMet();

      const el = flame();
      expect(el).not.toBeNull();
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.querySelector('.goal-flame__flame.brand-flame--lit')).not.toBeNull();
      expect(el.querySelector('.goal-flame__glow')).not.toBeNull();
    });

    it('lands centred on the step count, falling from above the screen', () => {
      mountToday();
      create().goalMet();

      const el = flame();
      expect(el.style.left).toBe('160px');
      expect(el.style.top).toBe('320px');
      expect(el.style.getPropertyValue('--goal-flame-drop')).toBe('-440px');
    });

    it('clears itself away once the animation is over', () => {
      mountToday();
      create().goalMet();

      vi.advanceTimersByTime(GOAL_FLAME_MS - 1);
      expect(flame()).not.toBeNull();
      vi.advanceTimersByTime(1);
      expect(flame()).toBeNull();
    });

    it('under reduced motion it glows in place instead of falling', () => {
      mountToday();
      create({ reducedMotion: true }).goalMet();
      expect(flame().classList.contains('goal-flame--still')).toBe(true);
    });

    it('reads reduced motion from the document\'s window by default', () => {
      mountToday();
      const matchMedia = vi.fn(() => ({ matches: true }));
      Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true });
      try {
        createGoalCelebration({ doc: document, storage, canPlay, today: () => '2026-10-02' }).goalMet();
        expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
        expect(flame().classList.contains('goal-flame--still')).toBe(true);
      } finally {
        delete window.matchMedia;
      }
    });
  });

  describe('once a day', () => {
    it('remembers the day it celebrated', () => {
      mountToday();
      create().goalMet();
      expect(storage.setItem).toHaveBeenCalledWith(CELEBRATED_KEY, '2026-10-02');
    });

    it('does not replay on later renders the same day', () => {
      mountToday();
      const celebration = create();
      celebration.goalMet();
      vi.advanceTimersByTime(GOAL_FLAME_MS);
      celebration.goalMet();
      expect(flame()).toBeNull();
    });

    it('does not replay after the app restarts the same day', () => {
      mountToday();
      storage = makeStorage({ [CELEBRATED_KEY]: '2026-10-02' });
      create().goalMet();
      expect(flame()).toBeNull();
    });

    it('celebrates again the next day', () => {
      mountToday();
      storage = makeStorage({ [CELEBRATED_KEY]: '2026-10-01' });
      create().goalMet();
      expect(flame()).not.toBeNull();
    });

    it('plays once even if the goal is reported twice while it is falling', () => {
      mountToday();
      const celebration = create();
      celebration.goalMet();
      celebration.goalMet();
      expect(document.querySelectorAll('.goal-flame')).toHaveLength(1);
    });
  });

  describe('waits until Today is on screen', () => {
    it('holds a met goal while it cannot play, and plays on flush once it can', () => {
      mountToday();
      canPlay.mockReturnValue(false);
      const celebration = create();

      celebration.goalMet();
      expect(flame()).toBeNull();
      expect(storage.setItem).not.toHaveBeenCalled();

      canPlay.mockReturnValue(true);
      celebration.flush();
      expect(flame()).not.toBeNull();
    });

    it('flush does nothing when no goal was met', () => {
      mountToday();
      create().flush();
      expect(flame()).toBeNull();
    });

    it('waits while the step count is not on the page', () => {
      document.body.innerHTML = '';
      const celebration = create();
      celebration.goalMet();
      expect(flame()).toBeNull();

      mountToday();
      celebration.flush();
      expect(flame()).not.toBeNull();
    });

    it('a failing canPlay counts as "not yet", logged', () => {
      mountToday();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      canPlay.mockImplementation(() => { throw new Error('not ready'); });
      expect(() => create().goalMet()).not.toThrow();
      expect(flame()).toBeNull();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('storage trouble never blocks the celebration', () => {
    it('plays when storage cannot be read or written', () => {
      mountToday();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      storage = { getItem: vi.fn(() => { throw new Error('blocked'); }), setItem: vi.fn(() => { throw new Error('blocked'); }) };
      create().goalMet();
      expect(flame()).not.toBeNull();
      spy.mockRestore();
    });
  });
});
