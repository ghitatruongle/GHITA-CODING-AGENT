import { type InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Optional label rendered above the input */
  label?: string;
  /** Error message rendered below the input */
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = '', id, ...rest },
  ref,
) {
  const inputId = id || (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-[11px] text-slate-400 font-medium">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={[
          'px-2.5 py-1.5 text-xs rounded-md',
          'bg-slate-900/60 border border-white/10 text-slate-100',
          'placeholder:text-slate-500',
          'focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none',
          'transition-colors duration-150',
          error ? 'border-red-500/50' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
});
