import Dexie, { type DBCore, type DBCoreMutateRequest, type DBCoreMutateResponse, type Middleware, type Transaction } from 'dexie';
import type { ContentDB, OutboxEntry } from '../lib/db';

/**
 * Change tracking for the cloud copy.
 *
 * Every write to a synced table also records "kind:id changed at T" in the
 * `outbox` table, inside the same transaction, so a change can never be saved
 * without also being queued for upload. It works below the data layer, so it
 * catches every write, including ones that don't touch `updatedAt`
 * (thread order, trash marks, bulk deletes, restoring a backup).
 */

/** Tables that sync, and the kind of record each holds. `texts` (derived) and `meta` (device-only) never sync. */
export const SYNCED_TABLES = {
  spaces: 'space',
  folders: 'folder',
  docs: 'doc',
  contents: 'content',
  platforms: 'platform',
} as const;

export type SyncTable = keyof typeof SYNCED_TABLES;
export type RecordKind = (typeof SYNCED_TABLES)[SyncTable];

export const TABLE_OF: Record<RecordKind, SyncTable> = {
  space: 'spaces',
  folder: 'folders',
  doc: 'docs',
  content: 'contents',
  platform: 'platforms',
};

export const SYNC_TABLE_NAMES = Object.keys(SYNCED_TABLES) as SyncTable[];

export const outboxKey = (kind: RecordKind, id: string) => `${kind}:${id}`;

const isSynced = (name: string): name is SyncTable => Object.prototype.hasOwnProperty.call(SYNCED_TABLES, name);

/** Transactions whose writes must not be uploaded (downloaded changes, clearing this laptop's copy). */
const quiet = new WeakSet<object>();

/**
 * Runs `fn` in a read-write transaction whose writes are NOT queued for upload.
 * Use it only for writes that come from the cloud or must stay on this device.
 */
export function withoutUpload<T>(db: ContentDB, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const tables = [...SYNC_TABLE_NAMES, 'texts', 'outbox', 'meta'].map((n) => db.table(n));
  return db.transaction('rw', tables, async (tx) => {
    const idbtrans = (tx as unknown as { idbtrans: object | null }).idbtrans;
    if (!idbtrans) throw new Error('Transaction not started');
    quiet.add(idbtrans);
    return fn(tx);
  });
}

/** Keys an add/put/delete touches, known before it runs. */
function knownKeys(req: Exclude<DBCoreMutateRequest, { type: 'deleteRange' }>): string[] {
  const ids = new Set<string>();
  if (req.type === 'delete') {
    for (const k of req.keys) if (k != null) ids.add(String(k));
    return [...ids];
  }
  for (const k of req.keys ?? []) if (k != null) ids.add(String(k));
  for (const v of req.values) if (v && v.id != null) ids.add(String(v.id));
  if (req.type === 'put') for (const k of req.updates?.keys ?? []) if (k != null) ids.add(String(k));
  return [...ids];
}

export const outboxMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'SyncOutbox',
  create(down) {
    return {
      ...down,
      transaction(stores, mode, options) {
        const scope = mode === 'readwrite' && stores.some(isSynced) && !stores.includes('outbox') ? [...stores, 'outbox'] : stores;
        return down.transaction(scope, mode, options);
      },
      table(name) {
        const table = down.table(name);
        if (!isSynced(name)) return table;
        const kind = SYNCED_TABLES[name];
        return {
          ...table,
          mutate(req) {
            if (quiet.has(req.trans as object)) return table.mutate(req);
            // Dexie's own layers below need the transaction's context, which an
            // `await` here would lose. Start writes synchronously, and use Dexie's
            // promise (which keeps the context) where a step must wait.
            const log = (keys: string[]) => {
              const at = Date.now();
              const values: OutboxEntry[] = keys.map((id) => ({ key: outboxKey(kind, id), kind, id, at }));
              return down.table('outbox').mutate({ type: 'put', trans: req.trans, values });
            };
            if (req.type === 'deleteRange') {
              // clear() and range deletes: find out which records are about to go, first.
              const found = table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } });
              return Dexie.Promise.resolve(found).then((q) => {
                const keys = (q.result as unknown[]).map(String);
                const done = table.mutate(req);
                return keys.length ? Promise.all([done, log(keys)]).then(([res]) => res) : done;
              }) as Promise<DBCoreMutateResponse>;
            }
            const keys = knownKeys(req);
            const done = table.mutate(req);
            return keys.length ? Promise.all([done, log(keys)]).then(([res]) => res) : done;
          },
        };
      },
    };
  },
};

/** Turns on change tracking for this database. Call before the database is first used. */
export function trackChanges(db: ContentDB) {
  db.use(outboxMiddleware);
}

