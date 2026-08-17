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

  it('db() sets #db-status textContent to the provided text', () => {
    const reporter = createStatusReporter(doc);
    reporter.db('✅ DB ready (0 records)');
    
    const dbEl = doc.getElementById('db-status');
    expect(dbEl.textContent).toBe('✅ DB ready (0 records)');
  });

  it('auth() sets #auth-status textContent to the provided text', () => {
    const reporter = createStatusReporter(doc);
    reporter.auth('✅ Connected');
    
    const authEl = doc.getElementById('auth-status');
    expect(authEl.textContent).toBe('✅ Connected');
  });

  it('repeated calls to db() overwrite the text, not append', () => {
    const reporter = createStatusReporter(doc);
    reporter.db('A');
    reporter.db('B');
    
    const dbEl = doc.getElementById('db-status');
    expect(dbEl.textContent).toBe('B');
  });

  it('repeated calls to auth() overwrite the text, not append', () => {
    const reporter = createStatusReporter(doc);
    reporter.auth('A');
    reporter.auth('B');
    
    const authEl = doc.getElementById('auth-status');
    expect(authEl.textContent).toBe('B');
  });

  it('createStatusReporter returns object with db, auth, and sync functions — and no syncBusy or status method', () => {
    const reporter = createStatusReporter(doc);
    expect(reporter).toHaveProperty('db');
    expect(reporter).toHaveProperty('auth');
    expect(reporter).toHaveProperty('sync');
    expect(typeof reporter.db).toBe('function');
    expect(typeof reporter.auth).toBe('function');
    expect(typeof reporter.sync).toBe('function');
    expect(reporter.syncBusy).toBeUndefined();
    expect(reporter.status).toBeUndefined();
  });

  it('missing #db-status element does not throw', () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <span id="auth-status"></span>
        </body>
      </html>
    `);
    const docWithoutDbStatus = dom.window.document;
    
    const reporter = createStatusReporter(docWithoutDbStatus);
    expect(() => {
      reporter.db('test');
    }).not.toThrow();
  });

  it('missing #auth-status element does not throw', () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <span id="db-status"></span>
        </body>
      </html>
    `);
    const docWithoutAuthStatus = dom.window.document;
    
    const reporter = createStatusReporter(docWithoutAuthStatus);
    expect(() => {
      reporter.auth('test');
    }).not.toThrow();
  });

  it('missing #db-status element calls console.warn with a message containing db-status', () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <span id="auth-status"></span>
        </body>
      </html>
    `);
    const docWithoutDbStatus = dom.window.document;
    
    const reporter = createStatusReporter(docWithoutDbStatus);
    reporter.db('test');
    
    expect(consoleWarnSpy).toHaveBeenCalled();
    const warnMessage = consoleWarnSpy.mock.calls[0][0];
    expect(warnMessage).toContain('db-status');
  });

  it('missing #auth-status element calls console.warn with a message containing auth-status', () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <span id="db-status"></span>
        </body>
      </html>
    `);
    const docWithoutAuthStatus = dom.window.document;
    
    const reporter = createStatusReporter(docWithoutAuthStatus);
    reporter.auth('test');
    
    expect(consoleWarnSpy).toHaveBeenCalled();
    const warnMessage = consoleWarnSpy.mock.calls[0][0];
    expect(warnMessage).toContain('auth-status');
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

  it('db() and auth() channels still write to their own elements after adding sync()', () => {
    const reporter = createStatusReporter(doc);
    reporter.db('db-text');
    reporter.auth('auth-text');
    reporter.sync('sync-text');

    expect(doc.getElementById('db-status').textContent).toBe('db-text');
    expect(doc.getElementById('auth-status').textContent).toBe('auth-text');
    expect(doc.getElementById('sync-status').textContent).toBe('sync-text');
  });

  // --- full-history-sync modal routing ---

  it('sync() with the full-history-sync prefix opens the modal instead of writing #sync-status', () => {
    const reporter = createStatusReporter(doc);
    reporter.sync('⏳ Full history sync — fetching all Google Fit data since 2013.');

    const modal = doc.getElementById('sync-progress-modal');
    expect(modal).not.toBeNull();
    expect(modal.hasAttribute('hidden')).toBe(false);
    expect(doc.querySelector('[data-role="message"]').textContent).toBe(
      '⏳ Full history sync — fetching all Google Fit data since 2013.'
    );
    expect(doc.getElementById('sync-status').textContent).toBe('');
  });

  it('a subsequent plain progress message closes the modal and writes #sync-status', () => {
    const reporter = createStatusReporter(doc);
    reporter.sync('⏳ Full history sync — fetching all Google Fit data since 2013.');
    reporter.sync('⚠️ Rate limited by Google Fit — retrying chunk 3/50 in 2s…');

    const modal = doc.getElementById('sync-progress-modal');
    expect(modal.hasAttribute('hidden')).toBe(true);
    expect(doc.getElementById('sync-status').textContent).toBe(
      '⚠️ Rate limited by Google Fit — retrying chunk 3/50 in 2s…'
    );
  });

  it('a terminal ✅ success message closes the modal and shows the toast', () => {
    const reporter = createStatusReporter(doc);
    reporter.sync('⏳ Full history sync — fetching all Google Fit data since 2013.');
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
