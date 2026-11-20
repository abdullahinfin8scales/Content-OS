import type { Editor } from '@tiptap/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock, Ellipsis, Plus, Repeat, Sun, Target, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { TopBar } from '../../components/TopBar';
import { Button, cx, IconButton } from '../../components/ui/Button';
import { TimePicker } from '../../components/ui/TimePicker';
import { addDays, formatLongDate, parseISODate, toISODate } from '../../lib/dates';
import { byTime } from '../../lib/personalRepo';
import { clockLabel, hourLabel, hourValue, minutesOf, nextQuarterHour, parseTaskInput, relativeDayName } from '../../lib/personalText';
import { navigate, paths } from '../../lib/router';
import type { Goal, Task } from '../../lib/types';
import { reportError } from '../../state/actions';
import { openMenu, toast, type MenuItem } from '../../state/feedback';
import { useGoalTasks, useNow, usePersonalLists, useToday } from '../../state/personal';
import { db, personal } from '../../state/repo';
import { useSettings } from '../../state/settings';
import { useUI } from '../../state/ui';
import { GoalCard, Page, ProgressBar, SectionLabel, TaskCheck } from './parts';
import { RichNote } from './RichNote';

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

        <Timeline day={day} isToday={isToday} tasks={sorted} goalById={goalById} goals={lists?.activeGoals ?? []} today={today} />

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

function Timeline({
  day,
  isToday,
  tasks,
  goalById,
  goals,
  today,
}: {
  day: string;
  isToday: boolean;
  tasks: Task[];
  goalById: Map<string, Goal>;
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

  const row = (t: Task) => <TaskRow key={t.id} task={t} goal={t.goalId ? goalById.get(t.goalId) : undefined} goals={goals} day={day} today={today} />;

  return (
    <>
      <section className="mb-8" aria-label="Anytime">
        <SectionLabel>Anytime</SectionLabel>
        {anytime.length === 0 ? (
          <p className="px-2 py-1.5 text-[13px] text-fg-3">Tasks without a time land here.</p>
        ) : (
          <div className="space-y-px">{anytime.map(row)}</div>
        )}
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
                <div className="min-w-0 flex-1 py-1">
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

export function TaskRow({ task, goal, goals, day, today, showDate }: { task: Task; goal?: Goal; goals: Goal[]; day: string; today: string; showDate?: boolean }) {
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

  const menu = (anchor: HTMLElement) => {
    if (isNN) {
      openMenu(anchor, [{ label: 'Edit non-negotiables', icon: <Repeat size={14} />, onSelect: () => navigate(paths.nonnegotiables()) }], { align: 'end', minWidth: 210 });
      return;
    }
    const otherDay = day === today ? shift(day, 1) : today;
    openMenu(
      anchor,
      [
        { label: task.time ? 'Change time' : 'Set a time', icon: <Clock size={14} />, onSelect: () => setTimeEdit(true) },
        ...(task.time ? [{ label: 'Make it anytime', icon: <X size={14} />, onSelect: () => void personal.updateTask(task.id, { time: null }).catch(reportError) }] : []),
        { label: day === today ? 'Move to tomorrow' : 'Move to today', icon: <ArrowRight size={14} />, onSelect: () => void personal.updateTask(task.id, { date: otherDay }).catch(reportError) },
        ...(goals.length
          ? [
              { type: 'separator' as const },
              { type: 'label' as const, label: 'Goal' },
              { label: 'No goal', checked: !task.goalId, onSelect: () => void personal.updateTask(task.id, { goalId: null }) },
              ...goals.map<MenuItem>((g) => ({ label: g.title, checked: g.id === task.goalId, onSelect: () => void personal.updateTask(task.id, { goalId: g.id }) })),
            ]
          : []),
        { type: 'separator' },
        {
          label: 'Delete',
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: async () => {
            const removed = await personal.deleteTask(task.id).catch(reportError);
            if (removed) toast('Task deleted', { action: { label: 'Undo', run: () => void personal.restoreTask(removed) } });
          },
        },
      ],
      { align: 'end', minWidth: 220 },
    );
  };

  return (
    <div className="group/task flex items-start gap-3 rounded-lg px-2 py-[7px] transition-colors hover:bg-hover">
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
                <Repeat size={11} /> Daily
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
      <IconButton
        label="Task options"
        size="xs"
        tip={false}
        className="mt-px opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
        onClick={(e) => menu(e.currentTarget)}
      >
        <Ellipsis size={14} />
      </IconButton>
    </div>
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
