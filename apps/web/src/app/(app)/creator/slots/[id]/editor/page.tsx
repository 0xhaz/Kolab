'use client';

import { use, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeftIcon, FilmIcon, MonitorPlayIcon, PauseIcon, PlayIcon, PlusIcon, ShareIcon } from 'lucide-react';
import { postRequirements, type BrandKitDto } from '@kolab/shared';
import { Chip, Empty, PageHeader, Panel, tone } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditorPlayer, type EditorPlayerHandle } from '@/components/creator/editor-player';
import { BrandPanel, ClipsPanel, MusicPanel, TextPanel, type HookLanguage } from '@/components/creator/editor-panels';
import { ExportDialog, type RenderedVideo } from '@/components/creator/editor-export-dialog';
import type { BrandAssets } from '@/components/creator/editor-draw';
import { autoCaptions, loadBitmap, renderVideo } from '@/components/creator/editor-media';
import {
  END_CARD_MS,
  INITIAL_STATE,
  MAX_CLIPS,
  clipLength,
  fmt,
  newKey,
  pickRecorderMime,
  readClip,
  totalLength,
  withHook,
  type EditorClip,
  type EditorState,
  type EditorText,
} from '@/components/creator/editor-model';
import { api, ApiError } from '@/lib/api';
import { creatorKeys, useSlot } from '@/lib/creator';
import { slotTitle } from '@/lib/earnings';
import { errorMessage } from '@/lib/errors';
import { uploadFile } from '@/lib/upload';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { cn } from '@/lib/utils';

type Tool = 'clips' | 'text' | 'brand' | 'music';
const noop = () => () => {};

