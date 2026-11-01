'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, PaintbrushIcon, ScissorsIcon, ShieldAlertIcon, ShieldCheckIcon, ShieldIcon, WandSparklesIcon, type LucideIcon } from 'lucide-react';
import type { SlotDto } from '@kolab/shared';
import { CampaignCover, Chip, Empty, Panel, SectionHeader, SlotBadge, tone } from '@/components/dashboard';
import { SlotDeliver } from '@/components/creator/slot-deliver';
import { SlotTimeline, slotSteps } from '@/components/creator/slot-timeline';
import { useSlot } from '@/lib/creator';
import { slotTitle } from '@/lib/earnings';
import { errorMessage } from '@/lib/errors';
import { shortDate, usdc } from '@/lib/format';

const CHECKS: Record<SlotDto['checks'], { label: string; color: string; icon: LucideIcon; note: string }> = {
  pending: { label: 'Checks pending', color: tone.muted, icon: ShieldIcon, note: 'Checks run automatically once you submit.' },
  passed: { label: 'Checks passed', color: tone.money, icon: ShieldCheckIcon, note: 'Public, on time and properly disclosed.' },
  failed: { label: 'Something was flagged', color: tone.warning, icon: ShieldAlertIcon, note: 'The brand sees what was flagged and decides. You can still be approved.' },
};

function ToolLink({ href, icon: Icon, title, sub }: { href: string; icon: LucideIcon; title: string; sub: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-3xl border border-white/8 bg-card p-4 outline-none transition hover:border-white/16 focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className="bg-glow grid size-11 shrink-0 place-items-center rounded-2xl text-white">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
      <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** One deliverable: amount, step timeline, checks, and the tools to make and submit it. */
export default function SlotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { slot, enrollment, isLoading, isError, error } = useSlot(id);
  const [now] = useState(() => Date.now());

  if (!slot || !enrollment) {
    return (
      <div className="space-y-6">
        <Link href="/creator/work" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeftIcon className="size-4" /> My work
        </Link>
        {isLoading ? <Panel className="h-64 animate-pulse bg-white/3" aria-busy /> : <Empty icon={CircleAlertIcon}>{isError ? errorMessage(error) : 'Deliverable not found.'}</Empty>}
      </div>
    );
  }

  const camp = enrollment.campaign;
  const canSubmit = enrollment.status === 'active' && (slot.status === 'open' || slot.status === 'rejected');
  const reviewEnds = slot.submittedAt ? new Date(new Date(slot.submittedAt).getTime() + camp.reviewWindowSecs * 1000).toISOString() : null;
  const steps = slotSteps(slot, reviewEnds, camp.holdbackBps / 100, now);
  const check = CHECKS[slot.checks];
  const submitted = slot.status !== 'open' && slot.status !== 'missed';

  return (
    <div className="space-y-8">
      <Link href={`/creator/work/${enrollment.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> {camp.title}
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <CampaignCover camp={camp} className="size-16 shrink-0 rounded-2xl border border-white/8" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-muted-foreground">{camp.brandName ?? camp.title}</div>
          <h1 className="text-3xl font-bold tracking-tight">{slotTitle(slot)}</h1>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <Panel className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-3xl font-bold tracking-tight tabular-nums text-money">{usdc(slot.amount)}</div>
              <SlotBadge status={slot.status} />
            </div>
            <p className={slot.status === 'missed' || slot.status === 'holdback_forfeited' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
              {slot.status === 'missed'
                ? 'Not delivered in time, so the money went back to the brand.'
                : slot.status === 'holdback_released'
                  ? 'Paid in full. Nice work.'
                  : 'Paid straight to your wallet. Kolab’s fee is on the brand.'}
            </p>
          </Panel>

          <section className="space-y-3">
            <SectionHeader title="Progress" />
            <Panel className="px-5 py-2">
              <SlotTimeline steps={steps} />
            </Panel>
          </section>

          {submitted && (
            <section className="space-y-3">
              <SectionHeader title="Automated checks" />
              <Panel className="space-y-2">
                <Chip label={check.label} color={check.color} icon={check.icon} />
                <p className="text-sm text-muted-foreground">{check.note}</p>
                {slot.submittedAt && <p className="text-xs text-muted-foreground">Submitted {shortDate(slot.submittedAt)}</p>}
              </Panel>
            </section>
          )}
        </div>

        <div className="space-y-6">
          {canSubmit ? (
            <>
              <section className="space-y-3">
                <SectionHeader title="Make it" />
                <div className="grid gap-3">
                  {slot.kind === 'post' && <ToolLink href={`/creator/slots/${slot.id}/kit`} icon={WandSparklesIcon} title="Creator kit" sub="Write your caption, pre-check it, then post on TikTok" />}
                  {camp.hasBrandKit && <ToolLink href={`/creator/slots/${slot.id}/studio`} icon={PaintbrushIcon} title="Create content" sub="Story, square and review templates with the brand kit" />}
                  <ToolLink href={`/creator/slots/${slot.id}/editor`} icon={ScissorsIcon} title="Edit video" sub="Trim clips, AI hook, auto-captions, brand logo and music" />
                </div>
              </section>
              <section className="space-y-3">
                <SectionHeader title={slot.kind === 'ugc' ? 'Deliver' : 'Submit'} />
                <SlotDeliver slot={slot} />
              </section>
            </>
          ) : (
            <Panel className="text-sm text-muted-foreground">
              {enrollment.status !== 'active' && (slot.status === 'open' || slot.status === 'rejected')
                ? enrollment.status === 'awaiting_shipment' || enrollment.status === 'in_transit'
                  ? 'You can submit once your product arrives and you confirm it.'
                  : 'This campaign isn’t accepting submissions.'
                : slot.status === 'submitted'
                  ? 'Submitted. The brand is reviewing; if they don’t reply in time, you’re paid automatically.'
                  : 'Nothing to do here right now.'}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
