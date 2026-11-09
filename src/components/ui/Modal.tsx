import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx, IconButton } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Align near the top (command-palette style) instead of centered. */
  top?: boolean;
  className?: string;
  hideClose?: boolean;
  labelledBy?: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, description, children, footer, width = 520, top, className, hideClose, labelledBy }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    // Focus the first field (or the panel) once mounted.
    requestAnimationFrame(() => {
      if (!node || node.contains(document.activeElement)) return;
      const first = node.querySelector<HTMLElement>('[data-autofocus]') ?? node.querySelector<HTMLElement>('input, textarea, select');
      (first ?? node).focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={cx('fixed inset-0 z-50 flex justify-center px-4 animate-fade', top ? 'items-start pt-[12vh]' : 'items-center py-6')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ background: 'rgb(0 0 0 / 0.55)', backdropFilter: 'blur(6px)' }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-line-strong bg-overlay shadow-pop outline-none animate-pop',
          className,
        )}
        style={{ maxWidth: width }}
      >
        {(title || !hideClose) && (title || description) ? (
          <div className="flex items-start gap-3 px-6 pt-5 pb-1">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id={labelledBy} className="text-[16px] font-semibold tracking-[-0.01em] text-fg">
                  {title}
                </h2>
              )}
              {description && <p className="mt-1 text-[13px] leading-relaxed text-fg-3">{description}</p>}
            </div>
            {!hideClose && (
              <IconButton label="Close" size="sm" tip={false} onClick={onClose} className="-mt-0.5 -mr-2">
                <X size={16} />
              </IconButton>
            )}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
