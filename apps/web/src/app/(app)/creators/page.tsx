'use client';

import { UsersIcon } from 'lucide-react';
import { Avatar, Chip, Empty, PageHeader, Panel, SectionHeader, tone } from '@/components/dashboard';
import { useCreators } from '@/lib/queries';
import { shortAddr, usdc } from '@/lib/format';

function reliability(rate: number | null) {
  if (rate === null) return { label: 'New creator', color: tone.info };
  if (rate >= 0.9) return { label: 'Reliable', color: tone.money };
  if (rate >= 0.7) return { label: 'Mostly on time', color: tone.warning };
  return { label: 'Often late', color: tone.danger };
}

export default function CreatorsPage() {
  const { data: rows = [], isLoading } = useCreators();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="People you’ve worked with"
        title="Creators"
        description="Reliability comes from on-chain outcomes across all of Kolab (released, missed, removed early), so ratings can’t override it."
      />
      {isLoading ? null : rows.length === 0 ? (
        <Empty icon={UsersIcon}>No creators yet. They appear here once they join one of your campaigns.</Empty>
      ) : (
        <section className="space-y-4">
          <SectionHeader title="All creators" count={rows.length} />
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {rows.map((r) => {
              const who = r.creator.displayName ?? r.creator.email ?? 'Creator';
              const rel = reliability(r.onTimeRate);
              return (
                <Panel key={r.creator.id} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={who} size={52} ring />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{who}</div>
                      <div className="font-mono text-xs text-muted-foreground">{shortAddr(r.creator.walletPubkey)}</div>
                    </div>
                    <Chip label={rel.label} color={rel.color} />
                  </div>
                  <div className="flex items-end justify-between rounded-2xl bg-popover px-4 py-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Earned with you</div>
                      <div className="text-xl font-bold tabular-nums text-money">{usdc(r.earnedWithBrand, 0)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">On time</div>
                      <div className="text-xl font-bold tabular-nums">{r.onTimeRate === null ? '—' : `${Math.round(r.onTimeRate * 100)}%`}</div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ['Delivered', r.delivered],
                      ['Missed', r.missed],
                      ['Removed early', r.deleted],
                    ].map(([label, n]) => (
                      <div key={label} className="rounded-xl border border-white/6 px-2 py-2">
                        <dd className="text-base font-semibold tabular-nums">{n}</dd>
                        <dt className="text-[11px] text-muted-foreground">{label}</dt>
                      </div>
                    ))}
                  </dl>
                </Panel>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
