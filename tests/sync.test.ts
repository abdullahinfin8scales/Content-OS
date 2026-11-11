import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContentDB } from '../src/lib/db';
import { Repo } from '../src/lib/repo';
import type { RichNode } from '../src/lib/types';
import {
  applyRows,
  clearLocal,
  OWNER_KEY,
  prepareForUser,
  pullChanges,
  pushPending,
  sameData,
  SyncError,
  type Change,
  type ServerRow,
  type SyncServer,
} from '../src/sync/engine';
import { trackChanges } from '../src/sync/outbox';

/** Behaves like the SQL in supabase/migrations: JSON storage, last write wins, keyset pages. */
class FakeServer implements SyncServer {
  rows = new Map<string, ServerRow>();
  private tick = 0;
  failNext: SyncError | null = null;
  refuse: ((c: Change) => boolean) | null = null;
  duringPush: (() => Promise<void>) | null = null;

  private now() {
    this.tick += 1;
    return new Date(Date.UTC(2026, 0, 1) + this.tick * 1000).toISOString();
  }

  async push(changes: Change[]): Promise<ServerRow[]> {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    if (this.refuse && changes.some(this.refuse)) throw new SyncError('Request too large', 'payload');
    if (this.duringPush) {
      const f = this.duringPush;
      this.duringPush = null;
      await f();
    }
    const latest = new Map<string, Change>();
    for (const c of changes) {
      const k = `${c.kind}:${c.id}`;
      const prev = latest.get(k);
      if (!prev || c.updated_at > prev.updated_at) latest.set(k, c);
    }
    const ts = this.now();
    const kept: ServerRow[] = [];
    for (const [k, c] of latest) {
      const cur = this.rows.get(k);
      if (cur && cur.updated_at > c.updated_at) {
        kept.push(JSON.parse(JSON.stringify(cur)));
        continue;
      }
      const data = c.deleted || c.data == null ? null : JSON.parse(JSON.stringify(c.data));
      this.rows.set(k, { kind: c.kind, id: c.id, data, deleted: c.deleted, updated_at: c.updated_at, server_updated_at: ts });
    }
    return kept;
  }

  async pull(since: string, afterKind: string, afterId: string, pageSize: number): Promise<ServerRow[]> {
    const key = (r: { server_updated_at: string; kind: string; id: string }) => [Date.parse(r.server_updated_at), r.kind, r.id] as const;
    const cmp = (a: readonly [number, string, string], b: readonly [number, string, string]) =>
      a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
    const from = [Date.parse(since), afterKind, afterId] as const;
    return [...this.rows.values()]
      .filter((r) => cmp(key(r), from) > 0)
      .sort((a, b) => cmp(key(a), key(b)))
      .slice(0, pageSize)
      .map((r) => JSON.parse(JSON.stringify(r)));
  }
}

let n = 0;
function device() {
  const db = new ContentDB(`sync-${++n}-${Math.random()}`);
  trackChanges(db);
  return { db, repo: new Repo(db) };
}

const text = (s: string): RichNode => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: s }] }] });
const outboxKeys = async (db: ContentDB) => (await db.outbox.toArray()).map((e) => e.key).sort();

let server: FakeServer;
beforeEach(() => {
  server = new FakeServer();
});

describe('change tracking', () => {
  it('queues every kind of write for upload, and nothing device-only', async () => {
    const { db, repo } = device();
    const space = await repo.createSpace({ name: 'Brand' });
    const doc = await repo.createDoc({ spaceId: space.id, title: 'Hello', content: text('Hi') });
    const platform = await repo.createPlatform({ name: 'Bluesky', url: 'https://bsky.app', domain: 'bsky.app', icon: { kind: 'monogram', text: 'B' }, limit: 300 });
    await db.meta.put({ key: 'something', value: 1 });
    expect(await outboxKeys(db)).toEqual([`content:${doc.id}`, `doc:${doc.id}`, `platform:${platform.id}`, `space:${space.id}`].sort());

    await db.outbox.clear();
    await repo.ensureThread(doc.id); // thread order etc. don't touch updatedAt everywhere
    await db.platforms.clear(); // range delete
    const keys = await outboxKeys(db);
    expect(keys).toContain(`doc:${doc.id}`);
    expect(keys).toContain(`platform:${platform.id}`);
    expect(keys.some((k) => k.startsWith('folder:'))).toBe(true);
    expect(keys.some((k) => k.startsWith('text'))).toBe(false);
  });
});

