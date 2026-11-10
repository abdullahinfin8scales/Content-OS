import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContentDB } from '../src/lib/db';
import { Repo } from '../src/lib/repo';
import type { RichNode } from '../src/lib/types';

let db: ContentDB;
let repo: Repo;
let n = 0;

beforeEach(async () => {
  db = new ContentDB(`test-${++n}-${Math.random()}`);
  await db.open();
  repo = new Repo(db);
});

const textDoc = (s: string): RichNode => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: s }] }] });

describe('spaces', () => {
  it('appends new spaces and reorders them', async () => {
    const a = await repo.createSpace({ name: 'A' });
    const b = await repo.createSpace({ name: 'B' });
    const c = await repo.createSpace({ name: '  ' });
    expect(c.name).toBe('Untitled space');
    expect([a.order, b.order, c.order]).toEqual([0, 1, 2]);
    await repo.reorderSpace(c.id, -1);
    const sorted = (await db.spaces.toArray()).sort((x, y) => x.order - y.order).map((s) => s.name);
    expect(sorted).toEqual(['A', 'Untitled space', 'B']);
    await repo.reorderSpace(a.id, -1); // already first: no-op
    expect((await db.spaces.get(a.id))!.order).toBe(0);
  });
});

describe('folders', () => {
  it('nests folders and refuses cycles', async () => {
    const s = await repo.createSpace({ name: 'S' });
    const a = await repo.createFolder({ spaceId: s.id, name: 'A' });
    const b = await repo.createFolder({ spaceId: s.id, parentId: a.id, name: 'B' });
    const c = await repo.createFolder({ spaceId: s.id, parentId: b.id, name: 'C' });
    await expect(repo.moveFolder(a.id, { spaceId: s.id, parentId: c.id })).rejects.toThrow(/into itself/);
    await expect(repo.moveFolder(a.id, { spaceId: s.id, parentId: a.id })).rejects.toThrow(/into itself/);
    await repo.moveFolder(c.id, { spaceId: s.id, parentId: null });
    expect((await db.folders.get(c.id))!.parentId).toBeNull();
  });

  it('carries nested folders and docs when moving to another space', async () => {
    const s1 = await repo.createSpace({ name: 'One' });
    const s2 = await repo.createSpace({ name: 'Two' });
    const a = await repo.createFolder({ spaceId: s1.id, name: 'A' });
    const b = await repo.createFolder({ spaceId: s1.id, parentId: a.id, name: 'B' });
    const d1 = await repo.createDoc({ spaceId: s1.id, folderId: a.id });
    const d2 = await repo.createDoc({ spaceId: s1.id, folderId: b.id });
    const outside = await repo.createDoc({ spaceId: s1.id });

    await repo.moveFolder(a.id, { spaceId: s2.id, parentId: null });

    expect((await db.folders.get(a.id))!.spaceId).toBe(s2.id);
    expect((await db.folders.get(b.id))!.spaceId).toBe(s2.id);
    expect((await db.docs.get(d1.id))!.spaceId).toBe(s2.id);
    expect((await db.docs.get(d2.id))!.spaceId).toBe(s2.id);
    expect((await db.docs.get(outside.id))!.spaceId).toBe(s1.id);
  });

  it('takes the destination space from the parent folder', async () => {
    const s1 = await repo.createSpace({ name: 'One' });
    const s2 = await repo.createSpace({ name: 'Two' });
    const target = await repo.createFolder({ spaceId: s2.id, name: 'Target' });
    const f = await repo.createFolder({ spaceId: s1.id, name: 'F' });
    await repo.moveFolder(f.id, { spaceId: s1.id, parentId: target.id });
    const moved = (await db.folders.get(f.id))!;
    expect(moved.spaceId).toBe(s2.id);
    expect(moved.parentId).toBe(target.id);
  });

  it('ignores a parent from another space when creating', async () => {
    const s1 = await repo.createSpace({ name: 'One' });
    const s2 = await repo.createSpace({ name: 'Two' });
    const other = await repo.createFolder({ spaceId: s2.id });
    const f = await repo.createFolder({ spaceId: s1.id, parentId: other.id });
    expect(f.parentId).toBeNull();
  });
});

