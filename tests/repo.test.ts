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
