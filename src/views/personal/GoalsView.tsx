import { Plus, Target } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader, TopBar } from '../../components/TopBar';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { addDays, isISODate, toISODate } from '../../lib/dates';
import { navigate, paths } from '../../lib/router';
import { reportError } from '../../state/actions';
import { deleteGoalWithConfirm, useGoalTasks, usePersonalLists, useToday } from '../../state/personal';
import { personal } from '../../state/repo';
import { GoalCard, Page, SectionLabel } from './parts';

export function GoalsView() {
  const lists = usePersonalLists();
  const goalTasks = useGoalTasks();
  const today = useToday();
  const [creating, setCreating] = useState(false);

  const active = lists?.activeGoals ?? [];
  const closed = (lists?.goals ?? []).filter((g) => g.status !== 'active');
  const showForm = creating || (lists !== undefined && lists.goals.length === 0);

  return (
    <>
      <TopBar crumbs={[{ label: 'Goals', icon: <Target size={14} /> }]} />
      <Page wide>
        <PageHeader
          eyebrow="Where you’re heading"
          title="Goals"
          meta={active.length ? `${active.length} active` : 'What do you want to reach, and by when?'}
          actions={
            !showForm && (
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                New goal
              </Button>
            )
          }
        />

        {showForm && <NewGoalForm today={today} onClose={lists?.goals.length ? () => setCreating(false) : undefined} />}

        {lists && lists.goals.length === 0 && !showForm && <EmptyState compact icon={<Target size={26} />} title="No goals yet" />}

        {active.length > 0 && (
          <section className="mt-8">
            <SectionLabel>Active</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              {active.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  linked={goalTasks?.get(g.id) ?? []}
                  today={today}
                  large
                  onDelete={() => void deleteGoalWithConfirm(g, goalTasks?.get(g.id)?.length ?? 0, false)}
                />
              ))}
            </div>
          </section>
        )}

        {closed.length > 0 && (
          <section className="mt-10">
            <SectionLabel>Achieved and dropped</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              {closed.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  linked={goalTasks?.get(g.id) ?? []}
                  today={today}
                  onDelete={() => void deleteGoalWithConfirm(g, goalTasks?.get(g.id)?.length ?? 0, false)}
                />
              ))}
            </div>
          </section>
        )}
      </Page>
    </>
  );
}

function NewGoalForm({ today, onClose }: { today: string; onClose?: () => void }) {
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState(() => toISODate(addDays(new Date(), 30)));
  const [why, setWhy] = useState('');
  const [tracking, setTracking] = useState(false);
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [unit, setUnit] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !isISODate(targetDate)) return;
    try {
      const goal = await personal.createGoal(
        {
          title,
          targetDate,
          why,
          measure: tracking && Number(target) > 0 ? { target: Number(target), current: Number(current) || 0, unit } : null,
        },
        today,
      );
      navigate(paths.goal(goal.id));
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line-strong p-5">
      <div className="label-display mb-3">New goal</div>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What do you want to reach?"
        className="w-full bg-transparent text-[20px] font-[560] tracking-[-0.02em] text-fg outline-none placeholder:text-fg-4"
        aria-label="Goal"
      />
      <textarea
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="Why does it matter to you? (shown as your reminder)"
        rows={2}
        className="mt-3 w-full resize-none bg-transparent text-[14px] leading-relaxed text-fg outline-none placeholder:text-fg-3"
        aria-label="Why it matters"
      />
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-[12px] text-fg-3">
          Reach it by
          <input type="date" value={targetDate} min={today} onChange={(e) => setTargetDate(e.target.value)} className="field w-[170px]!" required />
        </label>
        {tracking ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1.5 text-[12px] text-fg-3">
              Now
              <input type="number" min={0} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0" className="field w-[100px]! tabular-nums" />
            </label>
            <label className="flex flex-col gap-1.5 text-[12px] text-fg-3">
              Target
              <input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="10000" className="field w-[110px]! tabular-nums" required />
            </label>
            <label className="flex flex-col gap-1.5 text-[12px] text-fg-3">
              Unit
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="followers" className="field w-[130px]!" />
            </label>
          </div>
        ) : (
          <Button size="md" variant="ghost" onClick={() => setTracking(true)}>
            + Track a number
          </Button>
        )}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!title.trim()}>
          Create goal
        </Button>
      </div>
    </form>
  );
}
