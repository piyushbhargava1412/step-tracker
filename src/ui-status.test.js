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

  it('createStatusReporter accepts an injected doc parameter', () => {
    const reporter = createStatusReporter(doc);
    expect(reporter).toHaveProperty('db');
    expect(reporter).toHaveProperty('auth');
    expect(typeof reporter.db).toBe('function');
    expect(typeof reporter.auth).toBe('function');
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
});
