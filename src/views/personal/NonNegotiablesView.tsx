import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, Repeat, RotateCcw, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { PageHeader, TopBar } from '../../components/TopBar';
import { Button, cx } from '../../components/ui/Button';
import { TimePicker } from '../../components/ui/TimePicker';
import { EmptyState } from '../../components/ui/EmptyState';
import { addDays, formatDate, parseISODate, toISODate, weekStartsOn } from '../../lib/dates';
import { ALL_DAYS, isHHMM, nnDays, nnOnDate, nnTaskId } from '../../lib/personalRepo';
import { clockLabel, daysSummary, weekdayName, weekOrder } from '../../lib/personalText';
import type { NonNegotiable, Task } from '../../lib/types';
import { reportError } from '../../state/actions';
import { toast } from '../../state/feedback';
import { deleteNonNegForever, removeNonNegWithUndo, skipNonNegWithUndo, usePersonalLists, useToday } from '../../state/personal';
import { db, personal } from '../../state/repo';
import { DeleteButton, Page, SectionLabel } from './parts';

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
  const start = weekStartsOn();

  return (
    <>
      <TopBar crumbs={[{ label: 'Non-negotiables', icon: <Repeat size={14} /> }]} />
      <Page>
        <PageHeader
          eyebrow="Your routine"
          title="Non-negotiables"
          meta="Each one appears on its days’ timelines at its time. Tap the days to change them, or add a single day off. Removing one keeps it on past days."
        />
        <AddForm start={start} />

        {lists && active.length === 0 ? (
          <EmptyState
            compact
            icon={<Repeat size={26} />}
            title="No non-negotiables yet"
            body="Add the things you do no matter what — gym, reading, no sugar. Give each a time (or Anytime) and its days, and it will show up on each of those days."
          />
        ) : (
          <section className="mt-8">
            <SectionLabel>{active.length} active · last 7 days</SectionLabel>
            <div className="divide-y divide-line border-y border-line">
              {active.map((nn) => (
                <NonNegRow key={nn.id} nn={nn} week={week} copies={copies} today={today} start={start} />
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
                  <span className="w-[72px] shrink-0 text-[12.5px] text-fg-3 tabular-nums">{nn.time ? clockLabel(nn.time) : 'Anytime'}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-fg-3">{nn.title}</span>
                  <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => void personal.restoreNonNeg(nn.id)}>
                    Put back
                  </Button>
                  <DeleteButton label={`Delete “${nn.title}” for good`} onClick={() => void deleteNonNegForever(nn, today)} />
                </div>
              ))}
            </div>
          </section>
        )}
      </Page>
    </>
  );
}

/** Seven round day buttons (M T W T F S S). At least one stays on. */
function WeekdayPicker({ value, onChange, label, start }: { value: number[]; onChange: (days: number[]) => void; label: string; start: 0 | 1 }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {weekOrder(start).map((d) => {
        const on = value.includes(d);
        const name = weekdayName(d, 'long');
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={name}
            data-tip={on ? `${name} · on` : `${name} · off`}
            onClick={() => {
              if (on && value.length === 1) {
                toast('Keep at least one day', { tone: 'error' });
                return;
              }
              onChange(on ? value.filter((x) => x !== d) : [...value, d]);
            }}
            className={cx(
              'flex h-7 w-7 items-center justify-center rounded-full text-[11.5px] font-medium transition-colors',
              on ? 'bg-brand text-brand-fg' : 'border border-line text-fg-3 hover:border-line-strong hover:text-fg',
            )}
          >
            {weekdayName(d, 'narrow')}
          </button>
        );
      })}
    </div>
  );
}

function AddForm({ start }: { start: 0 | 1 }) {
  const [time, setTime] = useState('');
  const [anytime, setAnytime] = useState(false); // "Anytime" picked on purpose, as opposed to nothing picked yet
  const [title, setTitle] = useState('');
  const [days, setDays] = useState<number[]>([...ALL_DAYS]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!anytime && !isHHMM(time)) {
      toast('Pick a time (or Anytime) for this non-negotiable', { tone: 'error' });
      return;
    }
    try {
      await personal.createNonNeg({ title, time: anytime ? null : time, days });
      setTitle('');
      setTime('');
      setAnytime(false);
      setDays([...ALL_DAYS]);
    } catch (err) {
      reportError(err);
    }
  };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-line-strong p-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <TimePicker
          variant="field"
          label="Time"
          value={time || null}
          onChange={(v) => {
            setTime(v ?? '');
            setAnytime(v === null);
          }}
          placeholder={anytime ? 'Anytime' : 'Pick a time'}
          allowClear
          clearLabel="Anytime"
          emptyChosen={anytime}
          suggest="07:00"
          className="sm:w-[150px]"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Gym — 1 hour"
          className="h-10 min-w-0 flex-1 bg-transparent px-2 text-[14.5px] text-fg outline-none placeholder:text-fg-3"
          aria-label="Non-negotiable"
        />
        <Button type="submit" variant="primary" disabled={!title.trim() || (!time && !anytime)}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 pt-2 pb-0.5">
        <WeekdayPicker value={days} onChange={setDays} label="Days it is on" start={start} />
        <span className="text-[12px] text-fg-3">{daysSummary(days, start)}</span>
      </div>
    </form>
  );
}

