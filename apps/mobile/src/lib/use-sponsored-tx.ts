import { useCallback } from 'react';
import { Buffer } from 'buffer';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import type { SubmittedTx, UnsignedTx } from '@kolab/shared';
import { useApi } from './api';

/**
 * Sponsored signing flow (techstacks §4.1): the API builds the tx with our fee payer already signed,
 * the Privy embedded wallet adds the user's signature on-device, and the API submits + confirms.
 */
export function useSponsoredTx() {
  const api = useApi();
  const { wallets } = useEmbeddedSolanaWallet();

  return useCallback(
    async (buildPath: string, body: unknown): Promise<SubmittedTx> => {
      const wallet = wallets?.[0];
      if (!wallet) throw new Error('Wallet not ready yet');

      const { transaction } = await api<UnsignedTx>(buildPath, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const provider = await wallet.getProvider();
      const { signedTransaction } = await provider.request({
        method: 'signTransaction',
        params: { transaction: new Uint8Array(Buffer.from(transaction, 'base64')) },
      });

      return api<SubmittedTx>('/tx/submit', {
        method: 'POST',
        body: JSON.stringify({ transaction: Buffer.from(signedTransaction).toString('base64') }),
      });
    },
    [api, wallets],
  );
}
