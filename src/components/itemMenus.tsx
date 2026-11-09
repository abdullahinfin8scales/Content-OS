import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  CopyPlus,
  FilePlus,
  FileText,
  FolderInput,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Trash,
} from 'lucide-react';
import { navigate, paths } from '../lib/router';
import type { Doc, Folder, Space } from '../lib/types';
import {
  copyDocText,
  duplicateDoc,
  newFolder,
  openNewDocDialog,
  quickNewDoc,
  trashItem,
} from '../state/actions';
import type { MenuItem } from '../state/feedback';
import { repo } from '../state/repo';
import { useUI } from '../state/ui';
import type { Workspace } from '../state/workspace';

const I = 15;

export function newItemsMenu(ws: Workspace, spaceId: string, folderId: string | null): MenuItem[] {
  return [
    { label: 'New document', icon: <FilePlus size={I} />, onSelect: () => void quickNewDoc(ws, { spaceId, folderId }) },
    { label: 'New from template…', icon: <LayoutGrid size={I} />, onSelect: () => openNewDocDialog({ spaceId, folderId }) },
    { label: folderId ? 'New subfolder' : 'New folder', icon: <FolderPlus size={I} />, onSelect: () => void newFolder(spaceId, folderId, ws) },
  ];
}

export function spaceMenu(ws: Workspace, space: Space): MenuItem[] {
  const index = ws.spaces.findIndex((s) => s.id === space.id);
  return [
    ...newItemsMenu(ws, space.id, null),
    { type: 'separator' },
    { label: 'Rename', icon: <Pencil size={I} />, onSelect: () => useUI.getState().set({ renamingId: space.id }) },
    { label: 'Icon & color…', icon: <Palette size={I} />, onSelect: () => useUI.getState().set({ spaceDialog: { editId: space.id } }) },
    { label: 'Move up', icon: <ArrowUp size={I} />, disabled: index <= 0, onSelect: () => void repo.reorderSpace(space.id, -1) },
    { label: 'Move down', icon: <ArrowDown size={I} />, disabled: index === ws.spaces.length - 1, onSelect: () => void repo.reorderSpace(space.id, 1) },
    { type: 'separator' },
    { label: 'Delete space', icon: <Trash size={I} />, danger: true, onSelect: () => void trashItem('space', space.id, ws) },
  ];
}

export function folderMenu(ws: Workspace, folder: Folder): MenuItem[] {
  return [
    ...newItemsMenu(ws, folder.spaceId, folder.id),
    { type: 'separator' },
    { label: 'Open', icon: <FolderOpen size={I} />, onSelect: () => navigate(paths.folder(folder.id)) },
    { label: 'Rename', icon: <Pencil size={I} />, onSelect: () => useUI.getState().set({ renamingId: folder.id, sidebarOpen: true }) },
    { label: 'Move to…', icon: <FolderInput size={I} />, onSelect: () => useUI.getState().set({ moveItem: { kind: 'folder', id: folder.id } }) },
    { type: 'separator' },
    { label: 'Delete folder', icon: <Trash size={I} />, danger: true, onSelect: () => void trashItem('folder', folder.id, ws) },
  ];
}

export function docMenu(ws: Workspace, doc: Doc, opts: { inSidebar?: boolean } = {}): MenuItem[] {
  return [
    { label: 'Open', icon: <FileText size={I} />, onSelect: () => navigate(paths.doc(doc.id)) },
    ...(opts.inSidebar
      ? [{ label: 'Rename', icon: <Pencil size={I} />, onSelect: () => useUI.getState().set({ renamingId: doc.id }) } as MenuItem]
      : []),
    {
      label: doc.pinned ? 'Unpin' : 'Pin to Home',
      icon: doc.pinned ? <PinOff size={I} /> : <Pin size={I} />,
      onSelect: () => void repo.updateDoc(doc.id, { pinned: !doc.pinned }),
    },
    { label: 'Copy as plain text', icon: <ClipboardCopy size={I} />, onSelect: () => void copyDocText(doc) },
    { label: 'Duplicate', icon: <CopyPlus size={I} />, onSelect: () => void duplicateDoc(doc.id) },
    { label: 'Move to…', icon: <FolderInput size={I} />, onSelect: () => useUI.getState().set({ moveItem: { kind: 'doc', id: doc.id } }) },
    { type: 'separator' },
    { label: 'Delete', icon: <Trash size={I} />, danger: true, onSelect: () => void trashItem('doc', doc.id, ws) },
  ];
}
