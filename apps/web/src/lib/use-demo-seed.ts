'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import { errorMessage } from './errors';
import { useSignAndSubmit } from './use-sponsored-tx';

interface SeedTx {
  campaignId: string;
  title: string;
  transaction: string;
}

/** Loads the Glow Lab demo campaigns into the signed-in brand's account (DEMO_MODE only). */
export function useDemoSeed() {
  const signAndSubmit = useSignAndSubmit();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<string | null>(null);

  async function seed() {
    setProgress('Topping up test USDC…');
    try {
      const txs = await api<SeedTx[]>('/demo/seed', { method: 'POST' });
      if (txs.length === 0) {
        toast('All Glow Lab demo campaigns are already loaded');
        return;
      }
      for (const [i, tx] of txs.entries()) {
        setProgress(`Locking budget ${i + 1}/${txs.length} in escrow…`);
        await signAndSubmit(tx.transaction, { silent: true });
      }
      await qc.invalidateQueries();
      toast.success(`${txs.length} Glow Lab campaigns are live`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }
  return { seed, progress, busy: progress !== null };
}
