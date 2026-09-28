/**
 * File saving — a browser download on web, the phone's Documents folder in
 * the Android app (a WebView cannot follow a download link).
 */
import { Filesystem } from '@capacitor/filesystem';
import { saveTextFileAsDownload } from './web/files.js';
import { saveTextFileToDocuments, NATIVE_EXPORT_FOLDER } from './native/files.js';

export { NATIVE_EXPORT_FOLDER };

/**
 * @typedef {object} FileSaver
 * @property {(fileName: string, mimeType: string, text: string)
 *            => Promise<{ location: string|null }>} saveTextFile
 *           Resolves with where the user can find the file (null when the
 *           browser decides); rejects when the file could not be saved.
 */

/**
 * @param {object} deps
 * @param {boolean} deps.isNative
 * @param {Document} [deps.doc]         Required on web.
 * @param {object}   [deps.filesystem]  Capacitor Filesystem (native).
 * @returns {FileSaver}
 */
export function createFileSaver({ isNative, doc, filesystem = Filesystem }) {
  if (isNative) {
    return {
      saveTextFile: (fileName, _mimeType, text) => saveTextFileToDocuments(filesystem, fileName, text),
    };
  }
  if (typeof doc?.createElement !== 'function') {
    throw new TypeError('[platform/files] a document is required on web');
  }
  return {
    saveTextFile: (fileName, mimeType, text) => saveTextFileAsDownload(doc, fileName, mimeType, text),
  };
}