describe('two devices', () => {
  it('uploads, downloads, edits both ways and passes deletes on', async () => {
    const a = device();
    const b = device();
    const space = await a.repo.createSpace({ name: 'Brand' });
    const doc = await a.repo.createDoc({ spaceId: space.id, title: 'Draft', content: text('First line') });

    expect(await pushPending(a.db, server)).toEqual({ pushed: 3, failed: 0 });
    expect(await a.db.outbox.count()).toBe(0);

    await pullChanges(b.db, server);
    expect((await b.db.docs.get(doc.id))?.title).toBe('Draft');
    expect((await b.db.texts.get(doc.id))?.text).toBe('First line');
    expect(await b.db.outbox.count()).toBe(0); // downloads are not echoed back

    await b.repo.updateDoc(doc.id, { title: 'Edited on B' });
    await b.repo.saveContent(doc.id, text('Second line'));
    await pushPending(b.db, server);
    await pullChanges(a.db, server);
    expect((await a.db.docs.get(doc.id))?.title).toBe('Edited on B');
    expect((await a.db.texts.get(doc.id))?.text).toBe('Second line');

    await a.repo.trash('doc', doc.id);
    await a.repo.purge('doc', doc.id);
    await pushPending(a.db, server);
    expect(server.rows.get(`doc:${doc.id}`)).toMatchObject({ deleted: true, data: null });
    await pullChanges(b.db, server);
    expect(await b.db.docs.get(doc.id)).toBeUndefined();
    expect(await b.db.contents.get(doc.id)).toBeUndefined();
    expect(await b.db.texts.get(doc.id)).toBeUndefined();
  });

  it('keeps a newer local change over an older download', async () => {
    const a = device();
    const b = device();
    const space = await a.repo.createSpace({ name: 'Brand' });
    await pushPending(a.db, server);
    await pullChanges(b.db, server);

    await b.repo.updateSpace(space.id, { name: 'From B' });
    await pushPending(b.db, server);
    await new Promise((r) => setTimeout(r, 5));
    await a.repo.updateSpace(space.id, { name: 'From A, later' }); // not uploaded yet
    await pullChanges(a.db, server);
    expect((await a.db.spaces.get(space.id))?.name).toBe('From A, later');

    await pushPending(a.db, server);
    await pullChanges(b.db, server);
    expect((await b.db.spaces.get(space.id))?.name).toBe('From A, later');
  });

  it('takes the server copy when the server has a newer one', async () => {
    const a = device();
    const space = await a.repo.createSpace({ name: 'Old' });
    await pushPending(a.db, server);
    const row = server.rows.get(`space:${space.id}`)!;
    server.rows.set(`space:${space.id}`, { ...row, data: { ...(row.data as object), name: 'Newer elsewhere' }, updated_at: Date.now() + 60_000 });

    await a.repo.updateSpace(space.id, { name: 'Stale edit' });
    await pushPending(a.db, server);
    expect((await a.db.spaces.get(space.id))?.name).toBe('Newer elsewhere');
    expect(await a.db.outbox.count()).toBe(0);
  });

  it('uploads a change made while an upload was in flight', async () => {
    const a = device();
    const space = await a.repo.createSpace({ name: 'One' });
    server.duringPush = async () => {
      await new Promise((r) => setTimeout(r, 5));
      await a.repo.updateSpace(space.id, { name: 'Two' });
    };
    await pushPending(a.db, server);
    expect(await a.db.outbox.count()).toBe(1);
    await pushPending(a.db, server);
    expect((server.rows.get(`space:${space.id}`)!.data as { name: string }).name).toBe('Two');
    expect(await a.db.outbox.count()).toBe(0);
  });

  it('downloads more than one page, even when rows share a timestamp', async () => {
    const b = device();
    const ts = new Date(Date.UTC(2026, 0, 2)).toISOString();
    for (let i = 0; i < 1203; i++) {
      const id = `p${String(i).padStart(4, '0')}`;
      server.rows.set(`platform:${id}`, {
        kind: 'platform',
        id,
        data: { id, name: `P${i}`, url: '', domain: '', icon: { kind: 'monogram', text: 'P' }, limit: null, createdAt: 1, updatedAt: 1 },
        deleted: false,
        updated_at: 1,
        server_updated_at: ts,
      });
    }
    await pullChanges(b.db, server);
    expect(await b.db.platforms.count()).toBe(1203);
    expect(await b.db.outbox.count()).toBe(0);
  });
});

