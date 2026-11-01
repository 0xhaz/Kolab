import {
  getAddressEncoder,
  getBase64Encoder,
  getBytesEncoder,
  getProgramDerivedAddress,
  getU16Encoder,
  getU64Encoder,
  getU8Encoder,
  type Address,
  type Decoder,
  type ProgramDerivedAddress,
  type ReadonlyUint8Array,
} from '@solana/kit';
import * as ev from './generated/events/index.js';
import { KOLAB_PROGRAM_ADDRESS } from './generated/programs/index.js';

const utf8 = (s: string) => getBytesEncoder().encode(new TextEncoder().encode(s));

/** `["campaign", brand, campaign_id (u64 LE)]`, not generated because the id is an ix arg. */
export function findCampaignPda(
  seeds: { brand: Address; campaignId: bigint | number },
  config: { programAddress?: Address } = {},
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: config.programAddress ?? KOLAB_PROGRAM_ADDRESS,
    seeds: [utf8('campaign'), getAddressEncoder().encode(seeds.brand), getU64Encoder().encode(seeds.campaignId)],
  });
}

/** `["slot", enrollment, period_index (u16 LE), slot_idx (u8)]`. */
export function findSlotPda(
  seeds: { enrollment: Address; periodIndex: number; slotIdx: number },
  config: { programAddress?: Address } = {},
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: config.programAddress ?? KOLAB_PROGRAM_ADDRESS,
    seeds: [
      utf8('slot'),
      getAddressEncoder().encode(seeds.enrollment),
      getU16Encoder().encode(seeds.periodIndex),
      getU8Encoder().encode(seeds.slotIdx),
    ],
  });
}

/** Approval PDA creator for "anyone with the link can join". */
export const OPEN_INVITE = '11111111111111111111111111111111' as Address;

const EVENTS = {
  CreatorApproved: [ev.CREATOR_APPROVED_EVENT_DISCRIMINATOR, ev.getCreatorApprovedEventDecoder()],
  ApprovalRevoked: [ev.APPROVAL_REVOKED_EVENT_DISCRIMINATOR, ev.getApprovalRevokedEventDecoder()],
  CampaignCreated: [ev.CAMPAIGN_CREATED_EVENT_DISCRIMINATOR, ev.getCampaignCreatedEventDecoder()],
  CampaignFunded: [ev.CAMPAIGN_FUNDED_EVENT_DISCRIMINATOR, ev.getCampaignFundedEventDecoder()],
  CampaignClosed: [ev.CAMPAIGN_CLOSED_EVENT_DISCRIMINATOR, ev.getCampaignClosedEventDecoder()],
  CreatorEnrolled: [ev.CREATOR_ENROLLED_EVENT_DISCRIMINATOR, ev.getCreatorEnrolledEventDecoder()],
  EnrollmentCancelled: [ev.ENROLLMENT_CANCELLED_EVENT_DISCRIMINATOR, ev.getEnrollmentCancelledEventDecoder()],
  Shipped: [ev.SHIPPED_EVENT_DISCRIMINATOR, ev.getShippedEventDecoder()],
  Received: [ev.RECEIVED_EVENT_DISCRIMINATOR, ev.getReceivedEventDecoder()],
  NotReceived: [ev.NOT_RECEIVED_EVENT_DISCRIMINATOR, ev.getNotReceivedEventDecoder()],
  Submitted: [ev.SUBMITTED_EVENT_DISCRIMINATOR, ev.getSubmittedEventDecoder()],
  ChecksAttested: [ev.CHECKS_ATTESTED_EVENT_DISCRIMINATOR, ev.getChecksAttestedEventDecoder()],
  Rejected: [ev.REJECTED_EVENT_DISCRIMINATOR, ev.getRejectedEventDecoder()],
  Released: [ev.RELEASED_EVENT_DISCRIMINATOR, ev.getReleasedEventDecoder()],
  HoldbackSettled: [ev.HOLDBACK_SETTLED_EVENT_DISCRIMINATOR, ev.getHoldbackSettledEventDecoder()],
  Missed: [ev.MISSED_EVENT_DISCRIMINATOR, ev.getMissedEventDecoder()],
  SaleRecorded: [ev.SALE_RECORDED_EVENT_DISCRIMINATOR, ev.getSaleRecordedEventDecoder()],
  SalesClaimed: [ev.SALES_CLAIMED_EVENT_DISCRIMINATOR, ev.getSalesClaimedEventDecoder()],
} as const satisfies Record<string, readonly [ReadonlyUint8Array, Decoder<unknown>]>;

type Events = typeof EVENTS;
export type KolabEventName = keyof Events;
export type ParsedKolabEvent = {
  [K in KolabEventName]: { name: K; data: Events[K][1] extends Decoder<infer T> ? T : never };
}[KolabEventName];

function startsWith(data: ReadonlyUint8Array, prefix: ReadonlyUint8Array) {
  if (data.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (data[i] !== prefix[i]) return false;
  return true;
}

/** Decodes one Anchor event payload (discriminator + borsh), or null if it isn't ours. */
export function decodeKolabEvent(data: ReadonlyUint8Array): ParsedKolabEvent | null {
  for (const [name, [disc, decoder]] of Object.entries(EVENTS)) {
    if (startsWith(data, disc)) return { name, data: decoder.decode(data) } as ParsedKolabEvent;
  }
  return null;
}

/**
 * Extracts Kolab events from transaction logs. Only `Program data:` lines emitted while our
 * program is the innermost running program count, so another program can't forge our events.
 */
export function parseKolabEventLogs(
  logs: readonly string[],
  programAddress: Address = KOLAB_PROGRAM_ADDRESS,
): ParsedKolabEvent[] {
  const stack: string[] = [];
  const out: ParsedKolabEvent[] = [];
  const b64 = getBase64Encoder();
  for (const line of logs) {
    const invoke = /^Program (\w+) invoke \[\d+\]$/.exec(line);
    if (invoke) {
      stack.push(invoke[1]!);
      continue;
    }
    if (/^Program \w+ (success|failed)/.test(line)) {
      stack.pop();
      continue;
    }
    if (stack.at(-1) === programAddress && line.startsWith('Program data: ')) {
      try {
        const event = decodeKolabEvent(b64.encode(line.slice('Program data: '.length)));
        if (event) out.push(event);
      } catch {
        // not a Kolab event payload
      }
    }
  }
  return out;
}