function NonNegRow({ nn, week, copies, today, start }: { nn: NonNegotiable; week: string[]; copies: Map<string, Task> | undefined; today: string; start: 0 | 1 }) {
  const [title, setTitle] = useState(nn.title);
  const doneCount = week.filter((d) => copies?.get(nnTaskId(nn.id, d))?.done).length;
  const days = nnDays(nn);
  const daysOff = (nn.offDates ?? []).filter((d) => d >= today);

  const commitTitle = () => {
    if (title.trim() && title !== nn.title) personal.updateNonNeg(nn.id, { title }, today).catch(reportError);
    else setTitle(nn.title);
  };

  return (
    <div className="px-1 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
        <TimePicker
          variant="inline"
          label={`Time for ${nn.title}`}
          value={nn.time}
          onChange={(v) => v !== nn.time && void personal.updateNonNeg(nn.id, { time: v }, today).catch(reportError)}
          placeholder="Anytime"
          allowClear
          clearLabel="Anytime"
          emptyChosen
          className="w-[124px]"
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
            const state = copy?.done ? 'done' : copy ? 'missed' : !nnOnDate(nn, d) ? 'off' : 'none';
            const tip = { done: 'Done', missed: d === today ? 'Not yet' : 'Not done', off: 'Day off', none: 'No record' }[state];
            return (
              <span key={d} data-tip={`${formatDate(d, { weekday: true })} · ${tip}`} className="flex h-2 w-2 items-center justify-center">
                <span
                  className={cx(
                    'rounded-full',
                    state === 'done' ? 'h-2 w-2 bg-fg' : state === 'missed' ? 'h-2 w-2 border border-fg-3' : state === 'off' ? 'h-[1.5px] w-2 bg-fg-4' : 'h-2 w-2 bg-active',
                  )}
                />
              </span>
            );
          })}
        </div>
        <DeleteButton label={`Remove “${nn.title}”`} onClick={() => void removeNonNegWithUndo(nn, today)} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 sm:pl-[136px]">
        <WeekdayPicker
          value={days}
          label={`Days “${nn.title}” is on`}
          start={start}
          onChange={(next) => void personal.updateNonNeg(nn.id, { days: next }, today).catch(reportError)}
        />
        <span className="text-[12px] text-fg-3">{daysSummary(days, start)}</span>
        {daysOff.map((d) => (
          <span key={d} className="inline-flex h-7 items-center gap-1 rounded-full border border-line pr-1 pl-2.5 text-[12px] text-fg-3">
            Off <span className="text-fg tabular-nums">{formatDate(d, { weekday: true })}</span>
            <button
              type="button"
              aria-label={`Put “${nn.title}” back on ${formatDate(d, { weekday: true })}`}
              data-tip="Put back"
              onClick={() => void personal.unskipNonNegOn(nn.id, d, undefined, today).catch(reportError)}
              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-hover hover:text-fg"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <label
          className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 text-[12px] text-fg-3 transition-colors focus-within:text-fg hover:bg-hover hover:text-fg"
          data-tip="Take it off one day only"
        >
          <CalendarPlus size={13} /> Day off
          <input
            type="date"
            min={today}
            value=""
            onClick={(e) => {
              try {
                e.currentTarget.showPicker();
              } catch {
                /* the browser opens it itself */
              }
            }}
            onChange={(e) => {
              const d = e.target.value;
              if (!d) return;
              if (d < today) {
                toast('Pick today or a later day', { tone: 'error' });
                return;
              }
              void skipNonNegWithUndo(nn, d, today);
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`Pick a day off for “${nn.title}”`}
          />
        </label>
      </div>
    </div>
  );
}
