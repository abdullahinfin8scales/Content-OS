import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { docMenu } from '../components/itemMenus';
import { TopBar } from '../components/TopBar';
import { PlatformStack, StatusDot } from '../components/ui/Badges';
import { Button, cx, IconButton } from '../components/ui/Button';
import { addDays, addMonths, formatMonthYear, formatTime, parseISODate, toISODate, todayISO, weekStartsOn } from '../lib/dates';
import { draggedItem, endDrag, startDrag } from '../lib/dnd';
import { STATUS_META } from '../lib/meta';
import { navigate, paths } from '../lib/router';
import type { Doc } from '../lib/types';
import { openNewDocDialog } from '../state/actions';
import { openMenu } from '../state/feedback';
import { repo } from '../state/repo';
import { useWorkspace, type Workspace } from '../state/workspace';

function schedule(doc: Doc, iso: string) {
  const status = doc.status === 'posted' || doc.status === 'scheduled' ? doc.status : 'scheduled';
  if (doc.publishDate === iso && doc.status === status) return;
  void repo.updateDoc(doc.id, { publishDate: iso, status, kind: 'content' });
}

export function CalendarView() {
  const ws = useWorkspace();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const today = todayISO();
  const start = weekStartsOn();

  const cells = useMemo(() => {
    const first = addDays(month, -((month.getDay() - start + 7) % 7));
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [month, start]);

  const byDate = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of ws.docs) {
      if (d.kind !== 'content' || !d.publishDate) continue;
      const list = map.get(d.publishDate);
      if (list) list.push(d);
      else map.set(d.publishDate, [d]);
    }
    for (const list of map.values()) list.sort((a, b) => (a.publishTime ?? '99').localeCompare(b.publishTime ?? '99'));
    return map;
  }, [ws]);

  const unscheduled = useMemo(
    () =>
      ws.docs
        .filter((d) => d.kind === 'content' && !d.publishDate && (d.status === 'ready' || d.status === 'drafting'))
        .sort((a, b) => (a.status === b.status ? b.updatedAt - a.updatedAt : a.status === 'ready' ? -1 : 1)),
    [ws],
  );

  const weekdays = useMemo(() => cells.slice(0, 7).map((d) => d.toLocaleDateString(undefined, { weekday: 'short' })), [cells]);
  const monthCount = cells.filter((d) => d.getMonth() === month.getMonth()).reduce((n, d) => n + (byDate.get(toISODate(d))?.length ?? 0), 0);

  return (
    <>
      <TopBar crumbs={[{ label: 'Calendar', icon: <CalendarDays size={14} /> }]} />
      <div className="flex min-h-0 flex-1 canvas-glow">
        <div className="flex min-w-0 flex-1 flex-col px-4 pt-8 pb-4 sm:px-8 sm:pb-6">
          <div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="label-display mb-2">{monthCount ? `${monthCount} planned or posted` : 'Publishing calendar'}</div>
              <h1 className="text-[26px] leading-tight font-[680] tracking-[-0.025em] text-fg sm:text-[30px]">{formatMonthYear(month)}</h1>
            </div>
            <div className="flex items-center gap-1">
              <IconButton label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
                <ChevronLeft size={17} />
              </IconButton>
              <Button size="sm" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
                Today
              </Button>
              <IconButton label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
                <ChevronRight size={17} />
              </IconButton>
            </div>
          </div>

          <div className="flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-raised shadow-card">
            <div className="grid grid-cols-7 border-b border-line">
              {weekdays.map((w) => (
                <div key={w} className="px-2.5 py-2 text-[11px] font-medium tracking-wide text-fg-4 uppercase">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-7 grid-rows-6">
              {cells.map((date, i) => {
                const iso = toISODate(date);
                return (
                  <DayCell
                    key={iso}
                    iso={iso}
                    date={date}
                    docs={byDate.get(iso) ?? []}
                    outside={date.getMonth() !== month.getMonth()}
                    isToday={iso === today}
                    ws={ws}
                    lastCol={i % 7 === 6}
                    lastRow={i >= 35}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <aside className="hidden w-[290px] shrink-0 flex-col border-l border-line bg-frame/50 xl:flex">
          <div className="px-5 pt-8 pb-3">
            <div className="label-display mb-1.5">Ready to schedule</div>
            <p className="text-[12px] leading-relaxed text-fg-4">Drag onto a day to schedule it.</p>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-6">
            {unscheduled.length === 0 && (
              <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12px] text-fg-4">
                Nothing waiting. Drafts and ready posts without a date show up here.
              </div>
            )}
            {unscheduled.map((d) => (
              <a
                key={d.id}
                href={paths.doc(d.id)}
                draggable
                onDragStart={(e) => startDrag(e, { kind: 'doc', id: d.id }, d.title || 'Untitled')}
                onDragEnd={endDrag}
                className="block rounded-xl border border-line bg-raised p-3 transition-colors hover:border-line-strong"
              >
                <div className="flex items-center gap-2 text-[11.5px] text-fg-4">
                  <StatusDot status={d.status} className="h-1.5! w-1.5! shadow-none!" />
                  {STATUS_META[d.status].label}
                  <span className="flex-1" />
                  <PlatformStack platforms={d.platforms} size={11} max={3} />
                </div>
                <div className={cx('mt-1.5 line-clamp-2 text-[13px] font-medium', d.title ? 'text-fg' : 'text-fg-3')}>{d.title || 'Untitled'}</div>
              </a>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

function DayCell({
  iso,
  date,
  docs,
  outside,
  isToday,
  ws,
  lastCol,
  lastRow,
}: {
  iso: string;
  date: Date;
  docs: Doc[];
  outside: boolean;
  isToday: boolean;
  ws: Workspace;
  lastCol: boolean;
  lastRow: boolean;
}) {
  const [over, setOver] = useState(false);
  const shown = docs.slice(0, 3);
  const extra = docs.length - shown.length;

  const dragged = () => {
    const item = draggedItem();
    return item?.kind === 'doc' ? ws.docById.get(item.id) ?? null : null;
  };

  return (
    <div
      className={cx(
        'group relative flex min-h-[86px] min-w-0 flex-col gap-1 p-1.5 transition-colors',
        !lastCol && 'border-r border-line',
        !lastRow && 'border-b border-line',
        outside && 'bg-sunken/50',
        over && 'bg-hover ring-1 ring-fg-3 ring-inset',
      )}
      onDragOver={(e: DragEvent) => {
        const doc = dragged();
        if (!doc || doc.publishDate === iso) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const doc = dragged();
        if (!doc) return;
        e.preventDefault();
        endDrag();
        schedule(doc, iso);
      }}
    >
      <div className="flex items-center justify-between px-1">
        <span
          className={cx(
            'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-medium tabular-nums',
            isToday ? 'bg-brand text-brand-fg' : outside ? 'text-fg-4' : 'text-fg-2',
          )}
        >
          {date.getDate()}
        </span>
        <button
          aria-label={`New post on ${parseISODate(iso).toLocaleDateString()}`}
          className="flex h-5 w-5 items-center justify-center rounded-md text-fg-4 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-active hover:text-fg focus-visible:opacity-100"
          onClick={() => openNewDocDialog({ status: iso < todayISO() ? 'posted' : 'scheduled', publishDate: iso })}
        >
          <Plus size={13} />
        </button>
      </div>
      {shown.map((d) => (
        <a
          key={d.id}
          href={paths.doc(d.id)}
          draggable
          onDragStart={(e) => startDrag(e, { kind: 'doc', id: d.id }, d.title || 'Untitled')}
          onDragEnd={endDrag}
          onContextMenu={(e) => {
            e.preventDefault();
            openMenu(e, docMenu(ws, d));
          }}
          data-tip={d.title || 'Untitled'}
          className="flex min-w-0 items-start gap-1.5 rounded-md px-1.5 py-[3px] text-[11.5px] leading-snug transition-colors hover:brightness-125"
          style={{
            background: `color-mix(in oklab, ${STATUS_META[d.status].color} 14%, transparent)`,
            color: 'var(--fg)',
          }}
        >
          <span className="mt-[2px] h-3 w-[3px] shrink-0 rounded-full" style={{ background: STATUS_META[d.status].color }} />
          <span className="line-clamp-2 min-w-0 break-words max-sm:hidden">
            {d.publishTime && <span className="text-fg-3">{formatTime(d.publishTime)} </span>}
            {d.title || 'Untitled'}
          </span>
        </a>
      ))}
      {extra > 0 && (
        <button
          className="px-1.5 text-left text-[11px] text-fg-3 hover:text-fg"
          onClick={(e) =>
            openMenu(
              e.currentTarget,
              docs.map((d) => ({
                label: d.title || 'Untitled',
                icon: <StatusDot status={d.status} className="h-1.5! w-1.5! shadow-none!" />,
                onSelect: () => navigate(paths.doc(d.id)),
              })),
              { minWidth: 240 },
            )
          }
        >
          +{extra} more
        </button>
      )}
    </div>
  );
}
