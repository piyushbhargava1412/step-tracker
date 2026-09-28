// navigation.js — mobile screen navigation.
//
// Four bottom tabs (Today, Calendar, Insights, Journey) plus secondary screens
// that are pushed on top of the current tab (Search, Group challenge,
// Settings, and Backup inside Settings). Each screen is an element
// `#tab-<name>` carrying `data-screen`; the navigator shows exactly one of them
// (via the `hidden` attribute), updates the app bar title / back button and the
// bottom-nav highlight, and keeps a small back stack so the Android back button
// and the app-bar back arrow retrace the user's steps.

/** Bottom-nav tabs, in display order. */
export const TAB_SCREENS = ['today', 'calendar', 'insights', 'journey'];

/**
 * Every screen: its app-bar title and, for pushed screens, the screen it
 * belongs under (used to keep the right bottom tab highlighted).
 */
export const SCREENS = {
  today: { title: 'Today' },
  calendar: { title: 'Calendar' },
  insights: { title: 'Insights' },
  journey: { title: 'Journey' },
  search: { title: 'Search days', parent: 'today' },
  challenge: { title: 'Group challenge', parent: 'today' },
  settings: { title: 'Settings', parent: 'today' },
  backup: { title: 'Backup & restore', parent: 'settings' },
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "Monday, 28 September" — the Today screen's subtitle. */
export function _formatTodaySubtitle(date) {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** The bottom tab a screen lives under (a tab is its own). */
function _tabOf(name) {
  let current = name;
  while (current && !TAB_SCREENS.includes(current)) current = SCREENS[current]?.parent;
  return current || 'today';
}

/**
 * @param {Document} doc
 * @param {{
 *   onEnter?: Record<string, () => void>,  hooks run each time a screen is shown
 *   today?: () => Date,                    clock for the Today subtitle (tests)
 *   scrollTo?: (x: number, y: number) => void,
 * }} [options]
 * @returns {{ go: (name: string) => void, back: () => boolean, current: () => string, bind: () => void }}
 */
export function createNavigator(doc, { onEnter = {}, today = () => new Date(), scrollTo } = {}) {
  let stack = [];
  let clickController = null;
  const scrollTop = scrollTo || (() => {
    if (doc.scrollingElement) doc.scrollingElement.scrollTop = 0;
  });

  function _show(name) {
    doc.querySelectorAll('[data-screen]').forEach((el) => {
      el.hidden = el.id !== `tab-${name}`;
    });

    const tab = _tabOf(name);
    doc.querySelectorAll('[data-tab]').forEach((btn) => {
      if (btn.dataset.tab === tab) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    const title = doc.getElementById('app-title');
    if (title) title.textContent = SCREENS[name].title;
    const subtitle = doc.getElementById('app-subtitle');
    if (subtitle) subtitle.textContent = name === 'today' ? _formatTodaySubtitle(today()) : '';
    const backBtn = doc.getElementById('app-back');
    if (backBtn) backBtn.hidden = stack.length <= 1;
    if (doc.body) doc.body.dataset.activeScreen = name;

    scrollTop(0, 0);
    try {
      onEnter[name]?.();
    } catch (err) {
      console.error('[navigation]', err);
    }
  }

  function go(name) {
    if (!SCREENS[name]) return;
    if (TAB_SCREENS.includes(name)) {
      stack = [name];
    } else if (stack[stack.length - 1] !== name) {
      stack.push(name);
    }
    _show(name);
  }

  /**
   * One step back: close an open overlay (day sheet, photo) first, then pop a
   * pushed screen, then fall back to Today. Returns false only on Today with
   * nothing open — the caller may then leave the app.
   */
  function back() {
    const overlay = doc.querySelector('[data-overlay]:not([hidden])');
    if (overlay) {
      const KeyboardEventCtor = doc.defaultView?.KeyboardEvent ?? KeyboardEvent;
      doc.dispatchEvent(new KeyboardEventCtor('keydown', { key: 'Escape' }));
      return true;
    }
    if (stack.length > 1) {
      stack.pop();
      _show(stack[stack.length - 1]);
      return true;
    }
    if (current() !== 'today') {
      go('today');
      return true;
    }
    return false;
  }

  function current() {
    return stack[stack.length - 1];
  }

  /** One delegated click listener for tabs, `data-go` links and `data-back`. */
  function bind() {
    clickController?.abort();
    clickController = new (doc.defaultView?.AbortController ?? AbortController)();
    doc.addEventListener('click', (event) => {
      const target = event.target.closest?.('[data-tab], [data-go], [data-back]');
      if (!target) return;
      if (target.hasAttribute('data-back')) back();
      else go(target.dataset.tab || target.dataset.go);
    }, { signal: clickController.signal });
  }

  go('today');
  return { go, back, current, bind };
}
