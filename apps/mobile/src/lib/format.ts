import { fromBaseUnits } from '@kolab/shared';

/** Approximate display rates only; payouts are always in USDC (architecture §11 #18). */
const LOCAL = { MYR: { rate: 4.2, prefix: 'RM ' }, IDR: { rate: 16_000, prefix: 'Rp ' } } as const;
export type LocalCurrency = keyof typeof LOCAL;

export function usdc(base: string | bigint | number, digits = 2): string {
  const n = typeof base === 'number' ? base : fromBaseUnits(base);
  return `${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} USDC`;
}

export function local(base: string | bigint | number, currency: LocalCurrency = 'MYR'): string {
  const n = (typeof base === 'number' ? base : fromBaseUnits(base)) * LOCAL[currency].rate;
  const digits = currency === 'IDR' ? 0 : 2;
  return `≈ ${LOCAL[currency].prefix}${n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "in 3 days", "2 hours ago" relative to now. */
export function relative(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const [n, unit] =
    abs < 3_600_000 ? [Math.round(abs / 60_000), 'min'] : abs < 86_400_000 ? [Math.round(abs / 3_600_000), 'h'] : [Math.round(abs / 86_400_000), 'd'];
  return diff >= 0 ? `in ${n}${unit}` : `${n}${unit} ago`;
}

export const shortAddr = (a: string | null) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '—');
