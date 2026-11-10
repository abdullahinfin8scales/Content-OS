import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BackupError, exportBackup, parseBackup, restoreBackup } from '../src/lib/backup';
import { ContentDB } from '../src/lib/db';
import { Repo } from '../src/lib/repo';

const fresh = async () => {
  const db = new ContentDB(`backup-${Math.random()}`);
  await db.open();
  return { db, repo: new Repo(db) };
};

describe('backup', () => {
  it('round-trips through JSON into a fresh database', async () => {
    const a = await fresh();
    const home = await a.repo.createSpace({ name: 'Personal Brand' });
    await a.repo.createFolder({ spaceId: home.id, name: 'Ideas' });
    await a.repo.createDoc({ spaceId: home.id, title: 'Notes', kind: 'note' });
    const s = await a.repo.createSpace({ name: 'Client', color: 'violet' });
    const d = await a.repo.createFromTemplate('short-video', { spaceId: s.id });
    await a.repo.updateDoc(d.id, { title: 'Reel', tags: ['hooks'], metrics: { views: 1200 } });

    const json = JSON.parse(JSON.stringify(await exportBackup(a.db)));
    const b = await fresh();
    await b.repo.createSpace({ name: 'Will be replaced' });
    await restoreBackup(b.db, parseBackup(json));

    expect((await b.db.spaces.toArray()).map((x) => x.name).sort()).toEqual(['Client', 'Personal Brand']);
    const reel = (await b.db.docs.get(d.id))!;
    expect(reel.title).toBe('Reel');
    expect(reel.metrics.views).toBe(1200);
    expect(await b.db.contents.get(d.id)).toBeDefined();
    expect(await b.db.texts.get(d.id)).toBeDefined();
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup({ hello: 'world' })).toThrow(BackupError);
    expect(() => parseBackup({ app: 'infin8-content-os', version: 99, spaces: [], folders: [], docs: [], contents: [] })).toThrow(/newer/);
    expect(() => parseBackup({ app: 'infin8-content-os', version: 1, spaces: [] })).toThrow(/missing/);
  });

  it('repairs dangling references and bad field values', () => {
    const parsed = parseBackup({
      app: 'infin8-content-os',
      version: 1,
      spaces: [{ id: 's1', name: 'S', color: 'neon' }],
      folders: [
        { id: 'f1', spaceId: 's1', parentId: 'ghost' },
        { id: 'f2', spaceId: 'nope' },
      ],
      docs: [
        { id: 'd1', spaceId: 's1', folderId: 'f2', status: 'viral', platforms: ['x', 'myspace', 'x'], publishDate: 'tomorrow' },
        { id: 'd2', spaceId: 'missing' },
      ],
      contents: [{ id: 'd1', json: { type: 'doc', content: [] } }, { id: 'd2', json: {} }, 'junk'],
    });
    expect(parsed.spaces[0].color).toBe('white');
    expect(parsed.folders.map((f) => f.id)).toEqual(['f1']);
    expect(parsed.folders[0].parentId).toBeNull();
    expect(parsed.docs.map((d) => d.id)).toEqual(['d1']);
    expect(parsed.docs[0].folderId).toBeNull();
    expect(parsed.docs[0].status).toBe('drafting');
    expect(parsed.docs[0].platforms).toEqual(['x']);
    expect(parsed.docs[0].publishDate).toBeNull();
    expect(parsed.contents.map((c) => c.id)).toEqual(['d1']);
  });
});
