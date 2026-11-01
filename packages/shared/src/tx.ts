import { z } from 'zod';

/** A sponsored transaction built by the API: fee payer signed, user signature still empty. */
export const UnsignedTxSchema = z.object({
  transaction: z.string().min(1), // base64 wire transaction
});
export type UnsignedTx = z.infer<typeof UnsignedTxSchema>;

export const SubmitTxSchema = z.object({
  transaction: z.string().min(1).max(2048), // base64 wire tx, user-signed
});
export type SubmitTx = z.infer<typeof SubmitTxSchema>;

export const SubmittedTxSchema = z.object({
  signature: z.string(),
  explorerUrl: z.string(),
});
export type SubmittedTx = z.infer<typeof SubmittedTxSchema>;

export const MemoTxSchema = z.object({
  memo: z.string().min(1).max(200),
});
export type MemoTx = z.infer<typeof MemoTxSchema>;
