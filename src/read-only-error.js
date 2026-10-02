/**
 * The read-only viewer's write refusal (ST-023), kept free of Dexie so pure
 * modules can recognise it. Thrown by the backstop in read-only.js.
 */

export class ReadOnlyError extends Error {
  constructor() {
    super('View only — edit your data in the Walkaholic app');
    this.name = 'ReadOnlyError';
  }
}

/**
 * Dexie rethrows a middleware rejection as a DexieError carrying the same
 * name, so callers check the name rather than the class.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isReadOnlyError(err) {
  return err?.name === 'ReadOnlyError';
}
