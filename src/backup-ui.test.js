/**
 * Tests for src/backup-ui.js
 * Task 3: Backup panel UI (export + restore file input)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  return { db: vi.fn(), auth: vi.fn(), sync: vi.fn() };
}

function makeConfirm(returns = true) {
  return vi.fn().mockReturnValue(returns);
}

function makeSettingsPrefs({ lastLocalExport = null } = {}) {
  return {
    getLastLocalExport: vi.fn().mockResolvedValue(lastLocalExport),
    setLastLocalExport: vi.fn().mockResolvedValue(undefined),
  };
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('backup-ui.js — no innerHTML (runtime contract)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('render() builds the panel without ever assigning innerHTML', () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const innerHTMLSetter = vi.spyOn(doc.defaultView.Element.prototype, 'innerHTML', 'set');

    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);

    expect(innerHTMLSetter).not.toHaveBeenCalled();
  });

  it('export and restore interactions never assign innerHTML', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const innerHTMLSetter = vi.spyOn(doc.defaultView.Element.prototype, 'innerHTML', 'set');

    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);

    // Export flow — capture anchor so no real navigation happens
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
    const origCreateElement = doc.createElement.bind(doc);
    vi.spyOn(doc, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') vi.spyOn(el, 'click').mockImplementation(() => {});
      return el;
    });
    const exportBtn = container.querySelector('[data-action="export-backup"]');
    exportBtn.click();
    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());

    // Restore flow
    const payload = {
      schema_version: 1,
      exported_at: '2024-01-01T00:00:00.000Z',
      daily_records: [],
      settings: [],
    };
    const input = container.querySelector('[data-action="import-backup"]');
    const restore = simulateFileSelect(doc, input, JSON.stringify(payload));
    await vi.waitFor(() => expect(backup.restoreBackup).toHaveBeenCalled());

    expect(innerHTMLSetter).not.toHaveBeenCalled();

    restore();
  });
});

describe('createBackupUI — render', () => {
  it('renders an Export Backup button with data-action="export-backup"', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);

    expect(container.querySelector('[data-action="export-backup"]')).not.toBeNull();
  });

  it('renders a restore file input with data-action="import-backup" and type="file"', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
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
    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);

    const exportBtn = container.querySelector('[data-action="export-backup"]');
    const importInput = container.querySelector('[data-action="import-backup"]');
    expect(exportBtn.hidden).toBe(false);
    expect(importInput.hidden).toBe(false);
    expect(exportBtn.style.display).not.toBe('none');
    expect(importInput.style.display).not.toBe('none');
  });

  it('renders a "⚠️ Overwrites local database" warning badge in the restore section', () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);

    const badge = container.querySelector('.warning-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('⚠️ Overwrites local database');
  });

  it('renders "Last local export: Never" when no settings collaborator is injected', () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);

    expect(container.textContent).toContain('Last local export: Never');
  });

  it('renders the persisted last-export date from settings.getLastLocalExport()', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const settings = makeSettingsPrefs({ lastLocalExport: '2026-08-10T10:00:00.000Z' });
    const ui = createBackupUI(doc, backup, reporter, makeConfirm(), settings);
    await ui.render(container);

    expect(settings.getLastLocalExport).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Last local export: Aug 10, 2026');
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

    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);

    const exportBtn = container.querySelector('[data-action="export-backup"]');
    exportBtn.click();

    await vi.waitFor(() => expect(backup.buildBackup).toHaveBeenCalled());
    await vi.waitFor(() => expect(capturedAnchors.length).toBeGreaterThan(0));

    const anchor = capturedAnchors[0];
    expect(anchor.download).toMatch(BACKUP_FILENAME_PREFIX);
    expect(anchor.click).toHaveBeenCalled();
    expect(reporter.db).toHaveBeenCalledWith('✅ Backup exported successfully');
  });

  it('export button is disabled while buildBackup() is in-flight and re-enabled on completion', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');

    let resolveBackup;
    const buildBackup = vi.fn().mockReturnValue(new Promise((r) => { resolveBackup = r; }));
    const backup = { buildBackup, restoreBackup: vi.fn() };
    const reporter = makeReporter();

    const origCreateElement = doc.createElement.bind(doc);
    vi.spyOn(doc, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') vi.spyOn(el, 'click').mockImplementation(() => {});
      return el;
    });

    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
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

describe('createBackupUI — export metadata persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a successful export persists the timestamp via settings.setLastLocalExport', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const settings = makeSettingsPrefs();
    const origCreateElement = doc.createElement.bind(doc);
    vi.spyOn(doc, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') vi.spyOn(el, 'click').mockImplementation(() => {});
      return el;
    });

    const ui = createBackupUI(doc, backup, reporter, makeConfirm(), settings);
    await ui.render(container);
    const exportBtn = container.querySelector('[data-action="export-backup"]');
    exportBtn.click();

    await vi.waitFor(() => expect(settings.setLastLocalExport).toHaveBeenCalledTimes(1));
    expect(settings.setLastLocalExport).toHaveBeenCalledWith(expect.any(String));
  });

  it('the metadata line updates in place after a successful export, without a full re-render', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const settings = makeSettingsPrefs({ lastLocalExport: null });
    const origCreateElement = doc.createElement.bind(doc);
    vi.spyOn(doc, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') vi.spyOn(el, 'click').mockImplementation(() => {});
      return el;
    });

    const ui = createBackupUI(doc, backup, reporter, makeConfirm(), settings);
    await ui.render(container);
    expect(container.textContent).toContain('Last local export: Never');

    const exportBtn = container.querySelector('[data-action="export-backup"]');
    exportBtn.click();

    await vi.waitFor(() => expect(container.textContent).not.toContain('Last local export: Never'));
  });

  it('a setLastLocalExport failure is logged and never surfaces to the user (export already succeeded)', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const settings = makeSettingsPrefs();
    settings.setLastLocalExport.mockRejectedValue(new Error('write failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const origCreateElement = doc.createElement.bind(doc);
    vi.spyOn(doc, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') vi.spyOn(el, 'click').mockImplementation(() => {});
      return el;
    });

    const ui = createBackupUI(doc, backup, reporter, makeConfirm(), settings);
    await ui.render(container);
    const exportBtn = container.querySelector('[data-action="export-backup"]');
    exportBtn.click();

    await vi.waitFor(() => expect(settings.setLastLocalExport).toHaveBeenCalled());
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith('[backup-ui]', expect.any(Error)));
    expect(reporter.db).toHaveBeenCalledWith('✅ Backup exported successfully');
  });
});

describe('createBackupUI — Task 19 oversized export guard', () => {
  it('buildBackup RangeError ("backup too large") surfaces a generic ❌ reporter, no crash, no download', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const tooLarge = new RangeError(
      'backup too large: 100001 rows exceeds MAX_BACKUP_RECORDS'
    );
    const buildBackup = vi.fn().mockRejectedValue(tooLarge);
    const backup = { buildBackup, restoreBackup: vi.fn() };
    const reporter = makeReporter();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const anchors = [];
    const origCreateElement = doc.createElement.bind(doc);
    vi.spyOn(doc, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') anchors.push(el);
      return el;
    });

    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);
    const exportBtn = container.querySelector('[data-action="export-backup"]');
    exportBtn.click();

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    const msg = reporter.db.mock.calls[reporter.db.mock.calls.length - 1][0];
    expect(msg).toBe('❌ Export failed: backup too large');
    expect(msg).not.toMatch(/MAX_BACKUP_RECORDS|100001/);
    expect(consoleSpy).toHaveBeenCalledWith('[backup-ui]', tooLarge);
    expect(anchors).toHaveLength(0);
    expect(exportBtn.disabled).toBe(false);
  });

  it('non-RangeError export failure still surfaces the detailed message via reporter', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const buildBackup = vi.fn().mockRejectedValue(new Error('indexeddb quota exceeded'));
    const backup = { buildBackup, restoreBackup: vi.fn() };
    const reporter = makeReporter();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);
    const exportBtn = container.querySelector('[data-action="export-backup"]');
    exportBtn.click();

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    const msg = reporter.db.mock.calls[reporter.db.mock.calls.length - 1][0];
    expect(msg).toBe('❌ Export failed: indexeddb quota exceeded');
  });
});

describe('createBackupUI — restore path', () => {
  it('valid file -> restoreBackup() called and data:records:mutated dispatched', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const payload = { schema_version: 1, exported_at: '2024-01-01T00:00:00.000Z', daily_records: [], settings: [] };
    const backup = makeBackup();
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const input = container.querySelector('[data-action="import-backup"]');
    const restore = simulateFileSelect(doc, input, JSON.stringify(payload));

    await vi.waitFor(() => expect(backup.restoreBackup).toHaveBeenCalledWith(payload));
    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(reporter.db).toHaveBeenCalledWith('✅ Backup restored successfully');

    restore();
  });

  it('confirmFn is invoked with a warning message before restoreBackup is called', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const payload = { schema_version: 1, exported_at: '2024-01-01T00:00:00.000Z', daily_records: [], settings: [] };
    const backup = makeBackup();
    const reporter = makeReporter();
    const confirmFn = makeConfirm(true);
    const ui = createBackupUI(doc, backup, reporter, confirmFn);
    ui.render(container);

    const input = container.querySelector('[data-action="import-backup"]');
    const restore = simulateFileSelect(doc, input, JSON.stringify(payload));

    await vi.waitFor(() => expect(confirmFn).toHaveBeenCalledWith(expect.stringMatching(/overwrite/i)));
    expect(backup.restoreBackup).toHaveBeenCalledWith(payload);

    restore();
  });

  it('user cancels the confirm dialog: restoreBackup NOT called; data:records:mutated NOT dispatched', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const payload = { schema_version: 1, exported_at: '2024-01-01T00:00:00.000Z', daily_records: [], settings: [] };
    const backup = makeBackup();
    const reporter = makeReporter();
    const confirmFn = makeConfirm(false);
    const ui = createBackupUI(doc, backup, reporter, confirmFn);
    ui.render(container);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const input = container.querySelector('[data-action="import-backup"]');
    const restore = simulateFileSelect(doc, input, JSON.stringify(payload));

    await vi.waitFor(() => expect(confirmFn).toHaveBeenCalled());
    expect(backup.restoreBackup).not.toHaveBeenCalled();
    expect(events.length).toBe(0);

    restore();
  });

  it('data:records:mutated dispatched on success only — not on failure', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const payload = { schema_version: 1, exported_at: '2024-01-01T00:00:00.000Z', daily_records: [], settings: [] };
    const backup = makeBackup({ restoreResult: new Error('restore failed') });
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const input = container.querySelector('[data-action="import-backup"]');
    const restore = simulateFileSelect(doc, input, JSON.stringify(payload));

    await vi.waitFor(() => {
      expect(backup.restoreBackup).toHaveBeenCalled();
      expect(events.length).toBe(0);
    });

    restore();
  });

  it('unparseable JSON -> reporter called with error prefix; no uncaught exception', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const backup = makeBackup();
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);

    const input = container.querySelector('[data-action="import-backup"]');
    const restore = simulateFileSelect(doc, input, 'NOT JSON {{{');

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    const reporterMsg = reporter.db.mock.calls[0][0];
    expect(reporterMsg).toMatch(/[❌X]/);

    restore();
  });

  it('restoreBackup TypeError -> reporter called; data:records:mutated NOT dispatched', async () => {
    const doc = buildDoc();
    const container = doc.getElementById('tab-backup');
    const payload = { schema_version: 99, exported_at: '2024-01-01T00:00:00.000Z', daily_records: [], settings: [] };
    const backup = makeBackup({ restoreResult: new TypeError('Unsupported schema') });
    const reporter = makeReporter();
    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
    ui.render(container);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const input = container.querySelector('[data-action="import-backup"]');
    const restore = simulateFileSelect(doc, input, JSON.stringify(payload));

    await vi.waitFor(() => {
      expect(reporter.db).toHaveBeenCalled();
      const reporterMsg = reporter.db.mock.calls[0][0];
      expect(reporterMsg).toMatch(/[❌X]/);
      expect(events.length).toBe(0);
    });

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

    const ui = createBackupUI(doc, backup, reporter, makeConfirm());
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
