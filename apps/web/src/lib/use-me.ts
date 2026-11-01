'use client';

import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import type { Me } from '@kolab/shared';
import { api } from './api';

export function useMe() {
  const { ready, authenticated } = usePrivy();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/me'),
    enabled: ready && authenticated,
    // The embedded wallet appears a moment after first login; poll until the API has it.
    refetchInterval: (q) => (q.state.data && !q.state.data.walletPubkey ? 2000 : false),
  });
}
