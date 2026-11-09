import { Menu, PanelLeft } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useUI } from '../state/ui';
import { MOD } from './sidebar/Sidebar';
import { cx, IconButton } from './ui/Button';

export interface Crumb {
  label: string;
  href?: string;
  icon?: ReactNode;
}

export function TopBar({ crumbs = [], actions, center }: { crumbs?: Crumb[]; actions?: ReactNode; center?: ReactNode }) {
  const hidden = useUI((s) => s.sidebarHidden);
  const focusMode = useUI((s) => s.focusMode);
  const set = useUI((s) => s.set);
  return (
    <header data-print-hide className="relative z-10 flex h-[52px] shrink-0 items-center gap-1.5 border-b border-line px-2.5 sm:px-3.5">
      {!focusMode && (
        <IconButton label="Open menu" tip={false} className="lg:hidden" onClick={() => set({ sidebarOpen: true })}>
          <Menu size={18} />
        </IconButton>
      )}
      {hidden && !focusMode && (
        <IconButton label="Show sidebar" shortcut={`${MOD} \\`} className="max-lg:hidden" onClick={() => set({ sidebarHidden: false })}>
          <PanelLeft size={17} />
        </IconButton>
      )}
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 pl-1 text-[13px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const body = (
            <>
              {c.icon}
              <span className="truncate">{c.label}</span>
            </>
          );
          return (
            <Fragment key={i}>
              {i > 0 && <span className="shrink-0 text-fg-4">/</span>}
              {c.href && !last ? (
                <a
                  href={c.href}
                  className={cx(
                    'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-fg-3 transition-colors hover:bg-hover hover:text-fg',
                    i < crumbs.length - 2 && 'max-sm:hidden',
                  )}
                >
                  {body}
                </a>
              ) : (
                <span className={cx('flex min-w-0 items-center gap-1.5 px-1.5 py-1', last ? 'font-medium text-fg' : 'text-fg-3')}>{body}</span>
              )}
            </Fragment>
          );
        })}
      </nav>
      {center}
      <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
    </header>
  );
}

/** Large page heading used by list-style views. */
export function PageHeader({
  eyebrow,
  title,
  meta,
  icon,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4 pb-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {icon}
        <div className="min-w-0">
          {eyebrow && <div className="label-display mb-2">{eyebrow}</div>}
          <h1 className="truncate text-[26px] leading-tight font-[680] tracking-[-0.025em] text-fg sm:text-[30px]">{title}</h1>
          {meta && <div className="mt-1.5 text-[13px] text-fg-3">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
