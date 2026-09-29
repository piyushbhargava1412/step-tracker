import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createStatusReporter } from './ui-status.js';

describe('createStatusReporter', () => {
  let doc;
  let consoleWarnSpy;

  beforeEach(() => {
    // Create a fresh JSDOM document for each test
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <span id="db-status"></span>
          <span id="auth-status"></span>
          <span id="sync-status"></span>
        </body>
      </html>
    `);
    doc = dom.window.document;
    
    // Spy on console.warn
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  // --- ST-027: db() messages are toasts; auth() is a status light ---

  it('db() shows the message as a toast and writes no pill', () => {
    const reporter = createStatusReporter(doc);
    reporter.db('❌ Calendar load failed');

    expect(doc.getElementById('app-toast').textContent).toBe('❌ Calendar load failed');
  });

  it('a later db() message replaces the toast text', () => {
    const reporter = createStatusReporter(doc);
    reporter.db('A');
    reporter.db('B');
    expect(doc.getElementById('app-toast').textContent).toBe('B');
  });

  it('auth() shows a green light and "Connected" when connected', () => {
    const reporter = createStatusReporter(doc);
    reporter.auth('✅ Connected');

    const pill = doc.getElementById('auth-status');
    expect(pill.textContent).toBe('Connected');
    expect(pill.querySelector('.status-light--ok')).not.toBeNull();
  });

  it.each([
    ['⚠️ Could not reach Health Connect', 'status-light--warn'],
    ['🔑 Step access not allowed — allow it in Health Connect', 'status-light--error'],
    ['Not connected', 'status-light--error'],
  ])('auth(%s) shows "Disconnected" with the message as its tooltip', (text, light) => {
    const reporter = createStatusReporter(doc);
    reporter.auth(text);

    const pill = doc.getElementById('auth-status');
    expect(pill.textContent).toBe('Disconnected');
    expect(pill.querySelector(`.${light}`)).not.toBeNull();
    expect(pill.title).toBe(text.replace(/^[^A-Za-z]+/, ''));
  });

  it('repeated calls to auth() replace the pill, not append', () => {
    const reporter = createStatusReporter(doc);
    reporter.auth('Not connected');
    reporter.auth('✅ Connected');
    const pill = doc.getElementById('auth-status');
    expect(pill.textContent).toBe('Connected');
    expect(pill.querySelectorAll('.status-light')).toHaveLength(1);
  });

  it('createStatusReporter returns object with db, auth, and sync functions — and no syncBusy or status method', () => {
    const reporter = createStatusReporter(doc);
    expect(typeof reporter.db).toBe('function');
    expect(typeof reporter.auth).toBe('function');
    expect(typeof reporter.sync).toBe('function');
    expect(reporter.syncBusy).toBeUndefined();
    expect(reporter.status).toBeUndefined();
  });

  it('db() needs no pill element at all', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><span id="auth-status"></span></body></html>');
    const reporter = createStatusReporter(dom.window.document);
    expect(() => reporter.db('test')).not.toThrow();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('missing #auth-status element does not throw, and warns', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const reporter = createStatusReporter(dom.window.document);
    expect(() => reporter.auth('test')).not.toThrow();
    expect(consoleWarnSpy.mock.calls[0][0]).toContain('auth-status');
  });

  // --- sync() channel tests ---

  it('sync() sets #sync-status textContent to the provided text', () => {
    const reporter = createStatusReporter(doc);
    reporter.sync('hello');

    const syncEl = doc.getElementById('sync-status');
    expect(syncEl.textContent).toBe('hello');
  });

  it('repeated calls to sync() overwrite the text, not append', () => {
    const reporter = createStatusReporter(doc);
    reporter.sync('a');
    reporter.sync('b');

    const syncEl = doc.getElementById('sync-status');
    expect(syncEl.textContent).toBe('b');
  });

  it('missing #sync-status element does not throw', () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <span id="db-status"></span>
          <span id="auth-status"></span>
        </body>
      </html>
    `);
    const docWithoutSyncStatus = dom.window.document;

    const reporter = createStatusReporter(docWithoutSyncStatus);
    expect(() => {
      reporter.sync('x');
    }).not.toThrow();
  });

  it('missing #sync-status element calls console.warn with a message containing sync-status', () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <span id="db-status"></span>
          <span id="auth-status"></span>
        </body>
      </html>
    `);
    const docWithoutSyncStatus = dom.window.document;

    const reporter = createStatusReporter(docWithoutSyncStatus);
    reporter.sync('x');

    expect(consoleWarnSpy).toHaveBeenCalled();
    const warnMessage = consoleWarnSpy.mock.calls[0][0];
    expect(warnMessage).toContain('sync-status');
  });

  it('auth() and sync() channels still write to their own elements', () => {
    const reporter = createStatusReporter(doc);
    reporter.auth('✅ Connected');
    reporter.sync('sync-text');

    expect(doc.getElementById('auth-status').textContent).toBe('Connected');
    expect(doc.getElementById('sync-status').textContent).toBe('sync-text');
  });

  // --- full-history-sync modal routing ---

  it('sync() with the full-history-sync prefix opens the modal instead of writing #sync-status', () => {
    const reporter = createStatusReporter(doc);
    reporter.sync('⏳ Full history sync — fetching all Health Connect data since 2013.');

    const modal = doc.getElementById('sync-progress-modal');
    expect(modal).not.toBeNull();
    expect(modal.hasAttribute('hidden')).toBe(false);
    expect(doc.querySelector('[data-role="message"]').textContent).toBe(
      '⏳ Full history sync — fetching all Health Connect data since 2013.'
    );
    expect(doc.getElementById('sync-status').textContent).toBe('');
  });

  it('a subsequent plain progress message closes the modal and writes #sync-status', () => {
    const reporter = createStatusReporter(doc);
    reporter.sync('⏳ Full history sync — fetching all Health Connect data since 2013.');
    reporter.sync('⚠️ Health Connect is busy — retrying chunk 3/50 in 2s…');

    const modal = doc.getElementById('sync-progress-modal');
    expect(modal.hasAttribute('hidden')).toBe(true);
    expect(doc.getElementById('sync-status').textContent).toBe(
      '⚠️ Health Connect is busy — retrying chunk 3/50 in 2s…'
    );
  });

  it('a terminal ✅ success message closes the modal and shows the toast', () => {
    const reporter = createStatusReporter(doc);
    reporter.sync('⏳ Full history sync — fetching all Health Connect data since 2013.');
    reporter.sync('✅ Synced 100 days — up to date.');

    const modal = doc.getElementById('sync-progress-modal');
    expect(modal.hasAttribute('hidden')).toBe(true);
    expect(doc.getElementById('sync-status').textContent).toBe('');
    expect(doc.getElementById('app-toast').textContent).toBe('✅ Synced 100 days — up to date.');
  });

  it('a non-full-history sync() call when the modal was never opened does not throw', () => {
    const reporter = createStatusReporter(doc);
    expect(() => reporter.sync('some progress text')).not.toThrow();
  });
});

describe('ST-019: configurable connect label', () => {
  function setup(options) {
    document.body.innerHTML = '<span id="auth-status"></span><button id="auth-btn"></button>';
    return createStatusReporter(document, options);
  }

  it('uses the given connect label while not connected', () => {
    setup({ connectLabel: 'Connect Health Connect' }).auth('Not connected');
    expect(document.getElementById('auth-btn').textContent).toBe('Connect Health Connect');
  });

  it('still reads "Reconnect" once connected', () => {
    setup({ connectLabel: 'Connect Health Connect' }).auth('✅ Connected');
    expect(document.getElementById('auth-btn').textContent).toBe('Reconnect');
  });

  it('defaults to "Connect Google Account"', () => {
    setup().auth('Not connected');
    expect(document.getElementById('auth-btn').textContent).toBe('Connect Google Account');
  });
});
