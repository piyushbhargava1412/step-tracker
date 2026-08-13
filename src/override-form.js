/**
 * override-form.js — shared manual-override form and proof lightbox.
 *
 * Extracted from calendar-ui.js (ST-007a refactor) so the override workflow is
 * reusable: the calendar day-drawer and the Search Lab results grid both mount
 * the same form. Single responsibility: build and drive the override form DOM.
 *
 * Factory: createOverrideForm(doc, records, processImage, reporter, options)
 *   → { mount(container, { date, record }, { signal }) }
 *
 * The form carries no knowledge of its host — the caller decides where it is
 * mounted and which AbortSignal governs its listeners. All content is built via
 * createElement/textContent only; no innerHTML (repo security guard for the
 * user-authored proof-image surface).
 */

/**
 * Shared full-size proof-image lightbox.
 *
 * Factory: createProofLightbox(doc) → { open(src, panel), close() }
 * Appends a `.proof-lightbox` overlay to the given panel (defaults to body) and
 * tracks the open element so a re-open or close always leaves exactly one
 * instance in the DOM.
 *
 * @param {Document} doc
 * @returns {{ open: Function, close: Function }}
 */
export function createProofLightbox(doc) {
  let lightboxEl = null;

  /**
   * @param {string} src — proof image data URL
   * @param {HTMLElement} [panel] — element to append the overlay to
   */
  function open(src, panel) {
    close();

    const panelEl = panel || doc.body;
    const overlay = doc.createElement('div');
    overlay.className = 'proof-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Full-size proof image');

    const frame = doc.createElement('div');
    frame.className = 'proof-lightbox__frame';

    const img = doc.createElement('img');
    img.className = 'proof-lightbox__img';
    img.src = src;
    img.alt = 'Proof image';

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'proof-lightbox__close';
    closeBtn.textContent = '\u00D7';
    closeBtn.setAttribute('aria-label', 'Close proof image');

    frame.appendChild(img);
    frame.appendChild(closeBtn);
    overlay.appendChild(frame);
    panelEl.appendChild(overlay);
    lightboxEl = overlay;

    closeBtn.addEventListener('click', close, { once: true });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    }, { once: true });
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    }, { once: true });

    closeBtn.focus();
  }

  function close() {
    if (lightboxEl) {
      lightboxEl.remove();
      lightboxEl = null;
    }
  }

  return { open, close };
}

/**
 * Create the shared override form.
 *
 * @param {Document} doc
 * @param {{ overrideRecord: Function, revertRecord: Function }} records
 * @param {Function} processImage  — injected image processor (async, → base64)
 * @param {{ db: Function }} reporter
 * @param {object} [options]
 * @param {Function} [options.onViewProof]  — called with a proof src when the
 *   thumbnail is clicked so the host can open its own lightbox.
 * @param {string} [options.consolePrefix]  — console.error prefix (default
 *   '[override-form]').
 * @returns {{ mount: Function }}
 */
