import { Ellipsis, FileText, Folder as FolderIcon, Pin, StickyNote } from 'lucide-react';
import type { MouseEvent } from 'react';
import { formatDate, formatRelative } from '../../lib/dates';
import { endDrag, startDrag } from '../../lib/dnd';
import { navigate, paths } from '../../lib/router';
import { folderChain } from '../../lib/tree';
import type { Doc, Folder } from '../../lib/types';
import { openMenu } from '../../state/feedback';
import type { Workspace } from '../../state/workspace';
import { docMenu, folderMenu } from '../itemMenus';
import { PlatformStack, SpaceGlyph, StatusPill } from '../ui/Badges';
import { cx, IconButton } from '../ui/Button';

export function locationLabel(ws: Workspace, doc: Pick<Doc, 'spaceId' | 'folderId'>): string {
  const space = ws.spaceById.get(doc.spaceId);
  const chain = folderChain(ws.folderById, doc.folderId).map((f) => f.name);
  return [space?.name ?? 'Unknown space', ...chain].join(' / ');
}

function DocKindIcon({ doc, size = 15 }: { doc: Doc; size?: number }) {
  return doc.kind === 'note' ? <StickyNote size={size} /> : <FileText size={size} />;
}

function onDocContext(ws: Workspace, doc: Doc) {
  return (e: MouseEvent) => {
    e.preventDefault();
    openMenu(e, docMenu(ws, doc));
  };
}

/** Card used in grids, the home view and search-like surfaces. */
export function DocCard({ doc, ws, showLocation = true, className }: { doc: Doc; ws: Workspace; showLocation?: boolean; className?: string }) {
  const space = ws.spaceById.get(doc.spaceId);
  return (
    <a
      href={paths.doc(doc.id)}
      draggable
      onDragStart={(e) => startDrag(e, { kind: 'doc', id: doc.id }, doc.title || 'Untitled')}
      onDragEnd={endDrag}
      onContextMenu={onDocContext(ws, doc)}
      className={cx(
        'group relative flex min-h-[148px] flex-col rounded-2xl border border-line bg-raised p-4 shadow-card transition-[border-color,transform,background] duration-200 hover:-translate-y-0.5 hover:border-line-strong',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {doc.kind === 'content' ? (
          <StatusPill status={doc.status} size="sm" />
        ) : (
          <span className="inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium text-fg-3 ring-1 ring-line-strong ring-inset">
            <StickyNote size={11} /> Note
          </span>
        )}
        {doc.pinned && <Pin size={12} className="text-fg-3" />}
        <span className="flex-1" />
        <PlatformStack platforms={doc.platforms} size={12} />
      </div>
      <h3 className={cx('mt-3 line-clamp-2 text-[14.5px] leading-snug font-semibold tracking-[-0.01em]', doc.title ? 'text-fg' : 'text-fg-3')}>
        {doc.title || 'Untitled'}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-fg-3">{doc.excerpt || 'Empty document'}</p>
      <div className="mt-auto flex items-center gap-2 pt-4 text-[11.5px] text-fg-4">
        {showLocation && space && (
          <>
            <SpaceGlyph space={space} size="sm" className="scale-90" />
            <span className="min-w-0 truncate">{locationLabel(ws, doc)}</span>
            <span aria-hidden>·</span>
          </>
        )}
        <span className="shrink-0">{doc.publishDate && doc.kind === 'content' ? formatDate(doc.publishDate) : formatRelative(doc.updatedAt)}</span>
      </div>
      <IconButton
        label="More"
        size="xs"
        tip={false}
        className="absolute top-3 right-3 bg-raised opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={(e) => {
          e.preventDefault();
          openMenu(e.currentTarget, docMenu(ws, doc), { align: 'end' });
        }}
      >
        <Ellipsis size={14} />
      </IconButton>
    </a>
  );
}

