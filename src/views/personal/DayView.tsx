import type { Editor } from '@tiptap/react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  CalendarDays,
  CalendarOff,
  CalendarX,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Ellipsis,
  GripVertical,
  Lightbulb,
  Minus,
  Plus,
  Repeat,
  Sun,
  Target,
  Trash2,
  TrendingDown,
  Trophy,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { TopBar } from '../../components/TopBar';
import { Button, cx, IconButton } from '../../components/ui/Button';
import { TimePicker } from '../../components/ui/TimePicker';
import { addDays, formatLongDate, parseISODate, toISODate, weekStartsOn } from '../../lib/dates';
import { byTime, nnDays, nnOnDate } from '../../lib/personalRepo';
import { clockLabel, daysSummary, hourLabel, hourValue, minutesOf, nextQuarterHour, parseTaskInput, relativeDayName, weekdayName } from '../../lib/personalText';
import { navigate, paths } from '../../lib/router';
import type { Goal, NonNegotiable, Task } from '../../lib/types';
import { reportError } from '../../state/actions';
import { openMenu, toast, type MenuItem } from '../../state/feedback';
import {
  dayWords,
  deleteTaskWithUndo,
  moveTaskWithUndo,
  removeDayItemWithUndo,
  removeNonNegWithUndo,
  skipDayWords,
  useGoalTasks,
  useNow,
  usePersonalLists,
  useToday,
} from '../../state/personal';
import { db, personal } from '../../state/repo';
import { useSettings } from '../../state/settings';
import { useUI } from '../../state/ui';
import { DeleteButton, GoalCard, Page, ProgressBar, SectionLabel, TaskCheck } from './parts';
import { RichNote } from './RichNote';
import { resetSortStyles, startTaskDrag } from './taskSort';

const shift = (date: string, days: number) => toISODate(addDays(parseISODate(date), days));
const hourOf = (time: string) => Number(time.slice(0, 2));

