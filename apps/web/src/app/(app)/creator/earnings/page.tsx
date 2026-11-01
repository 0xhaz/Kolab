'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowUpIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  HandCoinsIcon,
  HeartHandshakeIcon,
  HourglassIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  WalletIcon,
  XCircleIcon,
  type LucideIcon,
} from 'lucide-react';
import { CASHOUT_DESTINATIONS, type CashoutStatus } from '@kolab/shared';
import { CampaignCover, Chip, Empty, HeroStat, PageHeader, Panel, SectionHeader, tone } from '@/components/dashboard';
import { CashoutDialog } from '@/components/cashout-dialog';
import { WithdrawDialog } from '@/components/creator/withdraw-dialog';
import { Button } from '@/components/ui/button';
import { creatorKeys, useCashouts, useMyEnrollments } from '@/lib/creator';
import { summarize } from '@/lib/earnings';
import { errorMessage } from '@/lib/errors';
import { myr, shortDate, usdc } from '@/lib/format';
import { useBalance } from '@/lib/queries';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';

const BUCKETS = [
  { key: 'paid', label: 'Paid to you', color: tone.money },
  { key: 'holdbackPending', label: 'Held until posts stay live', color: '#A78BFA' },
  { key: 'salesToClaim', label: 'Sales to claim', color: '#F472B6' },
  { key: 'upcoming', label: 'Locked for upcoming work', color: '#64748B' },
] as const;

const CASHOUT_STATUS: Record<CashoutStatus, { label: string; color: string; icon: LucideIcon }> = {
  awaiting_signature: { label: 'Waiting for signature', color: tone.muted, icon: HourglassIcon },
  deposit_sent: { label: 'In progress', color: tone.info, icon: LoaderCircleIcon },
  swapping: { label: 'Swapping', color: tone.info, icon: LoaderCircleIcon },
  completed: { label: 'Delivered', color: tone.money, icon: CheckCircle2Icon },
  refunded: { label: 'Refunded', color: tone.warning, icon: RotateCcwIcon },
  failed: { label: 'Failed', color: tone.danger, icon: XCircleIcon },
  expired: { label: 'Expired', color: tone.danger, icon: XCircleIcon },
};

const pctOf = (part: bigint, all: bigint) => (all === 0n ? 0 : Number((part * 1000n) / all) / 10);

