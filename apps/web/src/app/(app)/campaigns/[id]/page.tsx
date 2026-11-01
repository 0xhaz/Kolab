'use client';

import { Suspense, use, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  ChevronLeftIcon,
  CopyIcon,
  ExternalLinkIcon,
  FilmIcon,
  HandCoinsIcon,
  ImageIcon,
  LinkIcon,
  LockIcon,
  PackageIcon,
  PercentIcon,
  Undo2Icon,
  UsersIcon,
  VideoIcon,
} from 'lucide-react';
import { openUpload } from '@/lib/files';
import { BrandKitPanel } from '@/components/brand-kit-panel';
import { ApplicantsPanel } from '@/components/applicants-panel';
import { FundingPanel } from '@/components/funding-panel';
import type { ShippingAddress } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, CampaignCover, Chip, Empty, KitBadge, Panel, SectionHeader, SlotBadge, SlotStrip, StatTile, TYPE_LABEL, tone } from '@/components/dashboard';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useCampaign, type BrandEnrollment } from '@/lib/queries';
import { useSlotActions } from '@/lib/use-slot-actions';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { explorerAccount, relative, shortDate, usdc } from '@/lib/format';

const ENROLLMENT_LABEL: Record<BrandEnrollment['status'], string> = {
  awaiting_shipment: 'Waiting for you to ship',
  in_transit: 'Shipped',
  active: 'Active',
  not_received: 'Not received: reship or cancel',
  cancelled: 'Cancelled · refunded',
  completed: 'Completed',
};

