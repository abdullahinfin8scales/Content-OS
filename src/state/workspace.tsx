import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { compareNames, containerKey } from '../lib/tree';
import type { Doc, Folder, ID, Space } from '../lib/types';
import { db } from './repo';

export interface Workspace {
  spaces: Space[];
  folders: Folder[];
  docs: Doc[];
  trash: { spaces: Space[]; folders: Folder[]; docs: Doc[] };
  spaceById: Map<ID, Space>;
  folderById: Map<ID, Folder>;
  docById: Map<ID, Doc>;
  /** Live folders keyed by parent folder id, or `root:<spaceId>`; sorted by name. */
  foldersIn: Map<string, Folder[]>;
  /** Live docs keyed by folder id, or `root:<spaceId>`; newest first. */
  docsIn: Map<string, Doc[]>;
  allTags: string[];
}

function group<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function build(raw: { spaces: Space[]; folders: Folder[]; docs: Doc[] }): Workspace {
  const spaces = raw.spaces.filter((s) => !s.deletedAt).sort((a, b) => a.order - b.order);
  const liveSpaceIds = new Set(spaces.map((s) => s.id));
  const folders = raw.folders.filter((f) => !f.deletedAt && liveSpaceIds.has(f.spaceId));
  const docs = raw.docs.filter((d) => !d.deletedAt && liveSpaceIds.has(d.spaceId));

  const foldersIn = group(folders, (f) => containerKey(f.spaceId, f.parentId));
  for (const list of foldersIn.values()) list.sort((a, b) => compareNames(a.name, b.name));
  const docsIn = group(docs, (d) => containerKey(d.spaceId, d.folderId));
  for (const list of docsIn.values()) list.sort((a, b) => b.createdAt - a.createdAt);

  const tags = new Set<string>();
  for (const d of docs) for (const t of d.tags) tags.add(t);

  return {
    spaces,
    folders,
    docs,
    trash: {
      spaces: raw.spaces.filter((s) => s.deletedAt),
      folders: raw.folders.filter((f) => f.deletedAt),
      docs: raw.docs.filter((d) => d.deletedAt),
    },
    spaceById: new Map(raw.spaces.map((s) => [s.id, s])),
    folderById: new Map(raw.folders.map((f) => [f.id, f])),
    docById: new Map(raw.docs.map((d) => [d.id, d])),
    foldersIn,
    docsIn,
    allTags: [...tags].sort(compareNames),
  };
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const raw = useLiveQuery(
    () =>
      db.transaction('r', db.spaces, db.folders, db.docs, async () => ({
        spaces: await db.spaces.toArray(),
        folders: await db.folders.toArray(),
        docs: await db.docs.toArray(),
      })),
    [],
  );
  const workspace = useMemo(() => (raw ? build(raw) : null), [raw]);
  if (!workspace) return <>{fallback}</>;
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Workspace {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ws;
}
