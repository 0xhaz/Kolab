'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheckIcon, PaletteIcon, UploadIcon } from 'lucide-react';
import type { BrandKitDto, CampaignDto } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { keys } from '@/lib/queries';
import { assetUrl, uploadFile } from '@/lib/upload';

const fileInput = 'block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-foreground';

/** Seller's brand kit: logo, product photos, colours and notes for creators who joined. */
export function BrandKitPanel({ campaign }: { campaign: CampaignDto }) {
  const qc = useQueryClient();
  const kit = useQuery({
    queryKey: ['kit', campaign.id],
    queryFn: () => api<BrandKitDto>(`/campaigns/${campaign.id}/kit`),
    enabled: campaign.hasBrandKit,
  });
  const [editing, setEditing] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const [products, setProducts] = useState<File[]>([]);
  const [colors, setColors] = useState<[string, string]>(['#F97316', '#7C3AED']);
  const [notes, setNotes] = useState('');
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function save() {
    if (!logo || products.length === 0) return;
    try {
      setBusy('Uploading logo…');
      const { uploadId: logoUploadId } = await uploadFile(logo);
      const productUploadIds: string[] = [];
      for (const [i, p] of products.entries()) {
        setBusy(`Uploading photo ${i + 1}/${products.length}…`);
        productUploadIds.push((await uploadFile(p)).uploadId);
      }
      setBusy('Saving kit…');
      await api(`/campaigns/${campaign.id}/kit`, {
        method: 'PUT',
        body: JSON.stringify({ logoUploadId, productUploadIds, colors, notes: notes || undefined, rightsConfirmed: true }),
      });
      await qc.invalidateQueries({ queryKey: ['kit', campaign.id] });
      await qc.invalidateQueries({ queryKey: keys.campaign(campaign.id) });
      await qc.invalidateQueries({ queryKey: keys.campaigns });
      toast.success('Brand kit saved. Joined creators can use it now.');
      setEditing(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const data = kit.data;
  return (
    <section className="space-y-5 rounded-3xl border border-white/8 bg-card p-5 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            <span className="bg-glow grid size-8 place-items-center rounded-xl text-white">
              <PaletteIcon className="size-4" />
            </span>
            Brand kit
            {campaign.hasBrandKit && (
              <span className="inline-flex items-center gap-1 rounded-full border border-money/35 bg-money/10 px-2.5 py-0.5 text-xs font-medium text-money">
                <BadgeCheckIcon className="size-3" /> Ready · {campaign.kitAssetCount} assets
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            Creators see a “Brand kit ready” badge before joining; the logo, photos and colours unlock after they join.
          </p>
        </div>
        {!editing && (
          <Button className="h-9 px-4" variant={campaign.hasBrandKit ? 'glass' : 'gradient'} onClick={() => setEditing(true)}>
            <UploadIcon /> {campaign.hasBrandKit ? 'Replace kit' : 'Add brand kit'}
          </Button>
        )}
      </div>

      {!editing && data && (
        <div className="flex flex-wrap items-start gap-4">
          {data.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(data.logo.url)} alt="Logo" className="size-28 rounded-2xl border border-white/10 bg-white object-contain p-2.5 shadow-lg" />
          )}
          {data.products.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={assetUrl(p.url)} alt="Product" className="h-36 w-28 rounded-2xl border border-white/10 object-cover shadow-lg transition hover:-translate-y-0.5" />
          ))}
          <div className="space-y-2">
            <div className="flex gap-2">
              {data.colors.map((col) => (
                <span key={col} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/4 px-2.5 py-1 text-xs font-mono">
                  <span className="size-3 rounded-full" style={{ backgroundColor: col }} /> {col}
                </span>
              ))}
            </div>
            {data.notes && <p className="max-w-sm text-sm text-muted-foreground">{data.notes}</p>}
          </div>
        </div>
      )}

      {editing && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Logo (PNG with transparent background works best)</Label>
            <input type="file" accept="image/png,image/jpeg,image/webp" className={fileInput} onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1.5">
            <Label>Product photos (1–6)</Label>
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              className={fileInput}
              onChange={(e) => setProducts(Array.from(e.target.files ?? []).slice(0, 6))}
            />
            <p className="text-xs text-muted-foreground">The first photo becomes the campaign cover creators see in Discover.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Brand colours</Label>
            <div className="flex gap-3">
              {colors.map((col, i) => (
                <input
                  key={i}
                  type="color"
                  value={col}
                  aria-label={`Brand colour ${i + 1}`}
                  onChange={(e) => setColors((c) => (i === 0 ? [e.target.value, c[1]] : [c[0], e.target.value]))}
                  className="h-10 w-16 cursor-pointer rounded-xl border border-white/10 bg-transparent"
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes for creators (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Keep the logo on a light area; don’t recolour it." />
          </div>
          <label className="flex items-start gap-2 text-sm md:col-span-2">
            <input type="checkbox" className="mt-1" checked={rights} onChange={(e) => setRights(e.target.checked)} />
            I own the rights to these assets and allow creators who join this campaign to use them in content for it.
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button variant="gradient" disabled={!logo || products.length === 0 || !rights || !!busy} onClick={save}>
              {busy ?? 'Save brand kit'}
            </Button>
            <Button variant="ghost" disabled={!!busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
