import {
  CalendarDays,
  Ellipsis,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  House,
  Library,
  Lock,
  Moon,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  SquareKanban,
  Sun,
  Trash,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Wordmark } from '../../brand/Logo';
import type { DragItem } from '../../lib/dnd';
import { navigate, paths, useRoute, type Route } from '../../lib/router';
import { IS_PREVIEW } from '../../lib/env';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { canNestFolder, containerKey } from '../../lib/tree';
import type { Doc, Folder, ID, Space } from '../../lib/types';
import { moveDocTo, moveFolderTo, openNewDocDialog } from '../../state/actions';
import { openMenu } from '../../state/feedback';
import { repo } from '../../state/repo';
import { resolveTheme, useSettings } from '../../state/settings';
import { isExpanded, useUI } from '../../state/ui';
import { useWorkspace, type Workspace } from '../../state/workspace';
import { BackupStatus } from '../BackupStatus';
import { docMenu, folderMenu, newItemsMenu, spaceMenu } from '../itemMenus';
import { SpaceGlyph, StatusDot } from '../ui/Badges';
import { cx, IconButton } from '../ui/Button';
import { TreeRow, type DropSpec } from './TreeRow';

const DOCS_SHOWN = 30;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

function activeIds(route: Route): { docId?: ID; folderId?: ID; spaceId?: ID } {
  if (route.name === 'doc') return { docId: route.id };
  if (route.name === 'folder') return { folderId: route.id };
  if (route.name === 'space') return { spaceId: route.id };
  return {};
}

