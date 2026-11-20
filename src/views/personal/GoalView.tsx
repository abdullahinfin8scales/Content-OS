import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Ellipsis, Plus, RotateCcw, Target, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { TopBar } from '../../components/TopBar';
import { Button, IconButton } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDate, isISODate } from '../../lib/dates';
import { goalProgress } from '../../lib/personalRepo';
import { daysLeftLabel, parseTaskInput } from '../../lib/personalText';
import { navigate, paths } from '../../lib/router';
import type { Goal, GoalMeasure, Task } from '../../lib/types';
import { reportError } from '../../state/actions';
import { openMenu } from '../../state/feedback';
import { deleteGoalWithConfirm, useToday } from '../../state/personal';
import { db, personal } from '../../state/repo';
import { TaskRow } from './DayView';
import { DeleteButton, Page, ProgressBar, progressText, SectionLabel } from './parts';

export function GoalView({ id }: { id: string }) {
  const goal = useLiveQuery(async () => (await db.goals.get(id)) ?? null, [id]);
  const linked = useLiveQuery(() => db.tasks.where('goalId').equals(id).toArray(), [id]);
  const today = useToday();

  if (goal === undefined || linked === undefined) return <TopBar crumbs={[{ label: 'Goals', href: paths.goals() }]} />;
  if (!goal) {
    return (
      <>
        <TopBar crumbs={[{ label: 'Goals', href: paths.goals() }, { label: 'Not found' }]} />
        <EmptyState title="This goal doesn’t exist" body="It may have been deleted." action={<Button onClick={() => navigate(paths.goals())}>All goals</Button>} />
      </>
    );
  }
  return <GoalPage key={goal.id} goal={goal} linked={linked} today={today} />;
}

function GoalPage({ goal, linked, today }: { goal: Goal; linked: Task[]; today: string }) {
  const [title, setTitle] = useState(goal.title);
  const [why, setWhy] = useState(goal.why);
  useEffect(() => setTitle(goal.title), [goal.title]);
  useEffect(() => setWhy(goal.why), [goal.why]);

  const progress = goalProgress(goal, linked);
  const byDate = useMemo(() => {
    const sorted = [...linked].sort((a, b) => (a.date === b.date ? Number(a.done) - Number(b.done) : a.date < b.date ? 1 : -1));
    const open = sorted.filter((t) => !t.done);
    const done = sorted.filter((t) => t.done);
    return { open, done };
  }, [linked]);

  const setStatus = (status: Goal['status']) => void personal.updateGoal(goal.id, { status }).catch(reportError);

  const remove = () => deleteGoalWithConfirm(goal, linked.length, true);

  return (
    <>
      <TopBar
        crumbs={[{ label: 'Goals', href: paths.goals(), icon: <Target size={14} /> }, { label: goal.title }]}
        actions={
          <>
            <DeleteButton label="Delete goal" size="md" onClick={() => void remove()} />
            <IconButton
              label="Goal options"
              onClick={(e) =>
                openMenu(
                  e.currentTarget,
                  [
                    ...(goal.status === 'active'
                      ? [
                          { label: 'Mark achieved', icon: <Check size={14} />, onSelect: () => setStatus('achieved') },
                          { label: 'Drop this goal', icon: <X size={14} />, onSelect: () => setStatus('dropped') },
                        ]
                      : [{ label: 'Make active again', icon: <RotateCcw size={14} />, onSelect: () => setStatus('active') }]),
                    { type: 'separator' },
                    { label: 'Delete goal', icon: <Trash2 size={14} />, danger: true, onSelect: () => void remove() },
                  ],
                  { align: 'end', minWidth: 200 },
                )
              }
            >
              <Ellipsis size={16} />
            </IconButton>
          </>
        }
      />
      <Page>
        <div className="label-display mb-3">
          {goal.status === 'achieved' ? 'Achieved' : goal.status === 'dropped' ? 'Dropped' : daysLeftLabel(goal.targetDate, today)}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => (title.trim() && title !== goal.title ? personal.updateGoal(goal.id, { title }) : setTitle(goal.title))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-full bg-transparent text-[30px] leading-tight font-[560] tracking-[-0.028em] text-fg outline-none sm:text-[36px]"
          aria-label="Goal"
        />
        <textarea
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          onBlur={() => why !== goal.why && personal.updateGoal(goal.id, { why })}
          placeholder="Why does this matter to you?"
          rows={Math.max(2, why.split('\n').length)}
          className="mt-3 w-full resize-none bg-transparent text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-3"
          aria-label="Why it matters"
        />

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-fg-3">
          <span>Started {formatDate(goal.startDate)}</span>
          <label className="flex items-center gap-2">
            Reach it by
            <input
              type="date"
              defaultValue={goal.targetDate}
              key={goal.targetDate}
              onBlur={(e) => isISODate(e.target.value) && e.target.value !== goal.targetDate && personal.updateGoal(goal.id, { targetDate: e.target.value })}
              className="field h-8! w-[160px]!"
            />
          </label>
        </div>

        <section className="mt-8 rounded-2xl border border-line p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="label-display">Progress</span>
            <span className="text-[13px] text-fg tabular-nums">{Math.round(progress * 100)}%</span>
          </div>
          <ProgressBar value={progress} />
          <div className="mt-3 text-[13px] text-fg-3 tabular-nums">{progressText(goal, linked)}</div>
          <MeasureEditor goal={goal} />
        </section>

        <section className="mt-10">
          <SectionLabel>Steps</SectionLabel>
          <AddStep goalId={goal.id} today={today} />
          {byDate.open.length === 0 && byDate.done.length === 0 ? (
            <p className="px-2 py-2 text-[13px] text-fg-3">Add steps here, or link tasks to this goal from any day.</p>
          ) : (
            <div className="space-y-px">
              {[...byDate.open, ...byDate.done].map((t) => (
                <TaskRow key={t.id} task={t} goal={undefined} goals={[]} day={t.date} today={today} showDate />
              ))}
            </div>
          )}
        </section>
      </Page>
    </>
  );
}

