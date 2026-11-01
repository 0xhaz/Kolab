'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowUpIcon, ClipboardPasteIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/errors';
import { usdc } from '@/lib/format';
import { keys } from '@/lib/queries';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Send USDC from the Kolab wallet to any Solana address (e.g. an exchange deposit address). */
export function WithdrawDialog({ open, onOpenChange, availableUsdc }: { open: boolean; onOpenChange: (open: boolean) => void; availableUsdc: number }) {
  const send = useSponsoredTx();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const value = Number(amount);
  const address = to.trim();
  const addressOk = SOLANA_ADDRESS.test(address);
  const amountOk = Number.isFinite(value) && value > 0 && value <= availableUsdc;

  function close(next: boolean) {
    if (busy) return;
    onOpenChange(next);
    if (!next) {
      setAmount('');
      setTo('');
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      const tx = await send('/tx/withdraw', { to: address, amountUsdc: value });
      await qc.invalidateQueries({ queryKey: keys.balance });
      toast.success(`${usdc(value)} sent`, { action: { label: 'Explorer', onClick: () => window.open(tx.explorerUrl, '_blank') } });
      setBusy(false);
      setAmount('');
      setTo('');
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setTo(text.trim());
    } catch {
      toast.error('Clipboard access was blocked. Paste the address into the field.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-white/8">
              <ArrowUpIcon className="size-4" />
            </span>
            Withdraw USDC
          </DialogTitle>
          <p className="text-sm text-muted-foreground">To your own wallet or exchange on Solana. Kolab pays the network fee.</p>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (addressOk && amountOk && !busy) void withdraw();
          }}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="withdraw-amount">Amount (USDC)</Label>
              <button type="button" className="text-xs font-medium text-accent" onClick={() => setAmount(String(Math.floor(availableUsdc * 100) / 100))}>
                Max {usdc(availableUsdc)}
              </button>
            </div>
            <Input id="withdraw-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" aria-invalid={amount !== '' && !amountOk} />
            {value > availableUsdc && <p className="text-xs text-red-300">More than your wallet holds.</p>}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="withdraw-to">Solana address</Label>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-accent" onClick={paste}>
                <ClipboardPasteIcon className="size-3" /> Paste
              </button>
            </div>
            <Input
              id="withdraw-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
              placeholder="Wallet or exchange USDC (Solana) address"
              aria-invalid={to.length > 6 && !addressOk}
            />
            {to.length > 6 && !addressOk && <p className="text-xs text-red-300">That doesn’t look like a Solana address.</p>}
            <p className="text-xs text-muted-foreground">Check that the receiving wallet or exchange supports USDC on Solana. Transfers can’t be reversed.</p>
          </div>
          <Button type="submit" variant="gradient" size="lg" className="h-11 w-full" disabled={!addressOk || !amountOk || busy}>
            {busy ? 'Confirm in your wallet…' : `Withdraw ${amountOk ? usdc(value) : ''}`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
