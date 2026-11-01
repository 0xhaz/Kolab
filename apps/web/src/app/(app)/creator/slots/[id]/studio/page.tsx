'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronLeftIcon, CircleAlertIcon, DownloadIcon, ImagePlusIcon, LoaderIcon, ShieldCheckIcon, StarIcon } from 'lucide-react';
import { postRequirements } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Chip, Empty, PageHeader, Panel, SectionHeader, tone } from '@/components/dashboard';
import { useBrandKit } from '@/components/creator/work-brand-kit';
import { DEFAULT_HEADLINE, TEMPLATES, canvasPng, drawTemplate, loadCanvasImage, type TemplateId } from '@/components/creator/slot-templates-canvas';
import { useMyEnrollments } from '@/lib/creator';
import { slotTitle } from '@/lib/earnings';
import { errorMessage } from '@/lib/errors';
import { assetUrl } from '@/lib/upload';
import { useMe } from '@/lib/use-me';
import { cn } from '@/lib/utils';

/** Resolves the route id as a slot id, or (for per-sale campaigns without slots) an enrollment id. */
function useStudioTarget(id: string) {
  const q = useMyEnrollments();
  for (const e of q.data ?? []) {
    const slot = e.slots.find((s) => s.id === id);
    if (slot) return { ...q, enrollment: e, slot };
    if (e.id === id) return { ...q, enrollment: e, slot: undefined };
  }
  return { ...q, enrollment: undefined, slot: undefined };
}

