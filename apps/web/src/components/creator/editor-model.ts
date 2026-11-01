/** Web video editor: state model and helpers, mirroring apps/mobile/src/lib/editor.ts. */

export interface EditorClip {
  key: string;
  /** Object URL of the local file (revoked when the clip is removed or the editor closes). */
  url: string;
  name: string;
  durationMs: number;
  startMs: number;
  endMs: number;
  /** Small JPEG data URL for the timeline strip. */
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

export const INITIAL_STATE: EditorState = {
  clips: [],
  texts: [],
  captionPosition: 'bottom',
  captionStyle: 'pill',
  watermark: true,
  endCard: true,
  music: 'glow',
  musicVolume: 0.35,
  voiceVolume: 1,
  aspect: '9:16',
};

/** Original Kolab loops (copied from the mobile app into /public/music). */
export const MUSIC: { id: Exclude<MusicId, 'none'>; label: string; vibe: string; bpm: number; src: string }[] = [
  { id: 'glow', label: 'Glow', vibe: 'Chill lo-fi for routines', bpm: 84, src: '/music/glow.wav' },
  { id: 'pop', label: 'Pop', vibe: 'Bright, for unboxings', bpm: 112, src: '/music/pop.wav' },
  { id: 'bounce', label: 'Bounce', vibe: 'Punchy, for hype', bpm: 126, src: '/music/bounce.wav' },
];

export const musicSrc = (id: MusicId) => MUSIC.find((m) => m.id === id)?.src ?? null;

/** Always on the video: a paid partnership has to be disclosed on the content itself. */
export const DISCLOSURE = '#ad · Paid partnership';
export const HOOK_MS = 3000;
export const END_CARD_MS = 2500;
export const MAX_CLIPS = 5;
export const MIN_CLIP_MS = 300;

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export const clipLength = (c: EditorClip) => c.endMs - c.startMs;
export const totalLength = (clips: EditorClip[]) => clips.reduce((sum, c) => sum + clipLength(c), 0);

export const renderSize = (aspect: Aspect): [number, number] => (aspect === '9:16' ? [1080, 1920] : [1080, 1080]);

export function fmt(ms: number) {
  const s = Math.max(0, ms) / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** New hook text over the first 3 seconds (replaces any previous hook). */
export function withHook(texts: EditorText[], hook: string): EditorText[] {
  return [{ key: newKey(), kind: 'hook', text: hook, startMs: 0, endMs: HOOK_MS }, ...texts.filter((t) => t.kind !== 'hook')];
}

/** Reads a local video's length and grabs a thumbnail. The caller owns (and revokes) the object URL. */
export async function readClip(file: File): Promise<EditorClip> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await once(video, 'loadedmetadata');
    const durationMs = Math.round(video.duration * 1000);
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error(`Couldn’t read ${file.name}`);
    let thumb: string | null = null;
    try {
      video.currentTime = Math.min(0.5, video.duration / 2);
      await once(video, 'seeked');
      const c = document.createElement('canvas');
      const scale = 160 / Math.max(video.videoWidth, video.videoHeight, 1);
      c.width = Math.max(1, Math.round(video.videoWidth * scale));
      c.height = Math.max(1, Math.round(video.videoHeight * scale));
      c.getContext('2d')?.drawImage(video, 0, 0, c.width, c.height);
      thumb = c.toDataURL('image/jpeg', 0.7);
    } catch {
      thumb = null;
    }
    video.removeAttribute('src');
    video.load();
    return { key: newKey(), url, name: file.name, durationMs, startMs: 0, endMs: durationMs, thumb };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e instanceof Error ? e : new Error(`Couldn’t read ${file.name}`);
  }
}

/** Resolves on the first `event` (rejects on `error`). */
export function once(el: HTMLMediaElement, event: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => done(new Error('The video took too long to load')), timeoutMs);
    const ok = () => done();
    const fail = () => done(new Error('This video format isn’t supported by your browser'));
    function done(err?: Error) {
      clearTimeout(t);
      el.removeEventListener(event, ok);
      el.removeEventListener('error', fail);
      if (err) reject(err);
      else resolve();
    }
    el.addEventListener(event, ok);
    el.addEventListener('error', fail);
  });
}

/** Picks the best MediaRecorder container the browser supports (MP4/H.264 first, like the phone). */
export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}
