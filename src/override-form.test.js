import { createOverrideForm, createProofLightbox } from './override-form.js';

function buildDoc(html) {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = html;
  return doc;
}

function makeMockRecords() {
  return { overrideRecord: vi.fn().mockResolvedValue(undefined), revertRecord: vi.fn() };
}

function makeMockProcessImage() {
  return vi.fn().mockResolvedValue('data:image/jpeg;base64,PROCESSED');
}

function makeMockReporter() {
  return { db: vi.fn() };
}

function makeEntry(overrides = {}) {
  return {
    date: '2026-08-05',
    record: { effective_steps: 6000, is_overridden: false, override: null, ...overrides },
  };
}

function makeController() {
  const ac = new AbortController();
  return { signal: ac.signal, abort: () => ac.abort() };
}

async function openForm(doc, { records, processImage, reporter, onViewProof, entry, signal }) {
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const form = createOverrideForm(doc, records, processImage, reporter, { onViewProof });
  form.mount(container, entry, { signal });
  return {
    container,
    form,
    stepsInput: container.querySelector('input[data-field="effective-steps"]'),
    fileInput: container.querySelector('input[data-field="proof-image"]'),
    submitBtn: container.querySelector('button[type="submit"]'),
    deleteBtn: container.querySelector('[data-action="delete-proof"]'),
    thumbWrap: container.querySelector('[data-action="view-proof"]'),
    formEl: container.querySelector('form[data-form="override"]'),
  };
}

async function attachProof(fileInput, processImage) {
  const mockFile = new File(['test'], 'proof.jpg', { type: 'image/jpeg' });
  Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(processImage).toHaveBeenCalled());
}

