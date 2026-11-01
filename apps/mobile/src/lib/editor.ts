import { useCallback } from 'react';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { usePrivy } from '@privy-io/expo';
import KolabVideo, { type ComposeSpec, type TextSpec } from '../../modules/kolab-video';
import type { BrandKitDto } from '@kolab/shared';
import { ApiError, useApi } from './api';
import { absUrl } from './brand-kit';
import { env } from './env';

/** Rendering needs the native module (iOS dev build); older clients and Android don't have it yet. */
export const editorAvailable = KolabVideo !== null;

export interface EditorClip {
  key: string;
  uri: string;
  durationMs: number;
  startMs: number;
  endMs: number;
  thumb: string | null;
}

export interface EditorText {
  key: string;
  kind: 'hook' | 'caption';
  text: string;
  startMs: number;
  endMs: number;
}

export type Aspect = '9:16' | '1:1';
export type MusicId = 'none' | 'glow' | 'pop' | 'bounce';
export type CaptionStyle = 'pill' | 'shadow';

export interface EditorState {
  clips: EditorClip[];
  texts: EditorText[];
  captionPosition: 'center' | 'bottom';
  captionStyle: CaptionStyle;
  watermark: boolean;
  endCard: boolean;
  music: MusicId;
  musicVolume: number;
  voiceVolume: number;
  aspect: Aspect;
}

export const MUSIC: { id: Exclude<MusicId, 'none'>; label: string; vibe: string; bpm: number; module: number }[] = [
  { id: 'glow', label: 'Glow', vibe: 'Chill lo-fi for routines', bpm: 84, module: require('../../assets/music/glow.wav') },
  { id: 'pop', label: 'Pop', vibe: 'Bright, for unboxings', bpm: 112, module: require('../../assets/music/pop.wav') },
  { id: 'bounce', label: 'Bounce', vibe: 'Punchy, for hype', bpm: 126, module: require('../../assets/music/bounce.wav') },
];

/** Always on the video: a paid partnership has to be disclosed on the content itself. */
export const DISCLOSURE = '#ad · Paid partnership';
const HOOK_MS = 3000;

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export const clipLength = (c: EditorClip) => c.endMs - c.startMs;
export const totalLength = (clips: EditorClip[]) => clips.reduce((sum, c) => sum + clipLength(c), 0);

export function fmt(ms: number) {
  const s = Math.max(0, ms) / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Picks one or more videos from the library and reads their length + a thumbnail. */
export async function pickClips(): Promise<EditorClip[]> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: true, selectionLimit: 5, quality: 1 });
  if (res.canceled || !KolabVideo) return [];
  const out: EditorClip[] = [];
  for (const a of res.assets) {
    const info = await KolabVideo.getInfo(a.uri);
    const thumb = await KolabVideo.thumbnail(a.uri, Math.min(500, info.durationMs / 2), 240).catch(() => null);
    out.push({ key: newKey(), uri: a.uri, durationMs: info.durationMs, startMs: 0, endMs: info.durationMs, thumb });
  }
  return out;
}

async function musicUri(id: MusicId): Promise<string | null> {
  const track = MUSIC.find((m) => m.id === id);
  if (!track) return null;
  const asset = await Asset.fromModule(track.module).downloadAsync();
  return asset.localUri ?? asset.uri;
}

export async function musicPreviewUri(id: MusicId) {
  return musicUri(id);
}

/** Brand-kit images are signed remote links; the renderer reads local files. */
async function localCopy(url: string): Promise<string> {
  const dir = new Directory(Paths.cache, 'kolab-editor');
  if (!dir.exists) dir.create();
  const file = await File.downloadFileAsync(absUrl(url), dir, { idempotent: true });
  return file.uri;
}

export interface BrandContext {
  kit: BrandKitDto | undefined;
  brandName: string;
  /** Shown on the end card, e.g. the voucher code or the brand hashtag. */
  cta: string;
}

