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
    <div id="settings-modal" class="modal-overlay" role="dialog" aria-modal="true" hidden>
    </div>
  `;
}

function makeMockSettings({ anchorDate = '2024-03-15', count = 5, total = 3120 } = {}) {
  return {
    getSyncAnchorDate: vi.fn().mockResolvedValue(anchorDate),
    setSyncAnchorDate: vi.fn().mockResolvedValue(undefined),
    countRecordsBefore: vi.fn().mockResolvedValue(count),
    countAllRecords: vi.fn().mockResolvedValue(total),
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

  it('render() emits modal-dialog wrapper class matching styles.css', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    const dialog = doc.querySelector('#settings-modal .modal-dialog');
    expect(dialog).not.toBeNull();
  });

  it('render() emits modal-header class matching styles.css', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    const header = doc.querySelector('#settings-modal .modal-header');
    expect(header).not.toBeNull();
  });

  it('date input uses settings-date-picker class matching styles.css', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    const input = doc.querySelector('[data-field="anchor-date"]');
    expect(input.classList.contains('settings-date-picker')).toBe(true);
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
    expect(modal.hasAttribute('hidden')).toBe(false);
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
    expect(modal.hasAttribute('hidden')).toBe(true);
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
    expect(modal.hasAttribute('hidden')).toBe(true);
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

  it('prune with empty date reports validation message and never calls pruneRecordsBefore', async () => {
    const confirmFn = vi.fn().mockReturnValue(true);
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter, confirmFn);
    await ui.render();
    await ui.open();

    // Ensure date input is empty
    const input = doc.querySelector('[data-field="anchor-date"]');
    input.value = '';

    const pruneBtn = doc.querySelector('[data-action="prune"]');
    pruneBtn.click();

    await new Promise(r => setTimeout(r, 50));
    expect(settings.pruneRecordsBefore).not.toHaveBeenCalled();
    expect(confirmFn).not.toHaveBeenCalled();
    expect(reporter.db).toHaveBeenCalledWith(expect.stringMatching(/date/i));
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

// ── Task 7: Prune action with confirmFn ──────────────────────────────────────

describe('createSettingsUI — prune action', () => {
  it('confirmFn returns true → pruneRecordsBefore called and data:records:mutated dispatched', async () => {
    const confirmFn = vi.fn().mockReturnValue(true);
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings({ count: 3 });
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter, confirmFn);
    await ui.render();
    await ui.open();

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    // Set a date and click prune
    const input = doc.querySelector('[data-field="anchor-date"]');
    input.value = '2024-06-01';

    const pruneBtn = doc.querySelector('[data-action="prune"]');
    pruneBtn.click();

    await vi.waitFor(() => expect(settings.pruneRecordsBefore).toHaveBeenCalledWith('2024-06-01'));
    expect(confirmFn).toHaveBeenCalled();
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
  });

  it('confirmFn returns false → pruneRecordsBefore not called, no event dispatched', async () => {
    const confirmFn = vi.fn().mockReturnValue(false);
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings({ count: 3 });
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter, confirmFn);
    await ui.render();
    await ui.open();

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const pruneBtn = doc.querySelector('[data-action="prune"]');
    pruneBtn.click();

    await new Promise(r => setTimeout(r, 50));
    expect(settings.pruneRecordsBefore).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('pruneRecordsBefore throws → reporter.db called, no event dispatched', async () => {
    const confirmFn = vi.fn().mockReturnValue(true);
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    settings.pruneRecordsBefore = vi.fn().mockRejectedValue(new Error('Prune failed'));
    const reporter = makeMockReporter();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ui = createSettingsUI(doc, settings, reporter, confirmFn);
    await ui.render();
    await ui.open();

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const input = doc.querySelector('[data-field="anchor-date"]');
    input.value = '2024-06-01';
    const pruneBtn = doc.querySelector('[data-action="prune"]');
    pruneBtn.click();

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    expect(events.length).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

// ── Task 7: Clear-All hazard mode ────────────────────────────────────────────

describe('createSettingsUI — Clear-All hazard mode', () => {
  it('checking Clear-All disables date picker and switches button to 🔥 Clear Entire Database', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();

    const checkbox = doc.querySelector('[data-action="toggle-clear-all"]');
    expect(checkbox).not.toBeNull();
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(r => setTimeout(r, 10));

    const input = doc.querySelector('[data-field="anchor-date"]');
    expect(input.classList.contains('disabled-picker')).toBe(true);

    const wipeBtn = doc.querySelector('[data-action="wipe"]');
    expect(wipeBtn).not.toBeNull();
    expect(wipeBtn.textContent).toBe('🔥 Clear Entire Database');
  });

  it('unchecking Clear-All restores prune mode', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();

    const checkbox = doc.querySelector('[data-action="toggle-clear-all"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    const input = doc.querySelector('[data-field="anchor-date"]');
    expect(input.classList.contains('opacity-50')).toBe(false);
    expect(input.classList.contains('pointer-events-none')).toBe(false);

    const actionBtn = doc.querySelector('[data-action="prune"]');
    expect(actionBtn).not.toBeNull();
    expect(actionBtn.textContent).not.toContain('🔥');
  });

  it('Clear-All checked → impact counter is disabled', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();

    const checkbox = doc.querySelector('[data-action="toggle-clear-all"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    const preview = doc.querySelector('[data-preview="impact"]');
    const isDisabled = preview.getAttribute('aria-disabled') === 'true'
      || preview.classList.contains('disabled')
      || preview.dataset.disabled === 'true';
    expect(isDisabled).toBe(true);
  });
});

// ── Task 7: Wipe action with confirmFn ───────────────────────────────────────

describe('createSettingsUI — wipe action', () => {
  async function openHazardMode(doc, settings, reporter, confirmFn) {
    const ui = createSettingsUI(doc, settings, reporter, confirmFn);
    await ui.render();
    await ui.open();
    const checkbox = doc.querySelector('[data-action="toggle-clear-all"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    return ui;
  }

  it('confirmFn returns true in wipe mode → wipeDatabase called and data:records:mutated dispatched', async () => {
    const confirmFn = vi.fn().mockReturnValue(true);
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    await openHazardMode(doc, settings, reporter, confirmFn);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const wipeBtn = doc.querySelector('[data-action="wipe"]');
    expect(wipeBtn).not.toBeNull();
    wipeBtn.click();

    await vi.waitFor(() => expect(settings.wipeDatabase).toHaveBeenCalled());
    expect(confirmFn).toHaveBeenCalled();
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
  });

  it('confirmFn returns false in wipe mode → wipeDatabase not called, no event', async () => {
    const confirmFn = vi.fn().mockReturnValue(false);
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    await openHazardMode(doc, settings, reporter, confirmFn);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const wipeBtn = doc.querySelector('[data-action="wipe"]');
    wipeBtn.click();

    await new Promise(r => setTimeout(r, 50));
    expect(settings.wipeDatabase).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('wipeDatabase throws → reporter.db called; no event dispatched', async () => {
    const confirmFn = vi.fn().mockReturnValue(true);
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    settings.wipeDatabase = vi.fn().mockRejectedValue(new Error('Wipe failed'));
    const reporter = makeMockReporter();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await openHazardMode(doc, settings, reporter, confirmFn);

    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));

    const wipeBtn = doc.querySelector('[data-action="wipe"]');
    wipeBtn.click();

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    expect(events.length).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

// ── Task 7: no window.confirm file-content assertion ─────────────────────────

describe('settings-ui.js — no window.confirm', () => {
  const sourceFile = path.resolve(__dirname, 'settings-ui.js');
  const source = fs.readFileSync(sourceFile, 'utf-8');

  it('source never calls window.confirm', () => {
    expect(source).not.toContain('window.confirm');
    expect(source).not.toMatch(/\bconfirm\s*\(/);
  });
});

// ── Task 10: Save anchor on date change (no Save button) ─────────────────────

describe('createSettingsUI — save anchor on date change', () => {
  it('rendered modal contains NO save-anchor button', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    expect(doc.querySelector('[data-action="save-anchor"]')).toBeNull();
  });

  it('changing the date calls setSyncAnchorDate(date) and refreshes impact preview', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings({ count: 42, anchorDate: '2024-03-15' });
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();

    const input = doc.querySelector('[data-field="anchor-date"]');
    input.value = '2024-06-01';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(settings.setSyncAnchorDate).toHaveBeenCalledWith('2024-06-01'));

    const preview = doc.querySelector('[data-preview="impact"]');
    await vi.waitFor(() => expect(preview.textContent).toContain('42'));
  });

  it('changing the date with empty value does NOT call setSyncAnchorDate', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();

    const input = doc.querySelector('[data-field="anchor-date"]');
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(settings.setSyncAnchorDate).not.toHaveBeenCalled();
  });

  it('setSyncAnchorDate throws → reporter.db called with error message', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    settings.setSyncAnchorDate = vi.fn().mockRejectedValue(new Error('DB save failed'));
    const reporter = makeMockReporter();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();

    const input = doc.querySelector('[data-field="anchor-date"]');
    input.value = '2024-06-01';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌')));
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('open() persists nothing but refreshes the impact preview for the loaded anchor', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings({ count: 7, anchorDate: '2024-03-15' });
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();
    await vi.waitFor(() => expect(settings.countRecordsBefore).toHaveBeenCalledWith('2024-03-15'));
    const preview = doc.querySelector('[data-preview="impact"]');
    expect(preview.textContent).toContain('7');
  });
});

// ── New layout: two sections, divider, mockup labels ─────────────────────────

describe('createSettingsUI — mockup layout', () => {
  it('header title reads "⚙️ Settings & Data Hygiene"', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    const title = doc.querySelector('.modal-header h2');
    expect(title.textContent).toBe('⚙️ Settings & Data Hygiene');
  });

  it('close button uses .settings-close-btn (not the pill .btn)', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    const closeBtn = doc.querySelector('[data-action="close-settings"]');
    expect(closeBtn.classList.contains('settings-close-btn')).toBe(true);
    expect(closeBtn.classList.contains('btn')).toBe(false);
  });

  it('renders two sections separated by a divider', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    const sections = doc.querySelectorAll('.settings-section');
    expect(sections.length).toBe(2);
    expect(doc.querySelectorAll('.settings-divider').length).toBe(1);
  });

  it('sync section is titled "📅 SYNC BOUNDARY" and labels the picker "Track History From:"', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    const syncTitle = doc.querySelector('.sync-section .settings-section-title');
    expect(syncTitle.textContent).toBe('📅 SYNC BOUNDARY');
    expect(doc.querySelector('.sync-section .settings-label-text').textContent).toBe('Track History From:');
  });

  it('purge section is titled "🗑️ DATA PURGE OPTIONS" with Clear All label', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    const purgeTitle = doc.querySelector('.purge-section .settings-section-title');
    expect(purgeTitle.textContent).toBe('🗑️ DATA PURGE OPTIONS');
    expect(doc.querySelector('.purge-section .settings-clear-all-label span').textContent).toBe(
      'Clear All Local Data (Wipe entire database)'
    );
  });

  it('impact preview block is labelled "📊 Impact Preview:"', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings();
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    expect(doc.querySelector('.settings-impact-label').textContent).toBe('📊 Impact Preview:');
  });

  it('prune button label includes a human-readable date (Jan 1, 2018)', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings({ count: 3, anchorDate: '2018-01-01' });
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();
    await vi.waitFor(() => {
      const btn = doc.querySelector('[data-action="prune"]');
      expect(btn.textContent).toBe('🗑️ Prune Data Before Jan 1, 2018');
    });
  });

  it('impact preview renders "X records found prior to YYYY-MM-DD" (ISO date)', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings({ count: 1420, anchorDate: '2018-01-01' });
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();
    await ui.open();
    await vi.waitFor(() => {
      const preview = doc.querySelector('[data-preview="impact"]');
      expect(preview.textContent).toBe('1420 records found prior to 2018-01-01');
    });
  });

  it('wipe mode preview shows "X total records will be deleted"', async () => {
    const doc = buildDoc(getBaseHTML());
    const settings = makeMockSettings({ total: 3120 });
    const reporter = makeMockReporter();
    const ui = createSettingsUI(doc, settings, reporter);
    await ui.render();

    const checkbox = doc.querySelector('[data-action="toggle-clear-all"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      const preview = doc.querySelector('[data-preview="impact"]');
      expect(preview.textContent).toBe('3120 total records will be deleted');
    });
    expect(settings.countAllRecords).toHaveBeenCalled();
  });
});
