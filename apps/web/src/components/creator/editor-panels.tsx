'use client';

import {
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  CaptionsIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  LockIcon,
  MusicIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { Chip, Panel, tone } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Segmented, Slider, SmallButton, ToggleRow } from './editor-controls';
import { DISCLOSURE, MIN_CLIP_MS, MUSIC, clipLength, fmt, type EditorClip, type EditorState, type EditorText, type MusicId } from './editor-model';

const NUDGE = 500;
type Update = (patch: Partial<EditorState>) => void;

// ------------------------------------------------------------------ clips

/** Trim, reorder and remove the selected clip. `local` is the playhead inside its source file. */
export function ClipsPanel({
  clip,
  index,
  count,
  local,
  onClip,
  onSeek,
  onMove,
  onRemove,
  onAdd,
  canAdd,
}: {
  clip: EditorClip | undefined;
  index: number;
  count: number;
  local: number;
  onClip: (patch: Partial<EditorClip>) => void;
  onSeek: (ms: number) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  if (!clip) {
    return (
      <Panel className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">Add 1–5 clips from your computer. Trim them, add a hook and captions, then export.</p>
        <Button variant="gradient" className="h-10 px-5" onClick={onAdd}>
          <PlusIcon /> Add clips
        </Button>
      </Panel>
    );
  }
  const pct = (ms: number) => `${(ms / clip.durationMs) * 100}%`;
  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">
            Clip {index + 1} of {count}
          </div>
          <div className="max-w-56 truncate text-xs text-muted-foreground">{clip.name}</div>
        </div>
        <Chip label={`${fmt(clip.startMs)} – ${fmt(clip.endMs)} · ${fmt(clipLength(clip))}`} color={tone.accent} />
      </div>

      <div className="relative h-3 overflow-hidden rounded-full bg-white/8" aria-hidden>
        <div className="absolute inset-y-0 bg-accent/60" style={{ left: pct(clip.startMs), width: pct(clipLength(clip)) }} />
        <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: pct(Math.min(local, clip.durationMs)) }} />
      </div>

      <Slider label="Playhead" value={Math.min(local, clip.durationMs)} min={0} max={clip.durationMs} step={10} onChange={onSeek} display={fmt(local)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Slider
          label="Trim start"
          value={clip.startMs}
          min={0}
          max={clip.durationMs}
          step={10}
          onChange={(v) => onClip({ startMs: Math.min(v, clip.endMs - MIN_CLIP_MS) })}
          display={fmt(clip.startMs)}
        />
        <Slider
          label="Trim end"
          value={clip.endMs}
          min={0}
          max={clip.durationMs}
          step={10}
          onChange={(v) => onClip({ endMs: Math.max(v, clip.startMs + MIN_CLIP_MS) })}
          display={fmt(clip.endMs)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <SmallButton icon={ArrowRightToLineIcon} onClick={() => onClip({ startMs: Math.max(0, Math.min(local, clip.endMs - MIN_CLIP_MS)) })}>
          Start here
        </SmallButton>
        <SmallButton icon={ArrowLeftToLineIcon} onClick={() => onClip({ endMs: Math.min(clip.durationMs, Math.max(local, clip.startMs + MIN_CLIP_MS)) })}>
          End here
        </SmallButton>
      </div>
      <div className="flex flex-wrap gap-2">
        <SmallButton onClick={() => onClip({ startMs: Math.max(0, clip.startMs - NUDGE) })}>Start −½s</SmallButton>
        <SmallButton onClick={() => onClip({ startMs: Math.min(clip.endMs - MIN_CLIP_MS, clip.startMs + NUDGE) })}>Start +½s</SmallButton>
        <SmallButton onClick={() => onClip({ endMs: Math.max(clip.startMs + MIN_CLIP_MS, clip.endMs - NUDGE) })}>End −½s</SmallButton>
        <SmallButton onClick={() => onClip({ endMs: Math.min(clip.durationMs, clip.endMs + NUDGE) })}>End +½s</SmallButton>
      </div>
      <div className="flex flex-wrap gap-2">
        <SmallButton icon={ChevronLeftIcon} disabled={index === 0} onClick={() => onMove(-1)}>
          Move left
        </SmallButton>
        <SmallButton icon={ChevronRightIcon} disabled={index === count - 1} onClick={() => onMove(1)}>
          Move right
        </SmallButton>
        <SmallButton icon={Trash2Icon} danger onClick={onRemove}>
          Remove
        </SmallButton>
        <SmallButton icon={PlusIcon} disabled={!canAdd} onClick={onAdd}>
          Add clips
        </SmallButton>
      </div>
      <p className="text-xs text-muted-foreground">Play, pause where you want to cut, then use “Start here” or “End here”.</p>
    </Panel>
  );
}

