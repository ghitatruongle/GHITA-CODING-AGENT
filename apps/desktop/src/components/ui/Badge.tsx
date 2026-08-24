import { type HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  dot?: boolean;
}

const VARIANT_CLASSES: Record<string, string> = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  danger: 'bg-red-500/10 text-red-400 border-red-500/30',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  neutral: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export function Badge({
  variant = 'neutral',
  dot = false,
  children,
  className = '',
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded border',
        VARIANT_CLASSES[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
