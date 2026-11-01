'use client';

import { BadgeCheckIcon, DownloadIcon, InfoIcon, LockIcon } from 'lucide-react';
import type { CampaignDto } from '@kolab/shared';
import { Chip, Panel, SectionHeader, tone } from '@/components/dashboard';
import { errorMessage } from '@/lib/errors';
import { assetUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { useBrandKit } from './discover-data';

/** Locked preview for creators who haven't joined: tells them the seller came prepared. */
export function BrandKitLocked({ camp }: { camp: CampaignDto }) {
  if (!camp.hasBrandKit) return null;
  return (
    <Panel className="flex items-center gap-3.5 border-money/25 bg-money/6">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-money/15 text-money">
        <LockIcon className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="font-semibold">Brand kit ready · {camp.kitAssetCount} assets unlock after you join</div>
        <p className="text-sm text-muted-foreground">
          {camp.brandName ?? 'The brand'} prepared a logo, product photos and colours for your content.
        </p>
      </div>
    </Panel>
  );
}

/** Read-only gallery for joined creators, with a download link per asset. */
export function BrandKitGallery({ camp }: { camp: CampaignDto }) {
  const kit = useBrandKit(camp.id, camp.hasBrandKit);
  if (!camp.hasBrandKit) return null;
  const data = kit.data;
  const assets = data ? [...(data.logo ? [data.logo] : []), ...data.products] : [];
  return (
    <section className="space-y-3">
      <SectionHeader title="Brand kit" count={assets.length || undefined} />
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip label="Unlocked" color={tone.money} icon={BadgeCheckIcon} />
          {data?.colors.map((col) => (
            <span key={col} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="size-4 rounded-full border border-white/20" style={{ backgroundColor: col }} />
              {col}
            </span>
          ))}
        </div>
        {kit.isLoading && <p className="text-sm text-muted-foreground">Loading assets…</p>}
        {kit.isError && <p className="text-sm text-destructive">{errorMessage(kit.error)}</p>}
        {assets.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {assets.map((a) => {
              const src = assetUrl(a.url);
              return (
                <a
                  key={a.id}
                  href={src}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className={cn('group relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/8', a.kind === 'logo' ? 'bg-white' : 'bg-popover')}
                  aria-label={`Download ${a.kind === 'logo' ? 'logo' : 'product photo'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed kit links */}
                  <img src={src} alt="" className={cn('size-full transition duration-300 group-hover:scale-105', a.kind === 'logo' ? 'object-contain p-3' : 'object-cover')} />
                  <span className="absolute bottom-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white">
                    <DownloadIcon className="size-3.5" />
                  </span>
                  {a.kind === 'logo' && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">Logo</span>}
                </a>
              );
            })}
          </div>
        )}
        {data?.notes && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" /> {data.notes}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Use these only for this campaign. Open a deliverable to create content with them.</p>
      </Panel>
    </section>
  );
}
