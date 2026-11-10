import { SPACE_COLOR_VAR, STATUS_META } from '../../lib/meta';
import { platformInfo } from '../../lib/platforms';
import type { Platform, PlatformIconData, Space, Status } from '../../lib/types';
import { useWorkspace } from '../../state/workspace';
import { spaceIcon } from '../icons';
import { cx } from './Button';

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={{ background: STATUS_META[status].color, boxShadow: `0 0 0 3px color-mix(in oklab, ${STATUS_META[status].color} 18%, transparent)` }}
    />
  );
}

export function StatusPill({ status, className, size = 'md' }: { status: Status; className?: string; size?: 'sm' | 'md' }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-[12px]',
        className,
      )}
      style={{
        color: meta.color,
        background: `color-mix(in oklab, ${meta.color} 13%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 22%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

/** Draws a platform logo: a brand glyph, or a letter in a rounded square. */
export function PlatformGlyph({ icon, name, size = 14, className }: { icon: PlatformIconData; name: string; size?: number; className?: string }) {
  if (icon.kind === 'monogram') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={cx('shrink-0', className)} role="img" aria-label={name}>
        <rect x="1.75" y="1.75" width="20.5" height="20.5" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="12" y="16.4" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="currentColor" fontFamily="'Inter Variable', system-ui, sans-serif">
          {icon.text}
        </text>
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      fillRule={icon.evenOdd ? 'evenodd' : undefined}
      className={cx('shrink-0', className)}
      role="img"
      aria-label={name}
    >
      <path d={icon.path} />
    </svg>
  );
}

export function PlatformIcon({ platform, size = 14, className }: { platform: Platform; size?: number; className?: string }) {
  const info = platformInfo(useWorkspace().platforms, platform);
  return <PlatformGlyph icon={info.icon} name={info.name} size={size} className={className} />;
}

export function PlatformStack({ platforms, size = 13, max = 4, className }: { platforms: Platform[]; size?: number; max?: number; className?: string }) {
  const registry = useWorkspace().platforms;
  if (!platforms.length) return null;
  const shown = platforms.slice(0, max);
  const extra = platforms.length - shown.length;
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-fg-3', className)} data-tip={platforms.map((p) => platformInfo(registry, p).name).join(', ')}>
      {shown.map((p) => (
        <PlatformIcon key={p} platform={p} size={size} />
      ))}
      {extra > 0 && <span className="text-[11px] font-medium">+{extra}</span>}
    </span>
  );
}

export function SpaceGlyph({ space, size = 'md', className }: { space: Pick<Space, 'icon' | 'color'>; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const Icon = spaceIcon(space.icon);
  const color = SPACE_COLOR_VAR[space.color] ?? SPACE_COLOR_VAR.white;
  const box = { sm: 'h-[18px] w-[18px] rounded-[5px]', md: 'h-5 w-5 rounded-md', lg: 'h-9 w-9 rounded-[10px]', xl: 'h-12 w-12 rounded-[14px]' }[size];
  const icon = { sm: 11, md: 12, lg: 18, xl: 24 }[size];
  return (
    <span
      aria-hidden
      className={cx('inline-flex shrink-0 items-center justify-center', box, className)}
      style={{
        color,
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 24%, transparent)`,
      }}
    >
      <Icon size={icon} strokeWidth={2.1} />
    </span>
  );
}
