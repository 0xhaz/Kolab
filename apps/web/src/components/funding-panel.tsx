'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { GlobeIcon } from 'lucide-react';
import { FUNDING_SOURCES, type CampaignDto, type FundingStatus } from '@kolab/shared';
import { Chip, Panel, tone } from '@/components/dashboard';
import { FundAnyChainDialog } from '@/components/fund-any-chain';
import { Button } from '@/components/ui/button';
import { relative, usdc } from '@/lib/format';
import { useFundingConfig, useFundings } from '@/lib/queries';

const STATUS: Record<FundingStatus, { label: string; color: string }> = {
  awaiting_deposit: { label: 'Waiting for deposit', color: tone.warning },
  deposit_detected: { label: 'Deposit detected', color: tone.info },
  swapping: { label: 'Swapping', color: tone.info },
  funding_escrow: { label: 'Locking in escrow', color: tone.primary },
  completed: { label: 'In escrow', color: tone.money },
  failed: { label: 'Failed', color: tone.danger },
  refunded: { label: 'Refunded', color: tone.muted },
  expired: { label: 'Expired', color: tone.muted },
};

/** Escrow funding: how much of the budget is locked, and cross-chain top-ups via Aurora Intents. */
export function FundingPanel({ campaign }: { campaign: CampaignDto }) {
  const params = useSearchParams();
  // Arriving from "Create & fund from any chain" opens the dialog straight away.
  const [open, setOpen] = useState(() => params.get('fund') === 'any' && campaign.onChain);
  const { data: fundings = [] } = useFundings(campaign.id);
  const config = useFundingConfig();
  const funded = Number(campaign.totalFunded) / 1e6;
  const budget = Number(campaign.budget) / 1e6;
  const pct = budget > 0 ? Math.min(100, Math.round((funded / budget) * 100)) : 100;

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Escrow funding</h2>
            <span className="text-sm text-muted-foreground tabular-nums">
              <span className="font-semibold text-money">{usdc(funded, 0)}</span> of {usdc(budget, 0)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8" role="progressbar" aria-valuenow={pct} aria-label={`${pct}% of budget funded`}>
            <div className="bg-glow h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%` }} />
          </div>
        </div>
        <Button variant="gradient" className="h-10 px-5" disabled={!campaign.onChain || campaign.status === 'closed'} onClick={() => setOpen(true)}>
          <GlobeIcon /> Fund from any chain
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Pay with USDT on Tron, ETH on Base, BTC and more. Aurora Intents swaps it to USDC and locks it in this escrow in one flow.
        {config.data?.mode === 'simulated' ? ' Simulated on devnet.' : config.data?.mode === 'hybrid' ? ' Live Aurora swap on mainnet; this escrow is on devnet.' : ''}
      </p>
      {fundings.length > 0 && (
        <ul className="divide-y divide-white/6 rounded-2xl border border-white/6">
          {fundings.slice(0, 5).map((f) => {
            const src = FUNDING_SOURCES.find((s) => s.chain === f.sourceChain);
            return (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: src?.color }} />
                  {f.amountIn} {f.sourceAsset} on {src?.label}
                  <span className="text-muted-foreground">→ {usdc(f.amountOut, 0)}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {relative(f.createdAt)}
                  <Chip label={STATUS[f.status].label} color={STATUS[f.status].color} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <FundAnyChainDialog campaign={campaign} open={open} onOpenChange={setOpen} />
    </Panel>
  );
}