// ------------------------------------------------------------------ text

export type HookLanguage = 'en' | 'ms' | 'id';

export function TextPanel({
  state,
  update,
  hooks,
  hookSource,
  language,
  onLanguage,
  busy,
  onSuggest,
  onPickHook,
  onAutoCaptions,
  onAddCaption,
  playhead,
}: {
  state: EditorState;
  update: Update;
  hooks: string[];
  hookSource: string | null;
  language: HookLanguage;
  onLanguage: (l: HookLanguage) => void;
  busy: 'hooks' | 'captions' | null;
  onSuggest: () => void;
  onPickHook: (text: string) => void;
  onAutoCaptions: () => void;
  onAddCaption: () => void;
  playhead: number;
}) {
  const hook = state.texts.find((t) => t.kind === 'hook');
  const captions = state.texts.filter((t) => t.kind === 'caption');
  const editText = (key: string, patch: Partial<EditorText>) => update({ texts: state.texts.map((t) => (t.key === key ? { ...t, ...patch } : t)) });

  return (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">Hook · first 3 seconds</div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Hook language"
              value={language}
              onChange={(e) => onLanguage(e.target.value as HookLanguage)}
              className="h-8 rounded-full border border-white/10 bg-white/4 px-3 text-xs"
            >
              <option value="en">English</option>
              <option value="ms">Bahasa Melayu</option>
              <option value="id">Bahasa Indonesia</option>
            </select>
            <SmallButton icon={busy === 'hooks' ? LoaderCircleIcon : SparklesIcon} disabled={busy !== null} onClick={onSuggest}>
              {busy === 'hooks' ? 'Thinking…' : hooks.length ? 'New ideas' : 'Suggest hooks'}
            </SmallButton>
          </div>
        </div>
        {hooks.length > 0 && (
          <div className="space-y-2">
            {hooks.map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={hook?.text === h}
                onClick={() => onPickHook(h)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition',
                  hook?.text === h ? 'border-accent bg-accent/10' : 'border-white/8 bg-white/3 hover:border-white/16',
                )}
              >
                {h}
                {hook?.text === h && <CheckCircle2Icon className="size-4 shrink-0 text-accent" aria-hidden />}
              </button>
            ))}
            {hookSource === 'template' && <p className="text-xs text-muted-foreground">Template ideas (AI suggestions are off on this server).</p>}
          </div>
        )}
        <Input
          aria-label="Hook text"
          placeholder="Or write your own hook"
          value={hook?.text ?? ''}
          onChange={(e) => onPickHook(e.target.value)}
        />
      </Panel>

      <Panel className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Captions</div>
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{captions.length}</span>
        </div>
        <Button variant="glass" className="h-10 w-full" disabled={!state.clips.length || busy !== null} onClick={onAutoCaptions}>
          {busy === 'captions' ? <LoaderCircleIcon className="animate-spin" /> : <CaptionsIcon />}
          {busy === 'captions' ? 'Listening to your video…' : 'Auto-captions from your voice'}
        </Button>
        {captions.length > 0 && (
          <ul className="space-y-2">
            {captions.map((t) => (
              <li key={t.key} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {fmt(t.startMs)}–{fmt(t.endMs)}
                </span>
                <Input aria-label={`Caption at ${fmt(t.startMs)}`} value={t.text} onChange={(e) => editText(t.key, { text: e.target.value })} className="h-9 flex-1" />
                <button
                  type="button"
                  aria-label={`Delete caption at ${fmt(t.startMs)}`}
                  onClick={() => update({ texts: state.texts.filter((x) => x.key !== t.key) })}
                  className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/8 hover:text-foreground"
                >
                  <XIcon className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <SmallButton icon={PlusIcon} disabled={!state.clips.length} onClick={onAddCaption}>
          Add caption at {fmt(playhead)}
        </SmallButton>
        <div className="grid gap-2 sm:grid-cols-2">
          <Segmented
            label="Caption position"
            value={state.captionPosition}
            onChange={(captionPosition) => update({ captionPosition })}
            options={[
              { value: 'bottom', label: 'Bottom' },
              { value: 'center', label: 'Center' },
            ]}
          />
          <Segmented
            label="Caption style"
            value={state.captionStyle}
            onChange={(captionStyle) => update({ captionStyle })}
            options={[
              { value: 'pill', label: 'Box' },
              { value: 'shadow', label: 'Shadow' },
            ]}
          />
        </div>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ brand

export function BrandPanel({
  state,
  update,
  hasLogo,
  logoStatus,
  endCardText,
}: {
  state: EditorState;
  update: Update;
  hasLogo: boolean;
  logoStatus: string | null;
  endCardText: string;
}) {
  return (
    <Panel className="space-y-5">
      <ToggleRow
        title="Logo watermark"
        sub={hasLogo ? 'Brand logo in the top corner' : (logoStatus ?? 'This brand hasn’t provided a logo')}
        checked={state.watermark && hasLogo}
        disabled={!hasLogo}
        onChange={(watermark) => update({ watermark })}
      />
      <ToggleRow title="Brand end card" sub={`2.5s outro: product photo, logo and “${endCardText}”`} checked={state.endCard} onChange={(endCard) => update({ endCard })} />
      <ToggleRow
        title={DISCLOSURE}
        sub="Always on: paid partnerships must be disclosed on the video."
        checked
        trailing={<Chip label="Locked" icon={LockIcon} color={tone.muted} />}
      />
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">Format</div>
        <Segmented
          label="Aspect ratio"
          value={state.aspect}
          onChange={(aspect) => update({ aspect })}
          options={[
            { value: '9:16', label: '9:16 TikTok · Reels' },
            { value: '1:1', label: '1:1 Post' },
          ]}
        />
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ music

export function MusicPanel({ state, update }: { state: EditorState; update: Update }) {
  const options: { id: MusicId; label: string; vibe: string; bpm: number }[] = [{ id: 'none', label: 'No music', vibe: 'Original sound only', bpm: 0 }, ...MUSIC];
  return (
    <Panel className="space-y-4">
      <div role="radiogroup" aria-label="Music" className="grid gap-2 sm:grid-cols-2">
        {options.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={state.music === m.id}
            onClick={() => update({ music: m.id })}
            className={cn(
              'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition',
              state.music === m.id ? 'border-accent bg-accent/10' : 'border-white/8 bg-white/3 hover:border-white/16',
            )}
          >
            <span className="flex items-center gap-3">
              <span className={cn('grid size-9 place-items-center rounded-xl', m.id === 'none' ? 'bg-white/8 text-muted-foreground' : 'bg-glow text-white')}>
                <MusicIcon className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold">{m.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {m.vibe}
                  {m.bpm ? ` · ${m.bpm} bpm` : ''}
                </span>
              </span>
            </span>
            {state.music === m.id && <CheckCircle2Icon className="size-4 shrink-0 text-accent" aria-hidden />}
          </button>
        ))}
      </div>
      <Slider
        label="Music volume"
        value={state.musicVolume}
        min={0}
        max={1}
        step={0.05}
        onChange={(musicVolume) => update({ musicVolume })}
        display={state.music === 'none' ? 'Off' : `${Math.round(state.musicVolume * 100)}%`}
      />
      <Slider label="Original sound" value={state.voiceVolume} min={0} max={1} step={0.05} onChange={(voiceVolume) => update({ voiceVolume })} display={state.voiceVolume === 0 ? 'Muted' : `${Math.round(state.voiceVolume * 100)}%`} />
      <p className="text-xs text-muted-foreground">Original Kolab tracks, free to use in brand content. The music fades out over the last second.</p>
    </Panel>
  );
}
