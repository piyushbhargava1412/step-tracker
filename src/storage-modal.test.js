/**
 * Tests for src/storage-modal.js — Task 9: interactive persistence badge modal.
 *
 * jsdom-only. The no-innerHTML contract is asserted by spying on the
 * Element.prototype.innerHTML setter while the factory builds its DOM (a
 * jsdom-safe static check — no Node fs/path dependency).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  createStorageModal,
  NOT_PERSISTED_TEXT,
  PERSISTED_TEXT,
  STORAGE_PERSIST_GRANTED_KEY,
} from './storage-modal.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDoc(initialStatus = '') {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>
      <span id="db-status">${initialStatus}</span>
    </body></html>`,
    { url: 'http://localhost' }
  );
  return dom.window.document;
}

function makeReporter() {
  return { db: vi.fn(), auth: vi.fn(), sync: vi.fn() };
}

function makeNav({ persistResult = true, persistImpl } = {}) {
  return {
    storage: {
      persist: persistImpl ?? vi.fn(() => Promise.resolve(persistResult)),
    },
  };
}

function makeStorage() {
  const store = new Map();
  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => { store.set(key, String(value)); }),
  };
}

function overlayOf(doc) {
  return doc.body.querySelector('.storage-modal-overlay');
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createStorageModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Modal shell (built entirely in JS) ────────────────────────────────────

  it('builds the modal DOM in JS, hidden by default, with friendly guidance + actions', () => {
    const doc = makeDoc();
    createStorageModal(doc, makeReporter(), makeNav());

    const overlay = overlayOf(doc);
    expect(overlay).not.toBeNull();
    expect(overlay.hidden).toBe(true);
    expect(overlay.classList.contains('modal-overlay')).toBe(true);

    expect(overlay.querySelector('[data-action="close-storage-modal"]')).not.toBeNull();
    expect(overlay.querySelector('[data-action="request-persist"]')).not.toBeNull();

    // Friendly, non-scary copy
    expect(overlay.textContent).toContain('🛡️ Protect Your Step History');
    expect(overlay.textContent).toContain(
      'Browsers occasionally clear cached web data when your phone or laptop runs low ' +
      'on disk space. Enable data protection so your steps, streaks, and backup ' +
      'history are preserved.'
    );
    expect(overlay.querySelector('[data-action="request-persist"]').textContent).toBe(
      '🛡️ Protect My Data'
    );
  });

  // ── Badge click binding (opens only in the "not persisted" state) ─────────

  it('clicking #db-status showing "Unprotected" opens the modal', () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const modal = createStorageModal(doc, makeReporter(), makeNav());
    modal.attach();

    const overlay = overlayOf(doc);
    expect(overlay.hidden).toBe(true);
    doc.getElementById('db-status').click();
    expect(overlay.hidden).toBe(false);
  });

  it('clicking #db-status showing the persisted state does NOT open the modal', () => {
    const doc = makeDoc(PERSISTED_TEXT);
    const modal = createStorageModal(doc, makeReporter(), makeNav());
    modal.attach();

    const overlay = overlayOf(doc);
    doc.getElementById('db-status').click();
    expect(overlay.hidden).toBe(true);
  });

  it('clicking #db-status with unrelated text does NOT open the modal', () => {
    const doc = makeDoc('✅ Database ready');
    const modal = createStorageModal(doc, makeReporter(), makeNav());
    modal.attach();

    const overlay = overlayOf(doc);
    doc.getElementById('db-status').click();
    expect(overlay.hidden).toBe(true);
  });

  it('badge click opens the modal only after attach() binds the listener', () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const modal = createStorageModal(doc, makeReporter(), makeNav());
    const overlay = overlayOf(doc);

    doc.getElementById('db-status').click();
    expect(overlay.hidden).toBe(true);

    modal.attach();
    doc.getElementById('db-status').click();
    expect(overlay.hidden).toBe(false);
  });

  // ── Close affordance ──────────────────────────────────────────────────────

  it('close button dismisses the modal', () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const modal = createStorageModal(doc, makeReporter(), makeNav());
    modal.attach();
    doc.getElementById('db-status').click();

    const overlay = overlayOf(doc);
    expect(overlay.hidden).toBe(false);
    overlay.querySelector('[data-action="close-storage-modal"]').click();
    expect(overlay.hidden).toBe(true);
  });

  it('clicking the overlay backdrop (outside the dialog) dismisses the modal', () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const modal = createStorageModal(doc, makeReporter(), makeNav());
    modal.open();

    const overlay = overlayOf(doc);
    expect(overlay.hidden).toBe(false);
    overlay.click();
    expect(overlay.hidden).toBe(true);
  });

  // ── Request Persistent Storage ────────────────────────────────────────────

  it('"Request Persistent Storage" click calls nav.storage.persist() exactly once', async () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const nav = makeNav();
    const modal = createStorageModal(doc, makeReporter(), nav);
    modal.open();

    overlayOf(doc).querySelector('[data-action="request-persist"]').click();
    await flush();
    expect(nav.storage.persist).toHaveBeenCalledTimes(1);
  });

  it('persist() resolving true → reporter.db(PERSISTED_TEXT) and modal closes', async () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const reporter = makeReporter();
    const nav = makeNav({ persistResult: true });
    const modal = createStorageModal(doc, reporter, nav);
    modal.open();

    const overlay = overlayOf(doc);
    overlay.querySelector('[data-action="request-persist"]').click();
    await flush();
    expect(reporter.db).toHaveBeenCalledWith(PERSISTED_TEXT);
    expect(overlay.hidden).toBe(true);
  });

  it('persist() resolving true records the grant via storage.setItem(STORAGE_PERSIST_GRANTED_KEY, "1")', async () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const nav = makeNav({ persistResult: true });
    const storage = makeStorage();
    const modal = createStorageModal(doc, makeReporter(), nav, storage);
    modal.open();

    overlayOf(doc).querySelector('[data-action="request-persist"]').click();
    await flush();
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_PERSIST_GRANTED_KEY, '1');
  });

  it('persist() resolving false does NOT record a grant', async () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const nav = makeNav({ persistResult: false });
    const storage = makeStorage();
    const modal = createStorageModal(doc, makeReporter(), nav, storage);
    modal.open();

    overlayOf(doc).querySelector('[data-action="request-persist"]').click();
    await flush();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('works without a storage collaborator (defaults to null, never throws)', async () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const nav = makeNav({ persistResult: true });
    const modal = createStorageModal(doc, makeReporter(), nav);
    modal.open();

    overlayOf(doc).querySelector('[data-action="request-persist"]').click();
    await expect(flush()).resolves.toBeUndefined();
  });

  it('persist() resolving false → reporter.db(NOT_PERSISTED_TEXT); modal stays open', async () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const reporter = makeReporter();
    const nav = makeNav({ persistResult: false });
    const modal = createStorageModal(doc, reporter, nav);
    modal.open();

    const overlay = overlayOf(doc);
    overlay.querySelector('[data-action="request-persist"]').click();
    await flush();
    expect(reporter.db).toHaveBeenCalledWith(NOT_PERSISTED_TEXT);
    expect(overlay.hidden).toBe(false);
  });

  it('persist() rejecting → console.error("[storage-modal]", err) and never throws', async () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const reporter = makeReporter();
    const err = new Error('persist failed');
    const nav = makeNav({ persistImpl: vi.fn(() => Promise.reject(err)) });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const modal = createStorageModal(doc, reporter, nav);
    modal.open();

    overlayOf(doc).querySelector('[data-action="request-persist"]').click();
    await flush();
    expect(consoleSpy).toHaveBeenCalledWith('[storage-modal]', err);
    consoleSpy.mockRestore();
  });

  // ── AbortController scoping ───────────────────────────────────────────────

  it('open() twice does not accumulate modal click listeners (persist fires once)', async () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const nav = makeNav();
    const modal = createStorageModal(doc, makeReporter(), nav);
    modal.open();
    modal.open();

    overlayOf(doc).querySelector('[data-action="request-persist"]').click();
    await flush();
    expect(nav.storage.persist).toHaveBeenCalledTimes(1);
  });

  it('attach() twice does not accumulate #db-status listeners (single open per click)', () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const modal = createStorageModal(doc, makeReporter(), makeNav());
    modal.attach();
    modal.attach();

    const overlay = overlayOf(doc);
    doc.getElementById('db-status').click();
    expect(overlay.hidden).toBe(false);
  });

  it('close() aborts modal-scoped listeners — persist button no longer fires', async () => {
    const doc = makeDoc(NOT_PERSISTED_TEXT);
    const nav = makeNav();
    const modal = createStorageModal(doc, makeReporter(), nav);
    modal.open();
    modal.close();

    overlayOf(doc).querySelector('[data-action="request-persist"]').click();
    await flush();
    expect(nav.storage.persist).not.toHaveBeenCalled();
  });

  // ── Sole DOM writer (no innerHTML) — jsdom-safe static check ──────────────

  it('module is the sole DOM writer — never assigns innerHTML while building', () => {
    const doc = makeDoc();
    const setter = vi
      .spyOn(Element.prototype, 'innerHTML', 'set')
      .mockImplementation(() => {});

    createStorageModal(doc, makeReporter(), makeNav());

    expect(setter).not.toHaveBeenCalled();
  });
});