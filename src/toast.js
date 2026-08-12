/**
 * Transient fade-out notification toast.
 *
 * A single shared `#app-toast` popup anchored to the bottom of the viewport.
 * `showToast` updates its text and re-runs the fade-in animation; the toast
 * fades back out after `TOAST_MS` via the `.show` class removal. Called again
 * while visible simply restarts the timer — no stacking.
 *
 * The element is created lazily (attached to <body>) when the app shell does
 * not already provide one, so the notifier works in any DOM.
 */

/** How long the toast stays fully visible before fading out. */
export const TOAST_MS = 3000;

let toastTimer = null;

/**
 * Show a fading popup message.
 * @param {Document} doc   - The DOM document (injected for testability).
 * @param {string} message - The message text to display.
 * @param {number} [ms]    - Visible duration before fade-out (default TOAST_MS).
 */
export function showToast(doc = document, message, ms = TOAST_MS) {
  let toast = doc.getElementById('app-toast');
  if (!toast) {
    toast = doc.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    (doc.body || doc.documentElement).appendChild(toast);
  }

  toast.textContent = message;

  // Restart the fade-in even if the toast is already visible (remove → reflow
  // → add) so consecutive messages never stick mid-transition.
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
}