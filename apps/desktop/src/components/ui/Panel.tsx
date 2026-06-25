// ==============================================================================
// GHITA CODING AGENT — Shared Panel Primitive (side panel / section wrapper)
// ==============================================================================

import { type HTMLAttributes, type ReactNode } from 'react';

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional header title */
  title?: ReactNode;
  /** Optional icon rendered before the title */
  icon?: ReactNode;
  /** Border position */
  border?: 'left' | 'right' | 'none';
}

export function Panel({
  title,
  icon,
  border = 'none',
  children,
  className = '',
  ...rest
}: PanelProps) {
  const borderClass =
    border === 'left'
      ? 'border-l border-white/5'
      : border === 'right'
        ? 'border-r border-white/5'
        : '';

  return (
    <aside
      className={[
        'flex flex-col gap-4 p-4 bg-slate-800/40 backdrop-blur-sm shrink-0',
        borderClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {title && (
        <h3 className="text-[13px] font-bold tracking-wide text-indigo-200">
          {icon && <span className="mr-1.5">{icon}</span>}
          {title}
        </h3>
      )}
      {children}
    </aside>
  );
}
