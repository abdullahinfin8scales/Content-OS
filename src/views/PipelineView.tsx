import { CalendarDays, ChevronDown, Plus, Search, SquareKanban } from 'lucide-react';
import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { locationLabel } from '../components/docs/DocItems';
import { docMenu } from '../components/itemMenus';
import { TopBar } from '../components/TopBar';
import { PlatformIcon, PlatformStack, SpaceGlyph, StatusDot } from '../components/ui/Badges';
import { cx, IconButton } from '../components/ui/Button';
import { formatDueLabel, formatRelative, todayISO } from '../lib/dates';
import { draggedItem, endDrag, startDrag } from '../lib/dnd';
import { PLATFORM_META, STATUS_META } from '../lib/meta';
import { paths } from '../lib/router';
import { PLATFORMS, STATUSES, type Doc, type ID, type Platform, type Status } from '../lib/types';
import { openNewDocDialog } from '../state/actions';
import { openMenu } from '../state/feedback';
import { repo } from '../state/repo';
import { useWorkspace, type Workspace } from '../state/workspace';

const POSTED_SHOWN = 25;

function moveToStatus(doc: Doc, status: Status) {
  if (doc.status === status && doc.kind === 'content') return;
  void repo.updateDoc(doc.id, {
    status,
    kind: 'content',
    ...(status === 'posted' && !doc.publishDate ? { publishDate: todayISO() } : {}),
  });
}

