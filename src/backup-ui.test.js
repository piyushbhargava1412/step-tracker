/**
 * Tests for src/backup-ui.js
 * Task 3: Backup panel UI (export + restore file input)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { createBackupUI } from './backup-ui.js';
import { BACKUP_FILENAME_PREFIX } from './backup.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildDoc(html = '<div id="tab-backup"></div>') {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    url: 'http://localhost',
  });
  return dom.window.document;
}

function makeBackup({ buildResult = null, restoreResult = undefined } = {}) {
  return {
    buildBackup: vi.fn().mockResolvedValue(
      buildResult ?? {
        schema_version: 1,
        exported_at: '2024-01-01T00:00:00.000Z',
        daily_records: [],
        settings: [],
      }
    ),
    restoreBackup: restoreResult instanceof Error
      ? vi.fn().mockRejectedValue(restoreResult)
      : vi.fn().mockResolvedValue(restoreResult),
  };
}

function makeReporter() {
  return vi.fn();
}

/**
 * Simulates a file selection on an <input type="file"> element.
 * jsdom doesn't support real FileReader API for files set via JS,
 * so we mock FileReader to return the provided text.
 */
function simulateFileSelect(doc, input, text, filename = 'backup.json') {
  const file = new doc.defaultView.File([text], filename, { type: 'application/json' });

  // Mock FileReader using closure so instance.onload is correctly picked up
  const origFileReader = doc.defaultView.FileReader;
  doc.defaultView.FileReader = function MockFileReader() {
    const instance = {
      readAsText: function () {
        Promise.resolve().then(() => {
          if (instance.onload) {
            instance.onload({ target: { result: text } });
          }
        });
      },
      onload: null,
      onerror: null,
    };
    return instance;
  };

  // Trigger change event
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  input.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));

  return () => {
    doc.defaultView.FileReader = origFileReader;
  };
}

// ── Static scan ───────────────────────────────────────────────────────────────

const backupUiSource = (() => {
  try {
    return fs.readFileSync(path.resolve(__dirname, 'backup-ui.js'), 'utf8');
  } catch {
    return null;
  }
})();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('backup-ui.js — no innerHTML', () => {
  it('backup-ui.js contains no innerHTML assignments', () => {
    expect(backupUiSource).not.toBeNull();
    expect(backupUiSource).not.toMatch(/\.innerHTML\s*=/);
  });
});

describe('createBackupUI — render', () => {
  it('renders an Export Backup button with data-action="export-backup"', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter);
    ui.render(container);

    expect(container.querySelector('[data-action="export-backup"]')).not.toBeNull();
  });

  it('renders a restore file input with data-action="import-backup" and type="file"', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter);
    ui.render(container);

    const input = container.querySelector('[data-action="import-backup"]');
    expect(input).not.toBeNull();
    expect(input.type).toBe('file');
  });

  it('export and import buttons are visible (no hidden attribute or display:none)', () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter);
    ui.render(container);

    const exportBtn = container.querySelector('[data-action="export-backup"]');
    const importInput = container.querySelector('[data-action="import-backup"]');
    expect(exportBtn.hidden).toBe(false);
    expect(importInput.hidden).toBe(false);
    expect(exportBtn.style.display).not.toBe('none');
    expect(importInput.style.display).not.toBe('none');
  });
});

describe('createBackupUI — export path', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('export button click calls buildBackup() and triggers <a download> with BACKUP_FILENAME_PREFIX', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();

    // Spy on createElement to capture anchor creation
    const capturedAnchors = [];
    const origCreateElement = doc.createElement.bind(doc);
    vi.spyOn(doc, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        capturedAnchors.push(el);
        vi.spyOn(el, 'click').mockImplementation(() => {});
      }
      return el;
    });

    const ui = createBackupUI(doc, backup, reporter);
    ui.render(container);

    const exportBtn = container.querySelector('[data-action="export-backup"]');
    exportBtn.click();

    await vi.waitFor(() => expect(backup.buildBackup).toHaveBeenCalled());
    await vi.waitFor(() => expect(capturedAnchors.length).toBeGreaterThan(0));

    const anchor = capturedAnchors[0];
    expect(anchor.download).toMatch(BACKUP_FILENAME_PREFIX);
    expect(anchor.click).toHaveBeenCalled();
  });

  it('export button is disabled while buildBackup() is in-flight and re-enabled on completion', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');

    let resolveBackup;
    const buildBackup = vi.fn().mockReturnValue(new Promise((r) => { resolveBackup = r; }));
    const backup = { buildBackup, restoreBackup: vi.fn() };
    const reporter = makeReporter();

    vi.spyOn(doc, 'createElement').mockImplementation((tag) => {
      const origCreateElement = document.createElement.bind(document);
      const el = origCreateElement(tag);
      if (tag === 'a') vi.spyOn(el, 'click').mockImplementation(() => {});
      return el;
    });

    const ui = createBackupUI(doc, backup, reporter);
    ui.render(container);

    const exportBtn = container.querySelector('[data-action="export-backup"]');
    exportBtn.click();

    // Should be disabled synchronously after click
    await Promise.resolve(); // allow microtask to queue
    expect(exportBtn.disabled).toBe(true);

    // Resolve the backup promise
    resolveBackup({
      schema_version: 1,
      exported_at: '2024-01-01T00:00:00.000Z',
      daily_records: [],
      settings: [],
    });

    await vi.waitFor(() => expect(exportBtn.disabled).toBe(false));
  });
});

