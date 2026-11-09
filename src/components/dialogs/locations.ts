import { containerKey } from '../../lib/tree';
import type { ID, Space } from '../../lib/types';
import type { Workspace } from '../../state/workspace';

export interface LocationOption {
  key: string;
  spaceId: ID;
  folderId: ID | null;
  space: Space;
  label: string;
  path: string;
  depth: number;
}

/** Every space and folder in sidebar order, flattened for pickers. */
export function locationOptions(ws: Workspace, exclude?: Set<ID>): LocationOption[] {
  const out: LocationOption[] = [];
  for (const space of ws.spaces) {
    out.push({ key: `space:${space.id}`, spaceId: space.id, folderId: null, space, label: space.name, path: space.name, depth: 0 });
    const walk = (parentKey: string, depth: number, path: string) => {
      for (const folder of ws.foldersIn.get(parentKey) ?? []) {
        if (exclude?.has(folder.id)) continue;
        const p = `${path} / ${folder.name}`;
        out.push({ key: `folder:${folder.id}`, spaceId: space.id, folderId: folder.id, space, label: folder.name, path: p, depth });
        walk(folder.id, depth + 1, p);
      }
    };
    walk(containerKey(space.id, null), 1, space.name);
  }
  return out;
}

export function optionKey(spaceId: ID, folderId: ID | null) {
  return folderId ? `folder:${folderId}` : `space:${spaceId}`;
}
