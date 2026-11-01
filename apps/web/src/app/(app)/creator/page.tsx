'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon, CheckCircle2Icon, ChevronRightIcon, HourglassIcon, MapPinIcon, TruckIcon, UserRoundPenIcon, WalletIcon } from 'lucide-react';
import { CampaignCover, HeroStat, PageHeader, Panel, SectionHeader, SlotBadge, tone } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { CampaignRailCard } from '@/components/creator/campaign-card';
import { Completeness } from '@/components/creator/creator-profile';
import { firstName } from '@/components/creator/discover-data';
import { useCreatorCampaigns, useMyEnrollments, useMyProfile } from '@/lib/creator';
import { slotTitle, slotsNeedingWork, summarize } from '@/lib/earnings';
import { myr, relative, usdc } from '@/lib/format';
import { useMe } from '@/lib/use-me';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** A row that links somewhere: icon bubble, title, subtitle, chevron. */
function ActionRow({ href, icon: Icon, color, title, sub }: { href: string; icon: typeof MapPinIcon; color: string; title: string; sub: string }) {
  return (
    <Link href={href} className="group block rounded-3xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Panel className="flex items-center gap-3.5 p-4 transition group-hover:border-white/16">
        <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${color}26`, color }}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{title}</div>
          <div className="truncate text-sm text-muted-foreground">{sub}</div>
        </div>
        <ChevronRightIcon className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
      </Panel>
    </Link>
  );
}

export default function CreatorHome() {
  const { data: me } = useMe();
  const q = useMyEnrollments();
  const campaigns = useCreatorCampaigns();
  const profile = useMyProfile();
  const enrollments = q.data ?? [];
  const totals = summarize(enrollments);
  const todo = slotsNeedingWork(enrollments);
  const joined = new Set(enrollments.map((e) => e.campaignId));
  const open = (campaigns.data ?? []).filter((cp) => cp.status === 'active' && !joined.has(cp.id));
  const name = firstName(me?.displayName, me?.email);
  const [now] = useState(() => Date.now());

  const actions = enrollments.filter(
    (e) => (e.campaign.requiresShipping && e.status === 'awaiting_shipment' && !e.hasAddress) || e.status === 'in_transit',
  );
  const inReview = enrollments.flatMap((e) => e.slots.filter((s) => s.status === 'submitted').map((slot) => ({ slot, e })));

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={`${greeting()},`} title={name} description="Your campaigns, deliverables and earnings, same as in the Kolab app." />

      <HeroStat
        label="Earned on Kolab"
        value={usdc(totals.paid)}
        note={myr(totals.paid)}
        stats={[
          { label: 'Paid to you', value: usdc(totals.paid, 0) },
          { label: 'Held back', value: usdc(totals.holdbackPending, 0) },
          { label: 'To claim', value: usdc(totals.salesToClaim, 0) },
          { label: 'Still to earn', value: usdc(totals.upcoming, 0) },
        ]}
        action={
          <Link href="/creator/earnings" className="inline-flex items-center gap-2 rounded-full bg-white/18 px-3.5 py-1.5 text-sm font-medium backdrop-blur-md transition hover:bg-white/26">
            <WalletIcon className="size-4" /> Earnings
          </Link>
        }
      />

      {profile.data && !profile.data.complete && (
        <Panel className="flex flex-wrap items-center gap-4 border-primary/30 bg-primary/6">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <UserRoundPenIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="font-semibold">Finish your creator profile</div>
            <p className="text-sm text-muted-foreground">Selective campaigns pick from profiles. Brands need a niche, a channel and one sample.</p>
            <div className="max-w-sm">
              <Completeness profile={profile.data} />
            </div>
          </div>
          <Button variant="gradient" className="h-10 px-5" nativeButton={false} render={<Link href="/creator/profile" />}>
            Complete profile <ArrowRightIcon />
          </Button>
        </Panel>
      )}

      <div className="grid gap-8 xl:grid-cols-2">
        <div className="space-y-8">
          {actions.length > 0 && (
            <section className="space-y-3">
              <SectionHeader title="Needs you" count={actions.length} />
              {actions.map((e) =>
                e.status === 'in_transit' ? (
                  <ActionRow key={e.id} href={`/creator/work/${e.id}`} icon={TruckIcon} color={tone.sky} title="Your product is on the way" sub="Mark it received when it arrives" />
                ) : (
                  <ActionRow key={e.id} href={`/creator/work/${e.id}`} icon={MapPinIcon} color={tone.warning} title="Add your shipping address" sub={e.campaign.brandName ?? e.campaign.title} />
                ),
              )}
            </section>
          )}

          <section className="space-y-3">
            <SectionHeader title="Up next" count={todo.length || undefined} />
            {q.isLoading ? (
              <div className="h-24 animate-pulse rounded-3xl bg-white/5" aria-label="Loading deliverables" />
            ) : todo.length === 0 ? (
              <Panel className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <CheckCircle2Icon className="size-7 text-money" />
                {enrollments.length ? 'You’re all caught up.' : (
                  <span>
                    Join a campaign to start earning.{' '}
                    <Link href="/creator/discover" className="text-primary underline-offset-4 hover:underline">
                      Discover campaigns
                    </Link>
                  </span>
                )}
              </Panel>
            ) : (
              todo.slice(0, 5).map(({ slot, enrollment }) => (
                <Link key={slot.id} href={`/creator/slots/${slot.id}`} className="group block rounded-3xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <Panel className="flex items-center gap-3.5 p-4 transition group-hover:border-white/16">
                    <CampaignCover camp={enrollment.campaign} className="size-14 shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-semibold">{slotTitle(slot)}</div>
                      <div className="truncate text-sm text-muted-foreground">{enrollment.campaign.brandName ?? enrollment.campaign.title}</div>
                      <SlotBadge status={slot.status} />
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold tabular-nums text-money">{usdc(slot.amount, 0)}</div>
                      <div className="text-xs text-muted-foreground" suppressHydrationWarning>
                        {slot.dueAt ? `due ${relative(slot.dueAt, now)}` : 'starts on receipt'}
                      </div>
                    </div>
                  </Panel>
                </Link>
              ))
            )}
          </section>
        </div>

        <section className="space-y-3">
          <SectionHeader title="With the brand" count={inReview.length || undefined} />
          {inReview.length === 0 ? (
            <Panel className="py-8 text-center text-sm text-muted-foreground">Nothing waiting on a brand. Submitted work shows up here until it’s decided.</Panel>
          ) : (
            inReview.map(({ slot, e }) => (
              <ActionRow
                key={slot.id}
                href={`/creator/slots/${slot.id}`}
                icon={HourglassIcon}
                color={tone.info}
                title={`${slotTitle(slot)} · ${e.campaign.brandName ?? 'Brand'}`}
                sub={`${slot.checks === 'passed' ? 'Checks passed · ' : slot.checks === 'failed' ? 'Checks flagged · ' : ''}auto-paid if no reply`}
              />
            ))
          )}
        </section>
      </div>

      {open.length > 0 && (
        <section className="space-y-4">
          <SectionHeader
            title="Brands looking for you"
            count={open.length}
            action={
              <Link href="/creator/discover" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
                See all <ArrowRightIcon className="size-3.5" />
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {open.slice(0, 6).map((cp) => (
              <CampaignRailCard key={cp.id} camp={cp} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