/** Content studio: brand-kit templates the creator personalises and exports as a 1080-px PNG. */
export default function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { enrollment: e, slot, isLoading, isError, error } = useStudioTarget(id);
  const { data: me } = useMe();
  const kit = useBrandKit(e?.campaign.id, !!e?.campaign.hasBrandKit);
  const canvas = useRef<HTMLCanvasElement>(null);

  const perSale = e?.campaign.type === 'per_sale';
  const templates = TEMPLATES.filter((t) => !t.perSaleOnly || perSale);
  const [picked, setPicked] = useState<TemplateId | null>(null);
  const template: TemplateId = picked ?? (perSale ? 'voucher' : 'story');
  const [photo, setPhoto] = useState<string | null>(null);
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const [headline, setHeadline] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const products = kit.data?.products ?? [];
  const chosenPhoto = photo ?? myPhoto ?? (products[0] ? assetUrl(products[0].url) : null);
  const logoUrl = kit.data?.logo ? assetUrl(kit.data.logo.url) : null;
  const colors: [string, string] = [kit.data?.colors[0] ?? '#7C3AED', kit.data?.colors[1] ?? '#DB2777'];
  const text = headline ?? DEFAULT_HEADLINE[template];
  const brandName = e?.campaign.brandName ?? 'Brand';
  const brandTag = e ? postRequirements(e.campaign, e.voucherCode).brandTag : '#brand';
  const handle = (me?.displayName ?? me?.email?.split('@')[0] ?? 'creator').replace(/\s+/g, '').toLowerCase();
  const voucher = e?.voucherCode ?? null;
  const [c0, c1] = colors;

  // Redraw the preview canvas (which is also the export) whenever an input changes.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !e) return;
    let cancelled = false;
    const load = (src: string | null) => (src ? loadCanvasImage(src).catch(() => null) : Promise.resolve(null));
    void (async () => {
      const [logo, photoImg] = await Promise.all([load(logoUrl), load(chosenPhoto), document.fonts?.ready]);
      if (cancelled) return;
      try {
        drawTemplate(el, template, {
          logo,
          photo: photoImg,
          colors: [c0, c1],
          brandName,
          brandTag,
          headline: text,
          rating,
          handle,
          voucher,
          fontFamily: getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif',
        });
        setRenderError(null);
      } catch (err) {
        setRenderError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [e, template, logoUrl, chosenPhoto, c0, c1, brandName, brandTag, text, rating, handle, voucher]);

  function pickMine(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return void toast.error('Choose an image file.');
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setMyPhoto(url);
      setPhoto(url);
    };
    reader.onerror = () => toast.error('Couldn’t read that image.');
    reader.readAsDataURL(file);
  }

  async function download() {
    const el = canvas.current;
    if (!el) return;
    setExporting(true);
    try {
      const blob = await canvasPng(el);
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${brandName.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${template}-1080.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      toast.success('Saved. Post it from TikTok or Instagram.');
    } catch (err) {
      toast.error(`Couldn’t export: ${errorMessage(err)}. Try your own photo instead.`);
    } finally {
      setExporting(false);
    }
  }

  const backHref = slot ? `/creator/slots/${slot.id}` : e ? `/creator/work/${e.id}` : '/creator/work';
  const back = (
    <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
      <ChevronLeftIcon className="size-4" /> {slot ? slotTitle(slot) : (e?.campaign.title ?? 'My work')}
    </Link>
  );

  if (!e) {
    return (
      <div className="space-y-6">
        {back}
        {isLoading ? <Panel className="h-96 animate-pulse bg-white/3" aria-busy /> : <Empty icon={CircleAlertIcon}>{isError ? errorMessage(error) : 'Campaign not found in your work.'}</Empty>}
      </div>
    );
  }

  const tpl = TEMPLATES.find((t) => t.id === template)!;

  return (
    <div className="space-y-8">
      {back}
      <PageHeader
        eyebrow={brandName}
        title="Create content"
        description="Pick a template, personalise it with the brand kit, and download a 1080 px PNG ready for TikTok or Instagram."
        action={
          <Button variant="gradient" className="h-10 px-5" disabled={exporting} onClick={download}>
            {exporting ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />} Download PNG
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-3">
          <div role="radiogroup" aria-label="Template" className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={t.id === template}
                onClick={() => {
                  setPicked(t.id);
                  setHeadline(null);
                }}
                className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Chip label={`${t.label}`} color={t.id === template ? tone.primary : tone.muted} />
              </button>
            ))}
          </div>
          <Panel className="flex justify-center p-4">
            <canvas
              ref={canvas}
              role="img"
              aria-label={`${tpl.label} preview: ${text}`}
              className={cn('h-auto rounded-2xl border border-white/8 bg-black', template === 'story' ? 'w-full max-w-[22rem]' : 'w-full max-w-md')}
              style={{ aspectRatio: `${tpl.width} / ${tpl.height}` }}
            />
          </Panel>
          {renderError && <p className="text-sm text-destructive">{renderError}</p>}
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5 text-money" aria-hidden /> Exports at {tpl.width} × {tpl.height} px
          </p>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <SectionHeader title="Photo" />
            <Panel className="space-y-3">
              {!e.campaign.hasBrandKit && <p className="text-sm text-muted-foreground">This brand hasn’t shared a kit yet, so use your own photo.</p>}
              {kit.isLoading && <p className="text-sm text-muted-foreground">Loading brand photos…</p>}
              <div className="flex flex-wrap gap-2.5">
                {products.map((p, i) => {
                  const uri = assetUrl(p.url);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={chosenPhoto === uri}
                      aria-label={`Brand product photo ${i + 1}`}
                      onClick={() => setPhoto(uri)}
                      className={cn('relative h-24 w-20 overflow-hidden rounded-xl border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50', chosenPhoto === uri ? 'border-primary' : 'border-transparent')}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed kit links */}
                      <img src={uri} alt="" className="absolute inset-0 size-full object-cover" />
                    </button>
                  );
                })}
                {myPhoto && (
                  <button
                    type="button"
                    aria-pressed={chosenPhoto === myPhoto}
                    aria-label="My photo"
                    onClick={() => setPhoto(myPhoto)}
                    className={cn('relative h-24 w-20 overflow-hidden rounded-xl border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50', chosenPhoto === myPhoto ? 'border-primary' : 'border-transparent')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                    <img src={myPhoto} alt="" className="absolute inset-0 size-full object-cover" />
                  </button>
                )}
                <label className="flex h-24 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 text-muted-foreground transition hover:bg-white/4 focus-within:ring-3 focus-within:ring-ring/50">
                  <ImagePlusIcon className="size-5" aria-hidden />
                  <span className="text-[11px] font-medium">My photo</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={(ev) => pickMine(ev.target.files?.[0])} />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">Your own photo stays in your browser; nothing is uploaded.</p>
            </Panel>
          </section>

          <section className="space-y-3">
            <SectionHeader title={template === 'review' ? 'Your review' : 'Headline'} />
            <Panel className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="studio-headline">{template === 'review' ? 'Review' : 'Headline'}</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{text.length} / 90</span>
                </div>
                <Input id="studio-headline" maxLength={90} value={text} onChange={(ev) => setHeadline(ev.target.value)} />
              </div>
              {template === 'review' && (
                <div className="space-y-1.5">
                  <div className="text-sm font-medium" id="rating-label">
                    Rating
                  </div>
                  <div role="radiogroup" aria-labelledby="rating-label" className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} star${n > 1 ? 's' : ''}`}
                        onClick={() => setRating(n)}
                        className="rounded-md p-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <StarIcon className="size-7" style={{ color: '#F59E0B' }} fill={n <= rating ? '#F59E0B' : 'transparent'} aria-hidden />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2 rounded-2xl bg-white/4 px-3.5 py-2.5 text-xs text-muted-foreground">
                <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-money" aria-hidden />
                The “#ad · Paid partnership” sticker is required on every template and can’t be removed.
              </div>
            </Panel>
          </section>

          <Button variant="gradient" className="h-11 w-full px-5" disabled={exporting} onClick={download}>
            {exporting ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />} Download {tpl.width} px PNG
          </Button>
        </div>
      </div>
    </div>
  );
}
