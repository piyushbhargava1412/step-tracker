import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');
const { document } = new JSDOM(html).window;

describe('index.html tabbed shell contract', () => {
  it('#auth-status element is present', () => {
    expect(document.getElementById('auth-status')).not.toBeNull();
  });

  it('#db-status element is present', () => {
    expect(document.getElementById('db-status')).not.toBeNull();
  });

  it('#auth-btn element is present', () => {
    expect(document.getElementById('auth-btn')).not.toBeNull();
  });

  it('four [data-tab] buttons exist with correct values', () => {
    const tabs = document.querySelectorAll('[data-tab]');
    expect(tabs.length).toBe(4);
    const values = Array.from(tabs).map(t => t.dataset.tab);
    expect(values).toContain('dashboard');
    expect(values).toContain('calendar');
    expect(values).toContain('search');
    expect(values).toContain('spatial');
  });

  it('all four tab panels are present', () => {
    for (const name of ['dashboard', 'calendar', 'search', 'spatial']) {
      expect(document.getElementById(`tab-${name}`), `#tab-${name} missing`).not.toBeNull();
    }
  });

  it('dashboard panel is default-visible, others hidden', () => {
    const dashboard = document.getElementById('tab-dashboard');
    const calendar = document.getElementById('tab-calendar');
    const search = document.getElementById('tab-search');
    const spatial = document.getElementById('tab-spatial');

    const isHidden = (el) =>
      el.style.display === 'none' || el.classList.contains('hidden') || el.hasAttribute('hidden');

    expect(isHidden(dashboard)).toBe(false);
    expect(isHidden(calendar)).toBe(true);
    expect(isHidden(search)).toBe(true);
    expect(isHidden(spatial)).toBe(true);
  });

  it('no onclick= inline attributes remain', () => {
    expect(document.body.innerHTML).not.toMatch(/onclick=/);
  });

  it('no config.local.js script tag', () => {
    expect(html).not.toContain('config.local.js');
  });

  it('<script type="module" src="/src/main.js"> is present', () => {
    expect(html).toContain('src/main.js');
    expect(html).toContain('type="module"');
  });

  it('GSI library script still present', () => {
    expect(html).toContain('https://accounts.google.com/gsi/client');
  });

  it('styles.css link still present', () => {
    expect(html).toContain('styles.css');
  });

  it('no app.js script tag remains', () => {
    expect(html).not.toMatch(/<script[^>]+src=["'][^"']*app\.js["']/);
  });

  it('no fetch_btn reference remains', () => {
    expect(html).not.toContain('fetch_btn');
  });

  it('#sync-btn element is present inside <header> with exact label Sync Steps', () => {
    const syncBtn = document.getElementById('sync-btn');
    expect(syncBtn).not.toBeNull();
    expect(syncBtn.textContent).toBe('Sync Steps');
    expect(syncBtn.closest('header')).not.toBeNull();
  });

  it('#sync-status element is present inside <header>', () => {
    const syncStatus = document.getElementById('sync-status');
    expect(syncStatus).not.toBeNull();
    expect(syncStatus.closest('header')).not.toBeNull();
  });

  it('calendar nav, summary, and grid containers are present', () => {
    expect(document.getElementById('calendar-nav')).not.toBeNull();
    expect(document.getElementById('calendar-summary')).not.toBeNull();
    expect(document.getElementById('calendar-grid')).not.toBeNull();
  });

  it('calendar containers are descendants of #tab-calendar', () => {
    const tab = document.getElementById('tab-calendar');
    expect(tab.contains(document.getElementById('calendar-nav'))).toBe(true);
    expect(tab.contains(document.getElementById('calendar-summary'))).toBe(true);
    expect(tab.contains(document.getElementById('calendar-grid'))).toBe(true);
  });

  it('#day-drawer has correct ARIA attributes', () => {
    const drawer = document.getElementById('day-drawer');
    expect(drawer).not.toBeNull();
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(drawer.getAttribute('aria-labelledby')).toBe('day-drawer-title');
  });

  it('#day-drawer is a descendant of #tab-calendar', () => {
    const tab = document.getElementById('tab-calendar');
    expect(tab.contains(document.getElementById('day-drawer'))).toBe(true);
  });

  it('.drawer-overlay element exists', () => {
    expect(document.querySelector('.drawer-overlay')).not.toBeNull();
  });

  it('#tab-calendar is hidden by default', () => {
    const calendar = document.getElementById('tab-calendar');
    expect(calendar.style.display).toBe('none');
  });
});

describe('index.html — ST-015 settings button & modal (Task 8)', () => {
  it('#settings-btn is present inside .header-actions', () => {
    const btn = document.getElementById('settings-btn');
    expect(btn).not.toBeNull();
    expect(btn.closest('.header-actions')).not.toBeNull();
  });

  it('#settings-btn appears after #sync-btn in .header-actions', () => {
    const actions = document.querySelector('.header-actions');
    const children = Array.from(actions.children);
    const syncIdx = children.findIndex(el => el.id === 'sync-btn');
    const settingsIdx = children.findIndex(el => el.id === 'settings-btn');
    expect(settingsIdx).toBeGreaterThan(syncIdx);
  });

  it('#settings-modal is present with correct ARIA attributes', () => {
    const modal = document.getElementById('settings-modal');
    expect(modal).not.toBeNull();
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
  });

  it('#settings-modal is a direct child of div.container appended after <main>', () => {
    const container = document.querySelector('div.container');
    const modal = document.getElementById('settings-modal');
    expect(modal).not.toBeNull();
    expect(modal.parentElement).toBe(container);
    const main = container.querySelector('main');
    // modal comes after main in DOM order
    const containerChildren = Array.from(container.children);
    const mainIdx = containerChildren.indexOf(main);
    const modalIdx = containerChildren.indexOf(modal);
    expect(modalIdx).toBeGreaterThan(mainIdx);
  });

  it('#settings-modal has .modal-overlay class', () => {
    const modal = document.getElementById('settings-modal');
    expect(modal.classList.contains('modal-overlay')).toBe(true);
  });

  it('#settings-modal contains a date picker input', () => {
    const modal = document.getElementById('settings-modal');
    const datePicker = modal.querySelector('input[type="date"]');
    expect(datePicker).not.toBeNull();
  });

  it('#settings-modal contains an impact preview element', () => {
    const modal = document.getElementById('settings-modal');
    const preview = modal.querySelector('[data-settings="impact-preview"]');
    expect(preview).not.toBeNull();
  });

  it('#settings-modal contains a Prune button (danger action)', () => {
    const modal = document.getElementById('settings-modal');
    const pruneBtn = modal.querySelector('[data-action="prune"]');
    expect(pruneBtn).not.toBeNull();
  });

  it('#settings-modal contains a Clear-All checkbox (hazard toggle)', () => {
    const modal = document.getElementById('settings-modal');
    const clearAll = modal.querySelector('[data-action="clear-all"]');
    expect(clearAll).not.toBeNull();
  });

  it('#settings-modal contains a wipe/clear button', () => {
    const modal = document.getElementById('settings-modal');
    const wipeBtn = modal.querySelector('[data-action="wipe"]');
    expect(wipeBtn).not.toBeNull();
  });
});