export function DayView({ date }: { date?: string }) {
  const today = useToday();
  const day = date ?? today;
  const isToday = day === today;
  const lists = usePersonalLists();
  const goalTasks = useGoalTasks();
  const tasks = useLiveQuery(() => db.tasks.where('date').equals(day).toArray(), [day]);
  const yesterday = shift(today, -1);
  const carry = useLiveQuery(
    () => (isToday ? db.tasks.where('date').equals(yesterday).filter((t) => !t.done && !t.nnId).count() : Promise.resolve(0)),
    [isToday, yesterday],
  );
  const nnStamp = lists?.nonnegs.map((n) => `${n.id}:${n.updatedAt}`).join('|');

  // Keep this day's non-negotiables in line with the list (today and later only).
  useEffect(() => {
    if (nnStamp === undefined) return;
    personal.ensureDay(day, today).catch(reportError);
  }, [nnStamp, day, today]);

  const sorted = useMemo(() => (tasks ? [...tasks].sort(byTime) : []), [tasks]);
  const goalById = useMemo(() => new Map((lists?.goals ?? []).map((g) => [g.id, g])), [lists]);
  const nnById = useMemo(() => new Map((lists?.nonnegs ?? []).map((n) => [n.id, n])), [lists]);
  // Non-negotiables that are off this day (today or later), so they don't just vanish without a word.
  const offToday = useMemo(() => (day >= today ? (lists?.activeNonnegs ?? []).filter((n) => !nnOnDate(n, day)) : []), [lists, day, today]);
  const done = sorted.filter((t) => t.done).length;

  const relative = relativeDayName(day, today);
  const title = isToday ? 'Today' : (relative ?? formatLongDate(parseISODate(day)));
  const eyebrow = isToday || relative ? formatLongDate(parseISODate(day)) : day < today ? 'Past day' : 'Coming up';

  const go = (to: string) => navigate(to === today ? paths.home() : paths.day(to));

  return (
    <>
      <TopBar
        crumbs={[{ label: isToday ? 'Today' : formatLongDate(parseISODate(day)), icon: isToday ? <Sun size={14} /> : <CalendarDays size={14} /> }]}
        actions={
          <>
            <IconButton label="Previous day" onClick={() => go(shift(day, -1))}>
              <ChevronLeft size={17} />
            </IconButton>
            {!isToday && (
              <Button size="sm" variant="ghost" onClick={() => go(today)}>
                Today
              </Button>
            )}
            <IconButton label="Next day" onClick={() => go(shift(day, 1))}>
              <ChevronRight size={17} />
            </IconButton>
            <label className="relative ml-0.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-[9px] text-fg-2 hover:bg-hover hover:text-fg" data-tip="Pick a day">
              <CalendarDays size={16} />
              <input
                type="date"
                value={day}
                onChange={(e) => e.target.value && go(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Pick a day"
              />
            </label>
          </>
        }
      />
      <Page>
        <header className="mb-7">
          <div className="label-display mb-2.5">{eyebrow}</div>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <h1 className="text-[34px] leading-[1.05] font-[560] tracking-[-0.03em] text-fg sm:text-[40px]">{title}</h1>
            {sorted.length > 0 && (
              <div className="pb-1 text-[13px] text-fg-3 tabular-nums">
                <span className="font-medium text-fg">{done}</span> / {sorted.length} done
              </div>
            )}
          </div>
          {sorted.length > 0 && <ProgressBar value={done / sorted.length} className="mt-4" />}
        </header>

        {lists && lists.activeGoals.length > 0 && (
          <section className="mb-8" aria-label="Goals">
            <SectionLabel action={<a href={paths.goals()} className="text-[12px] text-fg-3 hover:text-fg">All goals</a>}>Goals</SectionLabel>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {lists.activeGoals.slice(0, 3).map((g) => (
                <GoalCard key={g.id} goal={g} linked={goalTasks?.get(g.id) ?? []} today={today} />
              ))}
            </div>
          </section>
        )}

        {isToday && !!carry && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-[13px]">
            <span className="text-fg">
              {carry} unfinished task{carry === 1 ? '' : 's'} from yesterday
            </span>
            <Button
              size="sm"
              icon={<ArrowRight size={14} />}
              onClick={async () => {
                const n = await personal.moveUnfinished(yesterday, today);
                if (n) toast(`Moved ${n} task${n === 1 ? '' : 's'} to today`, { tone: 'success' });
              }}
            >
              Move to today
            </Button>
          </div>
        )}

        <AddTaskBar day={day} isToday={isToday} goals={lists?.activeGoals ?? []} />

        {lists && lists.activeNonnegs.length === 0 && day >= today && (
          <a
            href={paths.nonnegotiables()}
            className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-dashed border-line-strong px-4 py-3.5 transition-colors hover:bg-hover"
          >
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium text-fg">Set your non-negotiables</span>
              <span className="block text-[12.5px] text-fg-3">The things you do every day, no matter what. Each one shows up here at its time.</span>
            </span>
            <ArrowRight size={16} className="shrink-0 text-fg-3" />
          </a>
        )}

        {offToday.length > 0 && <OffThisDay day={day} today={today} nonnegs={offToday} />}

        <Timeline day={day} isToday={isToday} tasks={sorted} goalById={goalById} nnById={nnById} goals={lists?.activeGoals ?? []} today={today} />

        <WinsAndLosses key={`wl-${day}`} day={day} isToday={isToday} />

        <JournalSection key={day} day={day} />
      </Page>
    </>
  );
}

/* ------------------------------ Adding ------------------------------ */

function AddTaskBar({ day, isToday, goals }: { day: string; isToday: boolean; goals: Goal[] }) {
  const [text, setText] = useState('');
  const [time, setTime] = useState('');
  const [goalId, setGoalId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dayFocus = useUI((s) => s.dayFocus);

  useEffect(() => {
    if (dayFocus?.target === 'task' && Date.now() - dayFocus.at < 2000) {
      input.current?.focus();
      useUI.getState().set({ dayFocus: null });
    }
  }, [dayFocus]);

  const goal = goals.find((g) => g.id === goalId);
  const parsed = parseTaskInput(text);
  const finalTime = time || parsed.time;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await personal.createTask({ date: day, title: parsed.title, time: finalTime, goalId });
      setText('');
      setTime('');
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <form onSubmit={submit} className="mb-8 rounded-2xl border border-line-strong p-1.5 focus-within:border-fg-3">
      <div className="flex items-center gap-2 pl-2.5">
        <Plus size={16} className="shrink-0 text-fg-3" />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task — try “Call Sara at 3pm”"
          className="h-10 min-w-0 flex-1 bg-transparent text-[14.5px] text-fg outline-none placeholder:text-fg-3"
          aria-label="New task"
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
        />
        <Button type="submit" size="sm" variant="primary" disabled={!text.trim()} className="mr-0.5">
          Add
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-1.5 pt-1 pb-0.5">
        <TimePicker
          label="Time"
          value={finalTime}
          onChange={(v) => setTime(v ?? '')}
          placeholder="Anytime"
          allowClear
          clearLabel="Anytime"
          suggest={isToday ? nextQuarterHour() : '09:00'}
        />
        {goals.length > 0 && (
          <button
            type="button"
            onClick={(e) =>
              openMenu(
                e.currentTarget,
                [
                  { type: 'label', label: 'Moves a goal forward' },
                  { label: 'No goal', checked: !goalId, onSelect: () => setGoalId(null) },
                  ...goals.map<MenuItem>((g) => ({ label: g.title, checked: g.id === goalId, onSelect: () => setGoalId(g.id) })),
                ],
                { minWidth: 220 },
              )
            }
            className={cx(
              'flex h-7 max-w-[240px] items-center gap-1.5 rounded-lg border px-2 text-[12px] transition-colors',
              goal ? 'border-line-strong text-fg' : 'border-line text-fg-3 hover:text-fg',
            )}
          >
            <Target size={13} className="shrink-0" />
            <span className="truncate">{goal ? goal.title : 'Goal'}</span>
          </button>
        )}
      </div>
    </form>
  );
}

/* ----------------------------- Timeline ----------------------------- */

/** "Off today: Gym (skipped) · Put back", "Reading (not on Saturdays)". */
function OffThisDay({ day, today, nonnegs }: { day: string; today: string; nonnegs: NonNegotiable[] }) {
  const weekday = parseISODate(day).getDay();
  return (
    <div className="-mt-4 mb-7 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 text-[12.5px] text-fg-3" aria-label="Non-negotiables off this day">
      <span className="inline-flex items-center gap-1.5">
        <CalendarOff size={13} /> Off {day === today ? 'today' : 'this day'}:
      </span>
      {nonnegs.map((nn) => {
        const skipped = !!nn.offDates?.includes(day);
        return (
          <span key={nn.id} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line pr-1 pl-2.5">
            <span className="text-fg">{nn.title}</span>
            <span>{skipped ? 'skipped' : `not on ${weekdayName(weekday, 'long')}s`}</span>
            {skipped ? (
              <button
                type="button"
                onClick={() => void personal.unskipNonNegOn(nn.id, day, undefined, today).catch(reportError)}
                className="h-5 rounded-full px-2 text-[12px] text-fg hover:bg-hover"
              >
                Put back
              </button>
            ) : (
              <a href={paths.nonnegotiables()} className="h-5 rounded-full px-2 text-[12px] leading-5 text-fg hover:bg-hover">
                Change days
              </a>
            )}
          </span>
        );
      })}
    </div>
  );
}

function Timeline({
  day,
  isToday,
  tasks,
  goalById,
  nnById,
  goals,
  today,
}: {
  day: string;
  isToday: boolean;
  tasks: Task[];
  goalById: Map<string, Goal>;
  nnById: Map<string, NonNegotiable>;
  goals: Goal[];
  today: string;
}) {
  const dayStart = useSettings((s) => s.dayStart);
  const dayEnd = useSettings((s) => s.dayEnd);
  const now = useNow();
  const [addingAt, setAddingAt] = useState<number | null>(null);

  const anytime = tasks.filter((t) => !t.time);
  const timed = tasks.filter((t) => t.time);
  const byHour = new Map<number, Task[]>();
  for (const t of timed) {
    const h = hourOf(t.time!);
    const list = byHour.get(h);
    if (list) list.push(t);
    else byHour.set(h, [t]);
  }
  const first = Math.min(dayStart, ...timed.map((t) => hourOf(t.time!)));
  const last = Math.max(dayEnd, ...timed.map((t) => hourOf(t.time!)));
  const hours: number[] = [];
  for (let h = first; h <= last; h++) hours.push(h);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowHour = now.getHours();

  // Each task's place inside its own hour block (or the Anytime list), for the "Move up / down" menu.
  const zoneInfo = useMemo(() => {
    const zones = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = t.time ? `h${hourOf(t.time)}` : 'any';
      const list = zones.get(key);
      if (list) list.push(t);
      else zones.set(key, [t]);
    }
    const info = new Map<string, { index: number; size: number }>();
    for (const list of zones.values()) list.forEach((t, index) => info.set(t.id, { index, size: list.length }));
    return info;
  }, [tasks]);

  // A drag leaves a copy of the row at its landing spot until the day re-renders with the task there: clear it then, before paint.
  useLayoutEffect(() => resetSortStyles(), [tasks]);

  const row = (t: Task) => (
    <TaskRow
      key={t.id}
      task={t}
      goal={t.goalId ? goalById.get(t.goalId) : undefined}
      nn={t.nnId ? nnById.get(t.nnId) : undefined}
      goals={goals}
      day={day}
      today={today}
      zone={zoneInfo.get(t.id)}
    />
  );

  return (
    <>
      <section className="mb-8" aria-label="Anytime">
        <SectionLabel>Anytime</SectionLabel>
        <div data-drop-zone="anytime" className="space-y-px">
          {anytime.length === 0 ? <p className="px-2 py-1.5 text-[13px] text-fg-3">Tasks without a time land here.</p> : anytime.map(row)}
        </div>
      </section>

      <section className="mb-12" aria-label="Schedule">
        <SectionLabel>Schedule</SectionLabel>
        <div className="border-b border-line">
          {hours.map((h) => {
            const items = byHour.get(h) ?? [];
            const current = isToday && h === nowHour;
            const before = current ? items.filter((t) => minutesOf(t.time!) <= nowMin) : items;
            const after = current ? items.filter((t) => minutesOf(t.time!) > nowMin) : [];
            return (
              <div key={h} className="group/hour relative flex border-t border-line" data-hour={h}>
                <div className={cx('flex w-[60px] shrink-0 flex-col items-start gap-1 pt-[11px] text-[12px] tabular-nums sm:w-[72px]', current ? 'font-medium text-fg' : 'text-fg-3')}>
                  {hourLabel(h)}
                  {/* In the label column, so it never covers a task's own buttons. */}
                  {items.length > 0 && addingAt !== h && (
                    <IconButton
                      label={`Add at ${hourLabel(h)}`}
                      size="xs"
                      className="-ml-1 opacity-0 group-hover/hour:opacity-100 focus-visible:opacity-100 max-lg:hidden"
                      onClick={() => setAddingAt(h)}
                    >
                      <Plus size={13} />
                    </IconButton>
                  )}
                </div>
                <div data-drop-zone={`hour-${h}`} className="min-w-0 flex-1 py-1">
                  {before.map(row)}
                  {current && <NowLine />}
                  {after.map(row)}
                  {addingAt === h ? (
                    <InlineAdd day={day} time={hourValue(h)} onDone={() => setAddingAt(null)} />
                  ) : items.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setAddingAt(h)}
                      className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[12.5px] text-fg-3 opacity-0 transition-opacity group-hover/hour:opacity-100 hover:bg-hover hover:text-fg focus-visible:opacity-100"
                    >
                      <Plus size={13} /> Add at {hourLabel(h)}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function NowLine() {
  return (
    <div className="relative my-1 flex items-center gap-2" aria-label="Now">
      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-fg" />
      <span className="h-px flex-1 bg-fg" />
      <span className="text-[10.5px] font-medium tracking-wide text-fg uppercase">Now</span>
    </div>
  );
}

function InlineAdd({ day, time, onDone }: { day: string; time: string; onDone: () => void }) {
  const [text, setText] = useState('');
  const submit = async () => {
    const parsed = parseTaskInput(text);
    if (!parsed.title.trim()) return onDone();
    try {
      await personal.createTask({ date: day, title: parsed.title, time: parsed.time ?? time });
      setText('');
    } catch (err) {
      reportError(err);
    }
  };
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span className="h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-fg-3" />
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
          if (e.key === 'Escape') onDone();
        }}
        onBlur={() => {
          if (text.trim()) void submit().then(onDone);
          else onDone();
        }}
        placeholder={`Task at ${clockLabel(time, { compact: true })}`}
        className="h-7 min-w-0 flex-1 bg-transparent text-[14.5px] text-fg outline-none placeholder:text-fg-3"
        aria-label={`New task at ${clockLabel(time, { compact: true })}`}
      />
    </div>
  );
}

/* ------------------------------ Task row ---------------------------- */

export function TaskRow({
  task,
  goal,
  goals,
  day,
  today,
  showDate,
  nn,
  zone,
}: {
  task: Task;
  goal?: Goal;
  goals: Goal[];
  day: string;
  today: string;
  showDate?: boolean;
  /** The non-negotiable this task is a copy of, when it is one. */
  nn?: NonNegotiable;
  /** Set on a day's page: where this task sits in its hour block (or the Anytime list), and how many are there. Your own tasks then get a drag handle. */
  zone?: { index: number; size: number };
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [timeEdit, setTimeEdit] = useState(false);
  const isNN = !!task.nnId;
  const exactTime = task.time && !task.time.endsWith(':00') ? task.time : null;

  const commitTitle = () => {
    setEditing(false);
    if (title.trim() && title !== task.title) personal.updateTask(task.id, { title }).catch(reportError);
    else setTitle(task.title);
  };

  const upcoming = task.date >= today;
  const skipWords = skipDayWords(task.date, today);
  const deleteLabel = isNN ? (upcoming ? `Skip “${task.title}” ${skipWords}` : `Delete “${task.title}” from this day`) : `Delete “${task.title}”`;
  const remove = () => void deleteTaskWithUndo(task, today);

  const menu = (anchor: HTMLElement) => {
    if (isNN) {
      const weekday = parseISODate(task.date).getDay();
      const days = nn ? nnDays(nn) : [];
      openMenu(
        anchor,
        upcoming
          ? [
              { label: `Skip ${skipWords}`, icon: <CalendarOff size={14} />, onSelect: remove },
              ...(nn && days.length > 1
                ? [
                    {
                      label: `Off every ${weekdayName(weekday, 'long')}`,
                      icon: <CalendarX size={14} />,
                      onSelect: () => {
                        personal
                          .updateNonNeg(nn.id, { days: days.filter((d) => d !== weekday) }, today)
                          .then(() =>
                            toast(`“${nn.title}” is off on ${weekdayName(weekday, 'long')}s`, {
                              action: { label: 'Undo', run: () => void personal.updateNonNeg(nn.id, { days }, today).catch(reportError) },
                            }),
                          )
                          .catch(reportError);
                      },
                    },
                  ]
                : []),
              { label: 'Edit non-negotiables', icon: <Repeat size={14} />, onSelect: () => navigate(paths.nonnegotiables()) },
              { type: 'separator' },
              { label: 'Remove from every day', icon: <Trash2 size={14} />, danger: true, onSelect: () => void removeNonNegWithUndo({ id: task.nnId!, title: task.title }, today) },
            ]
          : [
              { label: 'Edit non-negotiables', icon: <Repeat size={14} />, onSelect: () => navigate(paths.nonnegotiables()) },
              { type: 'separator' },
              { label: 'Delete from this day', icon: <Trash2 size={14} />, danger: true, onSelect: remove },
            ],
        { align: 'end', minWidth: 230 },
      );
      return;
    }
    const prevDay = shift(task.date, -1);
    const nextDay = shift(task.date, 1);
    const moveToDay = (to: string) => void moveTaskWithUndo(task, to, today);
    const moveTo =(to: 'top' | 'up' | 'down') => void personal.moveTask(task.id, to).catch(reportError);
    openMenu(
      anchor,
      [
        ...(zone && zone.size > 1
          ? [
              ...(zone.index > 0 ? [{ label: 'Move to top', icon: <ArrowUpToLine size={14} />, onSelect: () => moveTo('top') }] : []),
              ...(zone.index > 1 ? [{ label: 'Move up', icon: <ArrowUp size={14} />, onSelect: () => moveTo('up') }] : []),
              ...(zone.index < zone.size - 1 ? [{ label: 'Move down', icon: <ArrowDown size={14} />, onSelect: () => moveTo('down') }] : []),
              { type: 'separator' as const },
            ]
          : []),
        { label: task.time ? 'Change time' : 'Set a time', icon: <Clock size={14} />, onSelect: () => setTimeEdit(true) },
        ...(task.time ? [{ label: 'Make it anytime', icon: <X size={14} />, onSelect: () => void personal.updateTask(task.id, { time: null }).catch(reportError) }] : []),
        { label: `Move to ${dayWords(prevDay, today)}`, icon: <ArrowLeft size={14} />, onSelect: () => moveToDay(prevDay) },
        { label: `Move to ${dayWords(nextDay, today)}`, icon: <ArrowRight size={14} />, onSelect: () => moveToDay(nextDay) },
        ...(task.date !== today && prevDay !== today && nextDay !== today ? [{ label: 'Move to today', icon: <Sun size={14} />, onSelect: () => moveToDay(today) }] : []),
        ...(goals.length
          ? [
              { type: 'separator' as const },
              { type: 'label' as const, label: 'Goal' },
              { label: 'No goal', checked: !task.goalId, onSelect: () => void personal.updateTask(task.id, { goalId: null }) },
              ...goals.map<MenuItem>((g) => ({ label: g.title, checked: g.id === task.goalId, onSelect: () => void personal.updateTask(task.id, { goalId: g.id }) })),
            ]
          : []),
        { type: 'separator' },
        { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: remove },
      ],
      { align: 'end', minWidth: 220 },
    );
  };

  return (
    <div
      ref={rowRef}
      data-task-row=""
      data-task-id={task.id}
      data-time={task.time ?? ''}
      className="group/task flex items-start gap-3 rounded-lg px-2 py-[7px] transition-colors hover:bg-hover data-[dragging=true]:opacity-35"
    >
      <TaskCheck className="mt-[3px]" done={task.done} label={task.done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`} onToggle={() => void personal.setDone(task.id, !task.done)} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') {
                setTitle(task.title);
                setEditing(false);
              }
            }}
            className="h-6 w-full bg-transparent text-[14.5px] text-fg outline-none"
            aria-label="Task title"
          />
        ) : (
          <div
            className={cx('text-[14.5px] leading-6 break-words', task.done ? 'text-fg-3 line-through decoration-fg-4' : 'text-fg', !isNN && 'cursor-text')}
            onClick={() => !isNN && setEditing(true)}
          >
            {exactTime && <span className="mr-2 text-[12.5px] text-fg-3 tabular-nums">{clockLabel(exactTime)}</span>}
            {task.title}
          </div>
        )}
        {(isNN || goal || showDate || timeEdit) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-3">
            {isNN && (
              <span className="inline-flex items-center gap-1">
                <Repeat size={11} /> {nn ? daysSummary(nnDays(nn), weekStartsOn()) : 'Repeats'}
              </span>
            )}
            {goal && (
              <a href={paths.goal(goal.id)} className="inline-flex max-w-[260px] items-center gap-1 hover:text-fg">
                <Target size={11} className="shrink-0" />
                <span className="truncate">{goal.title}</span>
              </a>
            )}
            {showDate && <a href={task.date === today ? paths.home() : paths.day(task.date)} className="hover:text-fg">{relativeDayName(task.date, today) ?? task.date}</a>}
            {timeEdit && (
              <TimePicker
                defaultOpen
                label="Task time"
                value={task.time}
                onChange={(v) => v !== task.time && void personal.updateTask(task.id, { time: v }).catch(reportError)}
                onClose={() => setTimeEdit(false)}
                allowClear
                clearLabel="Anytime"
                placeholder="Anytime"
                suggest={day === today ? nextQuarterHour() : '09:00'}
              />
            )}
          </div>
        )}
      </div>
      <div className="-my-0.5 flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover/task:opacity-100 focus-within:opacity-100 max-lg:opacity-100">
        {zone && !isNN && (
          <IconButton
            label={`Drag “${task.title}” to move it`}
            size="sm"
            tip={false}
            data-tip="Drag to move or reorder"
            data-sort-handle={task.id}
            className="cursor-grab touch-none text-fg-3!"
            onPointerDown={(e) => rowRef.current && startTaskDrag(e, rowRef.current, (spot) => personal.placeTask(task.id, spot))}
            onClick={(e) => e.preventDefault()}
          >
            <GripVertical size={15} />
          </IconButton>
        )}
        <IconButton label="Task options" size="sm" tip={false} className="text-fg-3!" onClick={(e) => menu(e.currentTarget)}>
          <Ellipsis size={15} />
        </IconButton>
        <DeleteButton label={deleteLabel} onClick={remove} />
      </div>
    </div>
  );
}

/* -------------------------- Wins and losses -------------------------- */

/** What went well (and how many), and what went wrong with the lesson it taught. Saved on the day's journal entry. */
function WinsAndLosses({ day, isToday }: { day: string; isToday: boolean }) {
  const entry = useLiveQuery(async () => (await db.journal.get(day)) ?? null, [day]);
  const wins = entry?.wins ?? [];
  const losses = entry?.losses ?? [];

  return (
    <section aria-label="Wins and losses" className="mb-12">
      <SectionLabel>Wins &amp; losses</SectionLabel>
      <div className="grid gap-3 md:grid-cols-2">
        <DayCard icon={<Trophy size={14} />} title="Wins" count={wins.length} hint={isToday ? 'What went well today — what you achieved' : 'What went well — what you achieved'}>
          {wins.map((w) => (
            <div key={w.id} className="flex items-start gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-hover">
              <Check size={14} strokeWidth={2.25} className="mt-[5px] shrink-0 text-fg" />
              <InlineText value={w.text} label="Win" onCommit={(text) => personal.updateDayItem(day, 'wins', w.id, { text })} className="text-[14px] leading-6 text-fg" />
              <DeleteButton size="xs" label={`Remove win “${w.text}”`} className="mt-0.5" onClick={() => void removeDayItemWithUndo(day, 'wins', w.id)} />
            </div>
          ))}
          <AddDayItem label="Add a win" onAdd={(text) => personal.addWin(day, text)} />
        </DayCard>

        <DayCard icon={<TrendingDown size={14} />} title="Losses" count={losses.length} hint="What went wrong — and the lesson it taught">
          {losses.map((l) => (
            <div key={l.id} className="rounded-lg px-1.5 py-1 transition-colors hover:bg-hover">
              <div className="flex items-start gap-2.5">
                <Minus size={14} strokeWidth={2.25} className="mt-[5px] shrink-0 text-fg" />
                <InlineText value={l.text} label="Loss" onCommit={(text) => personal.updateDayItem(day, 'losses', l.id, { text })} className="text-[14px] leading-6 text-fg" />
                <DeleteButton size="xs" label={`Remove loss “${l.text}”`} className="mt-0.5" onClick={() => void removeDayItemWithUndo(day, 'losses', l.id)} />
              </div>
              <div className="flex items-start gap-2.5 pl-6">
                <Lightbulb size={13} className="mt-[4.5px] shrink-0 text-fg-3" />
                <InlineText
                  value={l.lesson}
                  label={`Lesson from “${l.text}”`}
                  placeholder="Lesson learned…"
                  allowEmpty
                  onCommit={(lesson) => personal.updateDayItem(day, 'losses', l.id, { lesson })}
                  className="text-[13.5px] leading-[22px] text-fg"
                />
              </div>
            </div>
          ))}
          <AddLoss onAdd={(text, lesson) => personal.addLoss(day, text, lesson)} />
        </DayCard>
      </div>
    </section>
  );
}

function DayCard({ icon, title, count, hint, children }: { icon: ReactNode; title: string; count: number; hint: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-line px-3 pt-3.5 pb-2">
      <div className="mb-2 flex items-start justify-between gap-3 px-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[14px] font-medium text-fg">
            {icon}
            {title}
          </div>
          <div className="mt-0.5 text-[12px] text-fg-3">{hint}</div>
        </div>
        <span className="text-[28px] leading-none font-[560] tracking-[-0.02em] text-fg tabular-nums" aria-label={`${count} ${title.toLowerCase()}`}>
          {count}
        </span>
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

function AddDayItem({ label, onAdd }: { label: string; onAdd: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text;
    if (!t.trim()) return;
    // Clear at once, so letters typed while it saves start the next one cleanly.
    setText('');
    try {
      await onAdd(t);
    } catch (err) {
      setText(t);
      reportError(err);
    }
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2.5 px-1.5 py-0.5">
      <Plus size={14} className="shrink-0 text-fg-3" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (e.target as HTMLInputElement).blur()}
        placeholder={label}
        aria-label={label}
        className="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3"
      />
    </form>
  );
}

/**
 * "Add a loss", then Enter moves straight to its lesson (no waiting on a save,
 * so nothing typed lands in the wrong box). Enter there saves both; leaving the
 * form with a loss written saves it too.
 */
function AddLoss({ onAdd }: { onAdd: (text: string, lesson: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const [lesson, setLesson] = useState('');
  const draft = useRef({ text: '', lesson: '' });
  draft.current = { text, lesson };
  const textRef = useRef<HTMLInputElement>(null);
  const lessonRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    const { text: t, lesson: l } = draft.current;
    if (!t.trim()) return;
    draft.current = { text: '', lesson: '' };
    setText('');
    setLesson('');
    try {
      await onAdd(t, l);
    } catch (err) {
      setText(t);
      setLesson(l);
      reportError(err);
    }
  };

  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Cancel: drop the draft, then leave (so leaving doesn't save it).
      draft.current = { text: '', lesson: '' };
      setText('');
      setLesson('');
      e.currentTarget.blur();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.currentTarget === textRef.current) {
      if (draft.current.text.trim()) lessonRef.current?.focus();
    } else {
      textRef.current?.focus();
      void save();
    }
  };

  return (
    <div
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void save();
      }}
    >
      <div className="flex items-center gap-2.5 px-1.5 py-0.5">
        <Plus size={14} className="shrink-0 text-fg-3" />
        <input
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={keys}
          placeholder="Add a loss"
          aria-label="Add a loss"
          className="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3"
        />
      </div>
      {/* Always there (hidden until a loss is written), so Enter can move focus to it at once. */}
      <div className={cx('flex items-center gap-2.5 pl-[30px]', !text.trim() && 'hidden')}>
        <Lightbulb size={13} className="shrink-0 text-fg-3" />
        <input
          ref={lessonRef}
          value={lesson}
          onChange={(e) => setLesson(e.target.value)}
          onKeyDown={keys}
          placeholder="Lesson learned — Enter to save"
          aria-label="Lesson learned"
          className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] text-fg outline-none placeholder:text-fg-3"
        />
      </div>
    </div>
  );
}

/**
 * Text that is edited where it sits: wraps like normal text, saves on Enter or
 * when focus leaves, Escape cancels. Empty text puts the old text back unless
 * `allowEmpty`.
 */
function InlineText({
  value,
  onCommit,
  label,
  placeholder,
  className,
  allowEmpty,
}: {
  value: string;
  onCommit: (text: string) => Promise<unknown>;
  label: string;
  placeholder?: string;
  className?: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef(false);

  // Take changes made elsewhere (another device, undo), but never while typing.
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(value);
  }, [value]);

  // Grow with the text, and again when the column's width changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = '0px';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          cancel.current = true;
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (cancel.current) {
          cancel.current = false;
          setText(value);
          return;
        }
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean && !allowEmpty) {
          setText(value);
          return;
        }
        setText(clean);
        if (clean !== value) onCommit(clean).catch(reportError);
      }}
      className={cx('block min-w-0 flex-1 resize-none overflow-hidden bg-transparent outline-none placeholder:text-fg-3', className)}
    />
  );
}

/* ------------------------------ Journal ----------------------------- */

function JournalSection({ day }: { day: string }) {
  const entry = useLiveQuery(async () => (await db.journal.get(day)) ?? null, [day]);
  const editor = useRef<Editor | null>(null);
  const section = useRef<HTMLElement>(null);
  const dayFocus = useUI((s) => s.dayFocus);

  useEffect(() => {
    if (entry === undefined) return;
    if (dayFocus?.target === 'journal' && Date.now() - dayFocus.at < 2000) {
      section.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      editor.current?.view.focus();
      editor.current?.commands.focus('end');
      useUI.getState().set({ dayFocus: null });
    }
  }, [dayFocus, entry]);

  return (
    <section ref={section} aria-label="Journal" className="scroll-mt-6">
      <SectionLabel action={<a href={paths.journal()} className="text-[12px] text-fg-3 hover:text-fg">All entries</a>}>Thoughts of the day</SectionLabel>
      <div className="rounded-2xl border border-line px-5 pt-4">
        {entry === undefined ? (
          <div className="h-[7em]" />
        ) : (
          <RichNote
            initial={entry?.json}
            onSave={(json) => personal.saveJournal(day, json)}
            placeholder="What’s on your mind today?"
            compact
            label="Thoughts of the day"
            editorRef={(e) => {
              editor.current = e;
            }}
          />
        )}
      </div>
    </section>
  );
}