/** Turns the editor state into the native compose spec. */
export async function buildSpec(state: EditorState, brand: BrandContext): Promise<ComposeSpec> {
  const [width, height] = state.aspect === '9:16' ? [1080, 1920] : [1080, 1080];
  const total = totalLength(state.clips);
  const pill = state.captionStyle === 'pill' ? '#000000B3' : undefined;

  const texts: TextSpec[] = [
    { text: DISCLOSURE, startMs: 0, endMs: total, position: 'top', fontSize: 34, color: '#FFFFFF', background: '#00000080' },
    ...state.texts.map((t) =>
      t.kind === 'hook'
        ? { text: t.text, startMs: t.startMs, endMs: t.endMs, position: 'center' as const, fontSize: 88, color: '#FFFFFF', background: '#DB2777E6' }
        : { text: t.text, startMs: t.startMs, endMs: t.endMs, position: state.captionPosition, fontSize: 60, color: '#FFFFFF', background: pill },
    ),
  ];

  const logo = state.watermark && brand.kit?.logo ? await localCopy(brand.kit.logo.url) : null;
  const product = state.endCard && brand.kit?.products[0] ? await localCopy(brand.kit.products[0].url) : null;
  const endLogo = state.endCard && brand.kit?.logo ? (logo ?? (await localCopy(brand.kit.logo.url))) : null;
  const colors = brand.kit?.colors.length ? brand.kit.colors : ['#7C3AED', '#DB2777'];
  const music = state.music === 'none' ? null : await musicUri(state.music);

  return {
    clips: state.clips.map((c) => ({ uri: c.uri, startMs: c.startMs, endMs: c.endMs })),
    width,
    height,
    texts,
    images: logo ? [{ uri: logo, x: 0.79, y: 0.105, width: 0.17, height: 0.07, opacity: 0.92, cornerRadius: 18 }] : [],
    endCard: state.endCard
      ? { durationMs: 2500, imageUri: product ?? undefined, logoUri: endLogo ?? undefined, title: brand.brandName, subtitle: brand.cta, colors }
      : undefined,
    music: music ? { uri: music, volume: state.musicVolume } : undefined,
    voiceVolume: state.voiceVolume,
  };
}

/** New hook text over the first 3 seconds (replaces any previous hook). */
export function withHook(texts: EditorText[], hook: string): EditorText[] {
  return [{ key: newKey(), kind: 'hook', text: hook, startMs: 0, endMs: HOOK_MS }, ...texts.filter((t) => t.kind !== 'hook')];
}

export function useEditorApi(slotId: string) {
  const api = useApi();
  const { getAccessToken } = usePrivy();

  const hooks = useCallback(
    (language: 'en' | 'ms' | 'id' = 'en') =>
      api<{ hooks: string[]; source: 'gemini' | 'template' }>(`/slots/${slotId}/hooks`, { method: 'POST', body: JSON.stringify({ language }) }),
    [api, slotId],
  );

  /** Exports the timeline's audio, sends it for transcription, returns timed caption texts. */
  const autoCaptions = useCallback(
    async (clips: EditorClip[]): Promise<EditorText[]> => {
      if (!KolabVideo) throw new Error('Update the app to use auto-captions');
      const audio = await KolabVideo.exportAudio(clips.map((c) => ({ uri: c.uri, startMs: c.startMs, endMs: c.endMs })));
      const form = new FormData();
      form.append('file', { uri: audio.uri, name: 'voice.m4a', type: 'audio/mp4' } as unknown as Blob);
      form.append('durationMs', String(Math.round(audio.durationMs)));
      const token = await getAccessToken();
      const res = await fetch(`${env.apiUrl}/slots/${slotId}/transcribe`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) throw new ApiError(res.status, body);
      return (body as { segments: { startMs: number; endMs: number; text: string }[] }).segments.map((s) => ({ key: newKey(), kind: 'caption', ...s }));
    },
    [getAccessToken, slotId],
  );

  return { hooks, autoCaptions };
}
