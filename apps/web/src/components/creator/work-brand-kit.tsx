'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheckIcon, DownloadIcon, InfoIcon, LoaderIcon, PaletteIcon } from 'lucide-react';
import type { BrandKitAsset, BrandKitDto, CampaignDto } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { Chip, Panel, SectionHeader, tone } from '@/components/dashboard';
import { api } from '@/lib/api';
import { useAuthed } from '@/lib/queries';
import { assetUrl } from '@/lib/upload';
import { errorMessage } from '@/lib/errors';

/** Brand kit for a joined campaign (signed asset links; refetched often since they expire). */
export const useBrandKit = (campaignId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ['creator', 'kit', campaignId],
    queryFn: () => api<BrandKitDto>(`/campaigns/${campaignId}/kit`),
    enabled: useAuthed() && !!campaignId && enabled,
    staleTime: 5 * 60_000,
  });

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif' };

/** Downloads a kit asset as a file (falls back to opening it when the host blocks CORS). */
export async function downloadAsset(asset: BrandKitAsset, name: string) {
  const url = assetUrl(asset.url);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${name}.${EXT[asset.mime] ?? 'png'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

/** Gallery of the seller's logo and product photos; each asset downloads on its own. */
export function WorkBrandKit({ camp, studioHref }: { camp: CampaignDto; studioHref?: string }) {
  const kit = useBrandKit(camp.id, camp.hasBrandKit);
  const [saving, setSaving] = useState<string | null>(null);
  if (!camp.hasBrandKit) return null;
  const data = kit.data;
  const assets = data ? [...(data.logo ? [data.logo] : []), ...data.products] : [];
  const slug = (camp.brandName ?? camp.title).replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();

  async function save(a: BrandKitAsset, i: number) {
    setSaving(a.id);
    try {
      await downloadAsset(a, a.kind === 'logo' ? `${slug}-logo` : `${slug}-product-${i}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Brand kit" count={assets.length || undefined} action={studioHref && <Link href={studioHref} className="text-sm font-medium text-primary hover:underline">Create content</Link>} />
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip label="Ready" color={tone.money} icon={BadgeCheckIcon} />
          {data && data.colors.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <PaletteIcon className="size-3.5" aria-hidden />
              {data.colors.map((col) => (
                <span key={col} className="inline-flex items-center gap-1">
                  <span className="size-4 rounded-full border border-white/20" style={{ backgroundColor: col }} aria-hidden />
                  <span className="font-mono">{col}</span>
                </span>
              ))}
            </span>
          )}
        </div>
        {kit.isLoading && <p className="text-sm text-muted-foreground">Loading assets…</p>}
        {kit.isError && <p className="text-sm text-destructive">{errorMessage(kit.error)}</p>}
        {assets.length > 0 && (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {assets.map((a, i) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => save(a, i)}
                  className="group relative block aspect-4/5 w-full overflow-hidden rounded-2xl border border-white/8 bg-white/4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  style={a.kind === 'logo' ? { backgroundColor: '#fff' } : undefined}
                  aria-label={`Download ${a.kind === 'logo' ? 'logo' : `product photo ${i}`}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed kit links from the API or Cloudinary */}
                  <img src={assetUrl(a.url)} alt="" className={a.kind === 'logo' ? 'absolute inset-0 size-full object-contain p-3' : 'absolute inset-0 size-full object-cover transition group-hover:scale-105'} />
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">{a.kind === 'logo' ? 'Logo' : 'Product'}</span>
                  <span className="absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white">
                    {saving === a.id ? <LoaderIcon className="size-3 animate-spin" /> : <DownloadIcon className="size-3" />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {data?.notes && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {data.notes}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {studioHref && (
            <Button variant="gradient" className="h-9 px-4" nativeButton={false} render={<Link href={studioHref} />}>
              Create content
            </Button>
          )}
          <p className="text-xs text-muted-foreground">For videos, add the logo and photos in TikTok’s editor or CapCut. Click any asset to download it.</p>
        </div>
      </Panel>
    </section>
  );
}
