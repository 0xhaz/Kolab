import Link from 'next/link';
import { ArrowUpRightIcon, BadgeCheckIcon, GiftIcon, LockIcon, UserCheckIcon, ZapIcon } from 'lucide-react';
import type { CampaignDto } from '@kolab/shared';
import { Avatar, CampaignCover, Chip, TYPE_LABEL } from '@/components/dashboard';
import { payout } from './discover-data';

/** Selective campaigns: the brand picks from applicants. Open ones anyone can join. */
export function AccessChip({ camp, long }: { camp: Pick<CampaignDto, 'selective'>; long?: boolean }) {
  return camp.selective ? (
    <Chip label={long ? 'Selective · apply to join' : 'Apply'} color="#FFFFFF" icon={UserCheckIcon} className="backdrop-blur-md" />
  ) : (
    <Chip label={long ? 'Open · join now' : 'Open'} color="#FFFFFF" icon={ZapIcon} className="backdrop-blur-md" />
  );
}

/** Chips on a cover photo: type, free product, kit, access. White so they read on any image. */
export function CoverChips({ camp, long }: { camp: CampaignDto; long?: boolean }) {
  return (
    <>
      <Chip label={TYPE_LABEL[camp.type]} color="#FFFFFF" className="backdrop-blur-md" />
      {camp.requiresShipping && <Chip label="Free product" color="#FFFFFF" icon={GiftIcon} className="backdrop-blur-md" />}
      {camp.hasBrandKit && <Chip label="Brand kit ready" color="#FFFFFF" icon={BadgeCheckIcon} className="backdrop-blur-md" />}
      <AccessChip camp={camp} long={long} />
    </>
  );
}

/** Discover feed: big image-led card like a social post (mobile CampaignFeedCard). */
export function CampaignFeedCard({ camp }: { camp: CampaignDto }) {
  const p = payout(camp);
  const brand = camp.brandName ?? 'Brand';
  return (
    <Link
      href={`/creator/campaigns/${camp.id}`}
      className="group block overflow-hidden rounded-3xl border border-white/8 bg-card transition duration-300 hover:-translate-y-0.5 hover:border-white/16 hover:shadow-[0_24px_48px_-24px_rgb(139_92_246/0.45)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <CampaignCover camp={camp} className="h-52">
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-1.5">
          <CoverChips camp={camp} />
        </div>
        <div className="absolute inset-x-4 bottom-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Avatar name={brand} size={24} />
            {brand}
            <BadgeCheckIcon aria-hidden className="size-3.5 text-sky-300" />
          </div>
          <div className="line-clamp-2 text-lg font-semibold leading-snug text-white">{camp.title}</div>
        </div>
      </CampaignCover>
      <div className="flex items-end justify-between gap-3 p-4">
        <div>
          <div className="text-xl font-bold tabular-nums text-money">Earn {p.amount}</div>
          <div className="text-xs text-muted-foreground">{p.detail}</div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <LockIcon className="size-3 text-money" /> Paid via escrow
          </span>
          <span className="inline-flex items-center gap-1 transition group-hover:text-foreground">
            View <ArrowUpRightIcon className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Home rail: compact square card. */
export function CampaignRailCard({ camp }: { camp: CampaignDto }) {
  const p = payout(camp);
  return (
    <Link
      href={`/creator/campaigns/${camp.id}`}
      className="group block overflow-hidden rounded-3xl border border-white/8 transition duration-300 hover:-translate-y-0.5 hover:border-white/16 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <CampaignCover camp={camp} className="aspect-square">
        <div className="absolute left-3 top-3">
          <AccessChip camp={camp} />
        </div>
        <div className="absolute inset-x-3.5 bottom-3">
          <div className="text-xl font-bold tabular-nums text-white">{p.amount}</div>
          <div className="truncate text-sm font-medium text-white/85">{camp.brandName ?? camp.title}</div>
        </div>
      </CampaignCover>
    </Link>
  );
}
