/**
 * Local backup panel UI — sole DOM writer for the "📄 Local JSON Files" column.
 * createBackupUI(doc, backup, reporter, confirmFn, settings) factory:
 *  - render(container): builds the Export Backup and Restore from Local File cards
 *  - Export: calls backup.buildBackup(), triggers <a download> via blob/anchor idiom,
 *    then persists the export timestamp via settings.setLastLocalExport
 *  - Restore: reads File as text, JSON.parse, confirms via confirmFn (guards against
 *    an accidental IndexedDB overwrite), calls backup.restoreBackup(), dispatches
 *    data:records:mutated
 *
 * `settings` is optional — when omitted, the "last export" metadata line always
 * reads "Never" and nothing is persisted (fails open, never blocks export/restore).
 *
 * No innerHTML — all DOM via createElement/textContent.
 * AbortController cleanup on re-render so listeners never accumulate.
 */

import { BACKUP_FILENAME_PREFIX } from './backup.js';
import { formatLastExportLine } from './backup-format.js';

export function createBackupUI(doc, backup, reporter, confirmFn, settings = null) {
  let controller = null;
  let exportMetaEl = null;

  /**
   * (Re)build the local-backup column content inside the given container element.
   * Idempotent: calling a second time aborts previous listeners and rebuilds DOM.
   * Async because the export-metadata line reflects the persisted timestamp; a
   * read failure fails open to "Never" so the panel always renders.
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

    let lastExportAt = null;
    if (settings?.getLastLocalExport) {
      try {
        lastExportAt = await settings.getLastLocalExport();
      } catch (err) {
        console.error('[backup-ui]', err);
      }
    }

    // Build panel
    const panel = doc.createElement('div');
    panel.className = 'backup-panel data-panel';

    const heading = doc.createElement('h2');
    heading.textContent = '📄 Local JSON Files';
    panel.appendChild(heading);

    // Export section
    const exportSection = doc.createElement('section');
    exportSection.className = 'backup-section data-panel__section';

    const exportHeading = doc.createElement('h3');
    exportHeading.textContent = 'Export Backup';
    exportSection.appendChild(exportHeading);

    const exportDesc = doc.createElement('p');
    exportDesc.textContent = 'Download a full backup of your step data and settings as a JSON file.';
    exportSection.appendChild(exportDesc);

    const exportBtn = doc.createElement('button');
    exportBtn.className = 'btn btn-primary';
    exportBtn.setAttribute('data-action', 'export-backup');
    exportBtn.textContent = '⬇️ Export JSON Backup';
    exportSection.appendChild(exportBtn);

    exportMetaEl = doc.createElement('p');
    exportMetaEl.className = 'backup-meta';
    exportMetaEl.textContent = formatLastExportLine(lastExportAt);
    exportSection.appendChild(exportMetaEl);

    panel.appendChild(exportSection);

    // Restore section
    const restoreSection = doc.createElement('section');
    restoreSection.className = 'backup-section data-panel__section';

    const restoreHeading = doc.createElement('h3');
    restoreHeading.textContent = 'Restore from Local File';
    restoreSection.appendChild(restoreHeading);

    const restoreDesc = doc.createElement('p');
    restoreDesc.textContent = 'Select a previously exported backup JSON file to restore your data.';
    restoreSection.appendChild(restoreDesc);

    const restoreActions = doc.createElement('div');
    restoreActions.className = 'panel-actions-row';

    const warningBadge = doc.createElement('span');
    warningBadge.className = 'warning-badge';
    warningBadge.textContent = '⚠️ Overwrites local database';
    restoreActions.appendChild(warningBadge);

    const importLabel = doc.createElement('label');
    importLabel.className = 'btn btn-secondary backup-file-label';
    importLabel.textContent = '📁 Choose Backup File';

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
    restoreActions.appendChild(importLabel);
    restoreSection.appendChild(restoreActions);
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
      const now = new Date().toISOString();
      const date = now.slice(0, 10); // YYYY-MM-DD
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
      reporter.db('✅ Backup exported successfully');
      await _recordExport(now);
    } catch (err) {
      console.error('[backup-ui]', err);
      reporter.db(
        err instanceof RangeError
          ? '❌ Export failed: backup too large'
          : '❌ Export failed: ' + (err.message ?? err)
      );
    } finally {
      btn.disabled = false;
    }
  }

  /**
   * Persist the export timestamp and refresh the metadata line in place
   * (no full re-render needed). A persistence failure is logged but never
   * surfaces to the user — the export itself already succeeded.
   * @param {string} at - ISO 8601 timestamp
   */
  async function _recordExport(at) {
    if (!settings?.setLastLocalExport) return;
    try {
      await settings.setLastLocalExport(at);
      if (exportMetaEl) exportMetaEl.textContent = formatLastExportLine(at);
    } catch (err) {
      console.error('[backup-ui]', err);
    }
  }

  /**
   * Handles the restore file input change. Confirms via confirmFn before any
   * Dexie write so a local restore can never silently overwrite the store.
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
        reporter.db('❌ Restore failed: file is not valid JSON');
        return;
      }
      const confirmed = confirmFn(
        'This will overwrite your local step data with the selected backup file. Continue?'
      );
      if (!confirmed) return;
      await backup.restoreBackup(parsed);
      doc.dispatchEvent(new doc.defaultView.CustomEvent('data:records:mutated'));
      reporter.db('✅ Backup restored successfully');
    } catch (err) {
      console.error('[backup-ui]', err);
      reporter.db('❌ Restore failed: ' + (err.message ?? err));
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
