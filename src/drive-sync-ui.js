/**
 * Cloud sync UI — sole DOM writer for Google Drive cloud controls.
 *
 * createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, driveBackupPrefs)
 *   render(container): builds "Back up to Drive" and "Restore from Drive" controls
 *     plus the Task-27 "Automatically back up to Drive after each sync" toggle.
 *
 * PL-2 Option A: manual push/pull, last-write-wins with pre-overwrite confirmFn warning.
 *
 * Remote Drive content is treated as untrusted: the injected driveSync.pull()
 * gateway runs envelope validation before returning, so a tampered payload is
 * rejected with no Dexie write and no data:records:mutated dispatch.
 *
 * Task 27 (opt-out consent): the checkbox is bound to the persisted
 * `drive_backup_enabled` setting via the injected driveBackupPrefs collaborator
 * ({ getDriveBackupEnabled, setDriveBackupEnabled }). It only gates the
 * *automatic* post-sync upload — the manual "Back up to Drive" button keeps
 * working regardless of the toggle. The collaborator may be null (defaults to
 * enabled) so legacy call sites render an enabled checkbox.
 *
 * No innerHTML — all DOM via createElement/textContent.
 * AbortController cleanup on re-render so listeners never accumulate.
 */

export function createDriveSyncUI(
  doc,
  driveSync,
  backup,
  reporter,
  confirmFn,
  driveBackupPrefs = null
) {
  let controller = null;

  /**
   * (Re)build the cloud-sync panel content inside the given container element.
   * Idempotent: calling a second time aborts previous listeners and rebuilds DOM.
   * Async because the auto-backup toggle reflects the persisted setting; a
   * read failure fails open to enabled so the panel always renders.
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

    // Build panel
    const panel = doc.createElement('div');
    panel.className = 'cloud-sync-panel data-panel';

    const heading = doc.createElement('h2');
    heading.textContent = '☁️ Google Drive Sync';
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

    const backupBtn = doc.createElement('button');
    backupBtn.className = 'btn btn-primary';
    backupBtn.setAttribute('data-action', 'backup-to-drive');
    backupBtn.textContent = '⬆️ Back up to Drive';
    backupSection.appendChild(backupBtn);

    // Task 27: opt-out toggle for the background auto-upload. Gated by the
    // persisted drive_backup_enabled setting; the manual button above is NOT
    // affected by this checkbox.
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

    backupSection.appendChild(toggleWrap);

    panel.appendChild(backupSection);

    // Restore section
    const restoreSection = doc.createElement('section');
    restoreSection.className = 'cloud-sync-section data-panel__section';

    const restoreHeading = doc.createElement('h3');
    restoreHeading.textContent = 'Restore from Drive';
    restoreSection.appendChild(restoreHeading);

    const restoreDesc = doc.createElement('p');
    restoreDesc.textContent =
      'Download and restore your step data from your Google Drive backup. ' +
      'This will overwrite your current local data.';
    restoreSection.appendChild(restoreDesc);

    const restoreBtn = doc.createElement('button');
    restoreBtn.className = 'btn btn-secondary';
    restoreBtn.setAttribute('data-action', 'restore-from-drive');
    restoreBtn.textContent = '⬇️ Restore from Drive';
    restoreSection.appendChild(restoreBtn);

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
