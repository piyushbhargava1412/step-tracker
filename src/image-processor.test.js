import { describe, it, expect, vi, afterEach } from 'vitest';
import { createImageProcessor, processImage, MAX_PROOF_IMAGE_PX, PROOF_IMAGE_QUALITY, ALLOWED_IMAGE_TYPES, MAX_PROOF_FILE_BYTES } from './image-processor.js';

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper to create a mock File
function makeFile(type = 'image/jpeg') {
  return { type, name: 'test.jpg', size: 100 };
}

/**
 * Build an injected image processor with controllable canvas/FileReader/Image.
 */
function makeImageProcessor({
  readerResult = 'data:image/jpeg;base64,abc123',
  readerError = null,
  imgWidth = 800,
  imgHeight = 600,
  imgError = null,
  toDataURLResult = 'data:image/jpeg;base64,RESIZED',
} = {}) {
  const canvasMock = {
    width: 0,
    height: 0,
    drawImage: vi.fn(),
    toDataURL: vi.fn(() => toDataURLResult),
  };
  const canvasFactory = vi.fn(() => canvasMock);

  const readerInstances = [];
  function MockFileReader() {
    this.result = null;
    this.onload = null;
    this.onerror = null;
    const self = this;
    this.readAsDataURL = vi.fn(function() {
      setTimeout(() => {
        if (readerError) {
          self.onerror && self.onerror(readerError);
        } else {
          self.result = readerResult;
          self.onload && self.onload();
        }
      }, 0);
    });
    readerInstances.push(this);
  }
  const MockFileReaderSpy = vi.fn(function() {
    return new MockFileReader();
  });

  const imgInstances = [];
  function MockImage() {
    this.onload = null;
    this.onerror = null;
    Object.defineProperty(this, 'width', { get: () => imgWidth });
    Object.defineProperty(this, 'height', { get: () => imgHeight });
    const self = this;
    Object.defineProperty(this, 'src', {
      set(val) {
        setTimeout(() => {
          if (imgError) {
            self.onerror && self.onerror(imgError);
          } else {
            self.onload && self.onload();
          }
        }, 0);
      }
    });
    imgInstances.push(this);
  }
  const MockImageSpy = vi.fn(function() {
    return new MockImage();
  });

  const processor = createImageProcessor({
    canvasFactory,
    FileReader: MockFileReaderSpy,
    Image: MockImageSpy,
  });

  return { processor, canvasMock, canvasFactory, MockFileReaderSpy, MockImageSpy, readerInstances, imgInstances };
}

describe('Constants', () => {
  it('exports MAX_PROOF_IMAGE_PX = 1024', () => {
    expect(MAX_PROOF_IMAGE_PX).toBe(1024);
  });

  it('exports PROOF_IMAGE_QUALITY = 0.8', () => {
    expect(PROOF_IMAGE_QUALITY).toBe(0.8);
  });
});

describe('createImageProcessor', () => {
  it('returns a processImage function', () => {
    const { processor } = makeImageProcessor();
    expect(typeof processor.processImage).toBe('function');
  });
});

describe('processImage — fail-fast guards', () => {
  it('rejects immediately with TypeError for null file', async () => {
    const { processor, MockFileReaderSpy } = makeImageProcessor();
    await expect(processor.processImage(null)).rejects.toThrow(TypeError);
    expect(MockFileReaderSpy).not.toHaveBeenCalled();
  });

  it('rejects immediately with TypeError for undefined file', async () => {
    const { processor, MockFileReaderSpy } = makeImageProcessor();
    await expect(processor.processImage(undefined)).rejects.toThrow(TypeError);
    expect(MockFileReaderSpy).not.toHaveBeenCalled();
  });

  it('rejects immediately for non-image MIME type (text/plain)', async () => {
    const { processor, MockFileReaderSpy } = makeImageProcessor();
    const file = makeFile('text/plain');
    await expect(processor.processImage(file)).rejects.toThrow(TypeError);
    expect(MockFileReaderSpy).not.toHaveBeenCalled();
  });

  it('rejects immediately for empty MIME type', async () => {
    const { processor, MockFileReaderSpy } = makeImageProcessor();
    const file = makeFile('');
    await expect(processor.processImage(file)).rejects.toThrow(TypeError);
    expect(MockFileReaderSpy).not.toHaveBeenCalled();
  });
});

