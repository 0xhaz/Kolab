'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CompassIcon, GiftIcon, UserCheckIcon, VideoIcon, ZapIcon, type LucideIcon } from 'lucide-react';
import type { CampaignDto } from '@kolab/shared';
import { CampaignCover, Empty, PageHeader, Panel, SectionHeader, SlotStrip } from '@/components/dashboard';
import { CampaignFeedCard } from '@/components/creator/campaign-card';
import { useCreatorCampaigns, useMyEnrollments } from '@/lib/creator';
import { usdc } from '@/lib/format';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'open' | 'selective' | 'product' | 'ugc';

const FILTERS: { value: Filter; label: string; icon?: LucideIcon; test: (c: CampaignDto) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'open', label: 'Open', icon: ZapIcon, test: (c) => !c.selective },
  { value: 'selective', label: 'Selective', icon: UserCheckIcon, test: (c) => c.selective },
  { value: 'product', label: 'Free product', icon: GiftIcon, test: (c) => c.requiresShipping },
  { value: 'ugc', label: 'UGC', icon: VideoIcon, test: (c) => c.type === 'ugc' },
];

/** Live campaigns this creator hasn't joined yet, plus the ones they have. */
export default function DiscoverPage() {
  const campaigns = useCreatorCampaigns();
  const mine = useMyEnrollments();
  const [filter, setFilter] = useState<Filter>('all');
  const joined = mine.data ?? [];
  const joinedIds = new Set(joined.map((e) => e.campaignId));
  const open = (campaigns.data ?? []).filter((cp) => cp.status === 'active' && !joinedIds.has(cp.id));
  const shown = open.filter(FILTERS.find((f) => f.value === filter)!.test);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Discover"
        title="Brands looking for you"
        description="Every payout is locked in on-chain escrow before you start. Open campaigns you can join right away; selective ones you apply to."
      />

      <div role="radiogroup" aria-label="Filter campaigns" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = open.filter(f.test).length;
          const on = filter === f.value;
          return (
            <button
              key={f.value}
              role="radio"
              aria-checked={on}
              onClick={() => setFilter(f.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                on ? 'border-transparent bg-brand-gradient text-white' : 'border-white/10 bg-white/3 text-muted-foreground hover:bg-white/6 hover:text-foreground',
              )}
            >
              {f.icon && <f.icon className="size-3.5" />}
              {f.label}
              <span className={cn('tabular-nums text-xs', on ? 'text-white/80' : 'text-muted-foreground')}>{count}</span>
            </button>
          );
        })}
      </div>

      {campaigns.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Loading campaigns">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-80 animate-pulse rounded-3xl bg-white/5" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Empty icon={CompassIcon}>
          {open.length === 0 ? 'No open campaigns right now. Brands can also send you a join link.' : 'Nothing matches this filter. Try another one.'}
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((cp) => (
            <CampaignFeedCard key={cp.id} camp={cp} />
          ))}
        </div>
      )}

      {joined.length > 0 && (
        <section className="space-y-4">
          <SectionHeader title="Joined" count={joined.length} />
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {joined.map((e) => (
              <Link key={e.id} href={`/creator/work/${e.id}`} className="group block rounded-3xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Panel className="space-y-3 p-4 transition group-hover:border-white/16">
                  <div className="flex items-center gap-3">
                    <CampaignCover camp={e.campaign} className="size-14 shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted-foreground">{e.campaign.brandName ?? 'Brand'}</div>
                      <div className="truncate font-semibold">{e.campaign.title}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums text-money">{usdc(e.earnedTotal, 0)}</div>
                      <div className="text-[11px] text-muted-foreground">earned</div>
                    </div>
                  </div>
                  {e.slots.length > 0 ? (
                    <SlotStrip statuses={e.slots.map((s) => s.status)} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Voucher {e.voucherCode ?? '—'} · {usdc(e.salesAccrued)} to claim
                    </p>
                  )}
                </Panel>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
