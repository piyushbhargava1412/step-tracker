import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFileSaver, NATIVE_EXPORT_FOLDER } from './files.js';

describe('ST-018: createFileSaver — web (browser download)', () => {
  let anchor;
  let doc;

  beforeEach(() => {
    vi.useFakeTimers();
    anchor = { click: vi.fn(), remove: vi.fn() };
    doc = { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } };
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('downloads the text through a temporary anchor and reports no location', async () => {
    const saver = createFileSaver({ isNative: false, doc });

    const result = await saver.saveTextFile('backup.json', 'application/json', '{"a":1}');

    expect(doc.createElement).toHaveBeenCalledWith('a');
    expect(anchor.href).toBe('blob:x');
    expect(anchor.download).toBe('backup.json');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ location: null });
  });

  it('builds a Blob with the given MIME type', async () => {
    const saver = createFileSaver({ isNative: false, doc });
    await saver.saveTextFile('steps.csv', 'text/csv', 'a,b');
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/csv');
  });

  it('revokes the object URL on the next tick, not synchronously', async () => {
    const saver = createFileSaver({ isNative: false, doc });
    await saver.saveTextFile('a.json', 'application/json', '{}');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
});

describe('ST-018: createFileSaver — native (Documents folder)', () => {
  let filesystem;

  beforeEach(() => {
    filesystem = {
      checkPermissions: vi.fn().mockResolvedValue({ publicStorage: 'granted' }),
      requestPermissions: vi.fn().mockResolvedValue({ publicStorage: 'granted' }),
      writeFile: vi.fn().mockResolvedValue({ uri: 'file:///x' }),
    };
  });

  it('writes UTF-8 text into Documents/Step Tracker and reports where', async () => {
    const saver = createFileSaver({ isNative: true, filesystem });

    const result = await saver.saveTextFile('backup.json', 'application/json', '{"a":1}');

    expect(filesystem.writeFile).toHaveBeenCalledWith({
      path: `${NATIVE_EXPORT_FOLDER}/backup.json`,
      data: '{"a":1}',
      directory: 'DOCUMENTS',
      encoding: 'utf8',
      recursive: true,
    });
    expect(result).toEqual({ location: `Documents/${NATIVE_EXPORT_FOLDER}/backup.json` });
    expect(NATIVE_EXPORT_FOLDER).toBe('Step Tracker');
  });

  it('asks for storage permission when not yet granted (Android 10 and older)', async () => {
    filesystem.checkPermissions.mockResolvedValue({ publicStorage: 'prompt' });

    await createFileSaver({ isNative: true, filesystem }).saveTextFile('a.csv', 'text/csv', 'x');

    expect(filesystem.requestPermissions).toHaveBeenCalledTimes(1);
    expect(filesystem.writeFile).toHaveBeenCalledTimes(1);
  });

  it('throws a readable error and writes nothing when permission is refused', async () => {
    filesystem.checkPermissions.mockResolvedValue({ publicStorage: 'prompt' });
    filesystem.requestPermissions.mockResolvedValue({ publicStorage: 'denied' });

    await expect(
      createFileSaver({ isNative: true, filesystem }).saveTextFile('a.csv', 'text/csv', 'x')
    ).rejects.toThrow('Storage permission is needed to save files to Documents.');
    expect(filesystem.writeFile).not.toHaveBeenCalled();
  });

  it('replaces characters Android file names cannot hold', async () => {
    await createFileSaver({ isNative: true, filesystem }).saveTextFile('a/b:c?.json', 'application/json', '{}');
    expect(filesystem.writeFile.mock.calls[0][0].path).toBe(`${NATIVE_EXPORT_FOLDER}/a_b_c_.json`);
  });
});

describe('ST-018: createFileSaver guard clauses', () => {
  it('requires a document on web', () => {
    expect(() => createFileSaver({ isNative: false })).toThrow(TypeError);
  });

  it('defaults to the Capacitor Filesystem plugin on native', () => {
    expect(() => createFileSaver({ isNative: true })).not.toThrow();
  });
});