export function PipelineView() {
  const ws = useWorkspace();
  const [spaceId, setSpaceId] = useState<ID | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [query, setQuery] = useState('');

  const columns = useMemo(() => {
    const q = query.trim().toLowerCase();
    const docs = ws.docs.filter(
      (d) =>
        d.kind === 'content' &&
        (!spaceId || d.spaceId === spaceId) &&
        (!platform || d.platforms.includes(platform)) &&
        (!q || d.title.toLowerCase().includes(q) || d.excerpt.toLowerCase().includes(q)),
    );
    const map = new Map<Status, Doc[]>(STATUSES.map((s) => [s, []]));
    for (const d of docs) map.get(d.status)!.push(d);
    map.get('idea')!.sort((a, b) => b.updatedAt - a.updatedAt);
    map.get('drafting')!.sort((a, b) => b.updatedAt - a.updatedAt);
    map.get('ready')!.sort((a, b) => b.updatedAt - a.updatedAt);
    map.get('scheduled')!.sort((a, b) => (a.publishDate ?? '9999').localeCompare(b.publishDate ?? '9999'));
    map.get('posted')!.sort((a, b) => (b.publishDate ?? '').localeCompare(a.publishDate ?? '') || b.updatedAt - a.updatedAt);
    return map;
  }, [ws, spaceId, platform, query]);

  const space = spaceId ? ws.spaceById.get(spaceId) : null;

  return (
    <>
      <TopBar crumbs={[{ label: 'Pipeline', icon: <SquareKanban size={14} /> }]} />
      <div className="flex min-h-0 flex-1 flex-col canvas-glow">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-4 pt-8 pb-5 sm:px-8">
          <div className="min-w-0 flex-1">
            <div className="label-display mb-2">From idea to posted</div>
            <h1 className="text-[26px] leading-tight font-[680] tracking-[-0.025em] text-fg sm:text-[30px]">Pipeline</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex h-8 w-[200px] items-center">
              <Search size={14} className="pointer-events-none absolute left-2.5 text-fg-4" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter cards" className="field h-8! pl-8! text-[13px]" />
            </label>
            <Picker
              label={space ? space.name : 'All spaces'}
              icon={space ? <SpaceGlyph space={space} size="sm" /> : undefined}
              onClick={(el) =>
                openMenu(el, [
                  { label: 'All spaces', checked: !spaceId, onSelect: () => setSpaceId(null) },
                  { type: 'separator' },
                  ...ws.spaces.map((s) => ({ label: s.name, icon: <SpaceGlyph space={s} size="sm" />, checked: spaceId === s.id, onSelect: () => setSpaceId(s.id) })),
                ])
              }
            />
            <Picker
              label={platform ? PLATFORM_META[platform].name : 'All platforms'}
              icon={platform ? <PlatformIcon platform={platform} size={13} /> : undefined}
              onClick={(el) =>
                openMenu(el, [
                  { label: 'All platforms', checked: !platform, onSelect: () => setPlatform(null) },
                  { type: 'separator' },
                  ...PLATFORMS.map((p) => ({
                    label: PLATFORM_META[p].name,
                    icon: <PlatformIcon platform={p} size={13} />,
                    checked: platform === p,
                    onSelect: () => setPlatform(p),
                  })),
                ], { align: 'end' })
              }
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4 sm:px-8 sm:pb-6">
          <div className="flex h-full min-w-max gap-3 lg:min-w-0">
            {STATUSES.map((status) => (
              <Column key={status} status={status} docs={columns.get(status)!} ws={ws} spaceId={spaceId} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Picker({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick: (el: HTMLElement) => void }) {
  return (
    <button
      onClick={(e) => onClick(e.currentTarget)}
      className="flex h-8 items-center gap-2 rounded-[10px] border border-line px-2.5 text-[12.5px] text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
    >
      {icon}
      <span className="max-w-[140px] truncate">{label}</span>
      <ChevronDown size={13} className="text-fg-4" />
    </button>
  );
}

function Column({ status, docs, ws, spaceId }: { status: Status; docs: Doc[]; ws: Workspace; spaceId: ID | null }) {
  const [over, setOver] = useState(false);
  const meta = STATUS_META[status];
  const shown = status === 'posted' ? docs.slice(0, POSTED_SHOWN) : docs;

  const accepts = () => {
    const item = draggedItem();
    if (!item || item.kind !== 'doc') return null;
    const doc = ws.docById.get(item.id);
    return doc && (doc.status !== status || doc.kind !== 'content') ? doc : null;
  };

  return (
    <section
      className={cx(
        'flex h-full w-[272px] shrink-0 flex-col rounded-2xl border bg-sunken/60 transition-colors lg:w-auto lg:min-w-[196px] lg:flex-1',
        over ? 'border-fg-3 bg-hover' : 'border-line',
      )}
      onDragOver={(e: DragEvent) => {
        if (!accepts()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const doc = accepts();
        if (!doc) return;
        e.preventDefault();
        endDrag();
        moveToStatus(doc, status);
      }}
      aria-label={`${meta.label} column`}
    >
      <header className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
        <StatusDot status={status} />
        <h2 className="text-[13px] font-semibold text-fg">{meta.label}</h2>
        <span className="text-[12px] text-fg-4 tabular-nums">{docs.length}</span>
        <span className="flex-1" />
        <IconButton
          label={`New ${meta.label.toLowerCase()} item`}
          size="xs"
          onClick={() =>
            openNewDocDialog({
              ...(spaceId ? { spaceId, folderId: null } : {}),
              status,
              ...(status === 'posted' ? { publishDate: todayISO() } : {}),
            })
          }
        >
          <Plus size={14} />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {shown.map((d) => (
          <BoardCard key={d.id} doc={d} ws={ws} />
        ))}
        {docs.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-line text-center text-[12px] text-fg-4">
            {meta.hint}
          </div>
        )}
        {docs.length > shown.length && (
          <a href={paths.library()} className="block py-2 text-center text-[12px] text-fg-3 hover:text-fg">
            {docs.length - shown.length} more in Library →
          </a>
        )}
      </div>
    </section>
  );
}

function BoardCard({ doc, ws }: { doc: Doc; ws: Workspace }) {
  const [dragging, setDragging] = useState(false);
  const space = ws.spaceById.get(doc.spaceId);
  const overdue = doc.status === 'scheduled' && doc.publishDate && doc.publishDate < todayISO();
  return (
    <a
      href={paths.doc(doc.id)}
      draggable
      onDragStart={(e) => {
        startDrag(e, { kind: 'doc', id: doc.id }, doc.title || 'Untitled');
        setDragging(true);
      }}
      onDragEnd={() => {
        endDrag();
        setDragging(false);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e, docMenu(ws, doc));
      }}
      className={cx(
        'block rounded-xl border border-line bg-raised p-3 shadow-card transition-[border-color,opacity,transform] hover:border-line-strong',
        dragging && 'opacity-40',
      )}
    >
      <div className={cx('line-clamp-2 text-[13.5px] leading-snug font-medium', doc.title ? 'text-fg' : 'text-fg-3')}>{doc.title || 'Untitled'}</div>
      {doc.excerpt && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-fg-3">{doc.excerpt}</p>}
      <div className="mt-2.5 flex items-center gap-2 text-[11.5px] text-fg-4">
        {space && <SpaceGlyph space={space} size="sm" className="scale-90" />}
        <span className="min-w-0 flex-1 truncate" title={locationLabel(ws, doc)}>
          {doc.publishDate ? (
            <span className={cx('inline-flex items-center gap-1', overdue && 'text-danger')}>
              <CalendarDays size={11} />
              {formatDueLabel(doc.publishDate)}
            </span>
          ) : (
            formatRelative(doc.updatedAt)
          )}
        </span>
        <PlatformStack platforms={doc.platforms} size={11} max={3} />
      </div>
    </a>
  );
}