describe('createBackupUI — restore path', () => {
  it('valid file -> restoreBackup() called and data:records:mutated dispatched', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const payload = { schema_version: 1, exported_at: '2024-01-01T00:00:00.000Z', daily_records: [], settings: [] };
    const backup = makeBackup();
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter);
    ui.render(container);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const input = container.querySelector('[data-action="import-backup"]');
    const restore = simulateFileSelect(doc, input, JSON.stringify(payload));

    await vi.waitFor(() => expect(backup.restoreBackup).toHaveBeenCalledWith(payload));
    await vi.waitFor(() => expect(events.length).toBe(1));

    restore();
  });

  it('data:records:mutated dispatched on success only — not on failure', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const payload = { schema_version: 1, exported_at: '2024-01-01T00:00:00.000Z', daily_records: [], settings: [] };
    const backup = makeBackup({ restoreResult: new Error('restore failed') });
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter);
    ui.render(container);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const input = container.querySelector('[data-action="import-backup"]');
    const restore = simulateFileSelect(doc, input, JSON.stringify(payload));

    await vi.waitFor(() => expect(backup.restoreBackup).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(events.length).toBe(0);

    restore();
  });

  it('unparseable JSON -> reporter called with error prefix; no uncaught exception', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter);
    ui.render(container);

    const input = container.querySelector('[data-action="import-backup"]');
    const restore = simulateFileSelect(doc, input, 'NOT JSON {{{');

    await vi.waitFor(() => expect(reporter).toHaveBeenCalled());
    const reporterMsg = reporter.mock.calls[0][0];
    expect(reporterMsg).toMatch(/[❌X]/);

    restore();
  });

  it('restoreBackup TypeError -> reporter called; data:records:mutated NOT dispatched', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const payload = { schema_version: 99, exported_at: '2024-01-01T00:00:00.000Z', daily_records: [], settings: [] };
    const backup = makeBackup({ restoreResult: new TypeError('Unsupported schema') });
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter);
    ui.render(container);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const input = container.querySelector('[data-action="import-backup"]');
    const restore = simulateFileSelect(doc, input, JSON.stringify(payload));

    await vi.waitFor(() => expect(reporter).toHaveBeenCalled());
    const reporterMsg = reporter.mock.calls[0][0];
    expect(reporterMsg).toMatch(/[❌X]/);
    await new Promise((r) => setTimeout(r, 30));
    expect(events.length).toBe(0);

    restore();
  });
});

describe('createBackupUI — AbortController cleanup', () => {
  it('calling createBackupUI render twice does not accumulate listeners (double-fire check)', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');

    let callCount = 0;
    const buildBackup = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        schema_version: 1,
        exported_at: '2024-01-01T00:00:00.000Z',
        daily_records: [],
        settings: [],
      });
    });
    const backup = { buildBackup, restoreBackup: vi.fn() };
    const reporter = makeReporter();

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    const ui = createBackupUI(doc, backup, reporter);
    ui.render(container);

    // Spy on anchors to prevent actual click
    const origCreateElement = doc.createElement.bind(doc);
    vi.spyOn(doc, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') vi.spyOn(el, 'click').mockImplementation(() => {});
      return el;
    });

    // Second render on same container — should abort first listener
    ui.render(container);

    callCount = 0; // reset after renders
    const exportBtn = container.querySelector('[data-action="export-backup"]');
    exportBtn.click();

    await vi.waitFor(() => expect(callCount).toBe(1));

    vi.unstubAllGlobals();
  });
});
