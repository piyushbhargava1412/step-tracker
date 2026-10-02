/**
 * The launch surface: the Walkaholic mark — the streak ring fills, the flame
 * lights, "walk" + "aholic" slide in from either side, then the catchline.
 * The markup and animation live in index.html / styles.css so they play from
 * the first paint, before any script runs; this module decides what happens
 * once the app is ready:
 *
 * - dismiss(): fade into the app.
 * - hold(): stay, and reveal the first-launch welcome (#onboarding, inside the
 *   splash) — onboarding-ui.js owns its content and buttons; closing it calls
 *   dismiss().
 *
 * Either waits until the animation has played (SPLASH_MIN_MS) — no wait under
 * reduced motion, or once a tap has skipped it. Until then the splash leaves
 * by itself after SPLASH_MAX_MS, so a failed start never traps the user; a
 * hold() after that brings it back. Once it has faded out it dispatches
 * "splash:gone" on the document (the goal celebration waits for it).
 */

/** Length of the CSS animation (styles.css › .splash). */
export const SPLASH_MIN_MS = 1700;

/** Safety limit: the splash leaves by itself if the app never reports ready. */
export const SPLASH_MAX_MS = 4000;

/** Fade-out duration (styles.css › .splash--leaving). */
export const SPLASH_LEAVE_MS = 350;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const TAGLINE_ID = 'splash-tagline';

function prefersReducedMotion(doc) {
  return Boolean(doc?.defaultView?.matchMedia?.(REDUCED_MOTION_QUERY)?.matches);
}

/**
 * @param {object} [options]
 * @param {Document} [options.doc]
 * @param {() => number} [options.now]  ms since the page started (performance.now)
 * @param {boolean} [options.reducedMotion]  defaults to the user's OS setting
 * @returns {{ dismiss: () => void, hold: () => void, isShowing: () => boolean }}
 */
export function createSplash({
  doc = document,
  now = () => performance.now(),
  reducedMotion = prefersReducedMotion(doc),
} = {}) {
  const el = doc?.getElementById?.('splash');
  if (!el) return { dismiss() {}, hold() {}, isShowing: () => false };

  let leaving = false;
  let held = false;
  let skipped = false;
  let safetyTimer = null;
  let pendingTimer = null;
  let pendingAction = null;

  /** Run `action` once the animation has played. */
  function afterAnimation(action) {
    clearTimeout(pendingTimer);
    pendingAction = action;
    const wait = reducedMotion || skipped ? 0 : SPLASH_MIN_MS - now();
    if (wait > 0) {
      pendingTimer = setTimeout(runPending, wait);
    } else {
      runPending();
    }
  }

  function runPending() {
    clearTimeout(pendingTimer);
    const action = pendingAction;
    pendingAction = null;
    action?.();
  }

  function leave() {
    if (leaving) return;
    leaving = true;
    clearTimeout(safetyTimer);
    el.classList.add('splash--leaving');
    setTimeout(() => {
      if (!leaving) return;
      el.hidden = true;
      doc.dispatchEvent?.(new Event('splash:gone'));
    }, SPLASH_LEAVE_MS);
  }

  function revealWelcome() {
    el.classList.add('splash--welcome');
  }

  function onTap() {
    if (held) return;
    skipped = true;
    if (pendingAction) runPending();
  }

  safetyTimer = setTimeout(leave, Math.max(0, SPLASH_MAX_MS - now()));
  el.addEventListener('click', onTap);

  return {
    /** The app is ready (or the welcome was closed): fade into it. */
    dismiss() {
      if (leaving) return;
      afterAnimation(leave);
    },

    /** The welcome needs the user: stay, as a dialog, and reveal it. */
    hold() {
      held = true;
      leaving = false;
      clearTimeout(safetyTimer);
      el.hidden = false;
      el.classList.remove('splash--leaving');
      el.removeAttribute('aria-hidden');
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', TAGLINE_ID);
      afterAnimation(revealWelcome);
    },

    isShowing: () => el.isConnected && !el.hidden,
  };
}
