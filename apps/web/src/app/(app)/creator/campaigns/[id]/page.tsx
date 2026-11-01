'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  CircleXIcon,
  HourglassIcon,
  PackageIcon,
  PercentIcon,
  PlusIcon,
  ShieldCheckIcon,
  TagIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ApplicationStatus, CampaignDetailDto } from '@kolab/shared';
import { Avatar, CampaignCover, Panel, SectionHeader, tone } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { ApplyDialog } from '@/components/creator/apply-dialog';
import { BrandKitGallery, BrandKitLocked } from '@/components/creator/brand-kit';
import { AboutBrand, Rule } from '@/components/creator/brand-reputation';
import { CoverChips } from '@/components/creator/campaign-card';
import { payout } from '@/components/creator/discover-data';
import { useCreatorCampaign, useMyApplication, useMyEnrollments } from '@/lib/creator';
import { errorMessage } from '@/lib/errors';
import { myr, shortDate, usdc } from '@/lib/format';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';

const hours = (secs: number) => (secs < 3600 ? `${Math.round(secs / 60)} min` : `${Math.round(secs / 3600)}h`);

const APPLICATION: Record<ApplicationStatus, { icon: LucideIcon; color: string; title: string; body: string }> = {
  pending: { icon: HourglassIcon, color: tone.info, title: 'Application sent · brand is reviewing', body: 'You’ll get a notification as soon as they decide.' },
  declined: { icon: CircleXIcon, color: tone.muted, title: 'Not selected this time', body: 'Brands often pick for one niche. Polish your profile and you can apply again.' },
  accepted: { icon: BadgeCheckIcon, color: tone.money, title: 'You’re in!', body: 'The brand approved you on-chain. Join to lock your pay in escrow.' },
};

