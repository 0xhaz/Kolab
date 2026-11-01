import { fromBaseUnits } from '@kolab/shared';

export function usdc(base: string | bigint | number, digits = 2): string {
  const n = typeof base === 'number' ? base : fromBaseUnits(base);
  return `${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} USDC`;
}

/** Approximate display only; payouts are always USDC. */
export const myr = (base: string | bigint) => `≈ RM ${(fromBaseUnits(base) * 4.2).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function relative(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const [n, unit] =
    abs < 3_600_000 ? [Math.max(1, Math.round(abs / 60_000)), 'min'] : abs < 86_400_000 ? [Math.round(abs / 3_600_000), 'h'] : [Math.round(abs / 86_400_000), 'd'];
  return diff >= 0 ? `in ${n}${unit}` : `${n}${unit} ago`;
}

export const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';

export const shortAddr = (a: string | null | undefined) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '—');

export const explorerAccount = (address: string) => `https://explorer.solana.com/address/${address}?cluster=devnet`;
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