describe('createOverrideForm — DOM contract', () => {
  it('mount builds form with steps, file, proof area and submit inside container', () => {
    const doc = buildDoc('<div id="root"></div>');
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const reporter = makeMockReporter();
    const ctrl = makeController();
    const container = doc.getElementById('root');

    const form = createOverrideForm(doc, records, processImage, reporter, {});
    form.mount(container, makeEntry(), { signal: ctrl.signal });

    expect(container.querySelector('form[data-form="override"]')).not.toBeNull();
    const stepsInput = container.querySelector('input[data-field="effective-steps"]');
    expect(stepsInput).not.toBeNull();
    expect(stepsInput.type).toBe('number');
    expect(stepsInput.min).toBe('0');
    expect(stepsInput.step).toBe('1');
    const fileInput = container.querySelector('input[data-field="proof-image"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput.accept).toBe('image/png,image/jpeg,image/webp');
    expect(container.querySelector('button[type="submit"]').textContent).toBe('Save Override');
    expect(container.querySelector('.proof-area')).not.toBeNull();
    expect(container.querySelector('[data-action="delete-proof"]')).not.toBeNull();
    expect(container.querySelector('[data-action="view-proof"]')).not.toBeNull();
  });

  it('pre-fills steps from record and reuses an existing proof (Save enabled on mount)', () => {
    const doc = buildDoc('<div id="root"></div>');
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const reporter = makeMockReporter();
    const ctrl = makeController();
    const container = doc.getElementById('root');
    const entry = makeEntry({ effective_steps: 7200, override: { proof_image_base64: 'data:image/jpeg;base64,PROOF' } });

    const form = createOverrideForm(doc, records, processImage, reporter, {});
    form.mount(container, entry, { signal: ctrl.signal });

    expect(container.querySelector('input[data-field="effective-steps"]').value).toBe('7200');
    expect(container.querySelector('button[type="submit"]').disabled).toBe(false);
  });
});

describe('createOverrideForm — proof handling', () => {
  it('Save is disabled until a proof image is uploaded', async () => {
    const doc = buildDoc('<div id="root"></div>');
    const { submitBtn } = await openForm(doc, {
      records: makeMockRecords(),
      processImage: makeMockProcessImage(),
      reporter: makeMockReporter(),
      entry: makeEntry(),
      signal: makeController().signal,
    });
    expect(submitBtn.disabled).toBe(true);
  });

  it('selecting a file processes it, enables Save, then submit calls overrideRecord with processed base64', async () => {
    const doc = buildDoc('<div id="root"></div>');
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));
    const { formEl, fileInput, stepsInput, submitBtn } = await openForm(doc, {
      records,
      processImage,
      reporter: makeMockReporter(),
      entry: makeEntry(),
      signal: makeController().signal,
    });

    const mockFile = new File(['test'], 'proof.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(processImage).toHaveBeenCalledWith(mockFile));
    await vi.waitFor(() => expect(submitBtn.disabled).toBe(false));

    stepsInput.value = '7500';
    formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(records.overrideRecord).toHaveBeenCalled());
    const [date, params] = records.overrideRecord.mock.calls[0];
    expect(date).toBe('2026-08-05');
    expect(params.effective_steps).toBe(7500);
    expect(params.proof_image_base64).toBe('data:image/jpeg;base64,PROCESSED');
    expect(events.length).toBe(1);
    expect(events[0].detail.date).toBe('2026-08-05');
  });

  it('submit without a proof does NOT call overrideRecord and dispatches no event', async () => {
    const doc = buildDoc('<div id="root"></div>');
    const records = makeMockRecords();
    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));
    const { formEl, stepsInput } = await openForm(doc, {
      records,
      processImage: makeMockProcessImage(),
      reporter: makeMockReporter(),
      entry: makeEntry(),
      signal: makeController().signal,
    });

    stepsInput.value = '7000';
    formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(records.overrideRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
  });

  it('delete removes an existing proof → Save disabled until a new image is uploaded', async () => {
    const doc = buildDoc('<div id="root"></div>');
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const entry = makeEntry({ override: { proof_image_base64: 'data:image/jpeg;base64,PROOF' } });
    const { deleteBtn, submitBtn, fileInput } = await openForm(doc, {
      records,
      processImage,
      reporter: makeMockReporter(),
      entry,
      signal: makeController().signal,
    });

    expect(submitBtn.disabled).toBe(false);
    deleteBtn.click();
    expect(submitBtn.disabled).toBe(true);

    const mockFile = new File(['test'], 'new.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(processImage).toHaveBeenCalled());
    await vi.waitFor(() => expect(submitBtn.disabled).toBe(false));
  });

  it('processImage rejection → reporter ❌, Save stays disabled, no overrideRecord call, no event', async () => {
    const doc = buildDoc('<div id="root"></div>');
    const records = makeMockRecords();
    const reporter = makeMockReporter();
    const processImage = vi.fn().mockRejectedValue(new Error('Bad image'));
    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fileInput, submitBtn } = await openForm(doc, {
      records,
      processImage,
      reporter,
      entry: makeEntry(),
      signal: makeController().signal,
    });

    const mockFile = new File(['test'], 'bad.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
    expect(consoleSpy).toHaveBeenCalledWith('[override-form]', expect.any(Error));
    expect(submitBtn.disabled).toBe(true);
    expect(records.overrideRecord).not.toHaveBeenCalled();
    expect(events.length).toBe(0);
    consoleSpy.mockRestore();
  });

  it('thumbWrap click invokes onViewProof with the current proof source', async () => {
    const doc = buildDoc('<div id="root"></div>');
    const onViewProof = vi.fn();
    const processImage = makeMockProcessImage();
    const entry = makeEntry({ override: { proof_image_base64: 'data:image/jpeg;base64,PROOF' } });
    const { thumbWrap } = await openForm(doc, {
      records: makeMockRecords(),
      processImage,
      reporter: makeMockReporter(),
      onViewProof,
      entry,
      signal: makeController().signal,
    });

    thumbWrap.click();
    expect(onViewProof).toHaveBeenCalledWith('data:image/jpeg;base64,PROOF');
  });
});

