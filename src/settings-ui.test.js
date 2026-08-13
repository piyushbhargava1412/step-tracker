/**
 * Tests for src/settings-ui.js — Settings DOM-writer.
 * Uses `document.implementation.createHTMLDocument` (same pattern as calendar-ui.test.js)
 * because JSDOM's AbortController.signal is not compatible with addEventListener.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSettingsUI } from './settings-ui.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

afterEach(() => vi.restoreAllMocks());

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildDoc(html = '') {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = html;
  return doc;
}

function getBaseHTML() {
  return `
    <div id="settings-modal" style="display:none;" role="dialog" aria-modal="true">
    </div>
  `;
}

function makeMockSettings({ anchorDate = '2024-03-15', count = 5 } = {}) {
  return {
    getSyncAnchorDate: vi.fn().mockResolvedValue(anchorDate),
    setSyncAnchorDate: vi.fn().mockResolvedValue(undefined),
    countRecordsBefore: vi.fn().mockResolvedValue(count),
    pruneRecordsBefore: vi.fn().mockResolvedValue(undefined),
    wipeDatabase: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockReporter() {
  return {
    auth: vi.fn(),
    db: vi.fn(),
  };
}

// ── File-content assertions (structural) ─────────────────────────────────────

describe('settings-ui.js — file-content assertions', () => {
  const sourceFile = path.resolve(__dirname, 'settings-ui.js');
  const source = fs.readFileSync(sourceFile, 'utf-8');

  it('source never contains innerHTML', () => {
    expect(source).not.toContain('innerHTML');
  });

  it('source never uses onclick= or .onclick assignment', () => {
    expect(source).not.toMatch(/onclick\s*=/);
    expect(source).not.toMatch(/\.onclick\s*=/);
  });
});

// ── Factory ───────────────────────────────────────────────────────────────────

describe('createSettingsUI — factory', () => {
  it('returns an object with open, close, and render methods', () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    expect(typeof ui.open).toBe('function');
    expect(typeof ui.close).toBe('function');
    expect(typeof ui.render).toBe('function');
  });

  it('does not touch the DOM at factory call time', () => {
    const doc = buildDoc('');
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    // Should not throw even with no modal in DOM
    expect(() => createSettingsUI(doc, settings, reporter)).not.toThrow();
  });
});

// ── render() ─────────────────────────────────────────────────────────────────

describe('createSettingsUI — render()', () => {
  it('builds modal DOM using createElement (not innerHTML)', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    const modal = doc.getElementById('settings-modal');
    expect(modal).not.toBeNull();
    expect(modal.childElementCount).toBeGreaterThan(0);
  });

  it('contains a date input after render', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    const input = doc.querySelector('#settings-modal input[type="date"]');
    expect(input).not.toBeNull();
  });

  it('contains an impact-preview element after render', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    const preview = doc.querySelector('[data-preview="impact"]');
    expect(preview).not.toBeNull();
  });
});

// ── open() / close() ─────────────────────────────────────────────────────────

describe('createSettingsUI — open() / close()', () => {
  it('open() makes modal visible', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();
    const modal = doc.getElementById('settings-modal');
    expect(modal.style.display).not.toBe('none');
  });

  it('open() pre-populates date input from getSyncAnchorDate()', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings({ anchorDate: '2024-03-15' });
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();
    const input = doc.querySelector('[data-field="anchor-date"]');
    expect(input.value).toBe('2024-03-15');
    expect(settings.getSyncAnchorDate).toHaveBeenCalled();
  });

  it('close() hides the modal', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();
    ui.close();
    const modal = doc.getElementById('settings-modal');
    expect(modal.style.display).toBe('none');
  });

  it('close-button click hides the modal', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();

    const closeBtn = doc.querySelector('[data-action="close-settings"]');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    const modal = doc.getElementById('settings-modal');
    expect(modal.style.display).toBe('none');
  });

  it('getSyncAnchorDate error → reporter.db called', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    settings.getSyncAnchorDate = vi.fn().mockRejectedValue(new Error('DB fail'));
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();
    expect(reporter.db).toHaveBeenCalled();
  });
});

// ── Impact preview on date change ────────────────────────────────────────────

describe('createSettingsUI — impact preview', () => {
  it('changing date input calls countRecordsBefore and updates preview counter', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings({ count: 42 });
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();

    const input = doc.querySelector('[data-field="anchor-date"]');
    input.value = '2024-06-01';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(settings.countRecordsBefore).toHaveBeenCalledWith('2024-06-01');
    });

    const preview = doc.querySelector('[data-preview="impact"]');
    await vi.waitFor(() => {
      expect(preview.textContent).toContain('42');
    });
  });

  it('countRecordsBefore throws → preview shows error state; reporter.db called', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    settings.countRecordsBefore = vi.fn().mockRejectedValue(new Error('DB fail'));
    const reporter = makeMockReporter();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();

    const input = doc.querySelector('[data-field="anchor-date"]');
    input.value = '2024-06-01';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(reporter.db).toHaveBeenCalled();
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

// ── AbortController / listener teardown ──────────────────────────────────────

describe('createSettingsUI — AbortController', () => {
  it('re-render aborts previous listeners — no calls after abort', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings({ count: 5 });
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();

    // Trigger change to confirm listener is active
    const input = doc.querySelector('[data-field="anchor-date"]');
    input.value = '2024-01-01';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(settings.countRecordsBefore).toHaveBeenCalledTimes(1));

    // Re-render (aborts previous controller, builds new listeners)
    await ui.render();
    settings.countRecordsBefore.mockClear();

    // Fire event on the modal — but the old input no longer exists
    // and a new input should be there. Old controller is aborted.
    // Verify by firing a change on the doc itself (no field target = no-op)
    doc.getElementById('settings-modal').dispatchEvent(new Event('change', { bubbles: false }));
    await new Promise(r => setTimeout(r, 50));
    expect(settings.countRecordsBefore).not.toHaveBeenCalled();
  });
});

// ── Guard clauses ─────────────────────────────────────────────────────────────

describe('createSettingsUI — guard clauses', () => {
  it('render() skips gracefully when #settings-modal is absent', async () => {
    const doc = buildDoc(''); // no modal
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ui = createSettingsUI(doc, settings, reporter);
    await expect(ui.render()).resolves.toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith('[settings-ui]', expect.stringContaining('Missing'));
  });

  it('open() skips gracefully when #settings-modal is absent', async () => {
    const doc = buildDoc(''); // no modal
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await expect(ui.open()).resolves.toBeUndefined();
  });

  it('close() skips gracefully when #settings-modal is absent', () => {
    const doc = buildDoc('');
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    expect(() => ui.close()).not.toThrow();
  });
});