/** Web port of the mobile video editor: clips → hook + captions → brand overlays → music → video file. */
export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const send = useSponsoredTx();
  const { slot, enrollment, isLoading, error } = useSlot(id);
  const camp = enrollment?.campaign;
  /** null = this browser can't record; undefined = not checked yet (server render). */
  const codec = useSyncExternalStore(noop, pickRecorderMime, () => undefined);

  const kit = useQuery({
    queryKey: ['kit', camp?.id],
    queryFn: () => api<BrandKitDto>(`/campaigns/${camp!.id}/kit`),
    enabled: !!camp?.hasBrandKit,
    staleTime: 5 * 60_000, // signed links last 10 minutes
  });
  const logoAsset = kit.data?.logo;
  const productAsset = kit.data?.products[0];
  const logo = useQuery({ queryKey: ['kit-bitmap', logoAsset?.id], queryFn: () => loadBitmap(logoAsset!.url), enabled: !!logoAsset, staleTime: Infinity, retry: 1 });
  const product = useQuery({ queryKey: ['kit-bitmap', productAsset?.id], queryFn: () => loadBitmap(productAsset!.url), enabled: !!productAsset, staleTime: Infinity, retry: 1 });

  const [state, setState] = useState<EditorState>(INITIAL_STATE);
  const [tool, setTool] = useState<Tool>('clips');
  const [sel, setSel] = useState(0);
  const [local, setLocal] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hooks, setHooks] = useState<string[]>([]);
  const [hookSource, setHookSource] = useState<string | null>(null);
  const [language, setLanguage] = useState<HookLanguage>('en');
  const [busy, setBusy] = useState<'hooks' | 'captions' | 'clips' | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<RenderedVideo | null>(null);
  const [delivering, setDelivering] = useState<string | null>(null);

  const player = useRef<EditorPlayerHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  /** Every object URL this page created, revoked on unmount. */
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const owned = urls.current;
    return () => {
      abort.current?.abort();
      owned.forEach((u) => URL.revokeObjectURL(u));
      owned.clear();
    };
  }, []);

  const clip = state.clips[sel];
  const offset = state.clips.slice(0, sel).reduce((sum, c) => sum + clipLength(c), 0);
  const playhead = clip ? offset + Math.max(0, Math.min(local, clip.endMs) - clip.startMs) : 0;
  const total = totalLength(state.clips);
  const update = (patch: Partial<EditorState>) => setState((s) => ({ ...s, ...patch }));

  const req = camp ? postRequirements(camp, enrollment?.voucherCode ?? null) : null;
  const endCardTitle = camp?.brandName ?? kit.data?.brandName ?? req?.product ?? '';
  const endCardText = req ? (req.voucher ? `Use code ${req.voucher}` : req.brandTag) : '';
  const brand: BrandAssets = {
    logo: logo.data ?? null,
    product: state.endCard ? (product.data ?? null) : null,
    colors: kit.data?.colors.length ? kit.data.colors : ['#7C3AED', '#DB2777'],
    title: endCardTitle,
    subtitle: endCardText,
  };
  const canDeliver = slot?.kind === 'ugc' && enrollment?.status === 'active' && (slot.status === 'open' || slot.status === 'rejected');

  function togglePlay() {
    if (!clip) return;
    if (playing) return setPlaying(false);
    if (playhead >= total - 100) {
      const first = state.clips[0]!;
      if (sel === 0) player.current?.seek(first.startMs);
      setSel(0);
      setLocal(first.startMs);
    } else if (local < clip.startMs || local >= clip.endMs - 30) {
      player.current?.seek(clip.startMs);
    }
    setPlaying(true);
  }

  async function addFiles(files: FileList | null) {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name));
    if (!list.length) return;
    const room = MAX_CLIPS - state.clips.length;
    if (list.length > room) toast.info(`Up to ${MAX_CLIPS} clips per video. Added the first ${Math.max(0, room)}.`);
    setBusy('clips');
    try {
      const added: EditorClip[] = [];
      for (const f of list.slice(0, Math.max(0, room))) {
        try {
          const c = await readClip(f);
          urls.current.add(c.url);
          added.push(c);
        } catch (e) {
          toast.error(errorMessage(e));
        }
      }
      if (added.length) {
        setState((s) => ({ ...s, clips: [...s.clips, ...added] }));
        if (!state.clips.length) setSel(0);
      }
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function setClip(patch: Partial<EditorClip>) {
    setState((s) => ({ ...s, clips: s.clips.map((c, i) => (i === sel ? { ...c, ...patch } : c)) }));
  }

  function moveClip(dir: -1 | 1) {
    const to = sel + dir;
    if (to < 0 || to >= state.clips.length) return;
    setState((s) => {
      const clips = [...s.clips];
      [clips[sel], clips[to]] = [clips[to]!, clips[sel]!];
      return { ...s, clips };
    });
    setSel(to);
  }

  function removeClip() {
    const gone = state.clips[sel];
    setPlaying(false);
    setState((s) => ({ ...s, clips: s.clips.filter((_, i) => i !== sel) }));
    setSel(Math.max(0, sel - 1));
    if (gone) {
      // Let the player switch source before the URL goes away.
      setTimeout(() => {
        URL.revokeObjectURL(gone.url);
        urls.current.delete(gone.url);
      }, 500);
    }
  }

  async function suggestHooks() {
    setBusy('hooks');
    try {
      const r = await api<{ hooks: string[]; source: 'gemini' | 'template' }>(`/slots/${id}/hooks`, { method: 'POST', body: JSON.stringify({ language }) });
      setHooks(r.hooks);
      setHookSource(r.source);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function pickHook(text: string) {
    setState((s) => ({ ...s, texts: text ? withHook(s.texts, text) : s.texts.filter((t) => t.kind !== 'hook') }));
  }

  async function runAutoCaptions() {
    setPlaying(false);
    setBusy('captions');
    try {
      const captions = await autoCaptions(id, state.clips);
      if (!captions.length) toast.info('No speech found. Add captions by hand.');
      else toast.success(`${captions.length} captions added. Edit any line below.`);
      setState((s) => ({ ...s, texts: [...s.texts.filter((t) => t.kind !== 'caption'), ...captions] }));
    } catch (e) {
      const code = e instanceof ApiError ? (e.body as { code?: string } | undefined)?.code : undefined;
      if (e instanceof ApiError && (e.status === 503 || code === 'auto_captions_unavailable')) {
        toast.info('Auto-captions aren’t switched on for this server yet. Add captions by hand.');
      } else toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function addCaption() {
    const t: EditorText = { key: newKey(), kind: 'caption', text: 'New caption', startMs: playhead, endMs: Math.min(total, playhead + 2000) };
    setState((s) => ({ ...s, texts: [...s.texts, t].sort((a, b) => a.startMs - b.startMs) }));
  }

  function setRendered(next: RenderedVideo | null) {
    if (result) {
      URL.revokeObjectURL(result.url);
      urls.current.delete(result.url);
    }
    setResult(next);
  }

  async function exportVideo() {
    if (!state.clips.length) return;
    setPlaying(false);
    setRendered(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress(0);
    try {
      // Called synchronously from the click so the AudioContext may start.
      const out = await renderVideo({ state, brand, signal: ctrl.signal, onProgress: (p) => setProgress(Math.min(1, p)) });
      const url = URL.createObjectURL(out.blob);
      urls.current.add(url);
      setRendered({ ...out, url });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error(errorMessage(e));
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  async function deliver() {
    if (!result) return;
    try {
      setDelivering('Uploading…');
      const file = new File([result.blob], `kolab-ugc-${id.slice(0, 8)}.${result.ext}`, { type: result.mime });
      const { uploadId } = await uploadFile(file);
      setDelivering('Confirm in your wallet…');
      const tx = await send(`/slots/${id}/tx/submit`, { uploadId });
      await qc.invalidateQueries({ queryKey: creatorKeys.enrollments });
      toast.success('Delivered. The brand has been notified to review it.', { action: { label: 'Explorer', onClick: () => window.open(tx.explorerUrl, '_blank') } });
      setRendered(null);
      router.push(`/creator/slots/${id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDelivering(null);
    }
  }

  // ------------------------------------------------------------------ states

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-xl bg-white/6" />
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="aspect-9/16 max-w-[340px] animate-pulse rounded-3xl bg-white/6" />
          <div className="h-80 animate-pulse rounded-3xl bg-white/6" />
        </div>
      </div>
    );
  }
  if (error) return <Empty icon={FilmIcon}>Couldn’t load this deliverable: {errorMessage(error)}</Empty>;
  if (!slot || !camp) {
    return (
      <Empty icon={FilmIcon}>
        This deliverable isn’t in your work list.
        <Button variant="glass" className="h-9 px-4" nativeButton={false} render={<Link href="/creator" />}>
          Back to home
        </Button>
      </Empty>
    );
  }

  const exportMs = total + (state.endCard && total ? END_CARD_MS : 0);
  const logoStatus = !logoAsset ? null : logo.isLoading ? 'Loading the brand logo…' : logo.isError ? 'Couldn’t load the brand logo' : null;

  return (
    <div className="space-y-6">
      <Link href={`/creator/slots/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> {slotTitle(slot)}
      </Link>
      <PageHeader
        eyebrow={`${camp.brandName ?? 'Brand'} · ${camp.title}`}
        title="Video editor"
        description="Cut your clips, add a hook and captions, brand it, and export. Everything renders in your browser; nothing leaves your computer until you deliver."
        action={
          codec !== undefined && (
            <Chip
              label={codec ? (codec.startsWith('video/mp4') ? 'Exports MP4 (H.264)' : 'Exports WebM') : 'Recording not supported in this browser'}
              color={codec ? tone.money : tone.danger}
              icon={MonitorPlayIcon}
            />
          )
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        aria-label="Add video clips"
        onChange={(e) => void addFiles(e.target.files)}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <div className="space-y-4 lg:sticky lg:top-6">
          <EditorPlayer
            ref={player}
            state={state}
            sel={sel}
            brand={brand}
            playing={playing}
            onSelect={setSel}
            onPlayingChange={setPlaying}
            onTime={setLocal}
          />
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!clip}
              aria-label={playing ? 'Pause' : 'Play'}
              className="bg-brand-gradient grid size-11 place-items-center rounded-full text-white shadow-lg transition active:scale-95 disabled:opacity-40"
            >
              {playing ? <PauseIcon className="size-4 fill-current" /> : <PlayIcon className="size-4 fill-current" />}
            </button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {fmt(playhead)} / {fmt(total)}
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Clips">
            {state.clips.map((c, i) => (
              <button
                key={c.key}
                type="button"
                role="listitem"
                aria-label={`Clip ${i + 1}, ${fmt(clipLength(c))}`}
                aria-current={i === sel}
                onClick={() => {
                  setPlaying(false);
                  setSel(i);
                  setTool('clips');
                }}
                className={cn('relative h-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white/6 transition', i === sel ? 'border-accent' : 'border-transparent hover:border-white/20')}
                style={{ width: Math.max(64, Math.min(160, clipLength(c) / 60)) }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL thumbnail */}
                {c.thumb && <img src={c.thumb} alt="" className="absolute inset-0 size-full object-cover" />}
                <span className="absolute right-1 bottom-1 rounded-md bg-black/60 px-1 text-[10px] font-semibold text-white">{fmt(clipLength(c))}</span>
              </button>
            ))}
            {state.clips.length < MAX_CLIPS && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy === 'clips'}
                aria-label="Add clips"
                className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border-2 border-dashed border-white/16 text-muted-foreground transition hover:border-white/30 hover:text-foreground"
              >
                <PlusIcon className={cn('size-5', busy === 'clips' && 'animate-pulse')} />
              </button>
            )}
          </div>

          <Button variant="gradient" size="lg" className="h-11 w-full" disabled={!state.clips.length || progress !== null || !codec} onClick={exportVideo}>
            <ShareIcon /> {state.clips.length ? `Export ${fmt(exportMs)} video` : 'Add clips to export'}
          </Button>
          {codec === null && <p className="text-center text-xs text-red-300">This browser can’t record video. Use a recent Chrome, Edge or Safari to export.</p>}
        </div>

        <Tabs value={tool} onValueChange={(v) => setTool(v as Tool)} className="min-w-0 gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="clips">Clips</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="brand">Brand</TabsTrigger>
            <TabsTrigger value="music">Music</TabsTrigger>
          </TabsList>
          <TabsContent value="clips">
            <ClipsPanel
              clip={clip}
              index={sel}
              count={state.clips.length}
              local={local}
              onClip={setClip}
              onSeek={(ms) => player.current?.seek(ms)}
              onMove={moveClip}
              onRemove={removeClip}
              onAdd={() => fileInput.current?.click()}
              canAdd={state.clips.length < MAX_CLIPS && busy !== 'clips'}
            />
          </TabsContent>
          <TabsContent value="text">
            <TextPanel
              state={state}
              update={update}
              hooks={hooks}
              hookSource={hookSource}
              language={language}
              onLanguage={setLanguage}
              busy={busy === 'hooks' || busy === 'captions' ? busy : null}
              onSuggest={suggestHooks}
              onPickHook={pickHook}
              onAutoCaptions={runAutoCaptions}
              onAddCaption={addCaption}
              playhead={playhead}
            />
          </TabsContent>
          <TabsContent value="brand">
            <BrandPanel state={state} update={update} hasLogo={!!logo.data} logoStatus={logoStatus} endCardText={endCardText} />
            {camp.hasBrandKit && kit.isError && <p className="mt-2 text-xs text-red-300">Couldn’t load the brand kit: {errorMessage(kit.error)}</p>}
          </TabsContent>
          <TabsContent value="music">
            <MusicPanel state={state} update={update} />
          </TabsContent>
        </Tabs>
      </div>

      <Panel className="text-xs text-muted-foreground">
        Tip: export plays your edit once in real time, so a 30-second video takes about 30 seconds. Keep this tab in front while it records.
      </Panel>

      <ExportDialog
        progress={progress}
        result={result}
        aspect={state.aspect}
        fileName={`kolab-${(camp.brandName ?? 'video').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${id.slice(0, 8)}.${result?.ext ?? 'mp4'}`}
        canDeliver={!!canDeliver}
        delivering={delivering}
        onCancel={() => abort.current?.abort()}
        onClose={() => setRendered(null)}
        onDeliver={deliver}
      />
    </div>
  );
}
