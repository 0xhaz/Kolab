'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, CopyIcon, HandCoinsIcon, InfoIcon, LockIcon, PackageIcon, TicketIcon } from 'lucide-react';
import type { MyEnrollmentDto } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { Avatar, CampaignCover, Chip, Empty, Panel, SectionHeader, SlotBadge, SlotStrip, TYPE_LABEL, tone } from '@/components/dashboard';
import { WorkBrandKit } from '@/components/creator/work-brand-kit';
import { WorkShippingForm } from '@/components/creator/work-shipping-form';
import { EnrollmentChip } from '@/components/creator/work-status';
import { creatorKeys, useEnrollment } from '@/lib/creator';
import { slotTitle } from '@/lib/earnings';
import { errorMessage } from '@/lib/errors';
import { explorerTx, relative, shortDate, usdc } from '@/lib/format';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { cn } from '@/lib/utils';

/** Joined → Shipped → Received, as on mobile. */
function ShipSteps({ status }: { status: MyEnrollmentDto['status'] }) {
  const at = status === 'awaiting_shipment' ? 0 : status === 'in_transit' || status === 'not_received' ? 1 : 2;
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Shipping progress">
      {['Joined', 'Shipped', 'Received'].map((label, i) => (
        <li key={label} className="space-y-1.5">
          <span
            className="block h-1.5 rounded-full"
            style={{ backgroundColor: i > at ? 'rgb(255 255 255 / 0.1)' : i === at && at < 2 ? tone.primary : tone.money }}
          />
          <span className={cn('flex items-center gap-1 text-xs', i <= at ? 'text-foreground' : 'text-muted-foreground')}>
            {i < at || at === 2 ? <CheckIcon className="size-3" aria-hidden /> : null}
            {label}
            {i === at && at < 2 && <span className="sr-only">(current)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function useAct(enrollmentId: string) {
  const send = useSponsoredTx();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(key: string, path: string, done: string) {
    setBusy(key);
    try {
      const { signature } = await send(path, {});
      await qc.invalidateQueries({ queryKey: creatorKeys.enrollments });
      toast.success(done, { action: { label: 'View tx', onClick: () => window.open(explorerTx(signature), '_blank', 'noopener') } });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  return { busy, act: (key: string, action: string, done: string) => act(key, `/enrollments/${enrollmentId}/tx/${action}`, done) };
}

/** One joined campaign: shipping, voucher, deliverables and the brand kit. */
export default function EnrollmentDetailPage({ params }: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = use(params);
  const q = useEnrollment(enrollmentId);
  const e = q.enrollment;
  const { busy, act } = useAct(enrollmentId);
  const [now] = useState(() => Date.now());

  const back = (
    <Link href="/creator/work" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
      <ChevronLeftIcon className="size-4" /> My work
    </Link>
  );

  if (!e) {
    return (
      <div className="space-y-6">
        {back}
        {q.isLoading ? <Panel className="h-64 animate-pulse bg-white/3" aria-busy /> : <Empty icon={CircleAlertIcon}>{q.isError ? errorMessage(q.error) : 'Campaign not found in your work.'}</Empty>}
      </div>
    );
  }

  const camp = e.campaign;
  const firstOpen = e.slots.find((s) => s.status === 'open' || s.status === 'rejected');
  const studioHref = `/creator/slots/${firstOpen?.id ?? e.id}/studio`;

  async function copyVoucher() {
    try {
      await navigator.clipboard.writeText(e!.voucherCode ?? '');
      toast.success('Voucher code copied');
    } catch {
      toast.error('Couldn’t reach the clipboard.');
    }
  }

  return (
    <div className="space-y-8">
      {back}

      <CampaignCover camp={camp} className="-mt-4 min-h-56 rounded-[2rem] border border-white/8">
        <div className="absolute inset-x-5 top-5 flex flex-wrap items-center gap-1.5">
          <Chip label={TYPE_LABEL[camp.type]} color="#FFFFFF" className="backdrop-blur-md" />
          {camp.requiresShipping && <Chip label="Free product" color="#FFFFFF" className="backdrop-blur-md" />}
          <EnrollmentChip status={e.status} className="bg-black/40 backdrop-blur-md" />
        </div>
        <div className="absolute inset-x-5 bottom-5 flex flex-wrap items-end justify-between gap-4 md:inset-x-7 md:bottom-6">
          <div className="min-w-0 max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-medium text-white/85">
              <Avatar name={camp.brandName ?? 'Brand'} size={24} />
              {camp.brandName ?? 'Brand'}
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white md:text-4xl">{camp.title}</h1>
            <Link href={`/creator/campaigns/${camp.id}`} className="mt-1 inline-flex items-center gap-0.5 text-sm text-white/80 hover:text-white">
              Brief & terms <ChevronRightIcon className="size-3.5" />
            </Link>
          </div>
          <div className="rounded-2xl bg-black/35 px-4 py-2.5 text-right backdrop-blur-md">
            <div className="text-xs text-white/75">Earned here</div>
            <div className="text-2xl font-bold tabular-nums text-money">{usdc(e.earnedTotal)}</div>
          </div>
        </div>
      </CampaignCover>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          {e.slots.length > 0 && (
            <section className="space-y-3">
              <SectionHeader title="Deliverables" count={e.slots.length} />
              <Panel className="space-y-1 p-3">
                <div className="px-2 pt-1 pb-2">
                  <SlotStrip statuses={e.slots.map((s) => s.status)} />
                </div>
                <ul>
                  {e.slots.map((s) => (
                    <li key={s.id}>
                      <Link href={`/creator/slots/${s.id}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 outline-none transition hover:bg-white/4 focus-visible:ring-3 focus-visible:ring-ring/50">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="font-semibold">{slotTitle(s)}</div>
                          <SlotBadge status={s.status} />
                        </div>
                        <div className="text-right">
                          <div className="font-semibold tabular-nums text-money">{usdc(s.amount, 0)}</div>
                          <div className="text-xs text-muted-foreground">{s.dueAt ? `due ${relative(s.dueAt, now)}` : 'after delivery'}</div>
                        </div>
                        <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            </section>
          )}

          <WorkBrandKit camp={camp} studioHref={studioHref} />
        </div>

        <div className="space-y-8">
          {camp.requiresShipping && (
            <section className="space-y-3">
              <SectionHeader title="Your product" />
              <Panel className="space-y-4">
                <ShipSteps status={e.status} />
                {e.trackingRef && (
                  <div className="flex items-start justify-between gap-3 rounded-2xl bg-white/4 px-3.5 py-2.5 text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <PackageIcon className="size-4" aria-hidden /> Shipped {e.shippedAt ? shortDate(e.shippedAt) : ''}
                    </span>
                    <span className="select-all text-right font-mono text-xs">{e.trackingRef}</span>
                  </div>
                )}
                {e.status === 'in_transit' && (
                  <>
                    <p className="text-sm">Got it? Your deadlines start the day you confirm.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="gradient"
                        className="h-10 px-5"
                        disabled={!!busy}
                        onClick={() => act('received', 'confirm-received', 'Confirmed. Your deadlines start today.')}
                      >
                        <CheckIcon /> {busy === 'received' ? 'Confirming…' : 'I received it'}
                      </Button>
                      <Button
                        variant="destructive"
                        className="h-10 rounded-full px-4"
                        disabled={!!busy}
                        onClick={() => act('nr', 'report-not-received', 'Reported. The brand can reship or cancel; your record isn’t affected.')}
                      >
                        {busy === 'nr' ? 'Reporting…' : 'Report not received'}
                      </Button>
                    </div>
                  </>
                )}
                {e.status === 'not_received' && <p className="text-sm text-muted-foreground">You reported it missing. The brand can reship or cancel; your record isn’t affected.</p>}
                {e.status === 'active' && e.receivedAt && <p className="text-sm text-muted-foreground">Received {shortDate(e.receivedAt)}. Deadlines count from that day.</p>}
                {e.status === 'awaiting_shipment' && e.hasAddress && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <LockIcon className="size-3.5 text-money" aria-hidden /> Address saved. The brand will ship soon.
                  </p>
                )}
              </Panel>
              {e.status === 'awaiting_shipment' && !e.hasAddress && <WorkShippingForm enrollmentId={e.id} />}
            </section>
          )}

          {camp.type === 'per_sale' && (
            <section className="space-y-3">
              <SectionHeader title="Your voucher" />
              <button
                type="button"
                onClick={copyVoucher}
                className="bg-glow relative block w-full overflow-hidden rounded-3xl p-5 text-left text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={`Copy voucher code ${e.voucherCode ?? ''}`}
              >
                <span className="flex items-center gap-1.5 text-sm text-white/85">
                  <TicketIcon className="size-4" aria-hidden /> Share this code · click to copy
                </span>
                <span className="mt-1 flex items-center gap-3 font-mono text-3xl font-bold tracking-widest">
                  {e.voucherCode ?? '—'} <CopyIcon className="size-5 opacity-80" aria-hidden />
                </span>
                <span aria-hidden className="absolute top-1/2 -left-3 size-6 rounded-full bg-background" />
                <span aria-hidden className="absolute top-1/2 -right-3 size-6 rounded-full bg-background" />
                <span className="mt-2 block text-sm text-white/85">Each confirmed order earns you {usdc(camp.perSaleAmount)}</span>
              </button>
              <Panel className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xl font-semibold tabular-nums text-money">{usdc(e.salesAccrued)}</div>
                  <div className="text-xs text-muted-foreground">ready to claim</div>
                </div>
                <Button
                  variant="gradient"
                  className="h-10 px-5"
                  disabled={!!busy || BigInt(e.salesAccrued) === 0n}
                  onClick={() => act('claim', 'claim-sales', 'Sales payout sent to your wallet')}
                >
                  <HandCoinsIcon /> {busy === 'claim' ? 'Claiming…' : 'Claim'}
                </Button>
              </Panel>
            </section>
          )}

          <Panel className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Only the brand can cancel an enrollment; any unpaid money goes back to them and your record isn’t affected. Joined {shortDate(e.createdAt)}.
            </span>
          </Panel>
        </div>
      </div>
    </div>
  );
}
