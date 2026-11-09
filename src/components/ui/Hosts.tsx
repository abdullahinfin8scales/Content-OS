import { Check, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { closeMenu, useConfirm, useMenu, useToasts, type MenuItem, type Toast } from '../../state/feedback';
import { Button, cx } from './Button';
import { Modal } from './Modal';

/* ------------------------------- Menu ------------------------------- */

export function MenuHost() {
  const menu = useMenu((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(-1);

  const actionable = (menu?.items ?? [])
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => (item.type ?? 'item') === 'item' && !(item as { disabled?: boolean }).disabled);

  useLayoutEffect(() => {
    if (!menu || !ref.current) {
      setPos(null);
      return;
    }
    const { width, height } = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = menu.align === 'end' ? menu.x - width : menu.x;
    let top = menu.y;
    if (top + height > vh - 8) top = menu.anchorTop !== undefined ? menu.anchorTop - height : vh - height - 8;
    left = Math.min(Math.max(8, left), vw - width - 8);
    top = Math.max(8, top);
    setPos({ left, top });
    setActive(-1);
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!actionable.length) return;
        setActive((current) => {
          const idx = actionable.findIndex((a) => a.i === current);
          const next = e.key === 'ArrowDown' ? (idx + 1) % actionable.length : (idx - 1 + actionable.length) % actionable.length;
          return actionable[next].i;
        });
      } else if (e.key === 'Enter') {
        const chosen = menu.items[active];
        if (chosen && (chosen.type ?? 'item') === 'item') {
          e.preventDefault();
          closeMenu();
          (chosen as Extract<MenuItem, { onSelect: () => void }>).onSelect();
        }
      }
    };
    const close = () => closeMenu();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  });

  if (!menu) return null;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[70] rounded-xl border border-line-strong bg-overlay p-1 shadow-pop animate-pop"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, minWidth: menu.minWidth ?? 200, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) => {
        if (item.type === 'separator') return <div key={i} className="mx-2 my-1 h-px bg-line" />;
        if (item.type === 'label')
          return (
            <div key={i} className="label-display px-2.5 pt-2 pb-1.5">
              {item.label}
            </div>
          );
        return (
          <button
            key={i}
            role="menuitem"
            disabled={item.disabled}
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              closeMenu();
              item.onSelect();
            }}
            className={cx(
              'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors disabled:opacity-40',
              item.danger ? 'text-danger' : 'text-fg',
              active === i && (item.danger ? 'bg-danger/10' : 'bg-hover'),
            )}
          >
            <span className={cx('flex w-4 shrink-0 justify-center', item.danger ? 'text-danger' : 'text-fg-3')}>{item.icon}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.checked && <Check size={14} className="text-fg-2" />}
            {item.shortcut && <span className="text-[11px] text-fg-4">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/* ------------------------------ Toasts ------------------------------ */

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.action ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [toast, dismiss]);
  const Icon = toast.tone === 'error' ? TriangleAlert : toast.tone === 'success' ? CircleCheck : Info;
  return (
    <div
      role="status"
      className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line-strong bg-overlay py-2 pr-2 pl-3.5 text-[13px] text-fg shadow-pop animate-rise"
    >
      <Icon size={15} className={toast.tone === 'error' ? 'text-danger' : toast.tone === 'success' ? 'text-[var(--st-posted)]' : 'text-fg-3'} />
      <span className="max-w-[340px]">{toast.message}</span>
      {toast.action && (
        <button
          className="ml-1 rounded-md px-2 py-1 text-[12.5px] font-semibold text-fg underline-offset-2 hover:bg-hover"
          onClick={() => {
            toast.action!.run();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button aria-label="Dismiss" className="rounded-md p-1 text-fg-3 hover:bg-hover hover:text-fg" onClick={() => dismiss(toast.id)}>
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex flex-col items-center gap-2 px-4" data-print-hide>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>,
    document.body,
  );
}

/* ----------------------------- Confirm ------------------------------ */

export function ConfirmHost() {
  const request = useConfirm((s) => s.request);
  return (
    <Modal
      open={!!request}
      onClose={() => request?.resolve(false)}
      title={request?.title}
      width={420}
      hideClose
      labelledBy="confirm-title"
      footer={
        <>
          <Button variant="ghost" onClick={() => request?.resolve(false)}>
            Cancel
          </Button>
          <Button variant={request?.danger ? 'danger' : 'primary'} onClick={() => request?.resolve(true)} data-autofocus>
            {request?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      {request?.message ? <div className="px-6 pt-1 pb-5 text-[13.5px] leading-relaxed text-fg-2">{request.message}</div> : <div className="h-3" />}
    </Modal>
  );
}

/* ----------------------------- Tooltips ----------------------------- */

/** One delegated tooltip for every element with `data-tip`. */
export function TooltipHost() {
  const [tip, setTip] = useState<{ text: string; key?: string; x: number; y: number; below: boolean } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let target: HTMLElement | null = null;
    const hide = () => {
      clearTimeout(timer);
      target = null;
      setTip(null);
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (el === target) return;
      hide();
      if (!el || !el.dataset.tip) return;
      target = el;
      timer = setTimeout(() => {
        if (!target || !document.body.contains(target)) return;
        const r = target.getBoundingClientRect();
        const below = r.top < 48;
        setTip({ text: target.dataset.tip!, key: target.dataset.tipKey, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
      }, 380);
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('scroll', hide, true);
      clearTimeout(timer);
    };
  }, []);
  if (!tip) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed z-[90] flex items-center gap-1.5 rounded-lg border border-line-strong bg-overlay px-2 py-1 text-[12px] font-medium whitespace-nowrap text-fg shadow-pop animate-fade"
      style={{ left: tip.x, top: tip.y, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})` }}
    >
      {tip.text}
      {tip.key && <span className="text-fg-3">{tip.key}</span>}
    </div>,
    document.body,
  );
}