describe('failures', () => {
  it('keeps changes queued when the network fails', async () => {
    const a = device();
    await a.repo.createSpace({ name: 'Brand' });
    server.failNext = new SyncError('Failed to fetch', 'network');
    await expect(pushPending(a.db, server)).rejects.toMatchObject({ kind: 'network' });
    expect(await a.db.outbox.count()).toBe(1);
    await pushPending(a.db, server);
    expect(await a.db.outbox.count()).toBe(0);
  });

  it('a record the server refuses does not block the others, and is retried after the next edit', async () => {
    const a = device();
    const space = await a.repo.createSpace({ name: 'Brand' });
    const big = await a.repo.createDoc({ spaceId: space.id, title: 'Huge' });
    server.refuse = (c) => c.id === big.id && c.kind === 'content';
    expect(await pushPending(a.db, server)).toEqual({ pushed: 2, failed: 1 });
    const stuck = await a.db.outbox.toArray();
    expect(stuck.map((e) => e.key)).toEqual([`content:${big.id}`]);
    expect(stuck[0].error).toBe('Request too large');
    expect(await pushPending(a.db, server)).toEqual({ pushed: 0, failed: 0 }); // not retried on its own

    server.refuse = null;
    await a.repo.saveContent(big.id, text('Smaller now'));
    await pushPending(a.db, server);
    expect(await a.db.outbox.count()).toBe(0);
  });
});

describe('accounts on this laptop', () => {
  it('claims data from before accounts, then recognises its owner', async () => {
    const a = device();
    const space = await a.repo.createSpace({ name: 'Old posts' });
    await a.db.outbox.clear(); // as if written before change tracking existed
    expect(await prepareForUser(a.db, 'user-1')).toBe('claimed');
    expect(await outboxKeys(a.db)).toEqual([`space:${space.id}`]);
    expect(await prepareForUser(a.db, 'user-1')).toBe('same');
    expect(await prepareForUser(a.db, 'user-2')).toBe('other');
    expect((await a.db.meta.get(OWNER_KEY))?.value).toBe('user-1');

    const empty = device();
    expect(await prepareForUser(empty.db, 'user-1')).toBe('fresh');
  });

  it('signing out clears this laptop but never deletes the cloud copy', async () => {
    const a = device();
    const space = await a.repo.createSpace({ name: 'Brand' });
    await a.repo.createDoc({ spaceId: space.id, title: 'Keep me' });
    await prepareForUser(a.db, 'user-1');
    await pushPending(a.db, server);
    const before = JSON.stringify([...server.rows.values()]);

    await clearLocal(a.db);
    expect(await a.db.docs.count()).toBe(0);
    expect(await a.db.outbox.count()).toBe(0);
    expect(await a.db.meta.get(OWNER_KEY)).toBeUndefined();
    await pushPending(a.db, server);
    expect(JSON.stringify([...server.rows.values()])).toBe(before);

    expect(await prepareForUser(a.db, 'user-1')).toBe('fresh');
    await pullChanges(a.db, server);
    expect((await a.db.docs.toArray()).map((d) => d.title)).toEqual(['Keep me']);
  });
});

describe('helpers', () => {
  it('compares data the way JSON stores it', () => {
    expect(sameData({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameData({ a: 1, position: undefined }, { a: 1 })).toBe(true);
    expect(sameData({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameData([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(sameData(null, {})).toBe(false);
  });

  it('ignores unknown kinds and malformed rows', async () => {
    const b = device();
    const rows = [
      { kind: 'mystery', id: 'x', data: { id: 'x' }, deleted: false, updated_at: 1, server_updated_at: '2026-01-01T00:00:00Z' },
      { kind: 'space', id: 'y', data: { id: 'not-y' }, deleted: false, updated_at: 1, server_updated_at: '2026-01-01T00:00:00Z' },
    ] as unknown as ServerRow[];
    expect(await applyRows(b.db, rows)).toBe(0);
    expect(await b.db.spaces.count()).toBe(0);
  });
});
