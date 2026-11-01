/**
 * Kolab program client. `generated/` comes from the Anchor IDL via Codama
 * (`pnpm --filter @kolab/sdk generate` after `anchor build`); don't edit it by hand.
 */
import { address, type Address } from '@solana/kit';
import {
  getKolabErrorMessage,
  KOLAB_ERROR__NOT_BRAND,
  KOLAB_ERROR__NOT_CREATOR,
  KOLAB_ERROR__CAMPAIGN_NOT_ACTIVE,
  KOLAB_ERROR__CAMPAIGN_ENDED,
  KOLAB_ERROR__CAMPAIGN_FULL,
  KOLAB_ERROR__INSUFFICIENT_FUNDS,
  KOLAB_ERROR__SHIPPING_WINDOW_OPEN,
  KOLAB_ERROR__SHIPPING_WINDOW_CLOSED,
  KOLAB_ERROR__INVALID_SLOT_STATE,
  KOLAB_ERROR__SLOT_PAST_DEADLINE,
  KOLAB_ERROR__NO_RESUBMITS_LEFT,
  KOLAB_ERROR__REVIEW_WINDOW_OPEN,
  KOLAB_ERROR__CHECKS_FAILED,
  KOLAB_ERROR__NOT_APPROVED,
  type KolabError,
} from './generated/index.js';

export * from './generated/index.js';
export * from './extras.js';

/** Two deployments of the same program (workplan §0.3). Generated builders default to `hosted`. */
export const KOLAB_PROGRAM_IDS = {
  /** Release build: hosted app + README. */
  hosted: address('5JeZ2i6VAPZDpdnwu6GgpXjrXYhodQibSrh6QwmXTQxD'),
  /** demo-clock build: local presentation only. */
  demo: address('7hTBC9iCNxZ3pmfk1EHstbB4hmxu2iRrNMZ4UhhChQfv'),
} as const satisfies Record<string, Address>;

const KOLAB_ERROR_MIN = 6000;
const KOLAB_ERROR_MAX = 6099;

/** Short, user-facing copy for program errors the apps are likely to surface. */
const FRIENDLY: Partial<Record<number, string>> = {
  [KOLAB_ERROR__NOT_BRAND]: 'Only the brand that owns this campaign can do that.',
  [KOLAB_ERROR__NOT_CREATOR]: 'Only the creator on this enrollment can do that.',
  [KOLAB_ERROR__CAMPAIGN_NOT_ACTIVE]: 'This campaign isn’t active yet.',
  [KOLAB_ERROR__CAMPAIGN_ENDED]: 'This campaign has ended.',
  [KOLAB_ERROR__CAMPAIGN_FULL]: 'This campaign is full.',
  [KOLAB_ERROR__INSUFFICIENT_FUNDS]: 'The campaign doesn’t have enough unpromised funds. Top up the vault first.',
  [KOLAB_ERROR__SHIPPING_WINDOW_OPEN]: 'The shipping window is still open.',
  [KOLAB_ERROR__SHIPPING_WINDOW_CLOSED]: 'The shipping window has closed.',
  [KOLAB_ERROR__INVALID_SLOT_STATE]: 'This deliverable isn’t in a state that allows that.',
  [KOLAB_ERROR__SLOT_PAST_DEADLINE]: 'The deadline for this deliverable has passed.',
  [KOLAB_ERROR__NO_RESUBMITS_LEFT]: 'You’ve already used your resubmission for this deliverable.',
  [KOLAB_ERROR__REVIEW_WINDOW_OPEN]: 'The brand still has time to review this.',
  [KOLAB_ERROR__CHECKS_FAILED]: 'Automated checks failed, so the brand needs to decide.',
  [KOLAB_ERROR__NOT_APPROVED]: 'The brand hasn’t approved you for this campaign yet.',
};

/**
 * Maps a Kolab program error code to readable text, or null if the code isn't ours.
 * Use with the custom error code from a failed simulation / transaction.
 */
export function kolabErrorMessage(code: number): string | null {
  if (code < KOLAB_ERROR_MIN || code > KOLAB_ERROR_MAX) return null;
  return FRIENDLY[code] ?? getKolabErrorMessage(code as KolabError);
}
