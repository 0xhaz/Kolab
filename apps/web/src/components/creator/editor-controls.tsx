'use client';

import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Pill segmented control (radio group), same look as the mobile `Segmented`. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full border border-white/8 bg-white/3 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition',
            value === o.value ? 'bg-brand-gradient text-white shadow' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small rounded action used for trims, nudges and reordering. */
export function SmallButton({ icon: Icon, children, danger, className, ...props }: ComponentProps<'button'> & { icon?: LucideIcon; danger?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-xs font-medium transition hover:bg-white/8 disabled:pointer-events-none disabled:opacity-40',
        danger && 'text-red-300',
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </button>
  );
}

/** Title + description + switch row. */
export function ToggleRow({ title, sub, checked, onChange, disabled, trailing }: { title: string; sub: string; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      {trailing ?? (
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          disabled={disabled}
          onClick={() => onChange?.(!checked)}
          className={cn('relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40', checked ? 'bg-accent' : 'bg-white/12')}
        >
          <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
        </button>
      )}
    </div>
  );
}

/** Labelled range slider with the value shown as text. */
export function Slider({ label, value, min, max, step, onChange, display }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display: string }) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-(--color-accent)" />
    </label>
  );
}