export function Sidebar() {
  const ws = useWorkspace();
  const route = useRoute();
  const sidebarOpen = useUI((s) => s.sidebarOpen);
  const sidebarHidden = useUI((s) => s.sidebarHidden);
  const set = useUI((s) => s.set);
  const theme = useSettings((s) => s.theme);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const setSettings = useSettings((s) => s.set);

  // Close the mobile drawer after navigating.
  useEffect(() => {
    set({ sidebarOpen: false });
  }, [route, set]);

  const counts = useMemo(() => {
    const content = ws.docs.filter((d) => d.kind === 'content');
    return {
      library: ws.docs.length,
      pipeline: content.filter((d) => d.status !== 'posted').length,
      trash:
        ws.trash.docs.filter((d) => d.trashRootId === d.id).length +
        ws.trash.folders.filter((f) => f.trashRootId === f.id).length +
        ws.trash.spaces.length,
    };
  }, [ws]);

  const active = activeIds(route);
  const resolved = resolveTheme(theme);

  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[2px] animate-fade lg:hidden" onClick={() => set({ sidebarOpen: false })} />}
      <aside
        data-print-hide
        className={cx(
          'flex h-full w-[272px] shrink-0 flex-col bg-frame',
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:w-[288px] max-lg:max-w-[86vw] max-lg:border-r max-lg:border-line max-lg:shadow-pop',
          sidebarOpen ? 'max-lg:animate-slide-in' : 'max-lg:hidden',
          sidebarHidden && 'lg:hidden',
        )}
      >
        {/* Brand */}
        <div className="flex h-[60px] shrink-0 items-center gap-2 pr-2.5 pl-5">
          <a href={paths.home()} className="group flex min-w-0 flex-1 flex-col gap-[5px] text-fg" aria-label="Infin8 Content OS — Home">
            <Wordmark className="h-[13px] w-auto max-w-full self-start" />
            <span className="font-display text-[7.5px] tracking-[0.42em] text-fg-3 uppercase">Content&nbsp;OS</span>
          </a>
          <IconButton
            label={desktop ? 'Hide sidebar' : 'Close menu'}
            shortcut={desktop ? `${MOD} \\` : undefined}
            size="sm"
            onClick={() => set(desktop ? { sidebarHidden: true } : { sidebarOpen: false })}
          >
            <PanelLeftClose size={16} />
          </IconButton>
        </div>

        {/* Search + create */}
        <div className="space-y-2 px-3 pt-1 pb-3">
          <button
            onClick={() => set({ paletteOpen: true })}
            className="flex h-9 w-full items-center gap-2.5 rounded-[10px] border border-line bg-sunken px-3 text-[13px] text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2"
          >
            <Search size={15} />
            <span className="flex-1 text-left">Search</span>
            <span className="kbd">{MOD} K</span>
          </button>
          <button
            onClick={() => openNewDocDialog()}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] bg-brand text-[13px] font-semibold text-brand-fg shadow-[0_1px_0_0_rgb(255_255_255/0.3)_inset,0_8px_20px_-10px_rgb(0_0_0/0.8)] transition-opacity hover:opacity-90"
          >
            <Plus size={16} strokeWidth={2.4} />
            New document
          </button>
        </div>

        {/* Primary nav */}
        <nav className="space-y-px px-3 pb-2">
          <NavItem href={paths.home()} icon={House} label="Home" active={route.name === 'home'} />
          <NavItem href={paths.library()} icon={Library} label="Library" active={route.name === 'library'} count={counts.library} />
          <NavItem href={paths.pipeline()} icon={SquareKanban} label="Pipeline" active={route.name === 'pipeline'} count={counts.pipeline} />
          <NavItem href={paths.calendar()} icon={CalendarDays} label="Calendar" active={route.name === 'calendar'} />
        </nav>

        {/* Spaces */}
        <div className="flex items-center justify-between pt-4 pr-3 pb-1.5 pl-5">
          <span className="label-display">Spaces</span>
          <IconButton label="New space" size="xs" onClick={() => set({ spaceDialog: {} })}>
            <Plus size={14} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" role="tree" aria-label="Spaces">
          {ws.spaces.length === 0 ? (
            <button
              onClick={() => set({ spaceDialog: {} })}
              className="mt-1 flex w-full flex-col items-start gap-1 rounded-xl border border-dashed border-line-strong p-3.5 text-left transition-colors hover:bg-hover"
            >
              <span className="text-[13px] font-medium text-fg">Create your first space</span>
              <span className="text-[12px] leading-snug text-fg-3">A space holds folders and documents — one per brand, client or channel.</span>
            </button>
          ) : (
            ws.spaces.map((space) => <SpaceNode key={space.id} space={space} ws={ws} active={active} />)
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-line px-3 pt-2 pb-3">
          <NavItem href={paths.trash()} icon={Trash} label="Trash" active={route.name === 'trash'} count={counts.trash || undefined} />
          <div className="flex items-center gap-1">
            <button
              onClick={() => set({ settingsOpen: true })}
              className="flex h-8 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-fg-2 transition-colors hover:bg-hover hover:text-fg"
            >
              <Settings size={16} className="text-fg-3" />
              Settings
            </button>
            <IconButton
              label={resolved === 'dark' ? 'Light theme' : 'Dark theme'}
              size="sm"
              onClick={() => setSettings({ theme: resolved === 'dark' ? 'light' : 'dark' })}
            >
              {resolved === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </IconButton>
          </div>
          {IS_PREVIEW ? (
            <button
              onClick={() => set({ settingsOpen: true })}
              className="mt-2 flex items-center gap-1.5 px-2.5 text-left text-[11px] text-[var(--st-drafting)]"
              data-tip="Preview on claude.ai — open Settings for details"
            >
              <Lock size={11} />
              Preview · for trying it out
            </button>
          ) : (
            <BackupStatus />
          )}
        </div>
      </aside>
    </>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  count,
}: {
  href: string;
  icon: typeof House;
  label: string;
  active: boolean;
  count?: number;
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors',
        active ? 'bg-active font-medium text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg',
      )}
    >
      {active && <span aria-hidden className="absolute top-1/2 -left-3 h-3.5 w-[3px] -translate-y-1/2 rounded-full bg-brand" />}
      <Icon size={16} className={active ? 'text-fg' : 'text-fg-3 transition-colors group-hover:text-fg-2'} />
      <span className="flex-1 truncate">{label}</span>
      {count != null && <span className="text-[11.5px] text-fg-4 tabular-nums">{count}</span>}
    </a>
  );
}

