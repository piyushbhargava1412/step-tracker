/**
 * Tests for src/drive-sync-ui.js
 * Task 6: Cloud sync UI (manual backup-now / restore-from-cloud, LWW warning)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { createDriveSyncUI } from './drive-sync-ui.js';
import { DRIVE_PUSH_SKIPPED } from './drive-sync.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildDoc(html = '<div id="cloud-controls"></div>') {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    url: 'http://localhost',
  });
  return dom.window.document;
}

function makeDriveSync({ pushResult = undefined, pullResult = null } = {}) {
  return {
    push: pushResult instanceof Error
      ? vi.fn().mockRejectedValue(pushResult)
      : vi.fn().mockResolvedValue(pushResult),
    pull: vi.fn().mockResolvedValue(pullResult),
    find: vi.fn().mockResolvedValue(null),
  };
}

function makeBackup({ buildResult = null, restoreResult = undefined } = {}) {
  const envelope = buildResult ?? {
    schema_version: 1,
    exported_at: '2024-01-15T10:00:00.000Z',
    daily_records: [{ date: '2024-01-15', effective_steps: 8000 }],
    settings: [],
  };
  return {
    buildBackup: vi.fn().mockResolvedValue(envelope),
    restoreBackup: restoreResult instanceof Error
      ? vi.fn().mockRejectedValue(restoreResult)
      : vi.fn().mockResolvedValue(restoreResult),
    _envelope: envelope,
  };
}

function makeReporter() {
  return { db: vi.fn(), auth: vi.fn(), sync: vi.fn() };
}

function makeDriveBackupPrefs({ enabled = true, lastDriveSync = null } = {}) {
  return {
    getDriveBackupEnabled: vi.fn().mockResolvedValue(enabled),
    setDriveBackupEnabled: vi.fn().mockResolvedValue(undefined),
    getLastDriveSync: vi.fn().mockResolvedValue(lastDriveSync),
    setLastDriveSync: vi.fn().mockResolvedValue(undefined),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createDriveSyncUI', () => {
  let doc, container, driveSync, backup, reporter, confirmFn, ui;

  beforeEach(async () => {
    doc = buildDoc();
    container = doc.getElementById('cloud-controls');
    driveSync = makeDriveSync();
    backup = makeBackup();
    reporter = makeReporter();
    confirmFn = vi.fn().mockReturnValue(true);
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    await ui.render(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders "Back up to Drive" button with a data-action attribute', () => {
    const btn = container.querySelector('[data-action="backup-to-drive"]');
    expect(btn).not.toBeNull();
  });

  it('renders "Restore from Drive" button with a data-action attribute', () => {
    const btn = container.querySelector('[data-action="restore-from-drive"]');
    expect(btn).not.toBeNull();
  });

  it('renders the "Google Drive" heading', () => {
    expect(container.querySelector('h2').textContent).toBe('Google Drive');
  });

  it('renders a "Replaces the data on this device" warning badge in the restore section', () => {
    const badge = container.querySelector('.warning-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('Replaces the data on this device');
  });

  it('renders the auto-backup toggle inside the "Back Up to Drive" section, beside the button', () => {
    const backupBtn = container.querySelector('[data-action="backup-to-drive"]');
    const toggle = container.querySelector('[data-action="toggle-drive-backup"]');
    expect(toggle).not.toBeNull();
    expect(backupBtn.closest('section')).toBe(toggle.closest('section'));
  });

  it('renders "No cloud backup found" when no last-sync metadata is available', () => {
    expect(container.textContent).toContain('No cloud backup found');
  });

  it('renders the persisted last-sync metadata from driveBackupPrefs.getLastDriveSync()', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    const prefs = makeDriveBackupPrefs({ lastDriveSync: { at: '2026-08-10T18:30:00.000Z', bytes: 245_760 } });
    const freshUi = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn, prefs);
    await freshUi.render(freshContainer);

    expect(prefs.getLastDriveSync).toHaveBeenCalledTimes(1);
    expect(freshContainer.textContent).toContain('Last cloud sync:');
    expect(freshContainer.textContent).toContain('240 KB');
  });

  // ── Backup-now path ──────────────────────────────────────────────────────────

  it('backup-now click calls buildBackup then driveSync.push with the envelope', async () => {
    const btn = container.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    // Allow microtasks to flush
    await new Promise(r => setTimeout(r, 0));

    expect(backup.buildBackup).toHaveBeenCalledOnce();
    expect(driveSync.push).toHaveBeenCalledOnce();
    expect(driveSync.push).toHaveBeenCalledWith(backup._envelope);
  });

  it('successful push calls reporter.sync with ✅-prefixed message', async () => {
    const btn = container.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(reporter.sync).toHaveBeenCalled();
    const msg = reporter.sync.mock.calls[reporter.sync.mock.calls.length - 1][0];
    expect(msg).toMatch(/^✅/);
  });

  it('a successful push persists { at, bytes } via driveBackupPrefs.setLastDriveSync', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    const prefs = makeDriveBackupPrefs();
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn, prefs);
    await ui.render(freshContainer);

    const btn = freshContainer.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(prefs.setLastDriveSync).toHaveBeenCalledWith({
      at: expect.any(String),
      bytes: JSON.stringify(backup._envelope).length,
    });
  });

  it('the metadata line updates in place after a successful push, without a full re-render', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    const prefs = makeDriveBackupPrefs();
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn, prefs);
    await ui.render(freshContainer);
    expect(freshContainer.textContent).toContain('No cloud backup found');

    const btn = freshContainer.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await vi.waitFor(() => expect(freshContainer.textContent).not.toContain('No cloud backup found'));
    expect(freshContainer.textContent).toContain('Last cloud sync:');
  });

  it('a skipped (no-token) push does NOT persist last-sync metadata', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    const prefs = makeDriveBackupPrefs();
    driveSync = makeDriveSync({ pushResult: DRIVE_PUSH_SKIPPED });
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn, prefs);
    await ui.render(freshContainer);

    const btn = freshContainer.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(prefs.setLastDriveSync).not.toHaveBeenCalled();
  });

  it('no-token push (skip sentinel) shows NO ✅ success toast — only an informational ℹ️ notice', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    driveSync = makeDriveSync({ pushResult: DRIVE_PUSH_SKIPPED });
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn);
    await ui.render(freshContainer);

    const btn = freshContainer.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    const calls = reporter.sync.mock.calls.map(c => c[0]);
    expect(calls.some(m => m.startsWith('✅'))).toBe(false);
    expect(calls).toContain('ℹ️ Google Account not connected — Drive sync unavailable');
  });

  it('explicit success (push resolves undefined) still shows the ✅ success toast', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    driveSync = makeDriveSync({ pushResult: undefined });
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn);
    await ui.render(freshContainer);

    const btn = freshContainer.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    const calls = reporter.sync.mock.calls.map(c => c[0]);
    expect(calls.some(m => m.startsWith('✅'))).toBe(true);
  });

  it('push rejects: reporter gets ❌ message, console.error with [drive-sync-ui] logged, NO data:records:mutated', async () => {
    const failure = new Error('network error');
    driveSync = makeDriveSync({ pushResult: failure });
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    await ui.render(container);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispatchSpy = vi.spyOn(doc, 'dispatchEvent');
    const btn = container.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    const calls = reporter.sync.mock.calls.map(c => c[0]);
    expect(calls.some(m => m.startsWith('❌'))).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync-ui]'),
      failure
    );
    const mutatedFired = dispatchSpy.mock.calls.some(c => c[0].type === 'data:records:mutated');
    expect(mutatedFired).toBe(false);
  });

  it('buildBackup RangeError ("backup too large") surfaces a generic ❌ reporter; push NOT called', async () => {
    const tooLarge = new RangeError(
      'backup too large: serialised payload exceeds MAX_BACKUP_BYTES'
    );
    const bk = { buildBackup: vi.fn().mockRejectedValue(tooLarge), restoreBackup: vi.fn() };
    const drive = makeDriveSync();
    ui = createDriveSyncUI(doc, drive, bk, reporter, confirmFn);
    await ui.render(container);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const btn = container.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    const calls = reporter.sync.mock.calls.map(c => c[0]);
    expect(calls).toContain('❌ Drive backup failed: backup too large');
    expect(calls.some(m => m.includes('MAX_BACKUP_BYTES'))).toBe(false);
    expect(drive.push).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync-ui]'),
      tooLarge
    );
  });

  // ── Restore-from-cloud path ──────────────────────────────────────────────────

  it('restore click invokes confirmFn before any restore logic', async () => {
    const envelope = { schema_version: 1, exported_at: '2024-01-15T10:00:00Z', daily_records: [], settings: [] };
    driveSync = makeDriveSync({ pullResult: envelope });
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    await ui.render(container);

    const btn = container.querySelector('[data-action="restore-from-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(confirmFn).toHaveBeenCalledBefore
      ? expect(confirmFn).toHaveBeenCalledBefore(driveSync.pull)
      : expect(confirmFn).toHaveBeenCalled();
  });

  it('user confirms: pull → restoreBackup → data:records:mutated dispatched', async () => {
    const envelope = { schema_version: 1, exported_at: '2024-01-15T10:00:00Z', daily_records: [], settings: [] };
    driveSync = makeDriveSync({ pullResult: envelope });
    confirmFn = vi.fn().mockReturnValue(true);
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    await ui.render(container);

    const dispatchSpy = vi.spyOn(doc, 'dispatchEvent');
    const btn = container.querySelector('[data-action="restore-from-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(driveSync.pull).toHaveBeenCalledOnce();
    expect(backup.restoreBackup).toHaveBeenCalledWith(envelope);
    const mutatedFired = dispatchSpy.mock.calls.some(c => c[0].type === 'data:records:mutated');
    expect(mutatedFired).toBe(true);
  });

  it('user cancels: restoreBackup NOT called; data:records:mutated NOT dispatched', async () => {
    const envelope = { schema_version: 1, exported_at: '2024-01-15T10:00:00Z', daily_records: [], settings: [] };
    driveSync = makeDriveSync({ pullResult: envelope });
    confirmFn = vi.fn().mockReturnValue(false);
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    await ui.render(container);

    const dispatchSpy = vi.spyOn(doc, 'dispatchEvent');
    const btn = container.querySelector('[data-action="restore-from-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(backup.restoreBackup).not.toHaveBeenCalled();
    const mutatedFired = dispatchSpy.mock.calls.some(c => c[0].type === 'data:records:mutated');
    expect(mutatedFired).toBe(false);
  });

  it('pull returns null (no backup): restoreBackup NOT called; reporter informs user', async () => {
    driveSync = makeDriveSync({ pullResult: null });
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    await ui.render(container);

    const btn = container.querySelector('[data-action="restore-from-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(backup.restoreBackup).not.toHaveBeenCalled();
    expect(reporter.sync).toHaveBeenCalledWith('ℹ️ No backup found on Google Drive');
  });

  it('restoreBackup throws: reporter called with ❌ prefix; event NOT dispatched', async () => {
    const envelope = { schema_version: 1, exported_at: '2024-01-15T10:00:00Z', daily_records: [], settings: [] };
    driveSync = makeDriveSync({ pullResult: envelope });
    backup = makeBackup({ restoreResult: new Error('restore failed') });
    confirmFn = vi.fn().mockReturnValue(true);
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    await ui.render(container);

    const dispatchSpy = vi.spyOn(doc, 'dispatchEvent');
    const btn = container.querySelector('[data-action="restore-from-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    const calls = reporter.sync.mock.calls.map(c => c[0]);
    expect(calls.some(m => m.startsWith('❌'))).toBe(true);
    const mutatedFired = dispatchSpy.mock.calls.some(c => c[0].type === 'data:records:mutated');
    expect(mutatedFired).toBe(false);
  });

  // ── Validate pulled envelope before restore (Task 11) ────────────────────────
  // Validation lives in driveSync.pull() (gateway-level). The UI merely surfaces
  // the resulting error via reporter.sync when pull rejects.

  it('a rejected pull (invalid payload) stops restore: no restoreBackup, no dispatch, reporter ❌', async () => {
    const error = new TypeError('invalid envelope');
    driveSync = makeDriveSync({ pullResult: null });
    // Force the factory-level mock to throw instead of resolving, since pull()
    // is what validates; the UI just catches and reports.
    driveSync.pull = vi.fn().mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispatchSpy = vi.spyOn(doc, 'dispatchEvent');
    confirmFn = vi.fn().mockReturnValue(true);
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    await ui.render(container);

    const btn = container.querySelector('[data-action="restore-from-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(backup.restoreBackup).not.toHaveBeenCalled();
    const calls = reporter.sync.mock.calls.map(c => c[0]);
    expect(calls.some(m => m.startsWith('❌'))).toBe(true);
    const mutatedFired = dispatchSpy.mock.calls.some(c => c[0].type === 'data:records:mutated');
    expect(mutatedFired).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync-ui]'),
      error
    );
  });

  it('a valid pulled envelope restores normally without a separate UI-level validator', async () => {
    const envelope = {
      schema_version: 1,
      exported_at: '2024-01-15T10:00:00Z',
      daily_records: [{ date: '2024-01-15', effective_steps: 8000 }],
      settings: [],
    };
    driveSync = makeDriveSync({ pullResult: envelope });
    const dispatchSpy = vi.spyOn(doc, 'dispatchEvent');
    confirmFn = vi.fn().mockReturnValue(true);
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    await ui.render(container);

    const btn = container.querySelector('[data-action="restore-from-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(backup.restoreBackup).toHaveBeenCalledWith(envelope);
    expect(reporter.sync).toHaveBeenCalledWith('✅ Data restored from Drive successfully');
    const mutatedFired = dispatchSpy.mock.calls.some(c => c[0].type === 'data:records:mutated');
    expect(mutatedFired).toBe(true);
  });

  // ── DOM contract ─────────────────────────────────────────────────────────────

  it('builds and re-renders the panel without ever assigning innerHTML', async () => {
    const innerHTMLSetter = vi.spyOn(doc.defaultView.Element.prototype, 'innerHTML', 'set');

    // Re-mount under the spy — any innerHTML assignment in render would be caught
    await ui.render(container);

    expect(innerHTMLSetter).not.toHaveBeenCalled();
  });

  // ── AbortController cleanup ───────────────────────────────────────────────────

  it('re-mounting aborts previous listeners; no duplicate firings on second mount', async () => {
    // Second mount
    await ui.render(container);

    const btn = container.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    // buildBackup called exactly once (not twice from two listeners)
    expect(backup.buildBackup).toHaveBeenCalledTimes(1);
  });
});

// ── Task 27: auto-backup opt-out toggle ──────────────────────────────────────

describe('Task 27: auto-backup opt-out toggle', () => {
  let doc, container, driveSync, backup, reporter, confirmFn, prefs, ui;

  beforeEach(async () => {
    doc = buildDoc();
    container = doc.getElementById('cloud-controls');
    driveSync = makeDriveSync();
    backup = makeBackup();
    reporter = makeReporter();
    confirmFn = vi.fn().mockReturnValue(true);
    prefs = makeDriveBackupPrefs();
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, prefs);
    await ui.render(container);
  });

  it('renders a checkbox labelled "Automatically back up to Drive after each sync"', async () => {
    const cb = container.querySelector('[data-action="toggle-drive-backup"]');
    expect(cb).not.toBeNull();
    expect(cb.type).toBe('checkbox');
    expect(container.textContent).toContain(
      'Automatically back up to Drive after each sync'
    );
  });

  it('checkbox is checked when the persisted pref is enabled (default true)', async () => {
    const cb = container.querySelector('[data-action="toggle-drive-backup"]');
    expect(cb.checked).toBe(true);
    expect(prefs.getDriveBackupEnabled).toHaveBeenCalledTimes(1);
  });

  it('checkbox is unchecked when the persisted pref is disabled', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    prefs = makeDriveBackupPrefs({ enabled: false });
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn, prefs);
    await ui.render(freshContainer);

    const cb = freshContainer.querySelector('[data-action="toggle-drive-backup"]');
    expect(cb.checked).toBe(false);
  });

  it('toggling the checkbox off persists false via setDriveBackupEnabled', async () => {
    const cb = container.querySelector('[data-action="toggle-drive-backup"]');
    cb.click();
    await new Promise(r => setTimeout(r, 0));

    expect(prefs.setDriveBackupEnabled).toHaveBeenCalledWith(false);
  });

  it('toggling the checkbox on persists true via setDriveBackupEnabled', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    prefs = makeDriveBackupPrefs({ enabled: false });
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn, prefs);
    await ui.render(freshContainer);

    const cb = freshContainer.querySelector('[data-action="toggle-drive-backup"]');
    cb.click();
    await new Promise(r => setTimeout(r, 0));

    expect(prefs.setDriveBackupEnabled).toHaveBeenCalledWith(true);
  });

  it('manual "Back up to Drive" button still uploads when the toggle is off', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    prefs = makeDriveBackupPrefs({ enabled: false });
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn, prefs);
    await ui.render(freshContainer);

    const btn = freshContainer.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(backup.buildBackup).toHaveBeenCalledTimes(1);
    expect(driveSync.push).toHaveBeenCalledTimes(1);
    expect(reporter.sync).toHaveBeenCalled();
    const calls = reporter.sync.mock.calls.map(c => c[0]);
    expect(calls.some(m => m.startsWith('✅'))).toBe(true);
  });

  // ── Storage-protection gesture: toggling auto-backup ─────────────────────

  it('toggling the checkbox silently requests navigator.storage.persist()', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    const nav = { storage: { persist: vi.fn().mockResolvedValue(true), persisted: vi.fn().mockResolvedValue(true) } };
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn, prefs, nav);
    await ui.render(freshContainer);

    const cb = freshContainer.querySelector('[data-action="toggle-drive-backup"]');
    cb.click();
    await new Promise(r => setTimeout(r, 0));

    expect(nav.storage.persist).toHaveBeenCalledTimes(1);
  });

  it('toggling the checkbox refreshes the #db-status header badge via the reporter', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    const nav = { storage: { persist: vi.fn().mockResolvedValue(true), persisted: vi.fn().mockResolvedValue(true) } };
    reporter.db.mockClear();
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn, prefs, nav);
    await ui.render(freshContainer);

    const cb = freshContainer.querySelector('[data-action="toggle-drive-backup"]');
    cb.click();
    await new Promise(r => setTimeout(r, 0));

    expect(reporter.db).toHaveBeenCalled();
  });

  it('toggling the checkbox dispatches data:storage-health:refresh', async () => {
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, prefs);
    await ui.render(container);

    const dispatchSpy = vi.spyOn(doc, 'dispatchEvent');
    const cb = container.querySelector('[data-action="toggle-drive-backup"]');
    cb.click();
    await new Promise(r => setTimeout(r, 0));

    const refreshed = dispatchSpy.mock.calls.some((c) => c[0].type === 'data:storage-health:refresh');
    expect(refreshed).toBe(true);
  });

  it('a failed toggle write does NOT request persist or dispatch the refresh event', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    prefs = makeDriveBackupPrefs();
    prefs.setDriveBackupEnabled.mockRejectedValue(new Error('write failed'));
    const nav = { storage: { persist: vi.fn().mockResolvedValue(true), persisted: vi.fn().mockResolvedValue(true) } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn, prefs, nav);
    await ui.render(freshContainer);

    const dispatchSpy = vi.spyOn(freshDoc, 'dispatchEvent');
    const cb = freshContainer.querySelector('[data-action="toggle-drive-backup"]');
    cb.click();
    await new Promise(r => setTimeout(r, 0));

    expect(nav.storage.persist).not.toHaveBeenCalled();
    const refreshed = dispatchSpy.mock.calls.some((c) => c[0].type === 'data:storage-health:refresh');
    expect(refreshed).toBe(false);
  });

  it('a successful manual "Back up to Drive" dispatches data:storage-health:refresh', async () => {
    const freshDoc = buildDoc();
    const freshContainer = freshDoc.getElementById('cloud-controls');
    prefs = makeDriveBackupPrefs();
    ui = createDriveSyncUI(freshDoc, driveSync, backup, reporter, confirmFn, prefs);
    await ui.render(freshContainer);

    const dispatchSpy = vi.spyOn(freshDoc, 'dispatchEvent');
    const btn = freshContainer.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    const refreshed = dispatchSpy.mock.calls.some((c) => c[0].type === 'data:storage-health:refresh');
    expect(refreshed).toBe(true);
  });
});

// ─── ST-020: Google Drive connection + primary device ─────────────────────────

describe('ST-020: Drive panel — Google connection and primary device', () => {
  const APP = { id: 'dev-app', label: 'Android app', since: '2026-09-28T12:00:00.000Z' };
  const nav = { storage: { persist: vi.fn(), persisted: vi.fn() } };

  function makePrimary({ status = { primary: null, isThisDevice: false }, other = null } = {}) {
    return {
      status: vi.fn().mockResolvedValue(status),
      otherPrimary: vi.fn().mockResolvedValue(other),
      makeThisPrimary: vi.fn().mockResolvedValue(APP),
    };
  }

  function makeConnection(connected) {
    return { label: 'Connect Google Drive', isConnected: vi.fn(() => connected), connect: vi.fn() };
  }

  async function renderPanel({ primaryDevice = null, driveConnection = null, canMakePrimary = false, confirm = true, driveSync = makeDriveSync() } = {}) {
    const doc = buildDoc();
    const container = doc.getElementById('cloud-controls');
    const reporter = makeReporter();
    const confirmFn = vi.fn(() => confirm);
    const backup = makeBackup();
    const ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, makeDriveBackupPrefs(), nav, {
      primaryDevice,
      driveConnection,
      canMakePrimary,
    });
    await ui.render(container);
    return { doc, container, reporter, confirmFn, driveSync, backup };
  }

  const click = (container, action) => container.querySelector(`[data-action="${action}"]`).click();

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('without the new collaborators the panel is unchanged (web, legacy)', async () => {
    const { container } = await renderPanel();
    expect(container.querySelector('[data-action="connect-drive"]')).toBeNull();
    expect(container.querySelector('[data-action="make-primary"]')).toBeNull();
    expect(container.querySelector('.cloud-sync-primary')).toBeNull();
  });

  it('offers "Connect Google Drive" when a Drive connection is supplied but not connected', async () => {
    const driveConnection = makeConnection(false);
    const { container } = await renderPanel({ driveConnection });

    click(container, 'connect-drive');

    expect(container.querySelector('[data-action="connect-drive"]').textContent).toBe('Connect Google Drive');
    expect(driveConnection.connect).toHaveBeenCalledTimes(1);
  });

  it('shows the connected state instead of the button once connected', async () => {
    const { container } = await renderPanel({ driveConnection: makeConnection(true) });
    expect(container.querySelector('[data-action="connect-drive"]')).toBeNull();
    expect(container.textContent).toContain('Google Drive connected');
  });

  it.each([
    [{ primary: null, isThisDevice: false }, 'No primary device yet'],
    [{ primary: APP, isThisDevice: true }, '📱 This device is the primary device — it backs up to Drive automatically.'],
    [{ primary: APP, isThisDevice: false }, '📱 Primary device: Android app (since Sep 28, 2026) — this device does not back up automatically.'],
  ])('describes the primary device (%o)', async (status, text) => {
    const { container } = await renderPanel({ primaryDevice: makePrimary({ status }) });
    expect(container.querySelector('.cloud-sync-primary').textContent).toContain(text);
  });

  it('offers "Make this the primary device" only where allowed and not already primary', async () => {
    let { container } = await renderPanel({ primaryDevice: makePrimary(), canMakePrimary: false });
    expect(container.querySelector('[data-action="make-primary"]')).toBeNull();

    ({ container } = await renderPanel({ primaryDevice: makePrimary({ status: { primary: APP, isThisDevice: true } }), canMakePrimary: true }));
    expect(container.querySelector('[data-action="make-primary"]')).toBeNull();

    ({ container } = await renderPanel({ primaryDevice: makePrimary(), canMakePrimary: true }));
    expect(container.querySelector('[data-action="make-primary"]').textContent).toBe('Make this the primary device');
  });

  it('making this the primary asks first, records it, then uploads a backup that carries it', async () => {
    const primaryDevice = makePrimary();
    const { container, confirmFn, driveSync, backup, reporter } = await renderPanel({
      primaryDevice,
      driveConnection: makeConnection(true),
      canMakePrimary: true,
    });

    click(container, 'make-primary');

    await vi.waitFor(() => expect(reporter.sync).toHaveBeenCalledWith('✅ This device is now the primary device'));
    expect(confirmFn).toHaveBeenCalledWith(expect.stringContaining('Only this device will back up to Google Drive automatically'));
    expect(primaryDevice.makeThisPrimary).toHaveBeenCalledTimes(1);
    expect(primaryDevice.makeThisPrimary.mock.invocationCallOrder[0]).toBeLessThan(backup.buildBackup.mock.invocationCallOrder[0]);
    expect(driveSync.push).toHaveBeenCalledTimes(1);
  });

  it('making this the primary does nothing when the user cancels', async () => {
    const primaryDevice = makePrimary();
    const { container, driveSync } = await renderPanel({ primaryDevice, driveConnection: makeConnection(true), canMakePrimary: true, confirm: false });

    click(container, 'make-primary');
    await Promise.resolve();

    expect(primaryDevice.makeThisPrimary).not.toHaveBeenCalled();
    expect(driveSync.push).not.toHaveBeenCalled();
  });

  it('making this the primary needs Google Drive connected first', async () => {
    const primaryDevice = makePrimary();
    const { container, reporter } = await renderPanel({ primaryDevice, driveConnection: makeConnection(false), canMakePrimary: true });

    click(container, 'make-primary');

    await vi.waitFor(() => expect(reporter.sync).toHaveBeenCalledWith('ℹ️ Connect Google Drive first — the primary device is recorded in your Drive backup'));
    expect(primaryDevice.makeThisPrimary).not.toHaveBeenCalled();
  });

  it('a manual backup asks first when another device is primary', async () => {
    const primaryDevice = makePrimary({ other: APP });
    const { container, confirmFn, driveSync } = await renderPanel({ primaryDevice, confirm: false });

    click(container, 'backup-to-drive');
    await vi.waitFor(() => expect(confirmFn).toHaveBeenCalled());

    expect(confirmFn).toHaveBeenCalledWith('Android app is the primary device. Backing up from here replaces its Google Drive backup. Continue?');
    expect(driveSync.push).not.toHaveBeenCalled();
  });

  it('a manual backup proceeds without asking when this device is primary or none is', async () => {
    const { container, confirmFn, driveSync } = await renderPanel({ primaryDevice: makePrimary({ other: null }) });

    click(container, 'backup-to-drive');

    await vi.waitFor(() => expect(driveSync.push).toHaveBeenCalledTimes(1));
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it('a manual backup does not warn about an unknown primary when Drive cannot be asked — the upload reports its own error', async () => {
    const { container, confirmFn, driveSync } = await renderPanel({
      primaryDevice: makePrimary({ other: { id: null, label: 'another device', since: null } }),
    });

    click(container, 'backup-to-drive');

    await vi.waitFor(() => expect(driveSync.push).toHaveBeenCalledTimes(1));
    expect(confirmFn).not.toHaveBeenCalled();
  });
});
