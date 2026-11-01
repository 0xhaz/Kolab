'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken, usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SocketPayload } from '@kolab/shared';
import { env } from './env';
import { useMe } from './use-me';

export interface LiveEvent {
  event: string;
  at: string;
  txSignature?: string;
  campaignId?: string;
}

const EventsContext = createContext<LiveEvent[]>([]);
export const useLiveEvents = () => useContext(EventsContext);

const CREATOR_TOASTS: Record<string, string> = {
  'enrollment.shipped': 'Your product is on the way',
  'slot.checks': 'Automated checks finished on your post',
  'slot.rejected': 'The brand asked for changes',
  'slot.released': 'Payment released to your wallet',
  'slot.holdback': 'Holdback settled',
  'sale.recorded': 'A sale came in with your voucher',
  'payout.claimed': 'Sales payout sent to your wallet',
  'application.updated': 'A brand reviewed your application',
  'cashout.updated': 'Cash-out updated',
};

const TOASTS: Record<string, string> = {
  'campaign.funded': 'Campaign funded on-chain',
  'enrollment.created': 'A creator joined',
  'enrollment.received': 'Creator received the product',
  'slot.submitted': 'New submission to review',
  'slot.released': 'Payment released to a creator',
  'slot.missed': 'A slot was missed and refunded to you',
  'slot.holdback': 'Holdback settled',
  'sale.recorded': 'Sale recorded',
  'application.updated': 'Creator applications updated',
};

/** Chain-confirmed events from the API: refresh data, toast, and keep a log for the demo panel. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const creator = me?.role === 'creator';
  const [events, setEvents] = useState<LiveEvent[]>([]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    const socket = io(env.wsUrl, {
      transports: ['websocket'],
      auth: (cb) => {
        void getAccessToken().then((token) => cb({ token }));
      },
    });
    socket.onAny((event: string, payload: SocketPayload<{ campaignId?: string }>) => {
      void qc.invalidateQueries();
      setEvents((prev) =>
        [{ event, at: payload?.at ?? new Date().toISOString(), txSignature: payload?.txSignature, campaignId: payload?.data?.campaignId }, ...prev].slice(0, 50),
      );
      const message = (creator ? CREATOR_TOASTS : TOASTS)[event];
      if (message) toast(message);
    });
    return () => {
      socket.disconnect();
    };
  }, [ready, authenticated, qc, creator]);

  return <EventsContext.Provider value={events}>{children}</EventsContext.Provider>;
}