/* ------------------------------------------------------------------ */

type Active = { docId?: ID; folderId?: ID; spaceId?: ID };

function dropInto(ws: Workspace, spaceId: ID, folderId: ID | null, onLinger?: () => void): DropSpec {
  return {
    accepts: (item: DragItem) => {
      if (item.kind === 'doc') {
        const doc = ws.docById.get(item.id);
        return !!doc && !(doc.spaceId === spaceId && doc.folderId === folderId);
      }
      const folder = ws.folderById.get(item.id);
      if (!folder) return false;
      if (folder.spaceId === spaceId && folder.parentId === folderId) return false;
      return canNestFolder(ws.folders, item.id, folderId);
    },
    onDrop: (item: DragItem) => {
      if (item.kind === 'doc') void moveDocTo(item.id, { spaceId, folderId }, ws);
      else void moveFolderTo(item.id, { spaceId, parentId: folderId }, ws);
    },
    onLinger,
  };
}

function RowActions({ onAdd, onMore }: { onAdd?: (el: HTMLElement) => void; onMore: (el: HTMLElement) => void }) {
  return (
    <>
      {onAdd && (
        <IconButton label="Add" size="xs" tip={false} onClick={(e) => onAdd(e.currentTarget)}>
          <Plus size={14} />
        </IconButton>
      )}
      <IconButton label="More" size="xs" tip={false} onClick={(e) => onMore(e.currentTarget)}>
        <Ellipsis size={14} />
      </IconButton>
    </>
  );
}

