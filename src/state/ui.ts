import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ID, Status } from '../lib/types';

export interface DocLocation {
  spaceId: ID;
  folderId: ID | null;
}

export interface NewDocRequest {
  spaceId?: ID;
  folderId?: ID | null;
  status?: Status;
  publishDate?: string;
}

interface UIState {
  /** Mobile drawer. */
  sidebarOpen: boolean;
  /** Desktop: sidebar tucked away. */
  sidebarHidden: boolean;
  detailsOpen: boolean;
  focusMode: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  newDoc: NewDocRequest | null;
  spaceDialog: { editId?: ID } | null;
  moveItem: { kind: 'doc' | 'folder'; id: ID } | null;
  renamingId: ID | null;
  expanded: Record<ID, boolean>;
  lastLocation: DocLocation | null;
  libraryLayout: 'list' | 'grid';
  set: (patch: Partial<Omit<UIState, 'set' | 'setExpanded'>>) => void;
  setExpanded: (id: ID, value: boolean) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      sidebarHidden: false,
      detailsOpen: true,
      focusMode: false,
      paletteOpen: false,
      settingsOpen: false,
      newDoc: null,
      spaceDialog: null,
      moveItem: null,
      renamingId: null,
      expanded: {},
      lastLocation: null,
      libraryLayout: 'list',
      set: (patch) => set(patch),
      setExpanded: (id, value) => set((s) => ({ expanded: { ...s.expanded, [id]: value } })),
    }),
    {
      name: 'infin8.ui',
      version: 1,
      partialize: (s) => ({
        sidebarHidden: s.sidebarHidden,
        detailsOpen: s.detailsOpen,
        expanded: s.expanded,
        lastLocation: s.lastLocation,
        libraryLayout: s.libraryLayout,
      }),
    },
  ),
);

/** Spaces default to expanded, folders to collapsed. */
export function isExpanded(expanded: Record<ID, boolean>, id: ID, fallback: boolean): boolean {
  return expanded[id] ?? fallback;
}
