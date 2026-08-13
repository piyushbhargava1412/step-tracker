// confirm.js — injectable confirm adapter
// Single responsibility: wrap a window-like reference's confirm method.

/**
 * Creates a confirm adapter that delegates to windowRef.confirm.
 * Fail-open: returns undefined if windowRef or windowRef.confirm is absent.
 *
 * @param {object} [windowRef] - A window-like object exposing a `confirm` method.
 * @returns {(msg: string) => boolean | undefined}
 */
export function createConfirmAdapter(windowRef) {
  return (msg) => windowRef?.confirm?.(msg)
}
