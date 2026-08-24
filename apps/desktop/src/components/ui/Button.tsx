import { type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<string, string> = {
  primary:
    'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-transparent hover:from-indigo-400 hover:to-indigo-500',
  secondary:
    'bg-transparent text-slate-300 border-white/10 hover:bg-white/5 hover:border-white/20',
  danger:
    'bg-transparent text-red-400 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50',
  ghost:
    'bg-transparent text-slate-400 border-transparent hover:bg-white/5 hover:text-slate-200',
};

const SIZE_CLASSES: Record<string, string> = {
  sm: 'px-2.5 py-0.5 text-[11px] gap-1',
  md: 'px-3.5 py-1.5 text-xs gap-1.5',
  lg: 'px-4 py-2 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center font-semibold rounded-md border',
        'transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
