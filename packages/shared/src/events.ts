/** WebSocket event names (techstacks §6.4). Payloads carry `txSignature` when on-chain. */
export const SOCKET_EVENTS = [
  'campaign.funded',
  'enrollment.created',
  'enrollment.shipped',
  'enrollment.received',
  'slot.submitted',
  'slot.checks',
  'slot.approved',
  'slot.rejected',
  'slot.released',
  'slot.missed',
  'slot.holdback',
  'sale.recorded',
  'payout.claimed',
  'application.updated',
  'funding.updated',
  'cashout.updated',
  'demo.clock',
] as const;
export type SocketEvent = (typeof SOCKET_EVENTS)[number];

export interface SocketPayload<T = unknown> {
  event: SocketEvent;
  data: T;
  txSignature?: string;
  at: string;
}
