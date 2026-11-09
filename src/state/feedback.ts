import type { ReactNode } from 'react';
import { create } from 'zustand';
import { uid } from '../lib/ids';

/* ------------------------------ Toasts ------------------------------ */

export interface Toast {
  id: string;
  message: string;
  tone: 'default' | 'success' | 'error';
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone'] }) => string;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) => {
    const id = uid(8);
    set((s) => ({ toasts: [...s.toasts.slice(-3), { tone: 'default', ...t, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function toast(message: string, opts: { tone?: Toast['tone']; action?: Toast['action'] } = {}) {
  return useToasts.getState().push({ message, ...opts });
}

/* ----------------------------- Confirm ------------------------------ */

export interface ConfirmRequest {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export const useConfirm = create<{ request: ConfirmRequest | null }>()(() => ({ request: null }));

export function confirmDialog(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirm.setState({
      request: {
        ...opts,
        resolve: (ok) => {
          useConfirm.setState({ request: null });
          resolve(ok);
        },
      },
    });
  });
}

/* ------------------------------ Menus ------------------------------- */

export type MenuItem =
  | {
      type?: 'item';
      label: string;
      icon?: ReactNode;
      onSelect: () => void;
      danger?: boolean;
      shortcut?: string;
      disabled?: boolean;
      checked?: boolean;
    }
  | { type: 'separator' }
  | { type: 'label'; label: string };

export interface MenuRequest {
  x: number;
  y: number;
  /** When opened from a button, flip above it if there is no room below. */
  anchorTop?: number;
  align: 'start' | 'end';
  items: MenuItem[];
  minWidth?: number;
}

export const useMenu = create<{ menu: MenuRequest | null }>()(() => ({ menu: null }));

/** Opens a menu at the pointer (context menu) or under an element (button). */
export function openMenu(
  at: { clientX: number; clientY: number } | HTMLElement,
  items: MenuItem[],
  opts: { align?: 'start' | 'end'; minWidth?: number } = {},
) {
  if (at instanceof HTMLElement) {
    const r = at.getBoundingClientRect();
    const align = opts.align ?? 'start';
    useMenu.setState({
      menu: { x: align === 'end' ? r.right : r.left, y: r.bottom + 6, anchorTop: r.top - 6, align, items, minWidth: opts.minWidth },
    });
  } else {
    useMenu.setState({ menu: { x: at.clientX, y: at.clientY, align: 'start', items, minWidth: opts.minWidth } });
  }
}

export function closeMenu() {
  useMenu.setState({ menu: null });
}
