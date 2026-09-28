import { describe, it, expect, vi } from 'vitest';
import { initCalendarViewSwitch } from './calendar-view-switch.js';

function buildDoc() {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = `
    <div id="calendar-view-switch" role="tablist">
      <button data-calendar-view="week" aria-selected="false">Week</button>
      <button data-calendar-view="month" aria-selected="true">Month</button>
    </div>
    <div id="calendar-month"></div>
    <div id="calendar-week" hidden></div>`;
  return doc;
}

const selected = (doc) => doc.querySelector('[aria-selected="true"]').dataset.calendarView;

describe('initCalendarViewSwitch', () => {
  it('starts on Month', () => {
    const doc = buildDoc();
    const sw = initCalendarViewSwitch(doc);
    expect(sw.current()).toBe('month');
  });

  it('tapping Week shows the week view, hides the month and reports the change', () => {
    const doc = buildDoc();
    const onChange = vi.fn();
    initCalendarViewSwitch(doc, { onChange });
    doc.querySelector('[data-calendar-view="week"]').click();
    expect(doc.getElementById('calendar-week').hidden).toBe(false);
    expect(doc.getElementById('calendar-month').hidden).toBe(true);
    expect(selected(doc)).toBe('week');
    expect(onChange).toHaveBeenCalledWith('week');
  });

  it('tapping the current view again does nothing', () => {
    const doc = buildDoc();
    const onChange = vi.fn();
    initCalendarViewSwitch(doc, { onChange });
    doc.querySelector('[data-calendar-view="month"]').click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('show() switches programmatically and ignores unknown views', () => {
    const doc = buildDoc();
    const sw = initCalendarViewSwitch(doc);
    sw.show('week');
    sw.show('year');
    expect(sw.current()).toBe('week');
    sw.show('month');
    expect(doc.getElementById('calendar-month').hidden).toBe(false);
    expect(selected(doc)).toBe('month');
  });

  it('a throwing onChange is logged, and the view still switches', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const doc = buildDoc();
    initCalendarViewSwitch(doc, { onChange: () => { throw new Error('x'); } });
    doc.querySelector('[data-calendar-view="week"]').click();
    expect(doc.getElementById('calendar-week').hidden).toBe(false);
    expect(spy).toHaveBeenCalledWith('[calendar-view-switch]', expect.any(Error));
    spy.mockRestore();
  });

  it('is a no-op without the switch', () => {
    const doc = document.implementation.createHTMLDocument('test');
    expect(() => initCalendarViewSwitch(doc).show('week')).not.toThrow();
  });
});
