'use client';

import type { ReactNode } from 'react';
import { LinkIcon, SparkleIcon, type LucideIcon } from 'lucide-react';
import { Panel, SectionHeader, tone } from '@/components/dashboard';
import { useBrandReputation } from '@/lib/creator';
import { usdc } from '@/lib/format';

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

/** Icon bubble + title + body: the building block of the "how you get paid" lists. */
export function Rule({ icon: Icon, color, title, children }: { icon: LucideIcon; color: string; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${color}22`, color }}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/** Brand track record from on-chain outcomes of its campaigns. */
export function AboutBrand({ campaignId }: { campaignId: string }) {
  const { data: rep, isLoading } = useBrandReputation(campaignId);
  const isNew = !!rep && rep.campaigns <= 1 && rep.creatorsPaid === 0;
  const stats = rep
    ? [
        ['Creators paid', String(rep.creatorsPaid)],
        ['Paid out', usdc(rep.paidOut, 0)],
        ['Decides on time', pct(rep.decidedInTimeRate)],
        ['Avg decision', rep.avgDecisionHours === null ? '—' : `${Math.round(rep.avgDecisionHours)}h`],
        ['Rejection rate', pct(rep.rejectionRate)],
        ['Campaigns', String(rep.campaigns)],
      ]
    : [];
  return (
    <section className="space-y-3">
      <SectionHeader title="About the brand" />
      <Panel className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading track record…</p>
        ) : !rep ? (
          <p className="text-sm text-muted-foreground">Track record unavailable right now.</p>
        ) : isNew ? (
          <Rule icon={SparkleIcon} color={tone.primary} title="New on Kolab">
            No paid campaigns yet. Your pay is still locked in escrow before you start.
          </Rule>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-popover px-3.5 py-2.5">
                <dd className={label === 'Paid out' ? 'font-semibold tabular-nums text-money' : 'font-semibold tabular-nums'}>{value}</dd>
                <dt className="text-xs text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LinkIcon className="size-3" /> From on-chain payouts
        </p>
      </Panel>
    </section>
  );
}
