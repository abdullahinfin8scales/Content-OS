import { ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { draggedItem, endDrag, startDrag, type DragItem } from '../../lib/dnd';
import { cx } from '../ui/Button';

export interface DropSpec {
  accepts: (item: DragItem) => boolean;
  onDrop: (item: DragItem) => void;
  /** Called after hovering a while during a drag (used to auto-expand). */
  onLinger?: () => void;
}

interface TreeRowProps {
  depth: number;
  href: string;
  icon: ReactNode;
  label: string;
  placeholder?: boolean;
  active?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onOpen?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  actions?: ReactNode;
  trailing?: ReactNode;
  drag?: DragItem;
  drop?: DropSpec;
  renaming?: boolean;
  onRename?: (value: string | null) => void;
}

export function TreeRow({
  depth,
  href,
  icon,
  label,
  placeholder,
  active,
  expandable,
  expanded,
  onToggle,
  onOpen,
  onContextMenu,
  actions,
  trailing,
  drag,
  drop,
  renaming,
  onRename,
}: TreeRowProps) {
  const [over, setOver] = useState(false);
  const linger = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearLinger = () => {
    clearTimeout(linger.current);
    linger.current = undefined;
  };

  const dropHandlers = drop
    ? {
        onDragOver: (e: DragEvent) => {
          const item = draggedItem();
          if (!item || !drop.accepts(item)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!over) setOver(true);
          if (drop.onLinger && !linger.current) linger.current = setTimeout(() => drop.onLinger?.(), 650);
        },
        onDragLeave: (e: DragEvent) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setOver(false);
          clearLinger();
        },
        onDrop: (e: DragEvent) => {
          const item = draggedItem();
          setOver(false);
          clearLinger();
          if (!item || !drop.accepts(item)) return;
          e.preventDefault();
          endDrag();
          drop.onDrop(item);
        },
      }
    : {};

  useEffect(() => clearLinger, []);

  const indent = 8 + depth * 14;

  return (
    <div
      className={cx(
        'group/row relative flex h-[30px] items-center rounded-lg text-[13.5px] transition-colors',
        active ? 'bg-active text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg',
        over && 'bg-hover text-fg ring-1 ring-fg-3 ring-inset',
      )}
      onContextMenu={(e) => {
        if (!onContextMenu || renaming) return;
        e.preventDefault();
        onContextMenu(e);
      }}
      {...dropHandlers}
    >
      {active && <span aria-hidden className="absolute top-1/2 -left-3 h-3.5 w-[3px] -translate-y-1/2 rounded-full bg-brand" />}
      {renaming ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 pr-1.5" style={{ paddingLeft: indent + (expandable ? 18 : 0) }}>
          <span className="flex shrink-0 items-center">{icon}</span>
          <RenameInput initial={label} onDone={(v) => onRename?.(v)} />
        </div>
      ) : (
        <a
          href={href}
          draggable={!!drag}
          onDragStart={drag ? (e) => startDrag(e, drag, label) : undefined}
          onDragEnd={drag ? endDrag : undefined}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            onOpen?.();
          }}
          className="flex h-full min-w-0 flex-1 items-center gap-2 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-inset rounded-lg"
          style={{ paddingLeft: indent }}
        >
          {expandable && (
            <span
              role="button"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              className="-mr-1 flex h-5 w-4 shrink-0 items-center justify-center rounded text-fg-4 hover:text-fg"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle?.();
              }}
            >
              <ChevronRight size={13} strokeWidth={2.4} className={cx('transition-transform duration-150', expanded && 'rotate-90')} />
            </span>
          )}
          <span className="flex shrink-0 items-center">{icon}</span>
          <span className={cx('min-w-0 flex-1 truncate', placeholder && 'text-fg-3')}>{label}</span>
          {trailing && <span className="shrink-0 text-[11px] text-fg-4 tabular-nums group-hover/row:hidden">{trailing}</span>}
        </a>
      )}
      {actions && !renaming && (
        <div className="hidden shrink-0 items-center gap-0.5 pr-1 group-focus-within/row:flex group-hover/row:flex">{actions}</div>
      )}
    </div>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Name"
      className="h-[24px] min-w-0 flex-1 rounded-md border border-fg-3 bg-sunken px-1.5 text-[13px] text-fg outline-none"
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(e.currentTarget.value);
        else if (e.key === 'Escape') finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}
