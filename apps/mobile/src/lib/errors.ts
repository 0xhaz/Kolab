import { ApiError } from './api';

const COPY: Record<string, string> = {
  wallet_not_ready: 'Your wallet is still being created. Try again in a moment.',
  campaign_not_active: 'This campaign isn’t taking creators right now.',
  creator_only: 'Only creator accounts can join campaigns.',
  not_slot_creator: 'This deliverable belongs to another creator.',
  not_approved: 'This campaign is selective. Apply first, and you can join once the brand accepts you.',
  profile_incomplete: 'Finish your creator profile first: a niche, a channel and one sample.',
  already_applied: 'You’ve already applied to this campaign.',
  campaign_is_open: 'This campaign is open to everyone, so you can join directly.',
  too_many_samples: 'You can show up to 6 samples. Remove one to add another.',
  auto_captions_unavailable: 'Auto-captions need the AI service, which isn’t set up on this server yet. Add captions by hand for now.',
  bad_duration: 'That timeline is too long for auto-captions (5 minutes max).',
  account_not_deletable: 'Your account still has money or work in progress. See what to finish first.',
  withdraw_to_self: 'That’s your own Kolab wallet address.',
  insufficient_usdc: 'Your wallet doesn’t hold that much USDC.',
  hybrid_not_allowed: 'Live cash-outs are limited to the Kolab team during the demo.',
  hybrid_amount_cap: 'Live Aurora cash-outs are capped for this demo. Try a smaller amount.',
  hybrid_daily_cap: 'You’ve reached today’s live cash-out limit for this demo.',
  relay_insufficient: 'Kolab’s mainnet relay doesn’t hold enough USDC for this right now.',
  aurora_asset_unresolved: 'Aurora doesn’t support that asset right now. Pick another.',
  aurora_error: 'Aurora couldn’t quote this route right now. Try another amount or asset.',
  account_not_found: 'This account no longer exists.',
  validation_failed: 'Please check the details and try again.',
};

/** Human message for API / program errors (the API already translates program error codes). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body as { code?: string; message?: string } | undefined;
    if (body?.code && COPY[body.code]) return COPY[body.code]!;
    return body?.message ?? body?.code ?? `Something went wrong (${e.status})`;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
