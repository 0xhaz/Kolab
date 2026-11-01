'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BriefcaseIcon, CalendarClockIcon, CompassIcon } from 'lucide-react';
import type { MyEnrollmentDto } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { Avatar, CampaignCover, Chip, Empty, PageHeader, Panel, SectionHeader, SlotStrip, TYPE_LABEL } from '@/components/dashboard';
import { EnrollmentChip, enrollmentAction, groupOf, nextDue, type WorkGroup } from '@/components/creator/work-status';
import { useMyEnrollments } from '@/lib/creator';
import { errorMessage } from '@/lib/errors';
import { relative, shortDate, usdc } from '@/lib/format';

const GROUPS: { key: WorkGroup; title: string; empty: string }[] = [
  { key: 'active', title: 'Active', empty: 'Nothing active right now.' },
  { key: 'waiting', title: 'Waiting for product', empty: 'No products on the way.' },
  { key: 'completed', title: 'Completed', empty: 'Finished campaigns show up here.' },
];

function WorkCard({ e, now }: { e: MyEnrollmentDto; now: number }) {
  const camp = e.campaign;
  const action = enrollmentAction(e);
  const due = nextDue(e);
  return (
    <Link
      href={`/creator/work/${e.id}`}
      className="group block overflow-hidden rounded-3xl border border-white/8 bg-card outline-none transition hover:border-white/16 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <CampaignCover camp={camp} className="h-32">
        <div className="absolute inset-x-4 top-3 flex flex-wrap gap-1.5">
          <Chip label={TYPE_LABEL[camp.type]} color="#FFFFFF" className="backdrop-blur-md" />
        </div>
        <div className="absolute inset-x-4 bottom-3 flex items-center gap-2">
          <Avatar name={camp.brandName ?? 'Brand'} size={24} />
          <span className="truncate text-sm font-medium text-white">{camp.brandName ?? 'Brand'}</span>
        </div>
      </CampaignCover>
      <div className="space-y-3.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 font-semibold leading-snug">{camp.title}</h3>
          <EnrollmentChip status={e.status} className="shrink-0" />
        </div>
        {e.slots.length > 0 ? <SlotStrip statuses={e.slots.map((s) => s.status)} /> : <p className="text-xs text-muted-foreground">Paid per confirmed sale</p>}
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Earned</div>
            <div className="text-lg font-semibold tabular-nums text-money">{usdc(e.earnedTotal)}</div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {due ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClockIcon className="size-3.5" aria-hidden />
                Next due {shortDate(due)} · {relative(due, now)}
              </span>
            ) : e.status === 'completed' ? (
              'All done'
            ) : (
              'No deadline yet'
            )}
          </div>
        </div>
        {action && <Chip label={action.label} color={action.color} icon={action.icon} />}
      </div>
    </Link>
  );
}

/** Every campaign the creator joined, grouped by where it stands. */
export default function MyWorkPage() {
  const q = useMyEnrollments();
  const [now] = useState(() => Date.now());
  const list = q.data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Creator"
        title="My work"
        description="Every campaign you joined: what’s due, what’s on the way, and what you’ve earned."
        action={
          <Button variant="glass" className="h-9 px-4" nativeButton={false} render={<Link href="/creator/discover" />}>
            <CompassIcon /> Find campaigns
          </Button>
        }
      />

      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Panel key={i} className="h-72 animate-pulse bg-white/3" />
          ))}
        </div>
      ) : q.isError ? (
        <Empty>{errorMessage(q.error)}</Empty>
      ) : list.length === 0 ? (
        <Empty icon={BriefcaseIcon}>
          <span>You haven’t joined a campaign yet.</span>
          <Button variant="gradient" className="h-9 px-4" nativeButton={false} render={<Link href="/creator/discover" />}>
            Discover campaigns
          </Button>
        </Empty>
      ) : (
        GROUPS.map((g) => {
          const items = list.filter((e) => groupOf(e) === g.key);
          if (items.length === 0 && g.key !== 'active') return null;
          return (
            <section key={g.key} className="space-y-3">
              <SectionHeader title={g.title} count={items.length} />
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{g.empty}</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((e) => (
                    <WorkCard key={e.id} e={e} now={now} />
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
