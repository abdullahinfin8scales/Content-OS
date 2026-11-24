import { Check, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx, IconButton } from '../../components/ui/Button';
import { formatDate } from '../../lib/dates';
import { goalProgress } from '../../lib/personalRepo';
import { daysLeftLabel } from '../../lib/personalText';
import { paths } from '../../lib/router';
import type { Goal, Task, TaskPriority } from '../../lib/types';
import { PRIORITY } from './priority';

/** Round tick box used by every task row. */
export function TaskCheck({
  done,
  onToggle,
  label,
  className,
  priority,
}: {
  done: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
  /** Rings the box in its priority colour while the task is open. */
  priority?: TaskPriority | null;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onToggle}
      className={cx(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
        done ? 'border-brand bg-brand text-brand-fg' : cx('text-transparent', priority ? PRIORITY[priority].ring : 'border-fg-3 hover:border-fg'),
        className,
      )}
    >
      <Check size={11} strokeWidth={3} />
    </button>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={cx('h-[3px] w-full overflow-hidden rounded-full bg-active', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** "2,500 / 10,000 followers" or "3 / 8 steps done". */
export function progressText(goal: Goal, linked: Task[]): string {
  if (goal.measure) {
    const n = (v: number) => v.toLocaleString();
    return `${n(goal.measure.current)} / ${n(goal.measure.target)}${goal.measure.unit ? ` ${goal.measure.unit}` : ''}`;
  }
  if (!linked.length) return 'No steps yet';
  return `${linked.filter((t) => t.done).length} / ${linked.length} steps done`;
}

/** A quiet, always-visible trash button that turns red on hover. */
export function DeleteButton({ label, onClick, size = 'sm', className }: { label: string; onClick: () => void; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  return (
    <IconButton
      label={label}
      size={size}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cx('relative z-10 text-fg-3! hover:text-danger!', className)}
    >
      <Trash2 size={size === 'xs' ? 13 : 15} />
    </IconButton>
  );
}

/** A goal at a glance: title, days left, progress. With `onDelete`, a trash button sits on the card. */
export function GoalCard({ goal, linked, today, large, onDelete }: { goal: Goal; linked: Task[]; today: string; large?: boolean; onDelete?: () => void }) {
  const progress = goalProgress(goal, linked);
  const over = goal.status === 'active' && goal.targetDate < today;
  return (
    <div
      className={cx(
        'group relative flex min-w-0 flex-col rounded-2xl border border-line transition-colors hover:border-line-strong',
        large ? 'gap-3 p-5' : 'gap-2.5 p-3.5',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* The title link stretches over the whole card; buttons sit above it. */}
        <a
          href={paths.goal(goal.id)}
          className={cx(
            'min-w-0 font-medium text-fg outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-[var(--ring)]',
            large ? 'text-[16px] leading-snug' : 'truncate text-[13.5px]',
          )}
        >
          {goal.title}
        </a>
        <span className={cx('flex shrink-0 items-center gap-1 text-[12px] tabular-nums', over ? 'text-danger' : 'text-fg-3')}>
          {goal.status === 'achieved' ? 'Achieved' : goal.status === 'dropped' ? 'Dropped' : daysLeftLabel(goal.targetDate, today)}
          {onDelete && <DeleteButton label={`Delete goal “${goal.title}”`} size="xs" className="-my-1 -mr-1.5 ml-1" onClick={onDelete} />}
        </span>
      </div>
      {large && goal.why && <p className="line-clamp-2 text-[13px] leading-relaxed text-fg-3">{goal.why}</p>}
      <ProgressBar value={progress} />
      <div className="flex items-center justify-between gap-3 text-[12px] text-fg-3">
        <span className="truncate tabular-nums">{progressText(goal, linked)}</span>
        {large && <span className="shrink-0">by {formatDate(goal.targetDate)}</span>}
      </div>
    </div>
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
      <span className="label-display">{children}</span>
      {action}
    </div>
  );
}

/** Narrow centred column used by the personal pages. */
export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cx('mx-auto w-full px-4 pt-8 pb-24 sm:px-8 sm:pt-12', wide ? 'max-w-[1040px]' : 'max-w-[820px]')}>{children}</div>
    </div>
  );
}
