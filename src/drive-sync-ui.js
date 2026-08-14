/**
 * Cloud sync UI — sole DOM writer for the "☁️ Google Drive Cloud Sync" column.
 *
 * createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, driveBackupPrefs)
 *   render(container): builds "Back Up to Drive" and "Restore from Drive" cards.
 *     The Task-27 "Automatically back up to Drive after each sync" toggle sits
 *     beside the "Back Up to Drive" button, inside the same card.
 *
 * PL-2 Option A: manual push/pull, last-write-wins with pre-overwrite confirmFn warning.
 *
 * Remote Drive content is treated as untrusted: the injected driveSync.pull()
 * gateway runs envelope validation before returning, so a tampered payload is
 * rejected with no Dexie write and no data:records:mutated dispatch.
 *
 * `driveBackupPrefs` doubles as the metadata store: it gates the auto-upload
 * toggle (getDriveBackupEnabled/setDriveBackupEnabled) AND records the last
 * successful push (getLastDriveSync/setLastDriveSync) for the "Last cloud
 * sync" metadata line. It only gates the *automatic* post-sync upload — the
 * manual "Back Up to Drive" button keeps working regardless of the toggle.
 * The collaborator may be null (defaults to enabled, "No cloud backup found")
 * so legacy call sites still render.
 *
 * No innerHTML — all DOM via createElement/textContent.
 * AbortController cleanup on re-render so listeners never accumulate.
 */

import { formatLastSyncLine } from './backup-format.js';

