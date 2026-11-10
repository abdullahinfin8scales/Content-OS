import type { Folder, ID } from './types';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Map key for "children of" — a folder id, or the root of a space. */
export function containerKey(spaceId: ID, folderId: ID | null): string {
  return folderId ?? `root:${spaceId}`;
}

/** All folders nested under `rootId` (not including it). */
export function descendantFolderIds(folders: Folder[], rootId: ID): Set<ID> {
  const byParent = new Map<ID, ID[]>();
  for (const f of folders) {
    if (!f.parentId) continue;
    const list = byParent.get(f.parentId);
    if (list) list.push(f.id);
    else byParent.set(f.parentId, [f.id]);
  }
  const out = new Set<ID>();
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return out;
}

/** Folder chain from the space root down to `folderId` (inclusive). */
export function folderChain(folderById: Map<ID, Folder>, folderId: ID | null): Folder[] {
  const chain: Folder[] = [];
  const seen = new Set<ID>();
  let current = folderId ? folderById.get(folderId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? folderById.get(current.parentId) : undefined;
  }
  return chain;
}

/** True when a folder may be moved under `targetParentId` without creating a cycle. */
export function canNestFolder(folders: Folder[], folderId: ID, targetParentId: ID | null): boolean {
  if (targetParentId === null) return true;
  if (targetParentId === folderId) return false;
  return !descendantFolderIds(folders, folderId).has(targetParentId);
}

/**
 * Where a new document goes when it starts from `location`: a thread is
 * swapped for the place the thread sits in. Posts are added to threads on
 * purpose ("Add post"), never by default.
 */
export function outsideThread<L extends { spaceId: ID; folderId: ID | null }>(folderById: Map<ID, Folder>, location: L): L {
  const folder = location.folderId ? folderById.get(location.folderId) : undefined;
  return folder?.kind === 'thread' ? { ...location, folderId: folder.parentId } : location;
}
