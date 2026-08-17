import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { showSyncProgressModal, hideSyncProgressModal } from './sync-progress-modal.js';

describe('sync-progress-modal', () => {
  let doc;

  beforeEach(() => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    doc = dom.window.document;
  });

  it('creates #sync-progress-modal lazily on first show, visible and unhidden', () => {
    expect(doc.getElementById('sync-progress-modal')).toBeNull();

    showSyncProgressModal(doc, 'fetching history…');

    const modal = doc.getElementById('sync-progress-modal');
    expect(modal).not.toBeNull();
    expect(modal.hasAttribute('hidden')).toBe(false);
  });

  it('renders the message text into the modal body', () => {
    showSyncProgressModal(doc, '⏳ Full history sync — fetching all Google Fit data since 2013.');

    const message = doc.querySelector('[data-role="message"]');
    expect(message.textContent).toBe(
      '⏳ Full history sync — fetching all Google Fit data since 2013.'
    );
  });

  it('re-showing with a new message overwrites the text, not appends', () => {
    showSyncProgressModal(doc, 'first');
    showSyncProgressModal(doc, 'second');

    const message = doc.querySelector('[data-role="message"]');
    expect(message.textContent).toBe('second');
  });

  it('reuses the existing modal element on a second show call (no duplicate nodes)', () => {
    showSyncProgressModal(doc, 'first');
    showSyncProgressModal(doc, 'second');

    expect(doc.querySelectorAll('#sync-progress-modal').length).toBe(1);
  });

  it('hideSyncProgressModal sets the hidden attribute', () => {
    showSyncProgressModal(doc, 'in progress');
    hideSyncProgressModal(doc);

    const modal = doc.getElementById('sync-progress-modal');
    expect(modal.hasAttribute('hidden')).toBe(true);
  });

  it('hideSyncProgressModal on a modal that was never shown does not throw', () => {
    expect(() => hideSyncProgressModal(doc)).not.toThrow();
  });

  it('clicking the close button hides the modal without throwing', () => {
    showSyncProgressModal(doc, 'in progress');
    const closeBtn = doc.querySelector('.settings-close-btn');

    expect(() => closeBtn.click()).not.toThrow();
    expect(doc.getElementById('sync-progress-modal').hasAttribute('hidden')).toBe(true);
  });

  it('clicking the backdrop (the overlay itself) hides the modal', () => {
    showSyncProgressModal(doc, 'in progress');
    const modal = doc.getElementById('sync-progress-modal');

    modal.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }));

    expect(modal.hasAttribute('hidden')).toBe(true);
  });

  it('clicking inside the dialog (not the backdrop) does not hide the modal', () => {
    showSyncProgressModal(doc, 'in progress');
    const dialog = doc.querySelector('.sync-modal-dialog');

    dialog.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }));

    expect(doc.getElementById('sync-progress-modal').hasAttribute('hidden')).toBe(false);
  });

  it('the modal carries dialog accessibility attributes', () => {
    showSyncProgressModal(doc, 'in progress');
    const modal = doc.getElementById('sync-progress-modal');

    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.getAttribute('aria-labelledby')).toBe('sync-progress-title');
  });
});
