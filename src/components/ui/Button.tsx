import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-fg hover:opacity-90 active:opacity-80 shadow-[0_1px_0_0_rgb(255_255_255/0.25)_inset,0_6px_18px_-8px_rgb(0_0_0/0.6)]',
  secondary: 'bg-raised text-fg border border-line-strong hover:bg-hover hover:border-fg-4',
  ghost: 'text-fg-2 hover:text-fg hover:bg-hover',
  danger: 'bg-danger text-white hover:opacity-90',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12.5px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-[13.5px] gap-2 rounded-[10px]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background,opacity,border-color,color] duration-150 select-none disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: 'xs' | 'sm' | 'md';
  /** Show the label as a tooltip (default true). */
  tip?: boolean;
  shortcut?: string;
}

const ICON_SIZES = { xs: 'h-6 w-6 rounded-md', sm: 'h-7 w-7 rounded-lg', md: 'h-8 w-8 rounded-[9px]' };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, size = 'md', tip = true, shortcut, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      data-tip={tip ? label : undefined}
      data-tip-key={shortcut}
      className={cx(
        'inline-flex shrink-0 items-center justify-center transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-35',
        ICON_SIZES[size],
        active ? 'bg-active text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
