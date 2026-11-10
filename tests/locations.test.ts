import { describe, expect, it } from 'vitest';
import { locationOptions } from '../src/components/dialogs/locations';
import { containerKey, outsideThread } from '../src/lib/tree';
import type { Folder, Space } from '../src/lib/types';
import type { Workspace } from '../src/state/workspace';

const space = { id: 's1', name: 'Personal brand', order: 0 } as Space;
const folder = (id: string, parentId: string | null, name: string, kind?: 'thread'): Folder =>
  ({ id, spaceId: 's1', parentId, name, ...(kind ? { kind } : {}), createdAt: 0, updatedAt: 0, deletedAt: null, trashRootId: null }) as Folder;

const reels = folder('f1', null, 'Reels');
const thread = folder('t1', 'f1', 'Why I post', 'thread');
const folderById = new Map([reels, thread].map((f) => [f.id, f]));
const ws = {
  spaces: [space],
  foldersIn: new Map([
    [containerKey('s1', null), [reels]],
    ['f1', [thread]],
  ]),
} as unknown as Workspace;

describe('new documents and threads', () => {
  it('puts new documents next to a thread, not inside it', () => {
    expect(outsideThread(folderById, { spaceId: 's1', folderId: 't1' })).toEqual({ spaceId: 's1', folderId: 'f1' });
    expect(outsideThread(folderById, { spaceId: 's1', folderId: 'f1' })).toEqual({ spaceId: 's1', folderId: 'f1' });
    expect(outsideThread(folderById, { spaceId: 's1', folderId: null })).toEqual({ spaceId: 's1', folderId: null });
  });

  it('offers threads as destinations only when asked (documents, not folders)', () => {
    expect(locationOptions(ws).map((o) => o.label)).toEqual(['Personal brand', 'Reels']);
    const withThreads = locationOptions(ws, { threads: true });
    expect(withThreads.map((o) => [o.label, o.thread])).toEqual([
      ['Personal brand', false],
      ['Reels', false],
      ['Why I post', true],
    ]);
    expect(locationOptions(ws, { threads: true, exclude: new Set(['f1']) }).map((o) => o.label)).toEqual(['Personal brand']);
  });
});
