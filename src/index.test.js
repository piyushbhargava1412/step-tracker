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
});
