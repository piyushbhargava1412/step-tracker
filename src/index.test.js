import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCREENS, TAB_SCREENS } from './navigation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');
const { document } = new JSDOM(html).window;

describe('index.html — mobile app shell', () => {
  it('has one screen element per navigation screen, and nothing else marked as a screen', () => {
    const ids = [...document.querySelectorAll('[data-screen]')].map((el) => el.id).sort();
    expect(ids).toEqual(Object.keys(SCREENS).map((name) => `tab-${name}`).sort());
  });

  it('shows only Today on load', () => {
    const visible = [...document.querySelectorAll('[data-screen]')].filter((el) => !el.hidden);
    expect(visible.map((el) => el.id)).toEqual(['tab-today']);
  });

  it('bottom navigation has the four tabs in order, with Today current', () => {
    const tabs = [...document.querySelectorAll('.bottom-nav [data-tab]')];
    expect(tabs.map((t) => t.dataset.tab)).toEqual(TAB_SCREENS);
    expect(document.querySelector('[data-tab="today"]').getAttribute('aria-current')).toBe('page');
  });

  it('has no Map, Lab or Backup tab', () => {
    for (const gone of ['spatial', 'lab', 'backup', 'search', 'dashboard']) {
      expect(document.querySelector(`[data-tab="${gone}"]`), gone).toBeNull();
    }
    expect(document.getElementById('tab-spatial')).toBeNull();
    expect(document.getElementById('tab-lab')).toBeNull();
  });

  it('app bar holds the back button (hidden), the title and the search + settings actions', () => {
    const bar = document.querySelector('header.app-bar');
    expect(bar.querySelector('#app-back[data-back]').hidden).toBe(true);
    expect(bar.querySelector('#app-title').textContent).toBe('Today');
    expect(bar.querySelector('#app-subtitle')).not.toBeNull();
    expect(bar.querySelector('[data-go="search"]').getAttribute('aria-label')).toBe('Search days');
    expect(bar.querySelector('[data-go="settings"]').getAttribute('aria-label')).toBe('Settings');
  });

  it('every icon-only button has an accessible name', () => {
    for (const btn of document.querySelectorAll('.icon-btn')) {
      expect(btn.getAttribute('aria-label'), btn.outerHTML).toBeTruthy();
    }
  });

  it('every data-go target is a real screen', () => {
    for (const el of document.querySelectorAll('[data-go]')) {
      expect(SCREENS[el.dataset.go], el.dataset.go).toBeDefined();
    }
  });
});

describe('index.html — Today screen', () => {
  const today = document.getElementById('tab-today');

  it('keeps the status elements the status reporter writes to', () => {
    for (const id of ['auth-status', 'backup-status', 'last-sync', 'sync-status', 'sync-btn']) {
      expect(today.querySelector(`#${id}`), id).not.toBeNull();
    }
    expect(document.getElementById('sync-btn').getAttribute('aria-label')).toBe('Sync steps');
  });

  it('groups the three statuses apart from the sync button, so they can wrap while it stays put', () => {
    const pills = [...today.querySelectorAll('.status-line > .status-pills > [id]')].map((el) => el.id);
    expect(pills).toEqual(['auth-status', 'last-sync', 'backup-status']);
    expect(today.querySelector('.status-line > #sync-btn')).not.toBeNull();
  });

  it('the sync button is an icon with a tooltip', () => {
    const btn = document.getElementById('sync-btn');
    expect(btn.querySelector('svg')).not.toBeNull();
    expect(btn.textContent.trim()).toBe('');
    expect(btn.getAttribute('title')).toBe('Sync steps');
  });

  it('has one progress panel with the ring mount and six stat tiles in order', () => {
    const card = today.querySelector('.today-card');
    expect(card.querySelector('#today-progress')).not.toBeNull();
    const tiles = [...card.querySelectorAll('.today-tiles > .stat-tile')].map((t) => t.id);
    expect(tiles).toEqual(['tile-distance', 'tile-strict', 'tile-lifetime', 'tile-tol99', 'tile-tol95', 'tile-best']);
  });

  it('has a challenge summary mount and no month overview or week chart', () => {
    expect(today.querySelector('#today-challenge')).not.toBeNull();
    expect(document.getElementById('dashboard-month')).toBeNull();
    expect(document.getElementById('active-lens')).toBeNull();
  });

  it('has the pull-to-refresh indicator', () => {
    expect(document.getElementById('ptr-indicator')).not.toBeNull();
  });
});

describe('index.html — Calendar screen', () => {
  const calendar = document.getElementById('tab-calendar');

  it('has the Week / Month switch with Month selected', () => {
    const options = [...calendar.querySelectorAll('#calendar-view-switch [data-calendar-view]')];
    expect(options.map((o) => o.dataset.calendarView)).toEqual(['week', 'month']);
    expect(calendar.querySelector('[data-calendar-view="month"]').getAttribute('aria-selected')).toBe('true');
  });

  it('has the month and week view mounts, week hidden', () => {
    expect(calendar.querySelector('#calendar-month').hidden).toBe(false);
    expect(calendar.querySelector('#calendar-week').hidden).toBe(true);
  });

  it('day drawer is a bottom sheet dialog the back button can close', () => {
    const drawer = calendar.querySelector('#day-drawer');
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(drawer.getAttribute('aria-labelledby')).toBe('day-drawer-title');
    expect(drawer.hasAttribute('data-overlay')).toBe(true);
    expect(drawer.classList.contains('sheet')).toBe(true);
    expect(calendar.querySelector('.drawer-overlay')).not.toBeNull();
  });
});

