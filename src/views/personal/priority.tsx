import { X } from 'lucide-react';
import { cx } from '../../components/ui/Button';
import { TASK_PRIORITIES, type TaskPriority } from '../../lib/types';
import { openMenu, type MenuItem } from '../../state/feedback';

/**
 * How the three priorities look. The class names are written out in full so
 * Tailwind finds them; the colours are the `--pri-*` tokens (red, blue, green;
 * they are the only coloured things in the app).
 */
export const PRIORITY: Record<TaskPriority, { label: string; dot: string; ring: string; flag: string }> = {
  important: { label: 'Important', dot: 'bg-pri-important', ring: 'border-pri-important hover:border-pri-important', flag: 'text-pri-important!' },
  needed: { label: 'Needs to get completed', dot: 'bg-pri-needed', ring: 'border-pri-needed hover:border-pri-needed', flag: 'text-pri-needed!' },
  low: { label: 'Not important', dot: 'bg-pri-low', ring: 'border-pri-low hover:border-pri-low', flag: 'text-pri-low!' },
};

export function PriorityDot({ priority, className }: { priority: TaskPriority; className?: string }) {
  return <span aria-hidden className={cx('block h-2.5 w-2.5 shrink-0 rounded-full', PRIORITY[priority].dot, className)} />;
}

/** The priority dropdown: the three choices, each with its colour, and "No priority" when one is set. */
export function openPriorityMenu(anchor: HTMLElement, current: TaskPriority | null | undefined, onPick: (priority: TaskPriority | null) => void) {
  const items: MenuItem[] = [
    { type: 'label', label: 'Priority' },
    ...TASK_PRIORITIES.map<MenuItem>((p) => ({ label: PRIORITY[p].label, icon: <PriorityDot priority={p} />, checked: current === p, onSelect: () => onPick(p) })),
    ...(current ? [{ type: 'separator' } as MenuItem, { label: 'No priority', icon: <X size={14} />, onSelect: () => onPick(null) } as MenuItem] : []),
  ];
  openMenu(anchor, items, { align: 'end', minWidth: 250 });
}
