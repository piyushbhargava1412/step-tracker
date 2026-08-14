/**
 * Cloud sync UI — sole DOM writer for Google Drive cloud controls.
 *
 * createDriveSyncUI(doc, driveSync, backup, reporter, confirmFn, validateEnvelope)
 *   render(container): builds "Back up to Drive" and "Restore from Drive" controls.
 *
 * PL-2 Option A: manual push/pull, last-write-wins with pre-overwrite confirmFn warning.
 *
 * Remote Drive content is treated as untrusted: the injected validateEnvelope
 * (default no-op) runs over the pulled envelope BEFORE restoreBackup so a
 * tampered payload is rejected with no Dexie write and no data:records:mutated
 * dispatch.
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
  validateEnvelope = () => {}
) {
  let controller = null;

  /**
   * (Re)build the cloud-sync panel content inside the given container element.
   * Idempotent: calling a second time aborts previous listeners and rebuilds DOM.
   *
   * @param {HTMLElement} container
   */
  function render(container) {
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

    // Build panel
    const panel = doc.createElement('div');
    panel.className = 'cloud-sync-panel';

    const heading = doc.createElement('h2');
    heading.textContent = '☁️ Google Drive Sync';
    panel.appendChild(heading);

    // Backup section
    const backupSection = doc.createElement('section');
    backupSection.className = 'cloud-sync-section';

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

    panel.appendChild(backupSection);

    // Restore section
    const restoreSection = doc.createElement('section');
    restoreSection.className = 'cloud-sync-section';

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
        }
      },
      { signal }
    );
  }

  /**
   * Handles the "Back up to Drive" action.
   * @param {HTMLButtonElement} btn
   */
  async function _handleBackupNow(btn) {
    btn.disabled = true;
    try {
      const envelope = await backup.buildBackup();
      await driveSync.push(envelope);
      reporter('✅ Backup uploaded to Drive successfully');
    } catch (err) {
      console.error('[drive-sync-ui]', err);
      reporter('❌ Drive backup failed: ' + (err.message ?? err));
    } finally {
      btn.disabled = false;
    }
  }

  /**
   * Handles the "Restore from Drive" action.
   * Warns via confirmFn before overwriting local data (LWW warning per PL-2 Option A).
   * Validates the pulled envelope (injected validateEnvelope) before restoreBackup
   * so a tampered Drive payload never reaches a Dexie write.
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
        reporter('ℹ️ No backup found on Google Drive');
        return;
      }
      validateEnvelope(envelope);
      await backup.restoreBackup(envelope);
      doc.dispatchEvent(new doc.defaultView.CustomEvent('data:records:mutated'));
      reporter('✅ Data restored from Drive successfully');
    } catch (err) {
      console.error('[drive-sync-ui]', err);
      reporter('❌ Restore from Drive failed: ' + (err.message ?? err));
    } finally {
      btn.disabled = false;
    }
  }

  return { render };
}
