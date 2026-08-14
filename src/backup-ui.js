/**
 * Backup panel UI — sole DOM writer.
 * createBackupUI(doc, backup, reporter) factory:
 *  - render(container): builds the backup panel with export button + restore file input
 *  - Export: calls backup.buildBackup(), triggers <a download> via blob/anchor idiom
 *  - Restore: reads File as text, JSON.parse, calls backup.restoreBackup(), dispatches data:records:mutated
 *
 * No innerHTML — all DOM via createElement/textContent.
 * AbortController cleanup on re-render so listeners never accumulate.
 */

import { BACKUP_FILENAME_PREFIX } from './backup.js';

export function createBackupUI(doc, backup, reporter) {
  let controller = null;

  /**
   * (Re)build the backup panel content inside the given container element.
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
    panel.className = 'backup-panel';

    const heading = doc.createElement('h2');
    heading.textContent = '💾 Backup & Restore';
    panel.appendChild(heading);

    // Export section
    const exportSection = doc.createElement('section');
    exportSection.className = 'backup-section';

    const exportHeading = doc.createElement('h3');
    exportHeading.textContent = 'Export Backup';
    exportSection.appendChild(exportHeading);

    const exportDesc = doc.createElement('p');
    exportDesc.textContent = 'Download a full backup of your step data and settings as a JSON file.';
    exportSection.appendChild(exportDesc);

    const exportBtn = doc.createElement('button');
    exportBtn.className = 'btn btn-primary';
    exportBtn.setAttribute('data-action', 'export-backup');
    exportBtn.textContent = '⬇️ Export Backup';
    exportSection.appendChild(exportBtn);

    panel.appendChild(exportSection);

    // Restore section
    const restoreSection = doc.createElement('section');
    restoreSection.className = 'backup-section';

    const restoreHeading = doc.createElement('h3');
    restoreHeading.textContent = 'Restore from Backup';
    restoreSection.appendChild(restoreHeading);

    const restoreDesc = doc.createElement('p');
    restoreDesc.textContent = 'Select a previously exported backup JSON file to restore your data.';
    restoreSection.appendChild(restoreDesc);

    const importLabel = doc.createElement('label');
    importLabel.className = 'btn btn-secondary backup-file-label';
    importLabel.textContent = '📂 Choose Backup File';

    const importInput = doc.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.json,application/json';
    importInput.setAttribute('data-action', 'import-backup');
    importInput.style.position = 'absolute';
    importInput.style.opacity = '0';
    importInput.style.pointerEvents = 'none';
    importInput.style.width = '1px';
    importInput.style.height = '1px';

    importLabel.appendChild(importInput);
    restoreSection.appendChild(importLabel);
    panel.appendChild(restoreSection);

    container.appendChild(panel);

    // Delegated click listener on container
    container.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-action]')?.getAttribute('data-action');
      if (action === 'export-backup') {
        await _handleExport(exportBtn);
      }
    }, { signal });

    // File input change listener
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      await _handleRestore(file);
      // Reset input so same file can be selected again
      e.target.value = '';
    }, { signal });
  }

  /**
   * Handles the export backup action.
   * @param {HTMLButtonElement} btn
   */
  async function _handleExport(btn) {
    btn.disabled = true;
    try {
      const envelope = await backup.buildBackup();
      const text = JSON.stringify(envelope, null, 2);
      const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const filename = `${BACKUP_FILENAME_PREFIX}${date}.json`;
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      try {
        const a = doc.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      reporter('✅ Backup exported successfully');
    } catch (err) {
      console.error('[backup-ui]', err);
      reporter('❌ Export failed: ' + (err.message ?? err));
    } finally {
      btn.disabled = false;
    }
  }

  /**
   * Handles the restore file input change.
   * @param {File} file
   */
  async function _handleRestore(file) {
    try {
      const text = await _readFileAsText(file);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        console.error('[backup-ui]', parseErr);
        reporter('❌ Restore failed: file is not valid JSON');
        return;
      }
      await backup.restoreBackup(parsed);
      doc.dispatchEvent(new doc.defaultView.CustomEvent('data:records:mutated'));
      reporter('✅ Backup restored successfully');
    } catch (err) {
      console.error('[backup-ui]', err);
      reporter('❌ Restore failed: ' + (err.message ?? err));
    }
  }

  /**
   * Reads a File as text using FileReader, returns a Promise<string>.
   * @param {File} file
   * @returns {Promise<string>}
   */
  function _readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new (doc.defaultView?.FileReader ?? FileReader)();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  return { render };
}
