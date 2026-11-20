import { Check, Clock } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clockLabel, matchTimes, parseTimeText, TIME_SLOTS } from '../../lib/personalText';
import { cx } from './Button';

type Variant = 'chip' | 'field' | 'inline';

const BUTTON: Record<Variant, string> = {
  chip: 'h-7 gap-1.5 rounded-lg border px-2 text-[12px]',
  field: 'h-10 gap-2 rounded-[9px] border px-3 text-[14px]',
  inline: 'h-8 gap-1.5 rounded-lg border px-2 text-[13.5px]',
};

/**
 * Google-Calendar-style time picker: click to open a list of times in
 * 15-minute steps, scrolled to the chosen (or a suggested) time. Typing
 * ("6", "6:30pm", "18:30") jumps to matching times; Enter picks.
 */
export function TimePicker({
  value,
  onChange,
  label,
  placeholder = 'Pick a time',
  suggest = '09:00',
  allowClear,
  clearLabel = 'No time',
  variant = 'chip',
  defaultOpen,
  onClose,
  className,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Accessible name of the button. */
  label: string;
  placeholder?: string;
  /** Where the list scrolls to when there is no value yet (HH:MM). */
  suggest?: string;
  /** Offer a first option that removes the time. */
  allowClear?: boolean;
  clearLabel?: string;
  variant?: Variant;
  defaultOpen?: boolean;
  onClose?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const button = useRef<HTMLButtonElement>(null);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
    onClose?.();
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={cx(
          'inline-flex shrink-0 items-center whitespace-nowrap transition-colors',
          BUTTON[variant],
          value ? 'border-line-strong text-fg' : 'border-line text-fg-3 hover:text-fg',
          variant === 'inline' && !value && 'border-transparent',
          variant === 'inline' && value && 'border-transparent hover:border-line',
          open && 'border-fg-3!',
          className,
        )}
      >
        <Clock size={variant === 'chip' ? 13 : 15} className="shrink-0" />
        <span className={cx(value && 'tabular-nums')}>{value ? clockLabel(value) : placeholder}</span>
      </button>
      {open && (
        <TimeList
          anchor={button}
          value={value}
          suggest={suggest}
          allowClear={allowClear}
          clearLabel={clearLabel}
          onPick={(v) => {
            onChange(v);
            close(true);
          }}
          onDismiss={close}
        />
      )}
    </>
  );
}

const WIDTH = 216;
const HEIGHT = 312;

function TimeList({
  anchor,
  value,
  suggest,
  allowClear,
  clearLabel,
  onPick,
  onDismiss,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  value: string | null;
  suggest: string;
  allowClear?: boolean;
  clearLabel: string;
  onPick: (value: string | null) => void;
  onDismiss: (refocus: boolean) => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // The chosen time stays in the list even when it isn't on a quarter hour.
  const slots = useMemo(() => (value && !TIME_SLOTS.includes(value) ? [...TIME_SLOTS, value].sort() : TIME_SLOTS), [value]);
  const options = useMemo<(string | null)[]>(() => {
    const matches = matchTimes(query, slots);
    const typed = parseTimeText(query);
    const times = typed && !matches.includes(typed) ? [typed, ...matches] : matches;
    return allowClear && !query ? [null, ...times] : times;
  }, [query, slots, allowClear]);

  const start = useMemo(() => {
    if (query) return 0;
    const target = value ?? suggest;
    let i = slots.findIndex((s) => s >= target);
    if (i < 0) i = slots.length - 1;
    return i + (allowClear ? 1 : 0);
    // Only on open and when the typed text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  const [active, setActive] = useState(start);
  useEffect(() => setActive(start), [start]);

  // Sits under its button (above when there's no room), and follows it when the page scrolls.
  const place = useCallback(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const top = below < HEIGHT + 12 && r.top > below ? Math.max(8, r.top - HEIGHT - 6) : r.bottom + 6;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8));
    setPos((cur) => (cur && cur.left === left && cur.top === top ? cur : { left, top }));
  }, [anchor]);
  useLayoutEffect(place, [place]);

  // Open centred on the chosen or suggested time, like Google Calendar.
  const centred = useRef(false);
  useLayoutEffect(() => {
    if (!pos || !list.current || centred.current) return;
    centred.current = true;
    const el = list.current.querySelector<HTMLElement>(`[data-i="${start}"]`);
    if (el) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.offsetHeight / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  // Keep the highlighted option in view while moving with the keyboard.
  useEffect(() => {
    const box = list.current;
    const el = box?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (!box || !el) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 4;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 4;
  }, [active]);

  useEffect(() => {
    const inside = (t: EventTarget | null) => t instanceof Node && (panel.current?.contains(t) || anchor.current?.contains(t));
    const onDown = (e: MouseEvent) => !inside(e.target) && onDismiss(false);
    const onScroll = (e: Event) => !inside(e.target) && place();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor, onDismiss, place]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={panel}
      className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-line-strong bg-overlay shadow-pop animate-pop"
      style={{ left: pos.left, top: pos.top, width: WIDTH, maxHeight: HEIGHT }}
    >
      <input
        autoFocus
        role="combobox"
        aria-expanded
        aria-controls={`${id}-list`}
        aria-activedescendant={options.length ? `${id}-${active}` : undefined}
        aria-label="Type a time"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (options.length) onPick(options[Math.min(active, options.length - 1)]);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onDismiss(true);
          } else if (e.key === 'Tab') {
            onDismiss(false);
          }
        }}
        placeholder="Type a time, e.g. 6:30pm"
        className="h-10 shrink-0 border-b border-line bg-transparent px-3 text-[13.5px] text-fg outline-none placeholder:text-fg-3"
      />
      <div ref={list} id={`${id}-list`} role="listbox" aria-label="Times" className="relative min-h-0 flex-1 overflow-y-auto p-1">
        {options.length === 0 && <div className="px-3 py-3 text-[12.5px] text-fg-3">Not a time — try “6:30pm” or “18:30”.</div>}
        {options.map((v, i) => {
          const selected = v === value;
          return (
            <div
              key={v ?? 'clear'}
              id={`${id}-${i}`}
              data-i={i}
              role="option"
              aria-selected={selected}
              onMouseMove={() => active !== i && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(v)}
              className={cx(
                'flex h-8 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-[13.5px]',
                i === active ? 'bg-active text-fg' : 'text-fg',
                v === null && 'text-fg-3',
              )}
            >
              <span className={cx(v && 'tabular-nums', selected && 'font-medium')}>{v ? clockLabel(v) : clearLabel}</span>
              {selected && <Check size={14} className="shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
