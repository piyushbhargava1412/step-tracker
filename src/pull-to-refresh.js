// pull-to-refresh.js — drag down from the top of the page to sync.
//
// The finger's travel is halved (a resistant feel) and shown by moving the
// indicator; releasing past PULL_THRESHOLD_PX of indicator travel runs
// onRefresh. Only starts at the very top of the page and while isEnabled().

/** Indicator travel (px) that arms a refresh. */
export const PULL_THRESHOLD_PX = 64;
const MAX_TRAVEL_PX = 96;

/**
 * @param {Document} doc
 * @param {{
 *   indicator: HTMLElement,
 *   onRefresh: () => (void|Promise<void>),
 *   getScrollTop?: () => number,
 *   isEnabled?: () => boolean,
 * }} options
 * @returns {{ destroy: () => void }}
 */
export function createPullToRefresh(doc, {
  indicator,
  onRefresh,
  getScrollTop = () => doc.scrollingElement?.scrollTop ?? 0,
  isEnabled = () => true,
}) {
  const controller = new (doc.defaultView?.AbortController ?? AbortController)();
  const { signal } = controller;
  let startY = null;
  let travel = 0;

  function reset() {
    startY = null;
    travel = 0;
    indicator.style.transform = '';
    indicator.classList.remove('ptr--pulling', 'ptr--armed');
  }

  doc.addEventListener('touchstart', (event) => {
    if (!isEnabled() || getScrollTop() > 0 || !event.touches?.length) return;
    startY = event.touches[0].clientY;
  }, { signal, passive: true });

  doc.addEventListener('touchmove', (event) => {
    if (startY === null || !event.touches?.length) return;
    const pulled = event.touches[0].clientY - startY;
    if (pulled <= 0) {
      travel = 0;
      indicator.style.transform = '';
      return;
    }
    travel = Math.min(MAX_TRAVEL_PX, pulled / 2);
    indicator.style.transform = `translateY(${travel}px)`;
    indicator.classList.add('ptr--pulling');
    indicator.classList.toggle('ptr--armed', travel >= PULL_THRESHOLD_PX);
  }, { signal, passive: true });

  doc.addEventListener('touchend', () => {
    if (startY === null) return;
    const armed = travel >= PULL_THRESHOLD_PX;
    reset();
    if (!armed) return;
    const fail = (err) => console.error('[pull-to-refresh]', err);
    try {
      Promise.resolve(onRefresh()).catch(fail);
    } catch (err) {
      fail(err);
    }
  }, { signal });

  return { destroy: () => controller.abort() };
}