export function createOverrideForm(doc, records, processImage, reporter, { onViewProof, consolePrefix = '[override-form]' } = {}) {
  /**
   * Mount the override form into `container`.
   *
   * @param {HTMLElement} container  — element the form is appended to.
   * @param {{ date: string, record: object|null }} entry
   * @param {{ signal: AbortSignal }} [options]
   */
  function mount(container, entry, { signal } = {}) {
    const { date, record } = entry;

    const form = doc.createElement('form');
    form.dataset.form = 'override';

    // Effective steps input (required)
    const stepsLabel = doc.createElement('label');
    stepsLabel.textContent = 'Effective Steps';
    const stepsInput = doc.createElement('input');
    stepsInput.type = 'number';
    stepsInput.min = '0';
    stepsInput.step = '1';
    stepsInput.dataset.field = 'effective-steps';
    stepsInput.required = true;
    if (record) {
      stepsInput.value = String(record.effective_steps);
    }
    stepsLabel.appendChild(stepsInput);
    form.appendChild(stepsLabel);

    // Proof image — mandatory. An existing proof is reused when re-editing; a
    // newly selected file replaces it. Removing the proof re-disables Save.
    const existingProof = record && record.override && record.override.proof_image_base64
      ? record.override.proof_image_base64
      : null;
    let currentProof = existingProof;
    let processing = false;

    const proofLabel = doc.createElement('label');
    proofLabel.textContent = 'Proof Image (required)';
    const fileInput = doc.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/webp';
    fileInput.dataset.field = 'proof-image';
    proofLabel.appendChild(fileInput);
    form.appendChild(proofLabel);

    // Proof preview area: empty hint, clickable thumbnail, remove button
    const proofArea = doc.createElement('div');
    proofArea.className = 'proof-area';

    const proofHint = doc.createElement('span');
    proofHint.className = 'proof-area__hint';
    proofHint.textContent = 'No proof image uploaded';

    const thumbWrap = doc.createElement('button');
    thumbWrap.type = 'button';
    thumbWrap.className = 'proof-thumb-wrap';
    thumbWrap.dataset.action = 'view-proof';
    thumbWrap.setAttribute('aria-label', 'View full-size proof image');
    const thumb = doc.createElement('img');
    thumb.className = 'proof-thumb';
    thumb.alt = 'Proof image thumbnail';
    thumbWrap.appendChild(thumb);

    const deleteBtn = doc.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'proof-delete-btn';
    deleteBtn.dataset.action = 'delete-proof';
    deleteBtn.textContent = 'Remove image';

    proofArea.appendChild(proofHint);
    proofArea.appendChild(thumbWrap);
    proofArea.appendChild(deleteBtn);
    form.appendChild(proofArea);

    // Submit button
    const submitBtn = doc.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Save Override';
    form.appendChild(submitBtn);

    function updateProofUI() {
      proofHint.hidden = currentProof != null;
      thumbWrap.hidden = currentProof == null;
      deleteBtn.hidden = currentProof == null;
      if (currentProof) thumb.src = currentProof;
    }

    function updateSaveState() {
      submitBtn.disabled = processing || currentProof == null;
      submitBtn.textContent = processing ? 'Processing\u2026' : 'Save Override';
    }

    updateProofUI();
    updateSaveState();

    // File change → downsize immediately (≤1024 px) so the thumbnail reflects
    // exactly what will be stored; Save stays disabled while processing.
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      if (!file) return;
      if (!processImage) {
        reporter.db('\u274C Image processing unavailable');
        fileInput.value = '';
        return;
      }
      const previousProof = currentProof;
      processing = true;
      updateSaveState();
      try {
        currentProof = await processImage(file);
      } catch (err) {
        reporter.db('\u274C Image processing failed');
        console.error(consolePrefix, err);
        currentProof = previousProof;
        fileInput.value = '';
      } finally {
        processing = false;
        updateProofUI();
        updateSaveState();
      }
    }, { signal });

    // Remove current proof → no proof state, Save disabled until re-upload
    deleteBtn.addEventListener('click', () => {
      currentProof = null;
      fileInput.value = '';
      updateProofUI();
      updateSaveState();
    }, { signal });

    // Click thumbnail → host's full-size lightbox
    thumbWrap.addEventListener('click', () => {
      if (currentProof && typeof onViewProof === 'function') onViewProof(currentProof);
    }, { signal });

    // Submit handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const stepsRaw = stepsInput.value.trim();
      const stepsNum = stepsRaw !== '' ? Number(stepsRaw) : NaN;

      // Guard-clause: validate inputs before calling overrideRecord
      // steps: required, must be a finite integer >= 0 (empty string, floats, negatives all rejected)
      if (stepsRaw === '' || !Number.isFinite(stepsNum) || !Number.isInteger(stepsNum) || stepsNum < 0) {
        stepsInput.setCustomValidity('Steps must be a whole number ≥ 0');
        stepsInput.reportValidity();
        return;
      }
      stepsInput.setCustomValidity('');

      // Proof is mandatory — button is normally disabled, but implicit form
      // submission (e.g. Enter key) can bypass that, so guard here too.
      if (currentProof == null) {
        fileInput.setCustomValidity('A proof image is required');
        fileInput.reportValidity();
        return;
      }
      fileInput.setCustomValidity('');

      try {
        await records.overrideRecord(date, {
          effective_steps: stepsNum,
          proof_image_base64: currentProof,
        });
        doc.dispatchEvent(new CustomEvent('data:records:mutated', { detail: { date } }));
      } catch (err) {
        reporter.db('\u274C Override failed');
        console.error(consolePrefix, err);
      }
    }, { signal });

    container.appendChild(form);
  }

  return { mount };
}
