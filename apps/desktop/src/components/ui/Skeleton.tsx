/**
 * Skeleton — Loading placeholder component.
 * Uses the existing `.skeleton` CSS class from globals.css.
 */

import type { CSSProperties, HTMLAttributes } from 'react';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Width of the skeleton (default: 100%) */
  width?: string | number;
  /** Height of the skeleton (default: 16px) */
  height?: string | number;
  /** Border radius (default: var(--radius-sm)) */
  borderRadius?: string | number;
  /** Variant shape */
  variant?: 'text' | 'rect' | 'circle';
}

export function Skeleton({
  width = '100%',
  height = '16px',
  borderRadius,
  variant = 'text',
  style,
  className = '',
  ...rest
}: SkeletonProps) {
  const resolvedBorderRadius =
    borderRadius ?? (variant === 'circle' ? '50%' : variant === 'rect' ? '4px' : 'var(--radius-sm)');

  return (
    <div
      className={`skeleton ${className}`}
      aria-hidden="true"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: typeof resolvedBorderRadius === 'number' ? `${resolvedBorderRadius}px` : resolvedBorderRadius,
        ...style,
      } as CSSProperties}
      {...rest}
    />
  );
}

/**
 * SkeletonBlock — A block-level skeleton with multiple lines.
 */
export interface SkeletonBlockProps {
  lines?: number;
  lineHeight?: string;
  lastLineWidth?: string;
  className?: string;
}

export function SkeletonBlock({
  lines = 3,
  lineHeight = '14px',
  lastLineWidth = '60%',
  className = '',
}: SkeletonBlockProps) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? lastLineWidth : '100%'}
        />
      ))}
    </div>
  );
}
