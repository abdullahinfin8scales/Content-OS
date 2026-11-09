import type { ReactNode } from 'react';
import { Mark } from '../../brand/Logo';
import { cx } from './Button';

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
  compact,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-10' : 'px-6 py-20', className)}>
      <div className="mb-5 text-fg-4">{icon ?? <Mark className="h-7 w-auto opacity-60" />}</div>
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-fg-3">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
