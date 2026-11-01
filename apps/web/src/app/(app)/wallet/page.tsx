'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ArrowUpRightIcon, KeyRoundIcon, PlusIcon, ZapIcon } from 'lucide-react';
import { CashoutDialog } from '@/components/cashout-dialog';
import { HeroStat, PageHeader, Panel } from '@/components/dashboard';
import { api } from '@/lib/api';
import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { keys, useBalance } from '@/lib/queries';
import { useMe } from '@/lib/use-me';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { explorerAccount, myr, usdc } from '@/lib/format';

export default function WalletPage() {
  const { data: me } = useMe();
  const { data: balance } = useBalance();
  const qc = useQueryClient();
  const sendSponsored = useSponsoredTx();
  const [busy, setBusy] = useState<'faucet' | 'tx' | null>(null);
  const [moving, setMoving] = useState(false);

  async function faucet() {
    setBusy('faucet');
    try {
      const r = await api<{ explorerUrl: string }>('/demo/faucet', { method: 'POST' });
      await qc.invalidateQueries({ queryKey: keys.balance });
      toast.success('1,000 test USDC added', { action: { label: 'Explorer', onClick: () => window.open(r.explorerUrl, '_blank') } });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function testTx() {
    setBusy('tx');
    try {
      const r = await sendSponsored('/tx/memo', { memo: 'Kolab sponsored tx test (web)' });
      toast.success('Transaction confirmed on devnet', { action: { label: 'Explorer', onClick: () => window.open(r.explorerUrl, '_blank') } });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Privy embedded wallet" title="Wallet" description="Your wallet on Solana devnet. Kolab pays every network fee, so you never need SOL." />

      <HeroStat
        label="Test USDC balance"
        value={balance ? usdc(balance.usdc) : '—'}
        note={balance ? myr(balance.usdc) : undefined}
        stats={[{ label: 'Network fees paid by Kolab', value: '0 SOL' }]}
        action={
          env.demoMode && (
            <button
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 active:scale-95 disabled:opacity-60"
              disabled={busy !== null}
              onClick={faucet}
            >
              <PlusIcon className="size-4" /> {busy === 'faucet' ? 'Minting…' : 'Get 1,000 test USDC'}
            </button>
          )
        }
      />

      <Panel className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-glow grid size-10 shrink-0 place-items-center rounded-xl text-white">
            <ArrowUpRightIcon className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold">Move funds to any chain</h2>
            <p className="text-sm text-muted-foreground">Refunds or leftover budget out as USDT on Tron, ETH on Base, BTC and more, via Aurora Intents.</p>
          </div>
        </div>
        <Button variant="gradient" className="h-10 px-5" disabled={!balance || BigInt(balance.usdc) < 1_000_000n} onClick={() => setMoving(true)}>
          Move funds
        </Button>
      </Panel>
      <CashoutDialog open={moving} onOpenChange={setMoving} availableUsdc={balance ? Number(balance.usdc) / 1e6 : 0} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary">
              <KeyRoundIcon className="size-4" />
            </span>
            <h2 className="font-semibold">Address</h2>
          </div>
          {me?.walletPubkey ? (
            <a className="block break-all rounded-2xl bg-popover px-4 py-3 font-mono text-sm text-primary underline-offset-4 hover:underline" href={explorerAccount(me.walletPubkey)} target="_blank" rel="noreferrer">
              {me.walletPubkey}
            </a>
          ) : (
            <div className="text-sm text-muted-foreground">Creating…</div>
          )}
          <p className="text-sm text-muted-foreground">
            On devnet, campaigns are funded with Kolab test USDC. In production this is real USDC from an on-ramp, or any token swapped to USDC at funding time.
          </p>
        </Panel>
        <Panel className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-accent/15 text-accent">
              <ZapIcon className="size-4" />
            </span>
            <h2 className="font-semibold">Sponsored transaction test</h2>
          </div>
          <p className="text-sm text-muted-foreground">Signs a memo with your wallet; Kolab’s fee payer covers the network fee.</p>
          <Button variant="glass" className="h-10 px-5" disabled={busy !== null} onClick={testTx}>
            {busy === 'tx' ? 'Signing…' : 'Send test transaction'}
          </Button>
        </Panel>
      </div>
    </div>
  );
}