/** Payout + the one action that fits the creator's state: join, apply, wait, or open their work. */
function JoinPanel({ camp }: { camp: CampaignDetailDto }) {
  const router = useRouter();
  const qc = useQueryClient();
  const send = useSponsoredTx();
  const enrollments = useMyEnrollments();
  const [busy, setBusy] = useState(false);
  const mine = camp.enrollments[0] ?? enrollments.data?.find((e) => e.campaignId === camp.id);
  const application = useMyApplication(camp.selective && !mine ? camp.id : '');
  const status = application.data?.status;
  const p = payout(camp);
  const live = camp.status === 'active';

  async function join() {
    setBusy(true);
    try {
      const tx = await send(`/campaigns/${camp.id}/tx/enroll`, {});
      await qc.invalidateQueries({ queryKey: ['creator'] });
      toast.success('You’re in! Your pay is locked in escrow.', {
        action: { label: 'Explorer', onClick: () => window.open(tx.explorerUrl, '_blank') },
      });
      const fresh = await enrollments.refetch();
      const enrollment = fresh.data?.find((e) => e.campaignId === camp.id);
      if (enrollment) router.push(`/creator/work/${enrollment.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const app = !mine && status ? APPLICATION[status] : null;

  return (
    <Panel className="space-y-5 lg:sticky lg:top-20">
      <div>
        <div className="text-xs text-muted-foreground">You earn</div>
        <div className="text-3xl font-bold tracking-tight tabular-nums text-money">{p.amount}</div>
        <div className="text-sm text-muted-foreground">
          {p.detail} · {myr(p.total)}
        </div>
      </div>

      {app && (
        <div className="rounded-2xl border p-3.5" style={{ borderColor: `${app.color}55`, backgroundColor: `${app.color}12` }} role="status">
          <Rule icon={app.icon} color={app.color} title={app.title}>
            {app.body}
          </Rule>
        </div>
      )}

      {mine ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-money">
            <CheckCircle2Icon className="size-4" /> You joined on {shortDate(mine.createdAt)}
          </div>
          <Button variant="gradient" size="lg" className="h-11 w-full" nativeButton={false} render={<Link href={`/creator/work/${mine.id}`} />}>
            Open your work <ArrowRightIcon />
          </Button>
        </div>
      ) : !camp.selective || status === 'accepted' ? (
        <Button variant="gradient" size="lg" className="h-11 w-full" disabled={busy || !live} onClick={join}>
          <PlusIcon /> {busy ? 'Confirm in your wallet…' : 'Join & lock your payout'}
        </Button>
      ) : status === 'pending' ? (
        <Button variant="glass" size="lg" className="h-11 w-full" disabled>
          <HourglassIcon /> In review
        </Button>
      ) : application.isLoading ? (
        <Button variant="glass" size="lg" className="h-11 w-full" disabled>
          Checking your application…
        </Button>
      ) : (
        <ApplyDialog camp={camp} again={status === 'declined'} disabled={!live} />
      )}

      {!live && !mine && <p className="text-xs text-muted-foreground">This campaign isn’t taking creators right now.</p>}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-money" />
        {camp.selective && !mine && status !== 'accepted'
          ? 'Selective campaign: the brand approves applicants on-chain before they can join.'
          : 'Joining locks your full payout in on-chain escrow. Kolab pays the network fee.'}
      </p>
    </Panel>
  );
}

export default function CreatorCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useCreatorCampaign(id);
  const enrollments = useMyEnrollments();
  const camp = q.data;

  if (!camp) {
    return (
      <div className="space-y-4">
        <Link href="/creator/discover" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeftIcon className="size-4" /> Discover
        </Link>
        {q.isLoading || q.isPending ? (
          <div className="h-72 animate-pulse rounded-[2rem] bg-white/5" aria-label="Loading campaign" />
        ) : (
          <p className="text-sm text-muted-foreground">{q.isError ? errorMessage(q.error) : 'Campaign not found.'}</p>
        )}
      </div>
    );
  }

  const joined = !!camp.enrollments[0] || !!enrollments.data?.some((e) => e.campaignId === camp.id);
  const holdbackPct = camp.holdbackBps / 100;
  const brand = camp.brandName ?? 'Brand';

  return (
    <div className="space-y-8">
      <Link href="/creator/discover" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> Discover
      </Link>

      <CampaignCover camp={camp} className="-mt-4 min-h-72 rounded-[2rem] border border-white/8 md:min-h-80">
        <div className="absolute inset-x-5 top-5 flex flex-wrap items-center gap-1.5">
          <CoverChips camp={camp} long />
        </div>
        <div className="absolute inset-x-5 bottom-5 max-w-3xl space-y-2 md:inset-x-7 md:bottom-7">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Avatar name={brand} size={30} />
            {brand}
            <BadgeCheckIcon aria-hidden className="size-4 text-sky-300" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{camp.title}</h1>
        </div>
      </CampaignCover>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 space-y-8 lg:order-1">
          {joined ? <BrandKitGallery camp={camp} /> : <BrandKitLocked camp={camp} />}

          {camp.briefMd && (
            <section className="space-y-3">
              <SectionHeader title="The brief" />
              <Panel>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{camp.briefMd}</p>
              </Panel>
            </section>
          )}

          {camp.slots.length > 0 && (
            <section className="space-y-3">
              <SectionHeader title="Deliverables" count={camp.slots.length} />
              <Panel className="py-2">
                <ol>
                  {camp.slots.map((sl, i) => (
                    <li key={i} className="flex items-stretch gap-3">
                      <div className="flex w-4 flex-col items-center pt-4">
                        <span aria-hidden className="size-3 shrink-0 rounded-full border-2 border-primary bg-background" />
                        {i < camp.slots.length - 1 && <span aria-hidden className="mt-1 w-0.5 flex-1 bg-white/10" />}
                      </div>
                      <div className="flex-1 py-2.5">
                        <div className="text-sm font-semibold">
                          {sl.kind === 'ugc' ? 'UGC video' : 'Post'} #{i + 1}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Day {Math.round(sl.dueOffsetSecs / 86400)}
                          {camp.requiresShipping ? ' after the product arrives' : ' after you join'}
                        </div>
                      </div>
                      <div className="pt-2.5 text-right">
                        <div className="font-semibold tabular-nums text-money">{usdc(sl.amount, 0)}</div>
                        {holdbackPct > 0 && (
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {usdc((BigInt(sl.amount) * BigInt(10_000 - camp.holdbackBps)) / 10_000n, 0)} on approval
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </Panel>
            </section>
          )}

          <section className="space-y-3">
            <SectionHeader title="How you get paid" />
            <Panel className="grid gap-5 md:grid-cols-2">
              <Rule icon={ShieldCheckIcon} color={tone.money} title="Locked before you start">
                The brand’s budget sits in on-chain escrow, so the money already exists.
              </Rule>
              {camp.type !== 'per_sale' ? (
                <>
                  <Rule icon={CheckCircle2Icon} color={tone.primary} title={`${100 - holdbackPct}% on approval${holdbackPct ? `, ${holdbackPct}% after 7 days live` : ''}`}>
                    Keep your post up and the rest follows automatically.
                  </Rule>
                  <Rule icon={ZapIcon} color={tone.warning} title={`Auto-paid after ${hours(camp.reviewWindowSecs)}`}>
                    If the brand doesn’t reply within the review window, you’re paid anyway.
                  </Rule>
                </>
              ) : (
                <Rule icon={TagIcon} color={tone.primary} title={`${usdc(camp.perSaleAmount)} per sale`}>
                  Share your voucher. Each confirmed order adds to what you can claim, any time.
                </Rule>
              )}
              <Rule icon={PercentIcon} color={tone.accent} title="You keep 100%">
                Kolab’s fee is paid by the brand, never taken from you.
              </Rule>
              {camp.requiresShipping && (
                <Rule icon={PackageIcon} color={tone.sky} title="Product shipped to you">
                  Your deadlines only start when you mark it received.
                </Rule>
              )}
            </Panel>
            <p className="text-xs text-muted-foreground">
              Runs {shortDate(camp.startAt)} to {shortDate(camp.endAt)} · up to {camp.maxCreators} creators
            </p>
          </section>

          <AboutBrand campaignId={camp.id} />
        </div>

        <div className="order-1 lg:order-2">
          <JoinPanel camp={camp} />
        </div>
      </div>
    </div>
  );
}
