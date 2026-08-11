/**
 * image-processor.js — Pure async image resizing utility.
 * 
 * Reads an image File, resizes proportionally so neither dimension exceeds
 * MAX_PROOF_IMAGE_PX, and returns a data:image/jpeg;base64,... string.
 * Zero DOM imports beyond injected collaborators.
 */

export const MAX_PROOF_IMAGE_PX = 1024;
export const PROOF_IMAGE_QUALITY = 0.8;

/** Explicit allowlist matching the file input's accept attribute. */
export const ALLOWED_IMAGE_TYPES = Object.freeze(new Set(['image/png', 'image/jpeg', 'image/webp']));

/**
 * Factory: creates a processImage function with injected collaborators.
 * @param {object} deps
 * @param {Function} deps.canvasFactory - () => canvas-like object
 * @param {Function} deps.FileReader - FileReader constructor
 * @param {Function} deps.Image - Image constructor
 */
export function createImageProcessor({
  canvasFactory = () => document.createElement('canvas'),
  FileReader: FR = globalThis.FileReader,
  Image: Img = globalThis.Image,
} = {}) {
  /**
   * Process an image File, resize if needed, return JPEG base64 data URL.
   * @param {File} file
   * @returns {Promise<string>}
   */
  function processImage(file) {
    // Fail-fast guards
    if (!file) {
      return Promise.reject(new TypeError('file is required'));
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return Promise.reject(new TypeError(`Invalid file type: ${file.type}`));
    }

    return new Promise((resolve, reject) => {
      const reader = new FR();

      reader.onerror = (err) => reject(err instanceof Error ? err : new Error('FileReader error'));
      reader.onload = () => {
        const dataUrl = reader.result;
        const img = new Img();

        img.onerror = (err) => reject(err instanceof Error ? err : new Error('Image load error'));
        img.onload = () => {
          const { width, height } = img;

          // Compute scaled dimensions (no upscaling)
          let scaledW = width;
          let scaledH = height;
          if (width > MAX_PROOF_IMAGE_PX || height > MAX_PROOF_IMAGE_PX) {
            const scale = MAX_PROOF_IMAGE_PX / Math.max(width, height);
            scaledW = Math.round(width * scale);
            scaledH = Math.round(height * scale);
          }

          const canvas = canvasFactory();
          canvas.width = scaledW;
          canvas.height = scaledH;
          canvas.drawImage(img, 0, 0, scaledW, scaledH);
          resolve(canvas.toDataURL('image/jpeg', PROOF_IMAGE_QUALITY));
        };

        img.src = dataUrl;
      };

      reader.readAsDataURL(file);
    });
  }

  return { processImage };
}

// Default export using platform globals
const _defaultProcessor = createImageProcessor();
export function processImage(file) {
  return _defaultProcessor.processImage(file);
}