export function createDriveSyncUI(
  doc,
  driveSync,
  backup,
  reporter,
  confirmFn,
  driveBackupPrefs = null
) {
  let controller = null;
  let syncMetaEl = null;

  /**
   * (Re)build the cloud-sync column content inside the given container element.
   * Idempotent: calling a second time aborts previous listeners and rebuilds DOM.
   * Async because the auto-backup toggle and last-sync metadata reflect
   * persisted state; a read failure fails open (enabled toggle / no metadata)
   * so the panel always renders.
   *
   * @param {HTMLElement} container
   */
  async function render(container) {
    // Abort previous listeners
    if (controller) {
      controller.abort();
    }
    controller = new (doc.defaultView?.AbortController ?? AbortController)();
    const { signal } = controller;

    // Clear existing content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Read the persisted auto-upload preference (fail-open to enabled).
    let autoBackupEnabled = true;
    if (driveBackupPrefs?.getDriveBackupEnabled) {
      try {
        autoBackupEnabled = (await driveBackupPrefs.getDriveBackupEnabled()) !== false;
      } catch (err) {
        console.error('[drive-sync-ui]', err);
      }
    }

    // Read the last-successful-sync metadata (fail-open to null).
    let lastSync = null;
    if (driveBackupPrefs?.getLastDriveSync) {
      try {
        lastSync = await driveBackupPrefs.getLastDriveSync();
      } catch (err) {
        console.error('[drive-sync-ui]', err);
      }
    }

    // Build panel
    const panel = doc.createElement('div');
    panel.className = 'cloud-sync-panel data-panel';

    const heading = doc.createElement('h2');
    heading.textContent = '☁️ Google Drive Cloud Sync';
    panel.appendChild(heading);

    // Backup section
    const backupSection = doc.createElement('section');
    backupSection.className = 'cloud-sync-section data-panel__section';

    const backupHeading = doc.createElement('h3');
    backupHeading.textContent = 'Back Up to Drive';
    backupSection.appendChild(backupHeading);

    const backupDesc = doc.createElement('p');
    backupDesc.textContent = 'Upload your current step data and settings to Google Drive.';
    backupSection.appendChild(backupDesc);

    // Task 27: the auto-backup opt-out toggle sits beside the manual button
    // (same row). It only gates the *automatic* post-sync upload — the
    // button itself keeps working regardless of the toggle.
    const backupActions = doc.createElement('div');
    backupActions.className = 'panel-actions-row';

    const backupBtn = doc.createElement('button');
    backupBtn.className = 'btn btn-primary';
    backupBtn.setAttribute('data-action', 'backup-to-drive');
    backupBtn.textContent = '☁️ Back Up to Drive';
    backupActions.appendChild(backupBtn);

    const toggleWrap = doc.createElement('label');
    toggleWrap.className = 'cloud-sync-toggle';

    const autoBackupToggle = doc.createElement('input');
    autoBackupToggle.type = 'checkbox';
    autoBackupToggle.id = 'drive-auto-backup-toggle';
    autoBackupToggle.setAttribute('data-action', 'toggle-drive-backup');
    autoBackupToggle.checked = autoBackupEnabled;
    toggleWrap.appendChild(autoBackupToggle);

    const toggleText = doc.createElement('span');
    toggleText.textContent = 'Automatically back up to Drive after each sync';
    toggleWrap.appendChild(toggleText);

    backupActions.appendChild(toggleWrap);
    backupSection.appendChild(backupActions);

    syncMetaEl = doc.createElement('p');
    syncMetaEl.className = 'cloud-sync-meta';
    syncMetaEl.textContent = formatLastSyncLine(lastSync);
    backupSection.appendChild(syncMetaEl);

    panel.appendChild(backupSection);

    // Restore section
    const restoreSection = doc.createElement('section');
    restoreSection.className = 'cloud-sync-section data-panel__section';

    const restoreHeading = doc.createElement('h3');
    restoreHeading.textContent = 'Restore from Drive';
    restoreSection.appendChild(restoreHeading);

    const restoreDesc = doc.createElement('p');
    restoreDesc.textContent =
      'Download and restore your step data from your Google Drive backup.';
    restoreSection.appendChild(restoreDesc);

    const restoreActions = doc.createElement('div');
    restoreActions.className = 'panel-actions-row';

    const warningBadge = doc.createElement('span');
    warningBadge.className = 'warning-badge';
    warningBadge.textContent = '⚠️ Overwrites local database';
    restoreActions.appendChild(warningBadge);

    const restoreBtn = doc.createElement('button');
    restoreBtn.className = 'btn btn-secondary';
    restoreBtn.setAttribute('data-action', 'restore-from-drive');
    restoreBtn.textContent = '🔄 Restore from Drive';
    restoreActions.appendChild(restoreBtn);

    restoreSection.appendChild(restoreActions);
    panel.appendChild(restoreSection);

    container.appendChild(panel);

    // Delegated click listener
    container.addEventListener(
      'click',
      async (e) => {
        const action = e.target.closest('[data-action]')?.getAttribute('data-action');
        if (action === 'backup-to-drive') {
          await _handleBackupNow(backupBtn);
        } else if (action === 'restore-from-drive') {
          await _handleRestoreFromCloud(restoreBtn);
        } else if (action === 'toggle-drive-backup') {
          await _handleToggleBackup(e.target);
        }
      },
      { signal }
    );
  }

  /**
   * Persist the Task-27 auto-backup toggle when the checkbox changes.
   * The click event has already toggled the input's checked state, so the new
   * value is read straight off the element. A failed write is logged and the
   * checkbox is reverted so the UI never lies about the persisted state.
   * @param {HTMLInputElement} checkbox
   */
  async function _handleToggleBackup(checkbox) {
    if (!driveBackupPrefs?.setDriveBackupEnabled) return;
    const next = checkbox.checked;
    try {
      await driveBackupPrefs.setDriveBackupEnabled(next);
    } catch (err) {
      console.error('[drive-sync-ui]', err);
      checkbox.checked = !next;
    }
  }

  /**
   * Handles the "Back up to Drive" action.
   * Only reports ✅ when an actual upload occurred. A push that was skipped
   * (no access token → DRIVE_PUSH_SKIPPED sentinel) surfaces an informational
   * ℹ️ notice consistent with the no-token reporter message — never a ✅.
   * @param {HTMLButtonElement} btn
   */
  async function _handleBackupNow(btn) {
    btn.disabled = true;
    try {
      const envelope = await backup.buildBackup();
      const result = await driveSync.push(envelope);
      if (result?.skipped === true) {
        reporter.sync('ℹ️ Google Account not connected — Drive sync unavailable');
        return;
      }
      reporter.sync('✅ Backup uploaded to Drive successfully');
      await _recordSync(envelope);
    } catch (err) {
      console.error('[drive-sync-ui]', err);
      reporter.sync(
        err instanceof RangeError
          ? '❌ Drive backup failed: backup too large'
          : '❌ Drive backup failed: ' + (err.message ?? err)
      );
    } finally {
      btn.disabled = false;
    }
  }

  /**
   * Persist the last-sync metadata (timestamp + serialised byte size) and
   * refresh the metadata line in place (no full re-render needed). A
   * persistence failure is logged but never surfaces to the user — the
   * upload itself already succeeded.
   * @param {object} envelope - the just-uploaded backup envelope
   */
  async function _recordSync(envelope) {
    if (!driveBackupPrefs?.setLastDriveSync) return;
    try {
      const entry = { at: new Date().toISOString(), bytes: JSON.stringify(envelope).length };
      await driveBackupPrefs.setLastDriveSync(entry);
      if (syncMetaEl) syncMetaEl.textContent = formatLastSyncLine(entry);
    } catch (err) {
      console.error('[drive-sync-ui]', err);
    }
  }

  /**
   * Handles the "Restore from Drive" action.
   * Warns via confirmFn before overwriting local data (LWW warning per PL-2 Option A).
   * driveSync.pull() already validates the envelope; restoreBackup also re-validates
   * defensively so a tampered payload never reaches Dexie.
   * @param {HTMLButtonElement} btn
   */
  async function _handleRestoreFromCloud(btn) {
    const confirmed = confirmFn(
      'This will overwrite your local step data with the backup from Google Drive. Continue?'
    );
    if (!confirmed) return;

    btn.disabled = true;
    try {
      const envelope = await driveSync.pull();
      if (envelope == null) {
        reporter.sync('ℹ️ No backup found on Google Drive');
        return;
      }
      await backup.restoreBackup(envelope);
      doc.dispatchEvent(new doc.defaultView.CustomEvent('data:records:mutated'));
      reporter.sync('✅ Data restored from Drive successfully');
    } catch (err) {
      console.error('[drive-sync-ui]', err);
      reporter.sync('❌ Restore from Drive failed: ' + (err.message ?? err));
    } finally {
      btn.disabled = false;
    }
  }

  return { render };
}
