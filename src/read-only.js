/**
 * Read-only backstop for the web viewer (ST-023).
 *
 * A Dexie DBCore middleware rejects every mutation — put, add, delete, clear,
 * modify, bulk writes — with ReadOnlyError while `isReadOnly()` is true, so a
 * control the markup gating missed still cannot change the viewer's data.
 * The one allowed writer is `writeSnapshot(fn)`: it runs `fn` inside a single
 * `rw` transaction over every table and only that transaction's writes pass.
 */
import Dexie from 'dexie';
import { ReadOnlyError } from './read-only-error.js';

export { ReadOnlyError, isReadOnlyError } from './read-only-error.js';

/**
 * Install the backstop on a Dexie database (before it is opened).
 * @param {Dexie} db
 * @param {{ isReadOnly: () => boolean }} options
 * @returns {{ writeSnapshot: (fn: () => Promise<void>) => Promise<void> }}
 */
export function guardWrites(db, { isReadOnly }) {
  // IndexedDB transactions allowed to write: the snapshot replacements in flight.
  const snapshotTransactions = new WeakSet();

  db.use({
    stack: 'dbcore',
    name: 'readOnlyGuard',
    create(downlevel) {
      return {
        ...downlevel,
        table(name) {
          const table = downlevel.table(name);
          return {
            ...table,
            mutate(req) {
              // Dexie turns the throw into the calling operation's rejection.
              if (isReadOnly() && !snapshotTransactions.has(req.trans)) {
                throw new ReadOnlyError();
              }
              return table.mutate(req);
            },
          };
        },
      };
    },
  });

  async function writeSnapshot(fn) {
    await db.transaction('rw', db.tables, async () => {
      snapshotTransactions.add(Dexie.currentTransaction.idbtrans);
      await fn();
    });
  }

  return { writeSnapshot };
}