describe('index.html — Insights, Journey and pushed screens', () => {
  it('Insights holds the analytics mount; Journey holds levels and the expedition', () => {
    expect(document.querySelector('#tab-insights #lab-analytics')).not.toBeNull();
    expect(document.querySelector('#tab-journey #lab-gamification')).not.toBeNull();
    expect(document.querySelector('#tab-journey #lab-odyssey')).not.toBeNull();
  });

  it('the challenge screen has its detail mount', () => {
    expect(document.querySelector('#tab-challenge #challenge-detail')).not.toBeNull();
  });

  it('Settings holds the connect button, a Backup row and the settings panel mount', () => {
    const settings = document.getElementById('tab-settings');
    expect(settings.querySelector('#auth-btn')).not.toBeNull();
    expect(settings.querySelector('[data-go="backup"]')).not.toBeNull();
    expect(settings.querySelector('#settings-panel')).not.toBeNull();
    expect(settings.querySelector('#app-version')).not.toBeNull();
  });

  it('ST-028: Settings has an App-update mount just above the version line, hidden and empty until the app fills it', () => {
    const mount = document.querySelector('#tab-settings #app-update');
    expect(mount).not.toBeNull();
    expect(mount.children).toHaveLength(0);
    expect(mount.hidden).toBe(true);
    expect(mount.nextElementSibling.id).toBe('app-version');
  });

  it('Backup lives inside Settings and holds storage health, Drive and file panels', () => {
    const backup = document.getElementById('tab-backup');
    for (const id of ['storage-health-controls', 'cloud-controls', 'backup-controls']) {
      expect(backup.querySelector(`#${id}`), id).not.toBeNull();
    }
  });

  it('the settings modal is gone (Settings is a screen now)', () => {
    expect(document.getElementById('settings-modal')).toBeNull();
    expect(document.getElementById('settings-btn')).toBeNull();
  });
});

describe('index.html — first launch', () => {
  it('has a hidden onboarding screen with connect, restore and skip actions', () => {
    const onboarding = document.getElementById('onboarding');
    expect(onboarding.hidden).toBe(true);
    for (const id of ['onboarding-connect', 'onboarding-restore', 'onboarding-skip']) {
      expect(onboarding.querySelector(`#${id}`), id).not.toBeNull();
    }
  });
});

describe('index.html — platform and build contract', () => {
  it('no onclick= inline attributes', () => {
    expect(document.body.innerHTML).not.toMatch(/onclick=/);
  });

  it('no emoji in the static shell (line icons only)', () => {
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('no config.local.js script tag', () => {
    expect(html).not.toContain('config.local.js');
  });

  it('<script type="module" src="/src/main.js"> is present', () => {
    expect(html).toContain('src/main.js');
    expect(html).toContain('type="module"');
  });

  it('GSI library script still present (the native build strips it)', () => {
    expect(html).toContain('<!-- Google Identity Services Library -->');
    expect(html).toContain('https://accounts.google.com/gsi/client');
  });

  it('fonts are bundled, not loaded from Google Fonts', () => {
    expect(html).not.toContain('fonts.googleapis.com');
  });

  it('styles.css link still present', () => {
    expect(html).toContain('styles.css');
  });

  it('manifest link present exactly once with href="/manifest.json"', () => {
    const links = document.querySelectorAll('link[rel="manifest"]');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/manifest.json');
  });

  it('theme-color meta present exactly once with content="#0ea5e9"', () => {
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    expect(metas.length).toBe(1);
    expect(metas[0].getAttribute('content')).toBe('#0ea5e9');
  });

  it('viewport covers the display cutout (edge-to-edge app)', () => {
    expect(document.querySelector('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');
  });
});

describe('ST-023: markup gating for the read-only web viewer', () => {
  it('marks the controls that change data as editor-only', () => {
    expect(document.getElementById('backup-status').hasAttribute('data-editor-only')).toBe(true);
    expect(document.querySelector('#tab-settings [data-go="backup"]').closest('[data-editor-only]')).not.toBeNull();
    expect(document.getElementById('settings-panel').hasAttribute('data-editor-only')).toBe(true);
    expect(document.getElementById('onboarding-restore').hasAttribute('data-editor-only')).toBe(true);
  });

  it('tells viewers where to edit, on Today and in Settings', () => {
    for (const screen of ['tab-today', 'tab-settings']) {
      const note = document.querySelector(`#${screen} [data-viewer-only]`);
      expect(note, screen).not.toBeNull();
      expect(note.textContent).toContain('View only');
    }
  });
});

describe('ST-027: status pills', () => {
  it('the storage badge pill is gone', () => {
    expect(document.getElementById('db-status')).toBeNull();
  });

  it('the connection pill starts as a red light reading "Disconnected"', () => {
    const pill = document.getElementById('auth-status');
    expect(pill.querySelector('.status-light--error')).not.toBeNull();
    expect(pill.textContent.trim()).toBe('Disconnected');
    expect(pill.getAttribute('title')).toBe('Not connected');
  });

  it('the backup pill is hidden until backup needs attention', () => {
    const pill = document.getElementById('backup-status');
    expect(pill.hidden).toBe(true);
    expect(pill.tagName).toBe('BUTTON');
  });
});
