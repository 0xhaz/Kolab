'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from './errors';
import { useSponsoredTx } from './use-sponsored-tx';

/** Approve / request changes on a slot, signed by the brand's embedded wallet. */
export function useSlotActions() {
  const send = useSponsoredTx();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(slotId: string, action: 'approve' | 'reject') {
    setBusy(`${action}:${slotId}`);
    try {
      const tx = await send(`/slots/${slotId}/tx/${action}`, action === 'reject' ? { reasonCode: 1 } : {});
      await qc.invalidateQueries();
      toast.success(action === 'approve' ? 'Approved. Payment released to the creator.' : 'Changes requested. The creator can resubmit once.', {
        action: { label: 'Explorer', onClick: () => window.open(tx.explorerUrl, '_blank') },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  return { busy, approve: (id: string) => run(id, 'approve'), reject: (id: string) => run(id, 'reject') };
}
