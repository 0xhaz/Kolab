import { ApiError } from './api';

const COPY: Record<string, string> = {
  insufficient_usdc: 'Your wallet doesn’t hold enough test USDC for this budget. Top up on the Wallet page.',
  brand_only: 'Only brand accounts can do that.',
  campaign_already_on_chain: 'This campaign is already live.',
  wallet_not_ready: 'Your wallet is still being created. Try again in a moment.',
  validation_failed: 'Please check the highlighted fields.',
  not_approved: 'The brand hasn’t approved this creator yet.',
  campaign_not_active: 'This campaign isn’t live yet.',
  profile_incomplete: 'Add a niche, a channel and one sample before applying.',
  already_applied: 'You’ve already applied to this campaign.',
  account_not_deletable: 'Your account still has money or work in progress. Finish those first.',
  withdraw_to_self: 'That’s your own Kolab wallet address.',
  demo_only: 'Demo controls are switched off on this server.',
  hybrid_not_allowed: 'Live cash-outs are limited to the Kolab team during the demo.',
  hybrid_amount_cap: 'Live Aurora flows are capped for this demo. Try a smaller amount.',
  hybrid_daily_cap: 'You’ve reached today’s live cash-out limit for this demo.',
  relay_insufficient: 'Kolab’s mainnet relay wallet doesn’t hold enough USDC for this right now.',
  refund_address_required: 'Add a refund address on the chain you’re paying from.',
  invalid_refund_address: 'That refund address doesn’t look right for this chain.',
  aurora_asset_unresolved: 'Aurora doesn’t support that asset right now. Pick another.',
  aurora_error: 'Aurora couldn’t quote this route right now. Try another amount or asset.',
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body as { code?: string; message?: string } | undefined;
    if (body?.code && COPY[body.code]) return COPY[body.code]!;
    return body?.message ?? body?.code ?? `Request failed (${e.status})`;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