/** Row used by the list layout of Library / Space / Folder views. */
export function DocRow({ doc, ws, showLocation }: { doc: Doc; ws: Workspace; showLocation: boolean }) {
  return (
    <a
      href={paths.doc(doc.id)}
      draggable
      onDragStart={(e) => startDrag(e, { kind: 'doc', id: doc.id }, doc.title || 'Untitled')}
      onDragEnd={endDrag}
      onContextMenu={onDocContext(ws, doc)}
      className="group grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-4 border-b border-line px-3 py-2.5 transition-colors last:border-b-0 hover:bg-hover md:grid-cols-[minmax(0,1fr)_104px_92px_88px_28px] xl:grid-cols-[minmax(0,1fr)_104px_92px_88px_minmax(0,180px)_80px_28px]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-sunken text-fg-3">
          <DocKindIcon doc={doc} />
        </span>
        <div className="min-w-0">
          <div className={cx('flex items-center gap-1.5 truncate text-[13.5px] font-medium', doc.title ? 'text-fg' : 'text-fg-3')}>
            <span className="truncate">{doc.title || 'Untitled'}</span>
            {doc.pinned && <Pin size={11} className="shrink-0 text-fg-3" />}
          </div>
          <div className="truncate text-[12px] text-fg-4">{doc.excerpt || 'Empty document'}</div>
        </div>
      </div>
      <div className="max-md:hidden">{doc.kind === 'content' ? <StatusPill status={doc.status} size="sm" /> : <span className="text-[12px] text-fg-4">Note</span>}</div>
      <div className="max-md:hidden">
        <PlatformStack platforms={doc.platforms} size={13} max={3} />
      </div>
      <div className="text-[12px] text-fg-3 tabular-nums max-md:text-right">
        {doc.kind === 'content' && doc.publishDate ? formatDate(doc.publishDate) : <span className="text-fg-4">—</span>}
      </div>
      <div className="truncate text-[12px] text-fg-3 max-xl:hidden">{showLocation ? locationLabel(ws, doc) : `${doc.wordCount} words`}</div>
      <div className="text-right text-[12px] text-fg-4 max-xl:hidden">{formatRelative(doc.updatedAt)}</div>
      <IconButton
        label="More"
        size="xs"
        tip={false}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
        onClick={(e) => {
          e.preventDefault();
          openMenu(e.currentTarget, docMenu(ws, doc), { align: 'end' });
        }}
      >
        <Ellipsis size={14} />
      </IconButton>
    </a>
  );
}

export function DocTableHeader({ showLocation }: { showLocation: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_28px] gap-4 border-b border-line px-3 py-2 text-[11px] font-medium tracking-wide text-fg-4 uppercase md:grid-cols-[minmax(0,1fr)_104px_92px_88px_28px] xl:grid-cols-[minmax(0,1fr)_104px_92px_88px_minmax(0,180px)_80px_28px]">
      <span>Title</span>
      <span className="max-md:hidden">Status</span>
      <span className="max-md:hidden">Platforms</span>
      <span className="max-md:text-right">Publish</span>
      <span className="max-xl:hidden">{showLocation ? 'Location' : 'Length'}</span>
      <span className="text-right max-xl:hidden">Edited</span>
      <span />
    </div>
  );
}

export function FolderTile({ folder, ws }: { folder: Folder; ws: Workspace }) {
  const docs = ws.docsIn.get(folder.id)?.length ?? 0;
  const subs = ws.foldersIn.get(folder.id)?.length ?? 0;
  return (
    <a
      href={paths.folder(folder.id)}
      draggable
      onDragStart={(e) => startDrag(e, { kind: 'folder', id: folder.id }, folder.name)}
      onDragEnd={endDrag}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e, folderMenu(ws, folder));
      }}
      onDoubleClick={() => navigate(paths.folder(folder.id))}
      className="group flex items-center gap-3 rounded-xl border border-line bg-raised px-3.5 py-3 transition-colors hover:border-line-strong hover:bg-hover"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-sunken text-fg-2 ring-1 ring-line ring-inset">
        <FolderIcon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-fg">{folder.name}</span>
        <span className="block text-[12px] text-fg-4">
          {docs} doc{docs === 1 ? '' : 's'}
          {subs ? ` · ${subs} folder${subs === 1 ? '' : 's'}` : ''}
        </span>
      </span>
    </a>
  );
}
