/**
 * Calendar Week / Month switch (#calendar-view-switch).
 * Shows #calendar-week or #calendar-month, keeps aria-selected in step, and
 * tells the caller which view is now showing (so it can render the week lazily).
 */

const VIEWS = ['week', 'month'];

/**
 * @param {Document} doc
 * @param {{ onChange?: (view: 'week'|'month') => void }} [options]
 * @returns {{ show: (view: string) => void, current: () => string }}
 */
export function initCalendarViewSwitch(doc, { onChange = () => {} } = {}) {
  let view = 'month';
  const switchEl = doc.getElementById('calendar-view-switch');

  function show(next) {
    if (!VIEWS.includes(next) || next === view) return;
    view = next;
    for (const name of VIEWS) {
      const panel = doc.getElementById(`calendar-${name}`);
      if (panel) panel.hidden = name !== view;
    }
    switchEl?.querySelectorAll('[data-calendar-view]').forEach((btn) => {
      btn.setAttribute('aria-selected', String(btn.dataset.calendarView === view));
    });
    try {
      onChange(view);
    } catch (err) {
      console.error('[calendar-view-switch]', err);
    }
  }

  switchEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-calendar-view]');
    if (btn) show(btn.dataset.calendarView);
  });

  return { show, current: () => view };
}
