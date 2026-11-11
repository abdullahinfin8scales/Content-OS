import { toPlainText } from '../lib/content';
import type { ContentDB, OutboxEntry } from '../lib/db';
import type { DocContent } from '../lib/types';
import { outboxKey, SYNC_TABLE_NAMES, SYNCED_TABLES, TABLE_OF, withoutUpload, type RecordKind } from './outbox';

/**
 * Two-way sync between this laptop's database and the cloud copy.
 *
 * - Upload: every queued change (see outbox.ts) is sent with the time it was
 *   made. The server keeps whichever version is newer (last write wins) and
 *   returns its copy when it kept its own, so this laptop takes it.
 * - Download: rows the server stored since the last download are applied,
 *   unless this laptop has a newer change of its own waiting to upload.
 * - Records are sent whole, as the app stores them. Permanent deletes are sent
 *   as "deleted" markers so other devices remove them too.
 */

/** One change on its way up. */
export interface Change {
  kind: RecordKind;
  id: string;
  data: unknown | null;
  deleted: boolean;
  /** When the change was made (ms). */
  updated_at: number;
}

/** One row as the server stores it. */
export interface ServerRow extends Change {
  /** When the server stored it (ISO timestamp, set by the server). */
  server_updated_at: string;
}

export type SyncErrorKind = 'network' | 'auth' | 'payload' | 'server';

export class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: SyncErrorKind,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/** What the engine needs from the cloud. */
export interface SyncServer {
  /** Stores changes; returns the server's rows for changes it rejected as older. */
  push(changes: Change[]): Promise<ServerRow[]>;
  /** Rows stored after (since, afterKind, afterId), oldest first. */
  pull(since: string, afterKind: string, afterId: string, pageSize: number): Promise<ServerRow[]>;
}

/* --------------------------------- meta --------------------------------- */

/** The account this laptop's data belongs to. */
export const OWNER_KEY = 'sync.owner';
/** Server time of the newest row downloaded. */
export const CURSOR_KEY = 'sync.cursor';
/** When this laptop last finished a sync (ms). */
export const LAST_SYNC_KEY = 'sync.lastSyncedAt';

export async function getMeta<T>(db: ContentDB, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(db: ContentDB, key: string, value: unknown) {
  await db.meta.put({ key, value });
}

/* ------------------------------ comparison ------------------------------ */

/** Deep equality for JSON-like data; a missing key equals an `undefined` one (JSON drops them). */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => sameData(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!sameData(ao[k], bo[k])) return false;
  return true;
}

function laterTimestamp(a: string | null | undefined, b: string): string {
  if (!a) return b;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb > ta ? b : a;
  return b > a ? b : a;
}

/* -------------------------------- apply --------------------------------- */

/**
 * Applies rows from the server. A row is skipped when this laptop has a newer
 * change to the same record waiting to upload; otherwise it replaces the local
 * copy and any older waiting change is dropped. Returns how many records changed.
 */
export async function applyRows(db: ContentDB, rows: ServerRow[]): Promise<number> {
  if (!rows.length) return 0;
  let changed = 0;
  await withoutUpload(db, async () => {
    for (const row of rows) {
      const tableName = TABLE_OF[row.kind];
      if (!tableName) continue; // a kind this version doesn't know
      const key = outboxKey(row.kind, row.id);
      const pending = await db.outbox.get(key);
      if (pending && pending.at > row.updated_at) continue;
      if (pending) await db.outbox.delete(key);

      const table = db.table(tableName);
      if (row.deleted || row.data == null) {
        if (await table.get(row.id)) {
          await table.delete(row.id);
          changed++;
        }
        if (row.kind === 'content') await db.texts.delete(row.id);
        continue;
      }
      const data = row.data as { id?: unknown };
      if (typeof data !== 'object' || data.id !== row.id) continue;
      const current = await table.get(row.id);
      if (current && sameData(current, data)) continue;
      await table.put(data);
      if (row.kind === 'content') await db.texts.put({ id: row.id, text: toPlainText((data as DocContent).json) });
      changed++;
    }
  });
  return changed;
}

/* --------------------------------- push --------------------------------- */

const MAX_BATCH_CHARS = 900_000;
const MAX_BATCH_ROWS = 200;