/** Creator earnings: what's paid, what's held, what's claimable, and how to move it out. */
export default function CreatorEarningsPage() {
  const q = useMyEnrollments();
  const balance = useBalance();
  const cashouts = useCashouts();
  const send = useSponsoredTx();
  const qc = useQueryClient();
  const [claiming, setClaiming] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const enrollments = q.data ?? [];
  const totals = summarize(enrollments);
  const all = BUCKETS.reduce((s, b) => s + totals[b.key], 0n);
  const available = balance.data ? Number(balance.data.usdc) / 1e6 : 0;

  async function claim(enrollmentId: string) {
    setClaiming(enrollmentId);
    try {
      const tx = await send(`/enrollments/${enrollmentId}/tx/claim-sales`, {});
      await qc.invalidateQueries({ queryKey: creatorKeys.enrollments });
      toast.success('Sales payout sent to your wallet', { action: { label: 'Explorer', onClick: () => window.open(tx.explorerUrl, '_blank') } });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setClaiming(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Creator" title="Earnings" description="Every payout comes straight from the campaign escrow on Solana, in USDC." />

      {q.isLoading ? (
        <div className="h-52 animate-pulse rounded-[2rem] bg-white/6" />
      ) : q.isError ? (
        <Empty icon={XCircleIcon}>
          Couldn’t load your earnings: {errorMessage(q.error)}
          <Button variant="glass" className="h-9 px-4" onClick={() => void q.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : (
        <>
          <HeroStat
            label="Paid to your wallet"
            value={usdc(totals.paid)}
            note={myr(totals.paid)}
            stats={[
              { label: 'Held until posts stay live', value: usdc(totals.holdbackPending) },
              { label: 'Sales to claim', value: usdc(totals.salesToClaim) },
              { label: 'Locked for upcoming work', value: usdc(totals.upcoming) },
              { label: 'In your wallet now', value: balance.data ? usdc(balance.data.usdc) : '—' },
            ]}
          />

          <Panel className="space-y-4">
            <SectionHeader title="Where your money is" />
            <div
              className="flex h-3 gap-0.5 overflow-hidden rounded-full"
              role="img"
              aria-label={BUCKETS.map((b) => `${b.label}: ${usdc(totals[b.key])}`).join(', ')}
            >
              {all === 0n ? (
                <div className="flex-1 bg-white/8" />
              ) : (
                BUCKETS.filter((b) => totals[b.key] > 0n).map((b) => (
                  <div key={b.key} style={{ flexGrow: Number((totals[b.key] * 1000n) / all), flexBasis: 0, minWidth: 4, backgroundColor: b.color }} />
                ))
              )}
            </div>
            <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {BUCKETS.map((b) => (
                <li key={b.key} className="flex items-center gap-2.5 text-sm">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: b.color }} />
                  <span className="flex-1 text-muted-foreground">{b.label}</span>
                  <span className="font-semibold tabular-nums">{usdc(totals[b.key])}</span>
                  <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{pctOf(totals[b.key], all)}%</span>
                </li>
              ))}
            </ul>
            {all === 0n && <p className="text-sm text-muted-foreground">Nothing yet. Join a campaign and deliver your first post to start earning.</p>}
          </Panel>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-glow grid size-11 shrink-0 place-items-center rounded-2xl text-white">
              <ArrowUpRightIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold">Cash out to any chain</h2>
              <p className="text-sm text-muted-foreground">USDT on Tron, ETH on Base, BTC and more</p>
            </div>
          </div>
          <Button variant="gradient" className="h-10 px-5" disabled={available < 1} onClick={() => setMoving(true)}>
            Cash out
          </Button>
        </Panel>
        <Panel className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/8">
              <ArrowUpIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold">Withdraw USDC</h2>
              <p className="text-sm text-muted-foreground">To your own wallet or exchange on Solana</p>
            </div>
          </div>
          <Button variant="glass" className="h-10 px-5" disabled={available <= 0} onClick={() => setWithdrawing(true)}>
            Withdraw
          </Button>
        </Panel>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <WalletIcon className="size-4" aria-hidden />
        {balance.isLoading ? 'Checking your wallet…' : balance.isError ? 'Couldn’t read your wallet balance.' : `${usdc(balance.data?.usdc ?? '0')} in your Kolab wallet`}
      </div>
      <CashoutDialog open={moving} onOpenChange={setMoving} availableUsdc={available} />
      <WithdrawDialog open={withdrawing} onOpenChange={setWithdrawing} availableUsdc={available} />

      {(cashouts.data ?? []).length > 0 && (
        <Panel className="space-y-3">
          <SectionHeader title="Recent cash-outs" count={cashouts.data!.length} />
          <ul className="divide-y divide-white/6">
            {cashouts.data!.slice(0, 5).map((o) => {
              const st = CASHOUT_STATUS[o.status];
              const dest = CASHOUT_DESTINATIONS.find((d) => d.chain === o.destChain);
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {usdc(o.amountIn)} → <span className="font-semibold">{o.amountOut} {o.destAsset}</span>
                    <span className="text-muted-foreground"> on {dest?.label ?? o.destChain}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{shortDate(o.createdAt)}</span>
                  <Chip label={st.label} color={st.color} icon={st.icon} />
                  {o.destinationExplorerUrl && (
                    <a href={o.destinationExplorerUrl} target="_blank" rel="noreferrer" aria-label="View on explorer" className="text-muted-foreground hover:text-foreground">
                      <ExternalLinkIcon className="size-4" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="flex items-center gap-3 rounded-3xl border px-5 py-4 text-sm font-medium" style={{ borderColor: `${tone.money}44`, backgroundColor: `${tone.money}14`, color: tone.money }}>
        <HeartHandshakeIcon className="size-5 shrink-0" aria-hidden />
        You keep 100% of your rate. Kolab charges brands, not creators.
      </div>

      <section className="space-y-4">
        <SectionHeader title="By campaign" count={enrollments.length} />
        {!q.isLoading && !q.isError && enrollments.length === 0 && (
          <Empty icon={HandCoinsIcon}>
            Join a campaign to start earning.
            <Button variant="gradient" className="h-9 px-4" nativeButton={false} render={<Link href="/creator/discover" />}>
              Discover campaigns
            </Button>
          </Empty>
        )}
        <div className="grid gap-3">
          {enrollments.map((e) => {
            const toClaim = BigInt(e.salesAccrued);
            return (
              <Panel key={e.id} className="flex flex-wrap items-center gap-4 p-4">
                <Link href={`/creator/campaigns/${e.campaignId}`} className="flex min-w-0 flex-1 items-center gap-3.5">
                  <CampaignCover camp={e.campaign} className="size-12 shrink-0 rounded-2xl" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{e.campaign.brandName ?? 'Brand'}</div>
                    <div className="truncate font-semibold">{e.campaign.title}</div>
                  </div>
                </Link>
                <div className="text-right">
                  <div className="text-lg font-bold text-money tabular-nums">{usdc(e.earnedTotal)}</div>
                  <div className="text-xs text-muted-foreground">earned</div>
                </div>
                {e.campaign.type === 'per_sale' && toClaim > 0n && (
                  <Button variant="gradient" className="h-10 px-5" disabled={claiming !== null} onClick={() => claim(e.id)}>
                    {claiming === e.id ? <LoaderCircleIcon className="animate-spin" /> : <HandCoinsIcon />}
                    {claiming === e.id ? 'Claiming…' : `Claim sales ${usdc(toClaim)}`}
                  </Button>
                )}
              </Panel>
            );
          })}
        </div>
      </section>

      <p className="text-center text-xs text-muted-foreground">Cash-out to MYR / IDR runs through a licensed partner (coming soon). Local amounts are estimates.</p>
    </div>
  );
}