function ShipDialog({ enrollment }: { enrollment: BrandEnrollment }) {
  const send = useSponsoredTx();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState<ShippingAddress | null | undefined>(undefined);
  const [courier, setCourier] = useState('J&T Express');
  const [trackingRef, setTrackingRef] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(next: boolean) {
    setOpen(next);
    if (next && address === undefined) {
      try {
        setAddress(await api<ShippingAddress | null>(`/enrollments/${enrollment.id}/address`));
      } catch (e) {
        toast.error(errorMessage(e));
      }
    }
  }

  async function ship() {
    setBusy(true);
    try {
      await send(`/enrollments/${enrollment.id}/tx/mark-shipped`, { courier, trackingRef });
      await qc.invalidateQueries();
      toast.success('Marked as shipped. The creator’s deadlines start when they receive it.');
      setOpen(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={load}>
      <DialogTrigger render={<Button variant="glass" className="h-9 px-4" />}>
        <PackageIcon /> Ship product
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ship to {enrollment.creator.displayName ?? enrollment.creator.email ?? 'creator'}</DialogTitle>
        </DialogHeader>
        {address === undefined ? (
          <p className="text-sm text-muted-foreground">Loading address…</p>
        ) : address === null ? (
          <p className="text-sm text-muted-foreground">The creator hasn’t added a shipping address yet.</p>
        ) : (
          <address className="rounded-2xl border border-white/8 bg-popover p-3.5 text-sm not-italic">
            {address.name}
            <br />
            {address.line1}
            {address.line2 ? <>, {address.line2}</> : null}
            <br />
            {address.postcode} {address.city}, {address.country}
            <br />
            {address.phone}
          </address>
        )}
        <p className="text-xs text-muted-foreground">Addresses are encrypted, visible only to you, and deleted 30 days after the campaign. Only a hash of the tracking number goes on-chain.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Courier</Label>
            <Input value={courier} onChange={(e) => setCourier(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tracking number</Label>
            <Input value={trackingRef} onChange={(e) => setTrackingRef(e.target.value)} placeholder="JT1234567890" />
          </div>
        </div>
        <Button variant="gradient" disabled={busy || !address || trackingRef.length < 4} onClick={ship}>
          {busy ? 'Confirm in your wallet…' : 'Mark as shipped'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: c, isLoading } = useCampaign(id);
  const actions = useSlotActions();
  const [now] = useState(() => Date.now());

  if (isLoading || !c) return <p className="text-sm text-muted-foreground">{isLoading ? 'Loading…' : 'Campaign not found.'}</p>;

  const link = `kolab://campaign/${c.id}`;
  const escrow = BigInt(c.totalFunded) - BigInt(c.totalReleased) - BigInt(c.totalRefunded);

  return (
    <div className="space-y-8">
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> Campaigns
      </Link>

      <CampaignCover camp={c} className="-mt-4 min-h-64 rounded-[2rem] border border-white/8 md:min-h-72">
        <div className="absolute inset-x-5 top-5 flex flex-wrap items-center gap-1.5">
          <Chip label={TYPE_LABEL[c.type]} color="#FFFFFF" className="backdrop-blur-md" />
          {c.requiresShipping && <Chip label="Free product" color="#FFFFFF" className="backdrop-blur-md" />}
          <KitBadge camp={c} />
          <Chip label={c.selective ? 'Selective · creators apply' : 'Open · anyone can join'} color="#FFFFFF" className="backdrop-blur-md" />
          {c.onchainPubkey && (
            <a
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/60"
              href={explorerAccount(c.onchainPubkey)}
              target="_blank"
              rel="noreferrer"
            >
              Escrow on Explorer <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
        <div className="absolute inset-x-5 bottom-5 flex flex-wrap items-end justify-between gap-4 md:inset-x-7 md:bottom-6">
          <div className="min-w-0 max-w-2xl">
            <div className="text-sm font-medium text-white/80">{c.brandName ?? 'Your brand'}</div>
            <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{c.title}</h1>
            {c.briefMd && <p className="mt-1.5 line-clamp-2 text-sm text-white/80">{c.briefMd}</p>}
          </div>
          <div className="rounded-2xl bg-black/35 px-4 py-2.5 text-right backdrop-blur-md">
            <div className="text-xs text-white/75">Budget funded</div>
            <div className="text-2xl font-bold tabular-nums text-money">{usdc(c.totalFunded, 0)}</div>
          </div>
        </div>
      </CampaignCover>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={LockIcon} color={tone.money} label="In escrow" value={usdc(escrow)} note={`of ${usdc(c.totalFunded)} funded`} />
        <StatTile icon={HandCoinsIcon} color={tone.primary} label="Paid to creators" value={usdc(BigInt(c.totalReleased) - BigInt(c.totalFees))} />
        <StatTile icon={PercentIcon} color={tone.accent} label="Kolab fee" value={usdc(c.totalFees)} note="5%, only on released money" />
        <StatTile icon={Undo2Icon} color={tone.sky} label="Refunded to you" value={usdc(c.totalRefunded)} />
      </div>

      <Suspense fallback={null}>
        <FundingPanel campaign={c} />
      </Suspense>

      <Panel className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <LinkIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Invite creators</div>
            <div className="truncate font-mono text-xs text-muted-foreground">{link}</div>
          </div>
        </div>
        <Button
          variant="gradient"
          className="h-9 px-4"
          onClick={() => {
            void navigator.clipboard.writeText(link);
            toast('Join link copied. Share it on WhatsApp or Telegram.');
          }}
        >
          <CopyIcon /> Copy join link
        </Button>
      </Panel>

      <ApplicantsPanel campaign={c} />

      <BrandKitPanel campaign={c} />

      <section className="space-y-4">
        <SectionHeader title="Joined creators" count={c.enrollments.length} />
        {c.enrollments.length === 0 ? (
          <Empty icon={UsersIcon}>No creators yet. Share the join link with creators you want to work with.</Empty>
        ) : (
          <div className="space-y-4">
            {c.enrollments.map((e) => {
              const who = e.creator.displayName ?? e.creator.email ?? e.creator.walletPubkey ?? 'Creator';
              return (
                <Panel key={e.id} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={who} size={44} ring />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{who}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.requiresShipping ? ENROLLMENT_LABEL[e.status] : 'Active'}
                          {e.trackingRef ? ` · ${e.trackingRef}` : ''}
                          {e.receivedAt ? ` · received ${shortDate(e.receivedAt)}` : ''}
                          {e.voucherCode ? ` · voucher ${e.voucherCode}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Earned</div>
                        <div className="font-semibold tabular-nums text-money">{usdc(e.earnedTotal, 0)}</div>
                      </div>
                      {c.requiresShipping && (e.status === 'awaiting_shipment' || e.status === 'not_received') && <ShipDialog enrollment={e} />}
                    </div>
                  </div>
                  {e.slots.length > 0 && <SlotStrip statuses={e.slots.map((s) => s.status)} />}
                  {e.slots.length > 0 && (
                    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                      {e.slots.map((s) => {
                        const url = s.submissions[0]?.url;
                        const fileKey = s.submissions[0]?.fileKey;
                        return (
                          <div key={s.id} className="space-y-2.5 rounded-2xl border border-white/8 bg-popover p-3.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                                {s.kind === 'ugc' ? <VideoIcon className="size-3.5 text-muted-foreground" /> : <ImageIcon className="size-3.5 text-muted-foreground" />}
                                {s.kind === 'ugc' ? 'UGC' : 'Post'} #{s.idx + 1}
                              </span>
                              <span className="text-sm font-semibold tabular-nums text-money">{usdc(s.amount, 0)}</span>
                            </div>
                            <SlotBadge status={s.status} />
                            <div className="text-xs text-muted-foreground">{s.dueAt ? `Due ${shortDate(s.dueAt)} (${relative(s.dueAt, now)})` : 'Starts on receipt'}</div>
                            {url && (
                              <a className="block truncate text-xs text-primary underline-offset-4 hover:underline" href={url} target="_blank" rel="noreferrer">
                                {url}
                              </a>
                            )}
                            {fileKey && (
                              <button className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline" onClick={() => void openUpload(fileKey)}>
                                <FilmIcon className="size-3" /> Watch video
                              </button>
                            )}
                            {s.status === 'submitted' && (
                              <div className="flex gap-2">
                                <Button size="sm" variant="gradient" disabled={!!actions.busy} onClick={() => actions.approve(s.id)}>
                                  {actions.busy === `approve:${s.id}` ? '…' : 'Approve'}
                                </Button>
                                <Button size="sm" variant="glass" disabled={!!actions.busy} onClick={() => actions.reject(s.id)}>
                                  Changes
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Panel>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
