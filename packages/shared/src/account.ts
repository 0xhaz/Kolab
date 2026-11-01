import { z } from 'zod';

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Plain USDC send from the Kolab wallet to any Solana address (no swap; store-safe "withdraw"). */
export const WithdrawSchema = z.object({
  to: z.string().trim().regex(SOLANA_ADDRESS, 'Not a Solana address'),
  amountUsdc: z.number().min(0.01).max(1_000_000),
});
export type Withdraw = z.infer<typeof WithdrawSchema>;

export const DeleteAccountSchema = z.object({ confirm: z.literal('DELETE') });

export type DeletionBlockerCode = 'wallet_not_empty' | 'active_campaigns' | 'unpaid_work';

/** Deleting the account also deletes the embedded wallet's keys, so money must be out first. */
export interface DeletionCheckDto {
  canDelete: boolean;
  blockers: { code: DeletionBlockerCode; detail: string }[];
}
