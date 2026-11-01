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
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body as { code?: string; message?: string } | undefined;
    if (body?.code && COPY[body.code]) return COPY[body.code]!;
    return body?.message ?? body?.code ?? `Request failed (${e.status})`;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
