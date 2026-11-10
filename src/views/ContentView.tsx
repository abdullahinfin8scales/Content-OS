import { ArrowDownUp, Check, ChevronDown, Ellipsis, FilePlus, FolderPlus, LayoutGrid, Library, Rows3, Search, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DocCard, DocRow, DocTableHeader, FolderTile } from '../components/docs/DocItems';
import { folderMenu, spaceMenu } from '../components/itemMenus';
import { PageHeader, TopBar, type Crumb } from '../components/TopBar';
import { PlatformIcon, SpaceGlyph, StatusDot } from '../components/ui/Badges';
import { Button, cx, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { STATUS_META } from '../lib/meta';
import { platformInfo } from '../lib/platforms';
import { paths } from '../lib/router';
import { compareNames, containerKey, descendantFolderIds, folderChain } from '../lib/tree';
import { STATUSES, type Doc, type Folder, type Platform, type Space, type Status } from '../lib/types';
import { newFolder, openNewDocDialog, quickNewDoc, rememberLocation } from '../state/actions';
import { openMenu } from '../state/feedback';
import { useUI } from '../state/ui';
import { useWorkspace } from '../state/workspace';

type Scope = { kind: 'library' } | { kind: 'space'; space: Space } | { kind: 'folder'; folder: Folder; space: Space };
type SortKey = 'updated' | 'created' | 'title' | 'publish';

const SORTS: Record<SortKey, string> = {
  updated: 'Last edited',
  created: 'Date created',
  title: 'Title',
  publish: 'Publish date',
};

export function ContentView({ scope }: { scope: Scope }) {
  const ws = useWorkspace();
  const layout = useUI((s) => s.libraryLayout);
  const setUI = useUI((s) => s.set);

  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [kind, setKind] = useState<'all' | 'content' | 'note'>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('updated');
  const [nested, setNested] = useState(scope.kind === 'library');

  const scopeId = scope.kind === 'library' ? 'library' : scope.kind === 'space' ? scope.space.id : scope.folder.id;
  useEffect(() => {
    // Reset filters when switching between folders/spaces.
    setQuery('');
    setStatuses([]);
    setPlatform(null);
    setKind('all');
    setTag(null);
    setNested(scope.kind === 'library');
    if (scope.kind === 'space') rememberLocation({ spaceId: scope.space.id, folderId: null });
    if (scope.kind === 'folder') rememberLocation({ spaceId: scope.folder.spaceId, folderId: scope.folder.id });
  }, [scopeId]);

  const location = scope.kind === 'library' ? null : { spaceId: scope.space.id, folderId: scope.kind === 'folder' ? scope.folder.id : null };

  const subfolders = useMemo(() => {
    if (scope.kind === 'library') return [];
    return ws.foldersIn.get(containerKey(scope.space.id, scope.kind === 'folder' ? scope.folder.id : null)) ?? [];
  }, [ws, scope]);

  const baseDocs = useMemo(() => {
    if (scope.kind === 'library') return ws.docs;
    if (scope.kind === 'space') return nested ? ws.docs.filter((d) => d.spaceId === scope.space.id) : (ws.docsIn.get(containerKey(scope.space.id, null)) ?? []);
    if (!nested) return ws.docsIn.get(scope.folder.id) ?? [];
    const ids = descendantFolderIds(ws.folders, scope.folder.id);
    ids.add(scope.folder.id);
    return ws.docs.filter((d) => d.folderId && ids.has(d.folderId));
  }, [ws, scope, nested]);

  const docs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = baseDocs.filter((d) => {
      if (kind !== 'all' && d.kind !== kind) return false;
      if (statuses.length && (d.kind !== 'content' || !statuses.includes(d.status))) return false;
      if (platform && !d.platforms.includes(platform)) return false;
      if (tag && !d.tags.includes(tag)) return false;
      if (q && !d.title.toLowerCase().includes(q) && !d.excerpt.toLowerCase().includes(q) && !d.tags.some((t) => t.toLowerCase().includes(q)))
        return false;
      return true;
    });
    const sorters: Record<SortKey, (a: Doc, b: Doc) => number> = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => compareNames(a.title || '￿', b.title || '￿'),
      publish: (a, b) => (b.publishDate ?? '').localeCompare(a.publishDate ?? '') || b.updatedAt - a.updatedAt,
    };
    return [...list].sort(sorters[sort]);
  }, [baseDocs, query, statuses, platform, kind, tag, sort]);

  const filtered = !!(query || statuses.length || platform || kind !== 'all' || tag);
  const showLocation = scope.kind === 'library' || nested;

  /* ------------------------------ header ------------------------------ */

  let crumbs: Crumb[];
  let title: string;
  let eyebrow: string;
  let icon = null;
  if (scope.kind === 'library') {
    crumbs = [{ label: 'Library', icon: <Library size={14} /> }];
    title = 'Library';
    eyebrow = 'Everything you have written';
  } else if (scope.kind === 'space') {
    crumbs = [{ label: scope.space.name, icon: <SpaceGlyph space={scope.space} size="sm" /> }];
    title = scope.space.name;
    eyebrow = 'Space';
    icon = <SpaceGlyph space={scope.space} size="xl" />;
  } else {
    const chain = folderChain(ws.folderById, scope.folder.id);
    crumbs = [
      { label: scope.space.name, href: paths.space(scope.space.id), icon: <SpaceGlyph space={scope.space} size="sm" /> },
      ...chain.map((f) => ({ label: f.name, href: paths.folder(f.id) })),
    ];
    title = scope.folder.name;
    eyebrow = 'Folder';
  }

  const total = baseDocs.length;
  const meta = (
    <>
      {total} document{total === 1 ? '' : 's'}
      {subfolders.length > 0 && ` · ${subfolders.length} folder${subfolders.length === 1 ? '' : 's'}`}
    </>
  );

  const moreMenu =
    scope.kind === 'space' ? spaceMenu(ws, scope.space) : scope.kind === 'folder' ? folderMenu(ws, scope.folder) : null;

  return (
    <>
      <TopBar
        crumbs={crumbs}
        actions={
          <>
            <IconButton label="List view" active={layout === 'list'} onClick={() => setUI({ libraryLayout: 'list' })}>
              <Rows3 size={16} />
            </IconButton>
            <IconButton label="Grid view" active={layout === 'grid'} onClick={() => setUI({ libraryLayout: 'grid' })}>
              <LayoutGrid size={16} />
            </IconButton>
            {moreMenu && (
              <IconButton label="More" onClick={(e) => openMenu(e.currentTarget, moreMenu, { align: 'end' })}>
                <Ellipsis size={16} />
              </IconButton>
            )}
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto canvas-glow">
        <div className="mx-auto w-full max-w-[1180px] px-4 pt-8 pb-24 sm:px-8">
          <PageHeader
            eyebrow={eyebrow}
            title={title}
            meta={meta}
            icon={icon}
            actions={
              location ? (
                <>
                  <Button icon={<FolderPlus size={15} />} onClick={() => void newFolder(location.spaceId, location.folderId, ws)}>
                    New folder
                  </Button>
                  <Button variant="primary" icon={<FilePlus size={15} />} onClick={() => openNewDocDialog(location)}>
                    New document
                  </Button>
                </>
              ) : (
                <Button variant="primary" icon={<FilePlus size={15} />} onClick={() => openNewDocDialog()}>
                  New document
                </Button>
              )
            }
          />

          {subfolders.length > 0 && (
            <section className="mb-8">
              <div className="label-display mb-3">Folders</div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {subfolders.map((f) => (
                  <FolderTile key={f.id} folder={f} ws={ws} />
                ))}
              </div>
            </section>
          )}

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="relative flex h-8 min-w-[180px] flex-1 items-center sm:max-w-[280px]">
              <Search size={14} className="pointer-events-none absolute left-2.5 text-fg-4" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by title, text or tag"
                className="field h-8! pl-8! text-[13px]"
              />
              {query && (
                <button aria-label="Clear" className="absolute right-2 text-fg-4 hover:text-fg" onClick={() => setQuery('')}>
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="flex flex-wrap items-center gap-1 rounded-[10px] border border-line bg-sunken p-0.5">
              {STATUSES.map((s) => {
                const on = statuses.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => setStatuses(on ? statuses.filter((x) => x !== s) : [...statuses, s])}
                    className={cx(
                      'flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors',
                      on ? 'bg-active text-fg' : 'text-fg-3 hover:text-fg',
                    )}
                    aria-pressed={on}
                  >
                    <StatusDot status={s} className="h-1.5! w-1.5! shadow-none!" />
                    {STATUS_META[s].label}
                  </button>
                );
              })}
            </div>
            <FilterButton
              label={platform ? platformInfo(ws.platforms, platform).name : 'Platform'}
              active={!!platform}
              onClick={(el) =>
                openMenu(el, [
                  { label: 'All platforms', checked: !platform, onSelect: () => setPlatform(null) },
                  { type: 'separator' },
                  ...ws.platforms.list.map((p) => ({
                    label: p.name,
                    icon: <PlatformIcon platform={p.id} size={13} />,
                    checked: platform === p.id,
                    onSelect: () => setPlatform(p.id),
                  })),
                ])
              }
            />
            <FilterButton
              label={kind === 'all' ? 'Type' : kind === 'content' ? 'Content' : 'Notes'}
              active={kind !== 'all'}
              onClick={(el) =>
                openMenu(el, [
                  { label: 'All types', checked: kind === 'all', onSelect: () => setKind('all') },
                  { label: 'Content pieces', checked: kind === 'content', onSelect: () => setKind('content') },
                  { label: 'Notes', checked: kind === 'note', onSelect: () => setKind('note') },
                ])
              }
            />
            {ws.allTags.length > 0 && (
              <FilterButton
                label={tag ? `#${tag}` : 'Tag'}
                icon={<Tag size={13} />}
                active={!!tag}
                onClick={(el) =>
                  openMenu(el, [
                    { label: 'Any tag', checked: !tag, onSelect: () => setTag(null) },
                    { type: 'separator' },
                    ...ws.allTags.map((t) => ({ label: `#${t}`, checked: tag === t, onSelect: () => setTag(t) })),
                  ])
                }
              />
            )}
            <span className="flex-1" />
            {scope.kind !== 'library' && (
              <button
                onClick={() => setNested(!nested)}
                className={cx(
                  'flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[12.5px] transition-colors',
                  nested ? 'bg-active text-fg' : 'text-fg-3 hover:bg-hover hover:text-fg',
                )}
                aria-pressed={nested}
              >
                {nested && <Check size={13} />}
                Include subfolders
              </button>
            )}
            <FilterButton
              label={SORTS[sort]}
              icon={<ArrowDownUp size={13} />}
              onClick={(el) =>
                openMenu(
                  el,
                  (Object.keys(SORTS) as SortKey[]).map((k) => ({ label: SORTS[k], checked: sort === k, onSelect: () => setSort(k) })),
                  { align: 'end' },
                )
              }
            />
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setStatuses([]);
                  setPlatform(null);
                  setKind('all');
                  setTag(null);
                }}
              >
                Clear
              </Button>
            )}
          </div>

          {docs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong">
              {filtered ? (
                <EmptyState compact title="Nothing matches these filters" body="Try clearing a filter or searching for something else." />
              ) : (
                <EmptyState
                  compact
                  title={scope.kind === 'library' ? 'Your library is empty' : 'No documents here yet'}
                  body="Start with a template — a short-form script, a carousel, a thread — or a blank page."
                  action={
                    <Button variant="primary" icon={<FilePlus size={15} />} onClick={() => (location ? void quickNewDoc(ws, location) : openNewDocDialog())}>
                      New document
                    </Button>
                  }
                />
              )}
            </div>
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((d) => (
                <DocCard key={d.id} doc={d} ws={ws} showLocation={showLocation} />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-raised shadow-card">
              <DocTableHeader showLocation={showLocation} />
              {docs.map((d) => (
                <DocRow key={d.id} doc={d} ws={ws} showLocation={showLocation} />
              ))}
            </div>
          )}
          {docs.length > 0 && filtered && (
            <div className="mt-3 text-[12px] text-fg-4">
              Showing {docs.length} of {total}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FilterButton({ label, icon, active, onClick }: { label: string; icon?: ReactNode; active?: boolean; onClick: (el: HTMLElement) => void }) {
  return (
    <button
      onClick={(e) => onClick(e.currentTarget)}
      className={cx(
        'flex h-8 items-center gap-1.5 rounded-[10px] border px-2.5 text-[12.5px] transition-colors',
        active ? 'border-fg-4 bg-active text-fg' : 'border-line text-fg-2 hover:border-line-strong hover:text-fg',
      )}
    >
      {icon}
      <span className="max-w-[140px] truncate">{label}</span>
      <ChevronDown size={13} className="text-fg-4" />
    </button>
  );
}