describe('docs', () => {
  it('creates, saves content and derives counts', async () => {
    const s = await repo.createSpace({ name: 'S' });
    const d = await repo.createDoc({ spaceId: s.id, title: 'Hello' });
    expect(d.status).toBe('drafting');
    await repo.saveContent(d.id, textDoc('Three little words'));
    const saved = (await db.docs.get(d.id))!;
    expect(saved.wordCount).toBe(3);
    expect(saved.excerpt).toBe('Three little words');
    expect((await db.texts.get(d.id))!.text).toBe('Three little words');
    expect((await repo.getContent(d.id))!.json).toEqual(textDoc('Three little words'));
  });

  it('moves docs between folders and spaces', async () => {
    const s1 = await repo.createSpace({ name: 'One' });
    const s2 = await repo.createSpace({ name: 'Two' });
    const f2 = await repo.createFolder({ spaceId: s2.id });
    const d = await repo.createDoc({ spaceId: s1.id });
    await repo.moveDoc(d.id, { spaceId: s1.id, folderId: f2.id });
    const moved = (await db.docs.get(d.id))!;
    expect(moved.spaceId).toBe(s2.id);
    expect(moved.folderId).toBe(f2.id);
  });

  it('creates from a template and duplicates as a fresh draft', async () => {
    const s = await repo.createSpace({ name: 'S' });
    const logged = await repo.createFromTemplate('log-post', { spaceId: s.id });
    expect(logged.status).toBe('posted');
    expect(logged.publishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await repo.updateDoc(logged.id, { title: 'Live', postUrl: 'https://a.b', metrics: { views: 10 }, tags: [' x ', 'x', ''] });
    expect((await db.docs.get(logged.id))!.tags).toEqual(['x']);
    const copy = await repo.duplicateDoc(logged.id);
    expect(copy.title).toBe('Live (copy)');
    expect(copy.status).toBe('drafting');
    expect(copy.postUrl).toBe('');
    expect(copy.metrics).toEqual({});
    expect(copy.publishDate).toBeNull();
  });
});

describe('trash', () => {
  it('cascades folder deletion and restores only what was deleted together', async () => {
    const s = await repo.createSpace({ name: 'S' });
    const a = await repo.createFolder({ spaceId: s.id, name: 'A' });
    const b = await repo.createFolder({ spaceId: s.id, parentId: a.id, name: 'B' });
    const earlier = await repo.createDoc({ spaceId: s.id, folderId: b.id });
    const later = await repo.createDoc({ spaceId: s.id, folderId: b.id });

    await repo.trash('doc', earlier.id);
    await repo.trash('folder', a.id);

    expect((await db.folders.get(b.id))!.trashRootId).toBe(a.id);
    expect((await db.docs.get(later.id))!.trashRootId).toBe(a.id);
    expect((await db.docs.get(earlier.id))!.trashRootId).toBe(earlier.id);

    await repo.restore('folder', a.id);
    expect((await db.folders.get(a.id))!.deletedAt).toBeNull();
    expect((await db.folders.get(b.id))!.deletedAt).toBeNull();
    expect((await db.docs.get(later.id))!.deletedAt).toBeNull();
    expect((await db.docs.get(earlier.id))!.deletedAt).not.toBeNull();
  });

  it('restores a doc to the space root when its folder is gone', async () => {
    const s = await repo.createSpace({ name: 'S' });
    const f = await repo.createFolder({ spaceId: s.id });
    const d = await repo.createDoc({ spaceId: s.id, folderId: f.id });
    await repo.trash('doc', d.id);
    await repo.trash('folder', f.id);
    await repo.purge('folder', f.id);
    expect(await db.folders.get(f.id)).toBeUndefined();
    await repo.restore('doc', d.id);
    const restored = (await db.docs.get(d.id))!;
    expect(restored.deletedAt).toBeNull();
    expect(restored.folderId).toBeNull();
    expect(restored.spaceId).toBe(s.id);
  });

  it('restores into a live space when the original space is gone', async () => {
    const s1 = await repo.createSpace({ name: 'One' });
    const d = await repo.createDoc({ spaceId: s1.id });
    await repo.trash('doc', d.id);
    await repo.trash('space', s1.id);
    await repo.purge('space', s1.id);
    await repo.restore('doc', d.id);
    const restored = (await db.docs.get(d.id))!;
    const space = (await db.spaces.get(restored.spaceId))!;
    expect(space.name).toBe('Restored');
    expect(space.deletedAt).toBeNull();
  });

  it('trashes and restores a whole space', async () => {
    const s = await repo.createSpace({ name: 'S' });
    const f = await repo.createFolder({ spaceId: s.id });
    const d = await repo.createDoc({ spaceId: s.id, folderId: f.id });
    await repo.trash('space', s.id);
    expect((await db.docs.get(d.id))!.trashRootId).toBe(s.id);
    await repo.restore('space', s.id);
    expect((await db.spaces.get(s.id))!.deletedAt).toBeNull();
    expect((await db.folders.get(f.id))!.deletedAt).toBeNull();
    expect((await db.docs.get(d.id))!.deletedAt).toBeNull();
  });

  it('purges content with the doc, and empties the trash', async () => {
    const s = await repo.createSpace({ name: 'S' });
    const d1 = await repo.createDoc({ spaceId: s.id });
    const d2 = await repo.createDoc({ spaceId: s.id });
    const keep = await repo.createDoc({ spaceId: s.id });
    await repo.trash('doc', d1.id);
    await repo.purge('doc', d1.id);
    expect(await db.contents.get(d1.id)).toBeUndefined();
    expect(await db.texts.get(d1.id)).toBeUndefined();
    await repo.trash('doc', d2.id);
    await repo.emptyTrash();
    expect(await db.docs.get(d2.id)).toBeUndefined();
    expect(await db.docs.get(keep.id)).toBeDefined();
  });
});

describe('fresh install', () => {
  it('starts with no spaces, folders or documents', async () => {
    expect(await db.spaces.count()).toBe(0);
    expect(await db.folders.count()).toBe(0);
    expect(await db.docs.count()).toBe(0);
  });
});

describe('threads', () => {
  const titles = async (threadId: string) => (await repo.threadPosts(threadId)).map((d) => d.title);

  it('starts a thread where the post is and adds the next post after it', async () => {
    const s = await repo.createSpace({ name: 'S' });
    const f = await repo.createFolder({ spaceId: s.id, name: 'Scripts' });
    const first = await repo.createDoc({ spaceId: s.id, folderId: f.id, title: 'Hook', platforms: ['x'], status: 'scheduled', publishDate: '2026-11-20' });
    const second = await repo.addPostAfter(first.id);
    const thread = (await db.folders.get(second.folderId!))!;
    expect(thread.kind).toBe('thread');
    expect(thread.parentId).toBe(f.id);
    expect(thread.name).toBe('Hook');
    expect(second.platforms).toEqual(['x']);
    expect(second.status).toBe('scheduled');
    expect(second.publishDate).toBe('2026-11-20');
    await repo.updateDoc(second.id, { title: 'Two' });
    const middle = await repo.addPostAfter(first.id);
    await repo.updateDoc(middle.id, { title: 'Between' });
    expect(await titles(thread.id)).toEqual(['Hook', 'Between', 'Two']);
  });

  it('connects an existing post, reorders, and detaches', async () => {
    const s1 = await repo.createSpace({ name: 'One' });
    const s2 = await repo.createSpace({ name: 'Two' });
    const a = await repo.createDoc({ spaceId: s1.id, title: 'A' });
    const b = await repo.createDoc({ spaceId: s2.id, title: 'B' });
    const c = await repo.createDoc({ spaceId: s1.id, title: 'C' });
    await repo.connectAfter(a.id, c.id);
    await repo.connectAfter(a.id, b.id);
    const thread = (await db.docs.get(a.id))!.folderId!;
    expect(await titles(thread)).toEqual(['A', 'B', 'C']);
    expect((await db.docs.get(b.id))!.spaceId).toBe(s1.id);

    await repo.movePost(c.id, -1);
    expect(await titles(thread)).toEqual(['A', 'C', 'B']);
    await repo.movePost(a.id, -1); // already first: no-op
    expect(await titles(thread)).toEqual(['A', 'C', 'B']);

    await repo.detachPost(c.id);
    expect(await titles(thread)).toEqual(['A', 'B']);
    const detached = (await db.docs.get(c.id))!;
    expect(detached.folderId).toBeNull();
    expect(detached.position).toBeUndefined();
    await expect(repo.connectAfter(a.id, a.id)).rejects.toThrow(/itself/);
  });

  it('keeps folders out of threads and appends posts moved in', async () => {
    const s = await repo.createSpace({ name: 'S' });
    const a = await repo.createDoc({ spaceId: s.id, title: 'A' });
    const thread = await repo.ensureThread(a.id);
    expect(await repo.ensureThread(a.id)).toEqual(thread);
    await expect(repo.createFolder({ spaceId: s.id, parentId: thread.id })).rejects.toThrow(/posts only/);
    const f = await repo.createFolder({ spaceId: s.id });
    await expect(repo.moveFolder(f.id, { spaceId: s.id, parentId: thread.id })).rejects.toThrow(/inside a thread/);
    const z = await repo.createDoc({ spaceId: s.id, title: 'Z' });
    await repo.moveDoc(z.id, { spaceId: s.id, folderId: thread.id });
    const fresh = await repo.createDoc({ spaceId: s.id, folderId: thread.id, title: 'New' });
    expect(await titles(thread.id)).toEqual(['A', 'Z', 'New']);
    expect(fresh.position).toBe(2);
  });

  it('trashes and restores a thread with its posts', async () => {
    const s = await repo.createSpace({ name: 'S' });
    const a = await repo.createDoc({ spaceId: s.id, title: 'A' });
    const b = await repo.addPostAfter(a.id);
    await repo.trash('folder', b.folderId!);
    expect((await db.docs.get(a.id))!.deletedAt).not.toBeNull();
    await repo.restore('folder', b.folderId!);
    expect((await repo.threadPosts(b.folderId!)).map((d) => d.id)).toEqual([a.id, b.id]);
  });
});

describe('custom platforms', () => {
  it('adds, updates and removes a platform, taking it off posts', async () => {
    const s = await repo.createSpace({ name: 'S' });
    const p = await repo.createPlatform({ name: ' Bluesky ', url: 'https://bsky.app/', domain: 'bsky.app', icon: { kind: 'monogram', text: 'B' }, limit: 300.4 });
    expect(p.id.startsWith('custom-')).toBe(true);
    expect(p.name).toBe('Bluesky');
    expect(p.limit).toBe(300);
    await repo.updatePlatform(p.id, { limit: -5 });
    expect((await db.platforms.get(p.id))!.limit).toBeNull();
    const d = await repo.createDoc({ spaceId: s.id, platforms: ['x', p.id] });
    expect(await repo.deletePlatform(p.id)).toBe(1);
    expect((await db.docs.get(d.id))!.platforms).toEqual(['x']);
    expect(await db.platforms.count()).toBe(0);
  });
});
