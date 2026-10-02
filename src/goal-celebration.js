/**
 * Goal celebration (ST-029): when today's goal is met, a translucent brand
 * flame drops from above the screen onto Today's step count, glows, and
 * fades away. styles.css (.goal-flame) holds the animation.
 *
 * Once a day: the first time Today is actually on screen with the goal met —
 * progress-ui reports a met goal on every render; main.js says when the
 * celebration may play (Today showing, no splash or welcome over it) and
 * calls flush() when that changes. The day is remembered in storage, so a
 * restart or a later sync does not replay it.
 */

import { createBrandFlame } from './brand-mark.js';
import { _localDate } from './date-utils.js';

export const CELEBRATED_KEY = 'goal_celebrated_on';

/** Length of the CSS animation (styles.css › .goal-flame); the overlay is removed after it. */
export const GOAL_FLAME_MS = 2800;

/** The falling flame's height (px); it starts this far above the top of the screen. */
const FLAME_SIZE = 120;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(doc) {
  return Boolean(doc?.defaultView?.matchMedia?.(REDUCED_MOTION_QUERY)?.matches);
}

/**
 * @param {{
 *   doc: Document,
 *   storage: Storage,
 *   canPlay: () => boolean,        Today is on screen with nothing over it
 *   today?: () => string,          local date, "YYYY-MM-DD"
 *   reducedMotion?: boolean,       defaults to the user's OS setting
 * }} deps
 * @returns {{ goalMet: () => void, flush: () => void }}
 */
export function createGoalCelebration({
  doc,
  storage,
  canPlay,
  today = () => _localDate(Date.now()),
  reducedMotion = prefersReducedMotion(doc),
}) {
  let pending = false;

  function _celebratedToday() {
    try {
      return storage?.getItem(CELEBRATED_KEY) === today();
    } catch (err) {
      console.error('[goal-celebration]', err);
      return false;
    }
  }

  function _remember() {
    try {
      storage?.setItem(CELEBRATED_KEY, today());
    } catch (err) {
      console.error('[goal-celebration]', err);
    }
  }

  function _mayPlay() {
    try {
      return Boolean(canPlay());
    } catch (err) {
      console.error('[goal-celebration]', err);
      return false;
    }
  }

  function _play(anchor) {
    const rect = anchor.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const overlay = doc.createElement('div');
    overlay.className = reducedMotion ? 'goal-flame goal-flame--still' : 'goal-flame';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.left = `${centerX}px`;
    overlay.style.top = `${centerY}px`;
    overlay.style.setProperty('--goal-flame-drop', `${-(centerY + FLAME_SIZE)}px`);

    const glow = doc.createElement('div');
    glow.className = 'goal-flame__glow';
    const flame = createBrandFlame(doc, { size: FLAME_SIZE });
    flame.classList.add('goal-flame__flame');
    overlay.append(glow, flame);

    doc.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), GOAL_FLAME_MS);
  }

  /** Play the pending celebration if Today is on screen. */
  function flush() {
    if (!pending || !_mayPlay()) return;
    const anchor = doc.querySelector('#today-progress .ring__steps');
    if (!anchor) return;
    pending = false;
    _remember();
    _play(anchor);
  }

  return {
    /** Today's progress rendered with the goal met. */
    goalMet() {
      if (pending || _celebratedToday()) return;
      pending = true;
      flush();
    },
    flush,
  };
}
