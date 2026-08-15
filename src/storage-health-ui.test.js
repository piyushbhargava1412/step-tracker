/**
 * Tests for src/storage-health-ui.js — the "💾 Storage & Data Health" panel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { createStorageHealthUI } from './storage-health-ui.js';

function buildDoc(html = '<div id="storage-health-controls"></div><span id="db-status"></span>') {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    url: 'http://localhost',
  });
  return dom.window.document;
}

function makeSettings({ enabled = false, lastDriveSync = null } = {}) {
  return {
    getDriveBackupEnabled: vi.fn().mockResolvedValue(enabled),
    getLastDriveSync: vi.fn().mockResolvedValue(lastDriveSync),
  };
}

function makeNav({ persisted = false, persistResult = true } = {}) {
  return {
    storage: {
      persisted: vi.fn().mockResolvedValue(persisted),
      persist: vi.fn().mockResolvedValue(persistResult),
    },
  };
}

function makeReporter() {
  return { db: vi.fn() };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createStorageHealthUI', () => {
  let doc, container;

  beforeEach(() => {
    doc = buildDoc();
    container = doc.getElementById('storage-health-controls');
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders the panel heading', async () => {
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), makeNav());
    await ui.render(container);
    const heading = container.querySelector('h2');
    expect(heading.textContent).toBe('💾 Storage & Data Health');
  });

  it('renders the Request Browser Storage Protection button', async () => {
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), makeNav());
    await ui.render(container);
    const btn = container.querySelector('[data-action="request-storage-protection"]');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('🛡️ Request Browser Storage Protection');
  });

  // ── Drive Cloud Backup status ────────────────────────────────────────────

  it('drive auto-sync enabled + a last sync -> "Active (size)"', async () => {
    const settings = makeSettings({ enabled: true, lastDriveSync: { at: '2024-01-01T00:00:00.000Z', bytes: 1331200 } });
    const ui = createStorageHealthUI(doc, settings, makeReporter(), makeNav());
    await ui.render(container);
    const value = container.querySelector('[data-field="drive-status"]');
    expect(value.textContent).toBe('🟢 Active (1300 KB)');
  });

  it('drive auto-sync enabled + no last sync yet -> "Active" with no size', async () => {
    const settings = makeSettings({ enabled: true, lastDriveSync: null });
    const ui = createStorageHealthUI(doc, settings, makeReporter(), makeNav());
    await ui.render(container);
    const value = container.querySelector('[data-field="drive-status"]');
    expect(value.textContent).toBe('🟢 Active');
  });

  it('drive auto-sync disabled -> "Disabled"', async () => {
    const settings = makeSettings({ enabled: false });
    const ui = createStorageHealthUI(doc, settings, makeReporter(), makeNav());
    await ui.render(container);
    const value = container.querySelector('[data-field="drive-status"]');
    expect(value.textContent).toBe('⚪ Disabled');
  });

  it('a settings read failure fails open to "Disabled"', async () => {
    const settings = {
      getDriveBackupEnabled: vi.fn().mockRejectedValue(new Error('boom')),
      getLastDriveSync: vi.fn().mockResolvedValue(null),
    };
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ui = createStorageHealthUI(doc, settings, makeReporter(), makeNav());
    await ui.render(container);
    const value = container.querySelector('[data-field="drive-status"]');
    expect(value.textContent).toBe('⚪ Disabled');
    expect(consoleSpy).toHaveBeenCalled();
  });

  // ── Local Browser Storage status ─────────────────────────────────────────

  it('persisted storage -> "Protected"', async () => {
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), makeNav({ persisted: true }));
    await ui.render(container);
    const value = container.querySelector('[data-field="local-status"]');
    expect(value.textContent).toBe('🟢 Protected');
  });

  it('unpersisted storage -> "Unpersisted"', async () => {
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), makeNav({ persisted: false }));
    await ui.render(container);
    const value = container.querySelector('[data-field="local-status"]');
    expect(value.textContent).toBe('🟡 Unpersisted');
  });

  // ── Request Protection button ────────────────────────────────────────────

  it('clicking the button calls navigator.storage.persist()', async () => {
    const nav = makeNav({ persisted: false, persistResult: true });
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), nav);
    await ui.render(container);

    container.querySelector('[data-action="request-storage-protection"]').click();
    await flush();

    expect(nav.storage.persist).toHaveBeenCalledTimes(1);
  });

  it('a granted request instantly flips the local status to "Protected"', async () => {
    const nav = makeNav({ persisted: false, persistResult: true });
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), nav);
    await ui.render(container);

    const value = container.querySelector('[data-field="local-status"]');
    expect(value.textContent).toBe('🟡 Unpersisted');

    container.querySelector('[data-action="request-storage-protection"]').click();
    await flush();

    expect(value.textContent).toBe('🟢 Protected');
  });

  it('a declined request leaves the local status as "Unpersisted"', async () => {
    const nav = makeNav({ persisted: false, persistResult: false });
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), nav);
    await ui.render(container);

    container.querySelector('[data-action="request-storage-protection"]').click();
    await flush();

    const value = container.querySelector('[data-field="local-status"]');
    expect(value.textContent).toBe('🟡 Unpersisted');
  });

  it('a declined request shows a visible inline hint (so the click never looks like a no-op)', async () => {
    const nav = makeNav({ persisted: false, persistResult: false });
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), nav);
    await ui.render(container);

    const hint = container.querySelector('.storage-health-hint');
    expect(hint.hidden).toBe(true);

    container.querySelector('[data-action="request-storage-protection"]').click();
    await flush();

    expect(hint.hidden).toBe(false);
    expect(hint.textContent.length).toBeGreaterThan(0);
  });

  it('a granted request shows no hint (the status row is the feedback)', async () => {
    const nav = makeNav({ persisted: false, persistResult: true });
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), nav);
    await ui.render(container);

    container.querySelector('[data-action="request-storage-protection"]').click();
    await flush();

    const hint = container.querySelector('.storage-health-hint');
    expect(hint.hidden).toBe(true);
  });

  it('clicking again clears a stale hint left over from a prior decline', async () => {
    const nav = makeNav({ persisted: false, persistResult: false });
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), nav);
    await ui.render(container);

    const btn = container.querySelector('[data-action="request-storage-protection"]');
    btn.click();
    await flush();
    const hint = container.querySelector('.storage-health-hint');
    expect(hint.hidden).toBe(false);

    btn.click();
    expect(hint.hidden).toBe(true);
    await flush();
  });

  it('clicking the button also refreshes the #db-status header badge via the reporter', async () => {
    const nav = makeNav({ persisted: false, persistResult: true });
    const settings = makeSettings({ enabled: false });
    const reporter = makeReporter();
    const ui = createStorageHealthUI(doc, settings, reporter, nav);
    await ui.render(container);

    container.querySelector('[data-action="request-storage-protection"]').click();
    await flush();

    expect(reporter.db).toHaveBeenCalled();
  });

  it('a rejecting persist() is caught, logged, never throws, and shows a hint too', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const nav = { storage: { persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockRejectedValue(new Error('denied')) } };
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), nav);
    await ui.render(container);

    const btn = container.querySelector('[data-action="request-storage-protection"]');
    btn.click();
    await flush();

    expect(consoleSpy).toHaveBeenCalled();
    expect(btn.disabled).toBe(false);
    const hint = container.querySelector('.storage-health-hint');
    expect(hint.hidden).toBe(false);
    expect(hint.textContent.length).toBeGreaterThan(0);
  });

  it('the button is disabled while the request is in flight and re-enabled after', async () => {
    let resolvePersist;
    const nav = {
      storage: {
        persisted: vi.fn().mockResolvedValue(false),
        persist: vi.fn(() => new Promise((r) => { resolvePersist = r; })),
      },
    };
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), nav);
    await ui.render(container);

    const btn = container.querySelector('[data-action="request-storage-protection"]');
    btn.click();
    await Promise.resolve();
    expect(btn.disabled).toBe(true);

    resolvePersist(true);
    await flush();

    expect(btn.disabled).toBe(false);
  });

  // ── Re-render / listener scoping ─────────────────────────────────────────

  it('calling render() twice does not accumulate click listeners (persist fires once per click)', async () => {
    const nav = makeNav({ persisted: false, persistResult: true });
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), nav);
    await ui.render(container);
    await ui.render(container);

    container.querySelector('[data-action="request-storage-protection"]').click();
    await flush();

    expect(nav.storage.persist).toHaveBeenCalledTimes(1);
  });

  it('never uses innerHTML (only createElement/textContent DOM writes)', async () => {
    const ui = createStorageHealthUI(doc, makeSettings(), makeReporter(), makeNav());
    const spy = vi.spyOn(container, 'insertAdjacentHTML');
    await ui.render(container);
    expect(spy).not.toHaveBeenCalled();
  });
});
