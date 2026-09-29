/**
 * Access role per platform (ST-023): the Android app is the only writer; the
 * browser is a read-only viewer of the snapshot the app backs up to Drive.
 *
 * `applyAccess` marks <html data-access="editor|viewer">. styles.css hides
 * `[data-editor-only]` controls from viewers and `[data-viewer-only]` notes
 * from editors, so render modules only mark their controls.
 */

export const ACCESS_EDITOR = 'editor';
export const ACCESS_VIEWER = 'viewer';

/**
 * @param {{ isNative: boolean }} deps
 * @returns {{ role: string, canEdit: boolean }}
 */
export function selectAccess({ isNative }) {
  return isNative
    ? { role: ACCESS_EDITOR, canEdit: true }
    : { role: ACCESS_VIEWER, canEdit: false };
}

/**
 * @param {Document|null} doc
 * @param {{ role: string }} access
 */
export function applyAccess(doc, access) {
  const root = doc?.documentElement;
  if (root) root.dataset.access = access.role;
}