describe('processImage — FileReader error', () => {
  it('rejects when FileReader fires error event', async () => {
    const { processor, MockImageSpy } = makeImageProcessor({ readerError: new Error('read fail') });
    const file = makeFile('image/jpeg');
    await expect(processor.processImage(file)).rejects.toThrow();
    expect(MockImageSpy).not.toHaveBeenCalled();
  });
});

describe('processImage — Image load error', () => {
  it('rejects when Image fires error event', async () => {
    const { processor } = makeImageProcessor({ imgError: new Error('img load fail') });
    const file = makeFile('image/jpeg');
    await expect(processor.processImage(file)).rejects.toThrow();
  });
});

describe('processImage — no upscaling', () => {
  it('image <= 1024px keeps original dimensions (800x600)', async () => {
    const { processor, canvasMock } = makeImageProcessor({ imgWidth: 800, imgHeight: 600 });
    const result = await processor.processImage(makeFile('image/jpeg'));
    expect(canvasMock.width).toBe(800);
    expect(canvasMock.height).toBe(600);
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('small image (100x80) not upscaled', async () => {
    const { processor, canvasMock } = makeImageProcessor({ imgWidth: 100, imgHeight: 80 });
    await processor.processImage(makeFile('image/png'));
    expect(canvasMock.width).toBe(100);
    expect(canvasMock.height).toBe(80);
  });
});

describe('processImage — proportional resize', () => {
  it('wide oversized (2048x1024) resizes to 1024x512', async () => {
    const { processor, canvasMock } = makeImageProcessor({ imgWidth: 2048, imgHeight: 1024 });
    await processor.processImage(makeFile('image/jpeg'));
    expect(canvasMock.width).toBe(1024);
    expect(canvasMock.height).toBe(512);
  });

  it('tall oversized (1024x2048) resizes to 512x1024', async () => {
    const { processor, canvasMock } = makeImageProcessor({ imgWidth: 1024, imgHeight: 2048 });
    await processor.processImage(makeFile('image/jpeg'));
    expect(canvasMock.width).toBe(512);
    expect(canvasMock.height).toBe(1024);
  });

  it('square oversized (2000x2000) resizes to 1024x1024', async () => {
    const { processor, canvasMock } = makeImageProcessor({ imgWidth: 2000, imgHeight: 2000 });
    await processor.processImage(makeFile('image/jpeg'));
    expect(canvasMock.width).toBe(1024);
    expect(canvasMock.height).toBe(1024);
  });

  it('landscape proportional (2048x1536) resizes to 1024x768', async () => {
    const { processor, canvasMock } = makeImageProcessor({ imgWidth: 2048, imgHeight: 1536 });
    await processor.processImage(makeFile('image/jpeg'));
    expect(canvasMock.width).toBe(1024);
    expect(canvasMock.height).toBe(768);
  });
});

describe('processImage — output format', () => {
  it('output matches /^data:image\\/jpeg;base64,/ regex', async () => {
    const { processor } = makeImageProcessor({ toDataURLResult: 'data:image/jpeg;base64,SOMEPAYLOAD' });
    const result = await processor.processImage(makeFile('image/png'));
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('calls canvas.toDataURL with image/jpeg and PROOF_IMAGE_QUALITY', async () => {
    const { processor, canvasMock } = makeImageProcessor();
    await processor.processImage(makeFile('image/jpeg'));
    expect(canvasMock.toDataURL).toHaveBeenCalledWith('image/jpeg', PROOF_IMAGE_QUALITY);
  });

  it('calls canvas.drawImage with the image element', async () => {
    const { processor, canvasMock } = makeImageProcessor({ imgWidth: 500, imgHeight: 400 });
    await processor.processImage(makeFile('image/jpeg'));
    expect(canvasMock.drawImage).toHaveBeenCalledTimes(1);
  });
});

describe('default processImage export', () => {
  it('is a function', () => {
    expect(typeof processImage).toBe('function');
  });
});

describe('ALLOWED_IMAGE_TYPES', () => {
  it('exports ALLOWED_IMAGE_TYPES as a Set or frozen array', () => {
    expect(ALLOWED_IMAGE_TYPES).toBeDefined();
    // must support .has() (Set) or convert to check membership
    const has = (t) => ALLOWED_IMAGE_TYPES instanceof Set
      ? ALLOWED_IMAGE_TYPES.has(t)
      : Array.from(ALLOWED_IMAGE_TYPES).includes(t);
    expect(has('image/png')).toBe(true);
    expect(has('image/jpeg')).toBe(true);
    expect(has('image/webp')).toBe(true);
    expect(has('image/svg+xml')).toBe(false);
  });
});

describe('processImage — MIME allowlist guard', () => {
  it('rejects image/svg+xml fail-fast before FileReader', async () => {
    const { processor, MockFileReaderSpy } = makeImageProcessor();
    const file = makeFile('image/svg+xml');
    await expect(processor.processImage(file)).rejects.toThrow(TypeError);
    expect(MockFileReaderSpy).not.toHaveBeenCalled();
  });

  it('rejects image/gif fail-fast before FileReader', async () => {
    const { processor, MockFileReaderSpy } = makeImageProcessor();
    const file = makeFile('image/gif');
    await expect(processor.processImage(file)).rejects.toThrow(TypeError);
    expect(MockFileReaderSpy).not.toHaveBeenCalled();
  });

  it('rejects image/bmp fail-fast before FileReader', async () => {
    const { processor, MockFileReaderSpy } = makeImageProcessor();
    const file = makeFile('image/bmp');
    await expect(processor.processImage(file)).rejects.toThrow(TypeError);
    expect(MockFileReaderSpy).not.toHaveBeenCalled();
  });

  it('accepts image/png', async () => {
    const { processor } = makeImageProcessor();
    await expect(processor.processImage(makeFile('image/png'))).resolves.toMatch(/^data:image\/jpeg;base64,/);
  });

  it('accepts image/jpeg', async () => {
    const { processor } = makeImageProcessor();
    await expect(processor.processImage(makeFile('image/jpeg'))).resolves.toMatch(/^data:image\/jpeg;base64,/);
  });

  it('accepts image/webp', async () => {
    const { processor } = makeImageProcessor();
    await expect(processor.processImage(makeFile('image/webp'))).resolves.toMatch(/^data:image\/jpeg;base64,/);
  });
});

describe('MAX_PROOF_FILE_BYTES constant', () => {
  it('exports MAX_PROOF_FILE_BYTES = 20 * 1024 * 1024', () => {
    expect(MAX_PROOF_FILE_BYTES).toBe(20 * 1024 * 1024);
  });
});

describe('processImage — file-size guard', () => {
  it('rejects files > 20 MB fail-fast before FileReader is instantiated', async () => {
    const { processor, MockFileReaderSpy } = makeImageProcessor();
    const oversizedFile = { type: 'image/jpeg', name: 'big.jpg', size: MAX_PROOF_FILE_BYTES + 1 };
    await expect(processor.processImage(oversizedFile)).rejects.toThrow(TypeError);
    await expect(processor.processImage(oversizedFile)).rejects.toThrow('File too large');
    expect(MockFileReaderSpy).not.toHaveBeenCalled();
  });

  it('rejects a file exactly 1 byte over 20 MB', async () => {
    const { processor, MockFileReaderSpy } = makeImageProcessor();
    const file = { type: 'image/png', name: 'edge.png', size: 20 * 1024 * 1024 + 1 };
    await expect(processor.processImage(file)).rejects.toThrow(TypeError);
    expect(MockFileReaderSpy).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at 20 MB boundary (size === MAX_PROOF_FILE_BYTES)', async () => {
    const { processor } = makeImageProcessor();
    const file = { type: 'image/jpeg', name: 'exact.jpg', size: MAX_PROOF_FILE_BYTES };
    await expect(processor.processImage(file)).resolves.toMatch(/^data:image\/jpeg;base64,/);
  });

  it('accepts a file well under 20 MB', async () => {
    const { processor } = makeImageProcessor();
    const file = { type: 'image/jpeg', name: 'small.jpg', size: 100 };
    await expect(processor.processImage(file)).resolves.toMatch(/^data:image\/jpeg;base64,/);
  });
});