describe('createOverrideForm — validation and failures', () => {
  it('empty / float / negative steps → overrideRecord NOT called, no event', async () => {
    for (const bad of ['', '3.5', '-1']) {
      const doc = buildDoc('<div id="root"></div>');
      const records = makeMockRecords();
      const processImage = makeMockProcessImage();
      const events = [];
      doc.addEventListener('data:records:mutated', (e) => events.push(e));
      const { formEl, fileInput, stepsInput } = await openForm(doc, {
        records,
        processImage,
        reporter: makeMockReporter(),
        entry: makeEntry(),
        signal: makeController().signal,
      });
      await attachProof(fileInput, processImage);
      stepsInput.value = bad;
      formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 20));
      expect(records.overrideRecord).not.toHaveBeenCalled();
      expect(events.length).toBe(0);
    }
  });

  it('steps = 0 with a valid proof → overrideRecord IS called', async () => {
    const doc = buildDoc('<div id="root"></div>');
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const { formEl, fileInput, stepsInput } = await openForm(doc, {
      records,
      processImage,
      reporter: makeMockReporter(),
      entry: makeEntry(),
      signal: makeController().signal,
    });
    await attachProof(fileInput, processImage);
    stepsInput.value = '0';
    formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(records.overrideRecord).toHaveBeenCalled());
    expect(records.overrideRecord.mock.calls[0][1].effective_steps).toBe(0);
  });

  it('overrideRecord rejection → reporter ❌, no event', async () => {
    const doc = buildDoc('<div id="root"></div>');
    const records = { overrideRecord: vi.fn().mockRejectedValue(new Error('DB write failed')), revertRecord: vi.fn() };
    const reporter = makeMockReporter();
    const processImage = makeMockProcessImage();
    const events = [];
    doc.addEventListener('data:records:mutated', (e) => events.push(e));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { formEl, fileInput, stepsInput } = await openForm(doc, {
      records,
      processImage,
      reporter,
      entry: makeEntry(),
      signal: makeController().signal,
    });
    await attachProof(fileInput, processImage);
    stepsInput.value = '7000';
    formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(reporter.db).toHaveBeenCalled());
    expect(reporter.db).toHaveBeenCalledWith(expect.stringContaining('❌'));
    expect(consoleSpy).toHaveBeenCalledWith('[override-form]', expect.any(Error));
    expect(events.length).toBe(0);
    consoleSpy.mockRestore();
  });

  it('listeners are bound to the supplied signal — abort removes them (no stacking on re-mount)', async () => {
    const doc = buildDoc('<div id="root"></div>');
    const records = makeMockRecords();
    const processImage = makeMockProcessImage();
    const ctrl = makeController();
    const { formEl, fileInput, stepsInput } = await openForm(doc, {
      records,
      processImage,
      reporter: makeMockReporter(),
      entry: makeEntry(),
      signal: ctrl.signal,
    });
    await attachProof(fileInput, processImage);
    stepsInput.value = '6000';
    ctrl.abort();

    formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(records.overrideRecord).not.toHaveBeenCalled();
  });
});

describe('createProofLightbox', () => {
  it('open appends .proof-lightbox to the target panel with the image src', () => {
    const doc = buildDoc('<div id="root"></div>');
    const lightbox = createProofLightbox(doc);
    const panel = doc.getElementById('root');
    lightbox.open('data:image/jpeg;base64,PROOF', panel);

    const el = doc.querySelector('.proof-lightbox');
    expect(el).not.toBeNull();
    expect(el.querySelector('img').src).toBe('data:image/jpeg;base64,PROOF');
    expect(el.parentNode).toBe(panel);
  });

  it('close removes the lightbox', () => {
    const doc = buildDoc('<div id="root"></div>');
    const lightbox = createProofLightbox(doc);
    lightbox.open('data:image/jpeg;base64,PROOF', doc.body);
    expect(doc.querySelector('.proof-lightbox')).not.toBeNull();
    lightbox.close();
    expect(doc.querySelector('.proof-lightbox')).toBeNull();
  });

  it('overlay click and Escape dismiss the lightbox', () => {
    const doc = buildDoc('<div id="root"></div>');
    const lightbox = createProofLightbox(doc);
    lightbox.open('data:image/jpeg;base64,PROOF', doc.body);
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(doc.querySelector('.proof-lightbox')).toBeNull();

    lightbox.open('data:image/jpeg;base64,PROOF', doc.body);
    doc.querySelector('.proof-lightbox').click();
    expect(doc.querySelector('.proof-lightbox')).toBeNull();
  });

  it('re-open replaces any existing lightbox (single instance)', () => {
    const doc = buildDoc('<div id="root"></div>');
    const lightbox = createProofLightbox(doc);
    lightbox.open('data:image/jpeg;base64,A', doc.body);
    lightbox.open('data:image/jpeg;base64,B', doc.body);
    const els = doc.querySelectorAll('.proof-lightbox');
    expect(els.length).toBe(1);
    expect(els[0].querySelector('img').src).toBe('data:image/jpeg;base64,B');
  });
});
