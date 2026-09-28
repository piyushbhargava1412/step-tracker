import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createNavigator, SCREENS, TAB_SCREENS } from './navigation.js';

function buildDoc() {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = `
    <header class="app-bar">
      <button id="app-back" data-back hidden>Back</button>
      <span id="app-subtitle"></span>
      <h1 id="app-title"></h1>
      <button data-go="search">Search</button>
      <button data-go="settings">Settings</button>
    </header>
    <section id="tab-today" data-screen></section>
    <section id="tab-calendar" data-screen hidden>
      <button data-nav="prev">Prev month</button>
    </section>
    <section id="tab-insights" data-screen hidden></section>
    <section id="tab-journey" data-screen hidden></section>
    <section id="tab-search" data-screen hidden></section>
    <section id="tab-challenge" data-screen hidden></section>
    <section id="tab-settings" data-screen hidden>
      <button data-go="backup">Backup</button>
    </section>
    <section id="tab-backup" data-screen hidden></section>
    <aside id="day-drawer" data-overlay hidden></aside>
    <nav class="bottom-nav">
      <button data-tab="today">Today</button>
      <button data-tab="calendar">Calendar</button>
      <button data-tab="insights">Insights</button>
      <button data-tab="journey">Journey</button>
    </nav>
  `;
  return doc;
}

const visible = (doc) =>
  [...doc.querySelectorAll('[data-screen]')].filter((el) => !el.hidden).map((el) => el.id);

describe('navigation — screen registry', () => {
  it('has exactly four bottom tabs, Today first, and no Map tab', () => {
    expect(TAB_SCREENS).toEqual(['today', 'calendar', 'insights', 'journey']);
    expect(SCREENS.spatial).toBeUndefined();
  });

  it('gives every pushed screen a parent and every screen a title', () => {
    for (const [name, screen] of Object.entries(SCREENS)) {
      expect(screen.title, name).toBeTruthy();
      if (!TAB_SCREENS.includes(name)) expect(SCREENS[screen.parent], name).toBeDefined();
    }
  });

  it('keeps Backup inside Settings', () => {
    expect(SCREENS.backup.parent).toBe('settings');
  });
});

describe('createNavigator', () => {
  let doc;
  let nav;
  beforeEach(() => {
    doc = buildDoc();
    nav = createNavigator(doc, { today: () => new Date(2026, 8, 28) });
    nav.bind();
  });

  it('starts on Today with the date as subtitle and no back button', () => {
    expect(nav.current()).toBe('today');
    expect(visible(doc)).toEqual(['tab-today']);
    expect(doc.getElementById('app-title').textContent).toBe('Today');
    expect(doc.getElementById('app-subtitle').textContent).toBe('Monday, 28 September');
    expect(doc.getElementById('app-back').hidden).toBe(true);
    expect(doc.body.dataset.activeScreen).toBe('today');
  });

  it('switches bottom tabs and marks the active one', () => {
    nav.go('calendar');
    expect(visible(doc)).toEqual(['tab-calendar']);
    const current = doc.querySelector('[data-tab][aria-current="page"]');
    expect(current.dataset.tab).toBe('calendar');
    expect(doc.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(doc.getElementById('app-title').textContent).toBe('Calendar');
    expect(doc.getElementById('app-subtitle').textContent).toBe('');
    expect(doc.getElementById('app-back').hidden).toBe(true);
  });

  it('pushes a secondary screen with a back button, keeping its tab highlighted', () => {
    nav.go('settings');
    expect(visible(doc)).toEqual(['tab-settings']);
    expect(doc.getElementById('app-back').hidden).toBe(false);
    expect(doc.getElementById('app-title').textContent).toBe('Settings');
    expect(doc.querySelector('[data-tab][aria-current="page"]').dataset.tab).toBe('today');
  });

  it('back() pops pushed screens in order, then returns to Today, then reports the root', () => {
    nav.go('calendar');
    nav.go('settings');
    nav.go('backup');
    expect(nav.back()).toBe(true);
    expect(nav.current()).toBe('settings');
    expect(nav.back()).toBe(true);
    expect(nav.current()).toBe('calendar');
    expect(nav.back()).toBe(true);
    expect(nav.current()).toBe('today');
    expect(nav.back()).toBe(false);
  });

  it('going to a tab clears the pushed-screen stack', () => {
    nav.go('settings');
    nav.go('journey');
    expect(nav.back()).toBe(true);
    expect(nav.current()).toBe('today');
  });

  it('does not stack the same screen twice', () => {
    nav.go('search');
    nav.go('search');
    nav.back();
    expect(nav.current()).toBe('today');
  });

  it('ignores unknown screen names', () => {
    nav.go('spatial');
    expect(nav.current()).toBe('today');
  });

  it('runs the enter hook of the screen it shows', () => {
    const onEnter = vi.fn();
    const doc2 = buildDoc();
    const nav2 = createNavigator(doc2, { onEnter: { settings: onEnter } });
    nav2.go('settings');
    expect(onEnter).toHaveBeenCalledTimes(1);
    nav2.go('backup');
    nav2.back();
    expect(onEnter).toHaveBeenCalledTimes(2);
  });

  it('a failing enter hook is logged, not thrown', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const doc2 = buildDoc();
    const nav2 = createNavigator(doc2, { onEnter: { search: () => { throw new Error('boom'); } } });
    expect(() => nav2.go('search')).not.toThrow();
    expect(nav2.current()).toBe('search');
    expect(spy).toHaveBeenCalledWith('[navigation]', expect.any(Error));
    spy.mockRestore();
  });

  it('handles clicks on data-tab, data-go and data-back', () => {
    doc.querySelector('[data-tab="insights"]').click();
    expect(nav.current()).toBe('insights');
    doc.querySelector('[data-go="settings"]').click();
    expect(nav.current()).toBe('settings');
    doc.querySelector('#tab-settings [data-go="backup"]').click();
    expect(nav.current()).toBe('backup');
    doc.getElementById('app-back').click();
    expect(nav.current()).toBe('settings');
  });

  it('leaves data-nav (calendar month arrows) alone', () => {
    nav.go('calendar');
    doc.querySelector('[data-nav="prev"]').click();
    expect(nav.current()).toBe('calendar');
  });

  it('back() closes an open overlay before leaving the screen', () => {
    nav.go('calendar');
    const drawer = doc.getElementById('day-drawer');
    drawer.hidden = false;
    const onKey = vi.fn();
    doc.addEventListener('keydown', onKey);
    expect(nav.back()).toBe(true);
    expect(onKey).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
    expect(nav.current()).toBe('calendar');
  });

  it('scrolls to the top when the screen changes', () => {
    const scrollTo = vi.fn();
    const doc2 = buildDoc();
    const nav2 = createNavigator(doc2, { scrollTo });
    nav2.go('journey');
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('re-binding does not double-handle clicks', () => {
    nav.bind();
    nav.go('settings');
    doc.querySelector('#tab-settings [data-go="backup"]').click();
    doc.getElementById('app-back').click();
    expect(nav.current()).toBe('settings');
  });
});
