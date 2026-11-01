import { useEffect, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { usePrivy } from '@privy-io/expo';
import { useQueryClient } from '@tanstack/react-query';
import type { SocketPayload } from '@kolab/shared';
import { useToast } from '@/components/toast';
import { env } from './env';
import { cashoutKeys } from './cashout';
import { keys } from './queries';
import { profileKeys } from './profile';

const TOASTS: Record<string, string> = {
  'slot.released': 'Payment released to your wallet',
  'slot.holdback': 'Holdback settled',
  'slot.rejected': 'The brand asked for changes',
  'slot.missed': 'A deliverable was missed and refunded to the brand',
  'enrollment.shipped': 'Your product has shipped',
  'sale.recorded': 'New sale recorded',
  'payout.claimed': 'Sales payout sent to your wallet',
  'application.updated': 'A brand reviewed your application',
};

/**
 * Socket.IO connection for chain-confirmed events. Every event refreshes the cached queries, so
 * the app updates the moment the API mirrors a transaction, whoever sent it.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, getAccessToken } = usePrivy();
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!user) return;
    const socket = io(env.wsUrl, {
      transports: ['websocket'],
      auth: (cb) => {
        getAccessToken().then((token) => cb({ token }));
      },
    });
    socket.onAny((event: string, payload: SocketPayload<{ campaignId?: string }>) => {
      void qc.invalidateQueries({ queryKey: keys.enrollments });
      void qc.invalidateQueries({ queryKey: keys.campaigns });
      if (event === 'cashout.updated') {
        void qc.invalidateQueries({ queryKey: cashoutKeys.list });
        void qc.invalidateQueries({ queryKey: cashoutKeys.balance });
      }
      const campaignId = payload?.data?.campaignId;
      if (campaignId) {
        void qc.invalidateQueries({ queryKey: keys.campaign(campaignId) });
        void qc.invalidateQueries({ queryKey: profileKeys.application(campaignId) });
      }
      const message = TOASTS[event];
      if (message) toast(message, event === 'slot.missed' || event === 'slot.rejected' ? 'error' : event === 'application.updated' ? 'info' : 'success');
    });
    return () => {
      socket.disconnect();
    };
  }, [user, getAccessToken, qc, toast]);

  return <>{children}</>;
}