function MeasureEditor({ goal }: { goal: Goal }) {
  const [editing, setEditing] = useState(false);
  const m = goal.measure;
  const save = (next: GoalMeasure | null) => void personal.updateGoal(goal.id, { measure: next }).catch(reportError);

  if (!m && !editing) {
    return (
      <Button size="sm" variant="ghost" className="mt-3 -ml-2" onClick={() => setEditing(true)}>
        + Track a number
      </Button>
    );
  }
  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
      <label className="flex flex-col gap-1.5 text-[12px] text-fg-3">
        Now
        <input
          type="number"
          min={0}
          defaultValue={m?.current ?? 0}
          key={`c${m?.current}`}
          onBlur={(e) => m && Number(e.target.value) !== m.current && save({ ...m, current: Number(e.target.value) || 0 })}
          className="field w-[110px]! tabular-nums"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[12px] text-fg-3">
        Target
        <input
          type="number"
          min={1}
          defaultValue={m?.target ?? ''}
          key={`t${m?.target}`}
          onBlur={(e) => {
            const target = Number(e.target.value);
            if (target > 0 && target !== m?.target) save({ current: m?.current ?? 0, unit: m?.unit ?? '', target });
          }}
          className="field w-[110px]! tabular-nums"
          placeholder="10000"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[12px] text-fg-3">
        Unit
        <input
          defaultValue={m?.unit ?? ''}
          key={`u${m?.unit}`}
          onBlur={(e) => m && e.target.value !== m.unit && save({ ...m, unit: e.target.value })}
          className="field w-[130px]!"
          placeholder="followers"
        />
      </label>
      {m && (
        <Button size="md" variant="ghost" onClick={() => (save(null), setEditing(false))}>
          Stop tracking
        </Button>
      )}
    </div>
  );
}

function AddStep({ goalId, today }: { goalId: string; today: string }) {
  const [text, setText] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseTaskInput(text);
    if (!parsed.title.trim()) return;
    try {
      await personal.createTask({ date: today, title: parsed.title, time: parsed.time, goalId });
      setText('');
    } catch (err) {
      reportError(err);
    }
  };
  return (
    <form onSubmit={submit} className="mb-3 flex items-center gap-2 rounded-xl border border-line px-3 focus-within:border-fg-3">
      <Plus size={15} className="shrink-0 text-fg-3" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a step to today"
        className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3"
        aria-label="New step"
      />
    </form>
  );
}
