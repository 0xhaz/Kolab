'use client';

import { useCallback } from 'react';
import { useSignTransaction, useWallets } from '@privy-io/react-auth/solana';
import type { SubmittedTx, UnsignedTx } from '@kolab/shared';
import { api } from './api';

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export interface SignOptions {
  /** Skip Privy's confirmation modal (used for bulk demo seeding the user explicitly asked for). */
  silent?: boolean;
}

/** Signs an API-built sponsored transaction with the embedded wallet and submits it. */
export function useSignAndSubmit() {
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  return useCallback(
    async (transaction: string, opts: SignOptions = {}): Promise<SubmittedTx> => {
      const wallet = wallets[0];
      if (!wallet) throw new Error('Wallet not ready yet');
      const { signedTransaction } = await signTransaction({
        transaction: toBytes(transaction),
        wallet,
        chain: 'solana:devnet',
        options: opts.silent ? { uiOptions: { showWalletUIs: false } } : undefined,
      });
      return api<SubmittedTx>('/tx/submit', {
        method: 'POST',
        body: JSON.stringify({ transaction: toBase64(signedTransaction) }),
      });
    },
    [wallets, signTransaction],
  );
}

/** Same sponsored flow as mobile: API builds + fee-payer signs, Privy signs, API submits. */
export function useSponsoredTx() {
  const signAndSubmit = useSignAndSubmit();
  return useCallback(
    async (buildPath: string, body: unknown, opts?: SignOptions): Promise<SubmittedTx> => {
      const { transaction } = await api<UnsignedTx>(buildPath, { method: 'POST', body: JSON.stringify(body) });
      return signAndSubmit(transaction, opts);
    },
    [signAndSubmit],
  );
}