function SpaceNode({ space, ws, active }: { space: Space; ws: Workspace; active: Active }) {
  const expanded = useUI((s) => isExpanded(s.expanded, space.id, true));
  const renaming = useUI((s) => s.renamingId === space.id);
  const { setExpanded, set } = useUI.getState();
  const key = containerKey(space.id, null);
  const folders = ws.foldersIn.get(key) ?? [];
  const docs = ws.docsIn.get(key) ?? [];

  return (
    <div role="treeitem" aria-expanded={expanded} className="mt-0.5">
      <TreeRow
        depth={0}
        href={paths.space(space.id)}
        icon={<SpaceGlyph space={space} size="sm" />}
        label={space.name}
        active={active.spaceId === space.id}
        expandable
        expanded={expanded}
        onToggle={() => setExpanded(space.id, !expanded)}
        onOpen={() => setExpanded(space.id, true)}
        onContextMenu={(e) => openMenu(e, spaceMenu(ws, space))}
        actions={
          <RowActions
            onAdd={(el) => openMenu(el, newItemsMenu(ws, space.id, null))}
            onMore={(el) => openMenu(el, spaceMenu(ws, space))}
          />
        }
        drop={dropInto(ws, space.id, null, () => setExpanded(space.id, true))}
        renaming={renaming}
        onRename={(value) => {
          set({ renamingId: null });
          if (value !== null && value.trim() && value !== space.name) void repo.updateSpace(space.id, { name: value });
        }}
      />
      {expanded && (
        <div role="group">
          {folders.map((f) => (
            <FolderNode key={f.id} folder={f} ws={ws} depth={1} active={active} />
          ))}
          <DocList docs={docs} ws={ws} depth={1} active={active} moreHref={paths.space(space.id)} />
          {folders.length === 0 && docs.length === 0 && (
            <button
              onClick={() => openNewDocDialog({ spaceId: space.id, folderId: null })}
              className="flex h-7 w-full items-center gap-2 rounded-lg pl-[30px] text-[12.5px] text-fg-4 hover:bg-hover hover:text-fg-2"
            >
              <Plus size={13} /> Add a document
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FolderNode({ folder, ws, depth, active }: { folder: Folder; ws: Workspace; depth: number; active: Active }) {
  const expanded = useUI((s) => isExpanded(s.expanded, folder.id, false));
  const renaming = useUI((s) => s.renamingId === folder.id);
  const { setExpanded, set } = useUI.getState();
  const children = ws.foldersIn.get(folder.id) ?? [];
  const docs = ws.docsIn.get(folder.id) ?? [];
  const Icon = expanded ? FolderOpen : FolderIcon;

  return (
    <div role="treeitem" aria-expanded={expanded}>
      <TreeRow
        depth={depth}
        href={paths.folder(folder.id)}
        icon={<Icon size={15} className="text-fg-3" />}
        label={folder.name}
        active={active.folderId === folder.id}
        expandable
        expanded={expanded}
        onToggle={() => setExpanded(folder.id, !expanded)}
        onOpen={() => setExpanded(folder.id, true)}
        onContextMenu={(e) => openMenu(e, folderMenu(ws, folder))}
        actions={
          <RowActions
            onAdd={(el) => openMenu(el, newItemsMenu(ws, folder.spaceId, folder.id))}
            onMore={(el) => openMenu(el, folderMenu(ws, folder))}
          />
        }
        trailing={docs.length || undefined}
        drag={{ kind: 'folder', id: folder.id }}
        drop={dropInto(ws, folder.spaceId, folder.id, () => setExpanded(folder.id, true))}
        renaming={renaming}
        onRename={(value) => {
          set({ renamingId: null });
          if (value !== null && value !== folder.name) void repo.renameFolder(folder.id, value);
        }}
      />
      {expanded && (
        <div role="group">
          {children.map((f) => (
            <FolderNode key={f.id} folder={f} ws={ws} depth={depth + 1} active={active} />
          ))}
          <DocList docs={docs} ws={ws} depth={depth + 1} active={active} moreHref={paths.folder(folder.id)} />
          {children.length === 0 && docs.length === 0 && (
            <div className="flex h-7 items-center text-[12px] text-fg-4" style={{ paddingLeft: 8 + (depth + 1) * 14 + 18 }}>
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocList({ docs, ws, depth, active, moreHref }: { docs: Doc[]; ws: Workspace; depth: number; active: Active; moreHref: string }) {
  const shown = docs.slice(0, DOCS_SHOWN);
  return (
    <>
      {shown.map((d) => (
        <DocNode key={d.id} doc={d} ws={ws} depth={depth} active={active.docId === d.id} />
      ))}
      {docs.length > shown.length && (
        <button
          onClick={() => navigate(moreHref)}
          className="flex h-7 w-full items-center rounded-lg text-[12px] text-fg-3 hover:bg-hover hover:text-fg"
          style={{ paddingLeft: 8 + depth * 14 + 18 }}
        >
          {docs.length - shown.length} more…
        </button>
      )}
    </>
  );
}

function DocNode({ doc, ws, depth, active }: { doc: Doc; ws: Workspace; depth: number; active: boolean }) {
  const renaming = useUI((s) => s.renamingId === doc.id);
  const set = useUI((s) => s.set);
  return (
    <div role="treeitem">
      <TreeRow
        depth={depth}
        href={paths.doc(doc.id)}
        icon={<FileText size={15} className={active ? 'text-fg-2' : 'text-fg-4'} />}
        label={doc.title || 'Untitled'}
        placeholder={!doc.title}
        active={active}
        onContextMenu={(e) => openMenu(e, docMenu(ws, doc, { inSidebar: true }))}
        actions={<RowActions onMore={(el) => openMenu(el, docMenu(ws, doc, { inSidebar: true }))} />}
        trailing={doc.kind === 'content' ? <StatusDot status={doc.status} className="mr-1 h-1.5! w-1.5!" /> : undefined}
        drag={{ kind: 'doc', id: doc.id }}
        renaming={renaming}
        onRename={(value) => {
          set({ renamingId: null });
          if (value !== null && value !== doc.title) void repo.updateDoc(doc.id, { title: value.trim() });
        }}
      />
    </div>
  );
}
