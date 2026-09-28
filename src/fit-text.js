/**
 * Fit-to-width for a single line of large text (the Today ring's step count).
 *
 * Scales the text through the `--fit` custom property, which the stylesheet
 * multiplies into the font size: `font-size: calc(40px * var(--fit, 1))`.
 * Scaling a factor rather than writing a pixel size keeps the platform's text
 * zoom (Android's system font size) applied exactly once.
 *
 * The element must clip on one line (`white-space: nowrap; overflow: hidden;
 * max-width: 100%`) so its scrollWidth reports the width the text needs.
 * Layout-dependent: a no-op wherever nothing has a width (a hidden screen, jsdom).
 */

export const MIN_FIT_SCALE = 0.5;

/**
 * Fit `el`'s text to its own width.
 * @param {HTMLElement | null} el
 * @returns {number} the scale applied (1 = full size)
 */
export function fitText(el) {
  if (!el) return 1;
  el.style.removeProperty('--fit');

  const available = el.clientWidth;
  const needed = el.scrollWidth;
  if (!available || needed <= available) return 1;

  const scale = Math.max(MIN_FIT_SCALE, Math.floor((available / needed) * 100) / 100);
  el.style.setProperty('--fit', String(scale));
  return scale;
}

/**
 * Fit `el` now and again whenever `box` resizes — so text rendered while its
 * screen was hidden fits once the screen is shown, and after a rotation.
 * @param {HTMLElement} el
 * @param {HTMLElement} box  the element whose size bounds `el`
 * @returns {() => void} stops watching
 */
export function keepTextFitted(el, box) {
  const Observer = el.ownerDocument?.defaultView?.ResizeObserver;
  if (!Observer) {
    fitText(el);
    return () => {};
  }
  const observer = new Observer(() => fitText(el));
  observer.observe(box);
  return () => observer.disconnect();
}
