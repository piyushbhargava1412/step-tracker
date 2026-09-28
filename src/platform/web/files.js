/** Revoke on the next tick: some browsers read the blob URL after click(). */
const REVOKE_DELAY_MS = 1000;

/**
 * Save text as a browser download via a temporary anchor.
 *
 * @param {Document} doc
 * @param {string} fileName
 * @param {string} mimeType
 * @param {string} text
 * @returns {Promise<{ location: null }>}  The browser owns the destination.
 */
export async function saveTextFileAsDownload(doc, fileName, mimeType, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  return { location: null };
}
