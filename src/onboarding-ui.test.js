import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOnboardingUI, ONBOARDING_DONE_KEY } from './onboarding-ui.js';

function buildDoc() {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = `
    <section id="onboarding" hidden>
      <p id="onboarding-text"></p>
      <button id="onboarding-connect">Connect</button>
      <button id="onboarding-restore">Restore</button>
      <button id="onboarding-skip">Not now</button>
    </section>`;
  return doc;
}

function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: vi.fn((k) => (k in data ? data[k] : null)),
    setItem: vi.fn((k, v) => { data[k] = String(v); }),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createOnboardingUI', () => {
  let doc;
  let storage;
  let connection;
  let onRestore;

  beforeEach(() => {
    doc = buildDoc();
    storage = makeStorage();
    connection = { label: 'Connect Health Connect', connect: vi.fn().mockResolvedValue(undefined) };
    onRestore = vi.fn();
  });

  function create(hasData = false) {
    return createOnboardingUI(doc, {
      storage,
      connection,
      sourceName: 'Health Connect',
      hasData: vi.fn().mockResolvedValue(hasData),
      onRestore,
    });
  }

  it('shows on first launch with no data, naming the step source', async () => {
    await create().start();
    expect(doc.getElementById('onboarding').hidden).toBe(false);
    expect(doc.body.classList.contains('has-onboarding')).toBe(true);
    expect(doc.getElementById('onboarding-connect').textContent).toBe('Connect Health Connect');
    expect(doc.getElementById('onboarding-text').textContent)
      .toBe('Step Tracker reads your daily steps from Health Connect. Everything stays on this device.');
  });

  it('ST-023: a custom introduction (the read-only web viewer)', async () => {
    const intro = 'See the steps your Step Tracker app backs up to Google Drive.';
    await createOnboardingUI(doc, { storage, connection, sourceName: 'Google Drive', intro, hasData: vi.fn().mockResolvedValue(false) }).start();
    expect(doc.getElementById('onboarding-text').textContent).toBe(intro);
  });

  it('stays hidden when there is data already', async () => {
    await create(true).start();
    expect(doc.getElementById('onboarding').hidden).toBe(true);
  });

  it('stays hidden once dismissed before', async () => {
    storage = makeStorage({ [ONBOARDING_DONE_KEY]: '1' });
    await create().start();
    expect(doc.getElementById('onboarding').hidden).toBe(true);
  });

  it('Connect asks the step source for access and stays open until connected', async () => {
    const ui = create();
    await ui.start();
    doc.getElementById('onboarding-connect').click();
    expect(connection.connect).toHaveBeenCalledTimes(1);
    expect(doc.getElementById('onboarding').hidden).toBe(false);
    ui.dismiss();
    expect(doc.getElementById('onboarding').hidden).toBe(true);
    expect(doc.body.classList.contains('has-onboarding')).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith(ONBOARDING_DONE_KEY, '1');
  });

  it('a failed connect is logged, not thrown', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    connection.connect = vi.fn().mockRejectedValue(new Error('denied'));
    await create().start();
    doc.getElementById('onboarding-connect').click();
    await tick();
    expect(spy).toHaveBeenCalledWith('[onboarding]', expect.any(Error));
    spy.mockRestore();
  });

  it('Restore closes onboarding and opens Backup & restore', async () => {
    await create().start();
    doc.getElementById('onboarding-restore').click();
    expect(doc.getElementById('onboarding').hidden).toBe(true);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('Not now closes onboarding for good', async () => {
    await create().start();
    doc.getElementById('onboarding-skip').click();
    expect(doc.getElementById('onboarding').hidden).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(ONBOARDING_DONE_KEY, '1');
  });

  it('isOpen() reports visibility', async () => {
    const ui = create();
    expect(ui.isOpen()).toBe(false);
    await ui.start();
    expect(ui.isOpen()).toBe(true);
  });

  it('shows when storage is unreadable, and a failing data check counts as no data', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    storage = { getItem: vi.fn(() => { throw new Error('blocked'); }), setItem: vi.fn(() => { throw new Error('blocked'); }) };
    const ui = createOnboardingUI(doc, {
      storage, connection, sourceName: 'Google Fit', hasData: vi.fn().mockRejectedValue(new Error('db')), onRestore,
    });
    await ui.start();
    expect(doc.getElementById('onboarding').hidden).toBe(false);
    expect(() => ui.dismiss()).not.toThrow();
    spy.mockRestore();
  });

  it('is a no-op without the onboarding markup', async () => {
    const empty = document.implementation.createHTMLDocument('test');
    const ui = createOnboardingUI(empty, { storage, connection, sourceName: 'x', hasData: vi.fn().mockResolvedValue(false) });
    await expect(ui.start()).resolves.toBeUndefined();
    expect(() => ui.dismiss()).not.toThrow();
  });
});
