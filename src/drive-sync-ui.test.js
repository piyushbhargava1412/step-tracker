/**
 * Tests for src/drive-sync-ui.js
 * Task 6: Cloud sync UI (manual backup-now / restore-from-cloud, LWW warning)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { createDriveSyncUI } from './drive-sync-ui.js';
import { _validateEnvelope } from './backup.js';

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
  return vi.fn();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createDriveSyncUI', () => {
  let doc, container, driveSync, backup, reporter, confirmFn, ui;

  beforeEach(() => {
    doc = buildDoc();
    container = doc.getElementById('cloud-controls');
    driveSync = makeDriveSync();
    backup = makeBackup();
    reporter = makeReporter();
    confirmFn = vi.fn().mockReturnValue(true);
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    ui.render(container);
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

  it('successful push calls reporter with ✅-prefixed message', async () => {
    const btn = container.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(reporter).toHaveBeenCalled();
    const msg = reporter.mock.calls[reporter.mock.calls.length - 1][0];
    expect(msg).toMatch(/^✅/);
  });

  it('push failure calls reporter with ❌-prefixed message and does NOT dispatch data:records:mutated', async () => {
    driveSync = makeDriveSync({ pushResult: new Error('network error') });
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    ui.render(container);

    const dispatchSpy = vi.spyOn(doc, 'dispatchEvent');
    const btn = container.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    const calls = reporter.mock.calls.map(c => c[0]);
    expect(calls.some(m => m.startsWith('❌'))).toBe(true);
    const mutatedFired = dispatchSpy.mock.calls.some(c => c[0].type === 'data:records:mutated');
    expect(mutatedFired).toBe(false);
  });

  // ── Restore-from-cloud path ──────────────────────────────────────────────────

  it('restore click invokes confirmFn before any restore logic', async () => {
    const envelope = { schema_version: 1, exported_at: '2024-01-15T10:00:00Z', daily_records: [], settings: [] };
    driveSync = makeDriveSync({ pullResult: envelope });
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    ui.render(container);

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
    ui.render(container);

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
    ui.render(container);

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
    ui.render(container);

    const btn = container.querySelector('[data-action="restore-from-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(backup.restoreBackup).not.toHaveBeenCalled();
    expect(reporter).toHaveBeenCalled();
  });

  it('restoreBackup throws: reporter called with ❌ prefix; event NOT dispatched', async () => {
    const envelope = { schema_version: 1, exported_at: '2024-01-15T10:00:00Z', daily_records: [], settings: [] };
    driveSync = makeDriveSync({ pullResult: envelope });
    backup = makeBackup({ restoreResult: new Error('restore failed') });
    confirmFn = vi.fn().mockReturnValue(true);
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn);
    ui.render(container);

    const dispatchSpy = vi.spyOn(doc, 'dispatchEvent');
    const btn = container.querySelector('[data-action="restore-from-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    const calls = reporter.mock.calls.map(c => c[0]);
    expect(calls.some(m => m.startsWith('❌'))).toBe(true);
    const mutatedFired = dispatchSpy.mock.calls.some(c => c[0].type === 'data:records:mutated');
    expect(mutatedFired).toBe(false);
  });

  // ── Validate pulled envelope before restore (Task 11) ────────────────────────

  it('rejects a tampered __proto__-polluting payload before any restore write (no restoreBackup, no dispatch, reporter ❌)', async () => {
    const tampered = JSON.parse(
      '{"schema_version":1,"exported_at":"2024-01-15T10:00:00Z",' +
        '"daily_records":[{"date":"2024-01-15","__proto__":{"polluted":true}}],"settings":[]}'
    );
    driveSync = makeDriveSync({ pullResult: tampered });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispatchSpy = vi.spyOn(doc, 'dispatchEvent');
    confirmFn = vi.fn().mockReturnValue(true);
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, _validateEnvelope);
    ui.render(container);

    const btn = container.querySelector('[data-action="restore-from-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(backup.restoreBackup).not.toHaveBeenCalled();
    const calls = reporter.mock.calls.map(c => c[0]);
    expect(calls.some(m => m.startsWith('❌'))).toBe(true);
    const mutatedFired = dispatchSpy.mock.calls.some(c => c[0].type === 'data:records:mutated');
    expect(mutatedFired).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[drive-sync-ui]'),
      expect.anything()
    );
  });

  it('a valid pulled envelope passes the injected validateEnvelope and restores normally', async () => {
    const envelope = {
      schema_version: 1,
      exported_at: '2024-01-15T10:00:00Z',
      daily_records: [{ date: '2024-01-15', effective_steps: 8000 }],
      settings: [],
    };
    driveSync = makeDriveSync({ pullResult: envelope });
    const validateSpy = vi.fn();
    const dispatchSpy = vi.spyOn(doc, 'dispatchEvent');
    confirmFn = vi.fn().mockReturnValue(true);
    ui = createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, validateSpy);
    ui.render(container);

    const btn = container.querySelector('[data-action="restore-from-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(validateSpy).toHaveBeenCalledWith(envelope);
    expect(backup.restoreBackup).toHaveBeenCalledWith(envelope);
    const mutatedFired = dispatchSpy.mock.calls.some(c => c[0].type === 'data:records:mutated');
    expect(mutatedFired).toBe(true);
  });

  // ── DOM contract ─────────────────────────────────────────────────────────────

  it('module source has zero innerHTML assignments', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, 'drive-sync-ui.js'),
      'utf8'
    );
    expect(src).not.toMatch(/\.innerHTML\s*=/);
  });

  // ── AbortController cleanup ───────────────────────────────────────────────────

  it('re-mounting aborts previous listeners; no duplicate firings on second mount', async () => {
    // Second mount
    ui.render(container);

    const btn = container.querySelector('[data-action="backup-to-drive"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    // buildBackup called exactly once (not twice from two listeners)
    expect(backup.buildBackup).toHaveBeenCalledTimes(1);
  });
});
