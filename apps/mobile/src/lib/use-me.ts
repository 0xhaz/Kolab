import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/expo';
import type { Me } from '@kolab/shared';
import { useApi } from './api';

export function useMe() {
  const { user } = usePrivy();
  const api = useApi();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/me'),
    enabled: !!user,
    // The embedded wallet appears a moment after first login; poll until the API has it.
    refetchInterval: (q) => (q.state.data && !q.state.data.walletPubkey ? 2000 : false),
  });
}

/** The mobile app is creator-only: claim the creator role the first time a new user opens it. */
export function useClaimCreatorRole() {
  const { data: me } = useMe();
  const api = useApi();
  const qc = useQueryClient();

  useEffect(() => {
    if (me && me.role === null) {
      api<Me>('/me', { method: 'PATCH', body: JSON.stringify({ role: 'creator' }) })
        .then((updated) => qc.setQueryData(['me'], updated))
        .catch(() => {
          // retried on next render/refetch
        });
    }
  }, [me, api, qc]);
}
