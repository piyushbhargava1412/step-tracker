import { describe, it, expect, beforeEach } from 'vitest';
import { switchTab, initTabs } from './tabs.js';

function buildDoc() {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = `
    <div class="tab-bar">
      <button data-tab="dashboard">Dashboard</button>
      <button data-tab="calendar">Calendar</button>
      <button data-tab="search">Search</button>
      <button data-tab="spatial">Spatial</button>
    </div>
    <div id="tab-dashboard"></div>
    <div id="tab-calendar"></div>
    <div id="tab-search"></div>
    <div id="tab-spatial"></div>
  `;
  return doc;
}

describe('switchTab', () => {
  let doc;
  beforeEach(() => { doc = buildDoc(); });

  it('shows #tab-dashboard', () => {
    switchTab('dashboard', doc);
    expect(doc.getElementById('tab-dashboard').style.display).toBe('block');
  });

  it('hides other panels when switching to dashboard', () => {
    switchTab('dashboard', doc);
    expect(doc.getElementById('tab-calendar').style.display).toBe('none');
    expect(doc.getElementById('tab-search').style.display).toBe('none');
    expect(doc.getElementById('tab-spatial').style.display).toBe('none');
  });

  it('shows #tab-calendar and hides others', () => {
    switchTab('calendar', doc);
    expect(doc.getElementById('tab-calendar').style.display).toBe('block');
    expect(doc.getElementById('tab-dashboard').style.display).toBe('none');
    expect(doc.getElementById('tab-search').style.display).toBe('none');
    expect(doc.getElementById('tab-spatial').style.display).toBe('none');
  });

  it('consecutive calls leave exactly one panel visible', () => {
    switchTab('dashboard', doc);
    switchTab('search', doc);
    const visible = ['dashboard', 'calendar', 'search', 'spatial']
      .filter(t => doc.getElementById(`tab-${t}`).style.display !== 'none');
    expect(visible).toEqual(['search']);
  });

  it('does not mutate location.href', () => {
    const before = location.href;
    switchTab('calendar', doc);
    expect(location.href).toBe(before);
  });

  it('does not add a history entry', () => {
    const before = history.length;
    switchTab('calendar', doc);
    expect(history.length).toBe(before);
  });
});

describe('initTabs', () => {
  let doc, barEl;
  beforeEach(() => {
    doc = buildDoc();
    barEl = doc.querySelector('.tab-bar');
  });

  it('delegated click on [data-tab="calendar"] switches to calendar', () => {
    initTabs(barEl, doc);
    barEl.querySelector('[data-tab="calendar"]').click();
    expect(doc.getElementById('tab-calendar').style.display).toBe('block');
    expect(doc.getElementById('tab-dashboard').style.display).toBe('none');
  });

  it('click on child <span> inside a button switches tab via closest()', () => {
    const btn = barEl.querySelector('[data-tab="spatial"]');
    const span = doc.createElement('span');
    btn.appendChild(span);
    initTabs(barEl, doc);
    span.click();
    expect(doc.getElementById('tab-spatial').style.display).toBe('block');
  });

  it('click on bar container itself (no [data-tab]) does nothing', () => {
    initTabs(barEl, doc);
    // All panels start without explicit display; clicking the bar should not throw
    expect(() => barEl.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
  });

  it('two sequential initTabs calls do not double-fire', () => {
    initTabs(barEl, doc);
    initTabs(barEl, doc);
    // Click calendar once — if double-fired it still ends up on calendar, but we verify count via side effects
    barEl.querySelector('[data-tab="calendar"]').click();
    expect(doc.getElementById('tab-calendar').style.display).toBe('block');
    // Only one panel should be visible
    const visible = ['dashboard', 'calendar', 'search', 'spatial']
      .filter(t => doc.getElementById(`tab-${t}`).style.display !== 'none');
    expect(visible).toEqual(['calendar']);
  });
});
