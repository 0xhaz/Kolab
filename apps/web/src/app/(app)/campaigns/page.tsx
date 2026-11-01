'use client';

import Link from 'next/link';
import { ArrowUpRightIcon, InboxIcon, PlusIcon, SparklesIcon, UserCheckIcon } from 'lucide-react';
import type { CampaignDto } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { CampaignCover, Chip, Empty, HeroStat, KitBadge, PageHeader, SectionHeader, TYPE_LABEL, tone } from '@/components/dashboard';
import { useCampaigns, useReview } from '@/lib/queries';
import { myr, usdc } from '@/lib/format';
import { env } from '@/lib/env';
import { useDemoSeed } from '@/lib/use-demo-seed';

const STATUS: Record<CampaignDto['status'], { label: string; color: string }> = {
  draft: { label: 'Draft · not funded', color: tone.muted },
  active: { label: 'Live', color: tone.money },
  cancelling: { label: 'Cancelling', color: tone.warning },
  closed: { label: 'Closed', color: tone.muted },
};

const sum = (rows: CampaignDto[], key: 'totalFunded' | 'totalReleased' | 'totalFees' | 'totalRefunded') =>
  rows.reduce((s, c) => s + BigInt(c[key]), 0n);

/** Brand-facing twin of the mobile CampaignFeedCard: image-led, money in mint. */
function CampaignCard({ c }: { c: CampaignDto }) {
  const funded = BigInt(c.totalFunded);
  const spent = BigInt(c.totalReleased) + BigInt(c.totalRefunded);
  const pct = funded > 0n ? Number((spent * 100n) / funded) : 0;
  const status = STATUS[c.status];
  return (
    <Link
      href={`/campaigns/${c.id}`}
      className="group block overflow-hidden rounded-3xl border border-white/8 bg-card transition duration-300 hover:-translate-y-0.5 hover:border-white/16 hover:shadow-[0_24px_48px_-24px_rgb(139_92_246/0.45)]"
    >
      <CampaignCover camp={c} className="h-44">
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-1.5">
          <Chip label={TYPE_LABEL[c.type]} color="#FFFFFF" className="backdrop-blur-md" />
          {c.requiresShipping && <Chip label="Free product" color="#FFFFFF" className="backdrop-blur-md" />}
          <Chip label={status.label} color={c.status === 'active' ? tone.money : '#FFFFFF'} className="ml-auto bg-black/40! backdrop-blur-md" />
        </div>
        <div className="absolute inset-x-4 bottom-3">
          <div className="text-xs font-medium text-white/80">{c.brandName ?? 'Your brand'}</div>
          <div className="truncate text-lg font-semibold text-white">{c.title}</div>
        </div>
      </CampaignCover>
      <div className="space-y-3 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Locked in escrow</div>
            <div className="text-xl font-bold tabular-nums text-money">{usdc(funded - spent, 0)}</div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>
              Paid out <span className="font-medium text-foreground tabular-nums">{usdc(c.totalReleased, 0)}</span>
            </div>
            <div>
              {c.slots.length} deliverable{c.slots.length === 1 ? '' : 's'} · up to {c.maxCreators} creators
            </div>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/8" role="progressbar" aria-valuenow={pct} aria-label={`${pct}% of budget settled`}>
          <div className="bg-glow h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <KitBadge camp={c} />
            {c.pendingApplications ? <Chip label={`${c.pendingApplications} to review`} color={tone.warning} icon={UserCheckIcon} /> : null}
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground transition group-hover:text-foreground">
            Open <ArrowUpRightIcon className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function CampaignsPage() {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const { data: review = [] } = useReview();
  const live = campaigns.filter((c) => c.status === 'active');
  const demo = useDemoSeed();
  const escrow = sum(campaigns, 'totalFunded') - sum(campaigns, 'totalReleased') - sum(campaigns, 'totalRefunded');

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Your campaigns"
        title="Campaigns"
        description="Budgets are locked in on-chain escrow and paid out slot by slot. You pay 5% only on money released to creators."
        action={
          <div className="flex flex-wrap gap-2">
            {env.demoMode && campaigns.length > 0 && (
              <Button variant="glass" size="lg" className="h-10 px-4" disabled={demo.busy} onClick={demo.seed}>
                <SparklesIcon /> {demo.progress ?? 'Load demo'}
              </Button>
            )}
            <Button variant="gradient" size="lg" className="h-10 px-5" nativeButton={false} render={<Link href="/campaigns/new" />}>
              <PlusIcon /> New campaign
            </Button>
          </div>
        }
      />

      <HeroStat
        label="Locked in escrow"
        value={usdc(escrow)}
        note={myr(escrow)}
        stats={[
          { label: 'Live campaigns', value: String(live.length) },
          { label: 'Paid for delivered work', value: usdc(sum(campaigns, 'totalReleased'), 0) },
          { label: 'Kolab fee (5%)', value: usdc(sum(campaigns, 'totalFees'), 0) },
          { label: 'Refunded to you', value: usdc(sum(campaigns, 'totalRefunded'), 0) },
        ]}
        action={
          review.length > 0 && (
            <Link href="/review" className="inline-flex items-center gap-2 rounded-full bg-white/18 px-3.5 py-1.5 text-sm font-medium backdrop-blur-md transition hover:bg-white/26">
              <InboxIcon className="size-4" /> {review.length} waiting for review
            </Link>
          )
        }
      />

      {isLoading ? null : campaigns.length === 0 ? (
        <Empty>
          <p>
            No campaigns yet. <Link className="text-primary underline-offset-4 hover:underline" href="/campaigns/new">Draft one from a product link</Link>
            {env.demoMode ? ', or load the Glow Lab demo.' : '.'}
          </p>
          {env.demoMode && (
            <Button variant="gradient" size="lg" className="h-10 px-5" disabled={demo.busy} onClick={demo.seed}>
              <SparklesIcon /> {demo.progress ?? 'Load Glow Lab demo campaigns'}
            </Button>
          )}
        </Empty>
      ) : (
        <section className="space-y-4">
          <SectionHeader title="All campaigns" count={campaigns.length} />
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
