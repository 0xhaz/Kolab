import { useQuery } from '@tanstack/react-query';
import type { CashoutDto, CashoutQuoteDto, CreateCashout } from '@kolab/shared';
import { useApi } from './api';

export const cashoutKeys = {
  balance: ['wallet-balance'] as const,
  list: ['cashouts'] as const,
  one: (id: string) => ['cashout', id] as const,
};

const TERMINAL = ['completed', 'refunded', 'failed', 'expired'];

/** USDC in the creator's own Kolab wallet (what can be cashed out). */
export function useWalletBalance() {
  const api = useApi();
  return useQuery({ queryKey: cashoutKeys.balance, queryFn: () => api<{ usdc: string }>('/tx/balance') });
}

export function useCashouts() {
  const api = useApi();
  return useQuery({ queryKey: cashoutKeys.list, queryFn: () => api<CashoutDto[]>('/cashouts') });
}

/** One cash-out, polled while in flight (realtime `cashout.updated` also refreshes it). */
export function useCashout(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: cashoutKeys.one(id ?? ''),
    queryFn: () => api<CashoutDto>(`/cashouts/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && TERMINAL.includes(q.state.data.status) ? false : 3000),
  });
}

export function useCashoutApi() {
  const api = useApi();
  return {
    quote: (body: CreateCashout) => api<CashoutQuoteDto>('/cashouts/quote', { method: 'POST', body: JSON.stringify(body) }),
    create: (body: CreateCashout) => api<CashoutDto>('/cashouts', { method: 'POST', body: JSON.stringify(body) }),
    sent: (id: string, signature: string) => api<CashoutDto>(`/cashouts/${id}/sent`, { method: 'POST', body: JSON.stringify({ signature }) }),
  };
}
