import { useLiveQuery } from 'dexie-react-hooks';
import { Repeat, RotateCcw, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { PageHeader, TopBar } from '../../components/TopBar';
import { Button, cx, IconButton } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { addDays, formatDate, parseISODate, toISODate } from '../../lib/dates';
import { isHHMM, nnTaskId } from '../../lib/personalRepo';
import { clockLabel } from '../../lib/personalText';
import type { NonNegotiable, Task } from '../../lib/types';
import { reportError } from '../../state/actions';
import { toast } from '../../state/feedback';
import { usePersonalLists, useToday } from '../../state/personal';
import { db, personal } from '../../state/repo';
import { Page, SectionLabel } from './parts';

export function NonNegotiablesView() {
  const lists = usePersonalLists();
  const today = useToday();
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => toISODate(addDays(parseISODate(today), i - 6))), [today]);
  const copies = useLiveQuery(
    async () => {
      const rows = await db.tasks.where('date').between(week[0], week[6], true, true).toArray();
      return new Map(rows.filter((t) => t.nnId).map((t) => [t.id, t]));
    },
    [week[0], week[6]],
  );

  const active = lists?.activeNonnegs ?? [];
  const archived = (lists?.nonnegs ?? []).filter((n) => n.archivedAt);

  return (
    <>
      <TopBar crumbs={[{ label: 'Non-negotiables', icon: <Repeat size={14} /> }]} />
      <Page>
        <PageHeader eyebrow="Every day" title="Non-negotiables" meta="Each one appears on every day’s timeline at its time. Removing one keeps it on past days." />
        <AddForm />

        {lists && active.length === 0 ? (
          <EmptyState
            compact
            icon={<Repeat size={26} />}
            title="No non-negotiables yet"
            body="Add the things you do every day, no matter what — gym, reading, no sugar. Give each a time and it will sit at that hour on every day."
          />
        ) : (
          <section className="mt-8">
            <SectionLabel>
              {active.length} daily · last 7 days
            </SectionLabel>
            <div className="divide-y divide-line border-y border-line">
              {active.map((nn) => (
                <NonNegRow key={nn.id} nn={nn} week={week} copies={copies} today={today} />
              ))}
            </div>
          </section>
        )}

        {archived.length > 0 && (
          <section className="mt-10">
            <SectionLabel>Removed</SectionLabel>
            <div className="divide-y divide-line border-y border-line">
              {archived.map((nn) => (
                <div key={nn.id} className="flex items-center gap-3 px-1 py-2.5">
                  <span className="w-[72px] shrink-0 text-[12.5px] text-fg-3 tabular-nums">{clockLabel(nn.time)}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-fg-3">{nn.title}</span>
                  <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => void personal.restoreNonNeg(nn.id)}>
                    Put back
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </Page>
    </>
  );
}

function AddForm() {
  const [time, setTime] = useState('');
  const [title, setTitle] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!isHHMM(time)) {
      toast('Pick a time for this non-negotiable', { tone: 'error' });
      return;
    }
    try {
      await personal.createNonNeg({ title, time });
      setTitle('');
      setTime('');
    } catch (err) {
      reportError(err);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-2xl border border-line-strong p-2 sm:flex-row sm:items-center">
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="field h-10! tabular-nums sm:w-[140px]!"
        aria-label="Time"
        required
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Gym — 1 hour"
        className="h-10 min-w-0 flex-1 bg-transparent px-2 text-[14.5px] text-fg outline-none placeholder:text-fg-3"
        aria-label="Non-negotiable"
      />
      <Button type="submit" variant="primary" disabled={!title.trim() || !time}>
        Add
      </Button>
    </form>
  );
}

function NonNegRow({ nn, week, copies, today }: { nn: NonNegotiable; week: string[]; copies: Map<string, Task> | undefined; today: string }) {
  const [title, setTitle] = useState(nn.title);
  const doneCount = week.filter((d) => copies?.get(nnTaskId(nn.id, d))?.done).length;

  const commitTitle = () => {
    if (title.trim() && title !== nn.title) personal.updateNonNeg(nn.id, { title }, today).catch(reportError);
    else setTitle(nn.title);
  };

  return (
    <div className="group flex flex-wrap items-center gap-x-3 gap-y-2 px-1 py-2.5 sm:flex-nowrap">
      <input
        type="time"
        defaultValue={nn.time}
        key={nn.time}
        onBlur={(e) => {
          const v = e.target.value;
          if (isHHMM(v) && v !== nn.time) personal.updateNonNeg(nn.id, { time: v }, today).catch(reportError);
        }}
        className="h-8 w-[132px] shrink-0 rounded-lg border border-transparent bg-transparent px-1.5 text-[13.5px] text-fg tabular-nums outline-none hover:border-line focus:border-fg-3"
        aria-label={`Time for ${nn.title}`}
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setTitle(nn.title);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 text-[14.5px] text-fg outline-none hover:border-line focus:border-fg-3"
        aria-label="Non-negotiable"
      />
      <div className="flex shrink-0 items-center gap-1" aria-label={`Done ${doneCount} of the last 7 days`}>
        {week.map((d) => {
          const copy = copies?.get(nnTaskId(nn.id, d));
          const state = copy?.done ? 'done' : copy ? 'missed' : 'none';
          return (
            <span
              key={d}
              data-tip={`${formatDate(d, { weekday: true })} · ${state === 'done' ? 'Done' : state === 'missed' ? (d === today ? 'Not yet' : 'Not done') : 'No record'}`}
              className={cx(
                'h-2 w-2 rounded-full',
                state === 'done' ? 'bg-fg' : state === 'missed' ? 'border border-fg-3' : 'bg-active',
              )}
            />
          );
        })}
      </div>
      <IconButton
        label={`Remove ${nn.title}`}
        size="sm"
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
        onClick={async () => {
          await personal.archiveNonNeg(nn.id, today).catch(reportError);
          toast(`Removed “${nn.title}” from your days`, { action: { label: 'Undo', run: () => void personal.restoreNonNeg(nn.id) } });
        }}
      >
        <X size={15} />
      </IconButton>
    </div>
  );
}