function batches(changes: Change[]): Change[][] {
  const out: Change[][] = [];
  let current: Change[] = [];
  let size = 0;
  for (const c of changes) {
    const n = JSON.stringify(c).length;
    if (current.length && (size + n > MAX_BATCH_CHARS || current.length >= MAX_BATCH_ROWS)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(c);
    size += n;
  }
  if (current.length) out.push(current);
  return out;
}

async function settle(db: ContentDB, batch: Change[], kept: ServerRow[]) {
  if (kept.length) await applyRows(db, kept);
  await db.transaction('rw', db.outbox, async () => {
    for (const c of batch) {
      const key = outboxKey(c.kind, c.id);
      const entry = await db.outbox.get(key);
      // Only clear it if it wasn't changed again while uploading.
      if (entry && entry.at === c.updated_at) await db.outbox.delete(key);
    }
  });
}

async function markFailed(db: ContentDB, c: Change, message: string) {
  const key = outboxKey(c.kind, c.id);
  await db.transaction('rw', db.outbox, async () => {
    const entry = await db.outbox.get(key);
    if (entry && entry.at === c.updated_at) await db.outbox.put({ ...entry, error: message });
  });
}

export interface PushResult {
  pushed: number;
  failed: number;
}

/** Uploads every waiting change. Network and sign-in problems are thrown; a change the server refuses is marked failed and skipped. */
export async function pushPending(db: ContentDB, server: SyncServer): Promise<PushResult> {
  const entries = (await db.outbox.toArray()).filter((e) => !e.error).sort((a, b) => a.at - b.at);
  if (!entries.length) return { pushed: 0, failed: 0 };

  const tables = SYNC_TABLE_NAMES.map((n) => db.table(n));
  const changes: Change[] = await db.transaction('r', tables, () =>
    Promise.all(
      entries.map(async (e: OutboxEntry): Promise<Change> => {
        const record = await db.table(TABLE_OF[e.kind]).get(e.id);
        return record
          ? { kind: e.kind, id: e.id, data: record, deleted: false, updated_at: e.at }
          : { kind: e.kind, id: e.id, data: null, deleted: true, updated_at: e.at };
      }),
    ),
  );

  let pushed = 0;
  let failed = 0;
  for (const batch of batches(changes)) {
    try {
      await settle(db, batch, await server.push(batch));
      pushed += batch.length;
    } catch (err) {
      if (!(err instanceof SyncError) || err.kind !== 'payload') throw err;
      // Find the change the server refuses; send the others.
      for (const c of batch) {
        try {
          await settle(db, [c], await server.push([c]));
          pushed++;
        } catch (e) {
          if (!(e instanceof SyncError) || e.kind !== 'payload') throw e;
          await markFailed(db, c, e.message);
          failed++;
        }
      }
    }
  }
  return { pushed, failed };
}

/* --------------------------------- pull --------------------------------- */

const PAGE_SIZE = 500;
/** Re-read the last minute each time, in case a slow upload landed just before the cursor. */
const OVERLAP_MS = 60_000;
const EPOCH = '1970-01-01T00:00:00.000Z';

/** Downloads and applies everything stored since the last download. Returns how many records changed. */
export async function pullChanges(db: ContentDB, server: SyncServer, onProgress?: (rows: number) => void): Promise<number> {
  const cursor = await getMeta<string>(db, CURSOR_KEY);
  const t = cursor ? Date.parse(cursor) : NaN;
  let since = Number.isFinite(t) ? new Date(t - OVERLAP_MS).toISOString() : EPOCH;
  let afterKind = '';
  let afterId = '';
  let newest = cursor ?? null;
  let changed = 0;
  let seen = 0;
  for (;;) {
    const rows = await server.pull(since, afterKind, afterId, PAGE_SIZE);
    if (rows.length) {
      changed += await applyRows(db, rows);
      seen += rows.length;
      onProgress?.(seen);
      const last = rows[rows.length - 1];
      since = last.server_updated_at;
      afterKind = last.kind;
      afterId = last.id;
      newest = laterTimestamp(newest, last.server_updated_at);
      await setMeta(db, CURSOR_KEY, newest);
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return changed;
}

/* ------------------------------ ownership ------------------------------- */

export async function hasLocalData(db: ContentDB): Promise<boolean> {
  for (const n of SYNC_TABLE_NAMES) if ((await db.table(n).count()) > 0) return true;
  return false;
}

/**
 * Ties this laptop's data to the signed-in account.
 * - `same`: it already belongs to this account.
 * - `claimed`: data from before accounts existed; all of it is queued for upload.
 * - `fresh`: nothing here yet.
 * - `other`: it belongs to a different account; nothing is changed.
 */
export async function prepareForUser(db: ContentDB, userId: string): Promise<'same' | 'claimed' | 'fresh' | 'other'> {
  return withoutUpload(db, async () => {
    const owner = await getMeta<string>(db, OWNER_KEY);
    if (owner === userId) return 'same';
    if (owner) return 'other';
    let any = false;
    const at = Date.now();
    for (const n of SYNC_TABLE_NAMES) {
      const kind = SYNCED_TABLES[n];
      const ids = (await db.table(n).toCollection().primaryKeys()).map(String);
      if (!ids.length) continue;
      any = true;
      await db.outbox.bulkPut(ids.map((id) => ({ key: outboxKey(kind, id), kind, id, at })));
    }
    await setMeta(db, OWNER_KEY, userId);
    return any ? 'claimed' : 'fresh';
  });
}

/** Removes this laptop's copy and sync state without touching the cloud copy (signing out). */
export async function clearLocal(db: ContentDB) {
  await withoutUpload(db, async () => {
    await Promise.all([
      ...SYNC_TABLE_NAMES.map((n) => db.table(n).clear()),
      db.texts.clear(),
      db.outbox.clear(),
      db.meta.bulkDelete([OWNER_KEY, CURSOR_KEY, LAST_SYNC_KEY]),
    ]);
  });
}
