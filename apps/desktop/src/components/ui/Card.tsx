import { type HTMLAttributes, type ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional header title rendered at the top */
  title?: ReactNode;
  /** Optional icon rendered before the title */
  icon?: ReactNode;
  /** Padding variant */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING_CLASSES: Record<string, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({
  title,
  icon,
  padding = 'md',
  children,
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        'glass-card rounded-lg border border-white/5 bg-slate-800/40 backdrop-blur',
        PADDING_CLASSES[padding],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {title && (
        <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)] mb-4">
          {icon && <span>{icon}</span>}
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
