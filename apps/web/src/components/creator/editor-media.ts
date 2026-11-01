'use client';

/**
 * Browser media plumbing for the web editor: auto-caption audio (Web Audio → 16 kHz WAV), brand
 * images as ImageBitmaps (no tainted canvas), and the real-time exporter (canvas + Web Audio →
 * MediaRecorder). The phone does the same work natively with AVFoundation.
 */
import { getAccessToken } from '@privy-io/react-auth';
import { ApiError } from '@/lib/api';
import { env } from '@/lib/env';
import { assetUrl } from '@/lib/upload';
import { drawFrame, type BrandAssets } from './editor-draw';
import {
  END_CARD_MS,
  clipLength,
  musicSrc,
  newKey,
  once,
  pickRecorderMime,
  renderSize,
  totalLength,
  type EditorClip,
  type EditorState,
  type EditorText,
} from './editor-model';

// ------------------------------------------------------------------ auto-captions

const SPEECH_RATE = 16_000;

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** The trimmed timeline's sound, in clip order, downmixed to a mono 16 kHz WAV. */
export async function timelineWav(clips: EditorClip[]): Promise<{ wav: Blob; durationMs: number }> {
  const durationMs = totalLength(clips);
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil((durationMs / 1000) * SPEECH_RATE)), SPEECH_RATE);
  let at = 0;
  for (const clip of clips) {
    const bytes = await (await fetch(clip.url)).arrayBuffer();
    // A clip without an audio track (or a codec Web Audio can't decode) just contributes silence.
    const audio = await ctx.decodeAudioData(bytes).catch(() => null);
    if (audio) {
      const src = ctx.createBufferSource();
      src.buffer = audio;
      src.connect(ctx.destination);
      src.start(at / 1000, clip.startMs / 1000, clipLength(clip) / 1000);
    }
    at += clipLength(clip);
  }
  const rendered = await ctx.startRendering();
  return { wav: encodeWav(rendered.getChannelData(0), SPEECH_RATE), durationMs };
}

/** Sends the timeline audio for transcription and returns timed caption texts. */
export async function autoCaptions(slotId: string, clips: EditorClip[]): Promise<EditorText[]> {
  const { wav, durationMs } = await timelineWav(clips);
  const form = new FormData();
  form.append('file', new File([wav], 'voice.wav', { type: 'audio/wav' }));
  form.append('durationMs', String(Math.round(durationMs)));
  const token = await getAccessToken();
  const res = await fetch(`${env.apiUrl}/slots/${slotId}/transcribe`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, body);
  return (body as { segments: { startMs: number; endMs: number; text: string }[] }).segments.map((s) => ({ key: newKey(), kind: 'caption', ...s }));
}

// ------------------------------------------------------------------ brand images

/** Kit images are fetched as blobs and decoded locally so drawing them never taints the canvas. */
export async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(assetUrl(url));
  if (!res.ok) throw new Error(`Image ${res.status}`);
  const blob = await res.blob();
  try {
    return await createImageBitmap(blob);
  } catch {
    // SVG logos: decode through an <img>, then snapshot.
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

// ------------------------------------------------------------------ export

export interface ExportResult {
  blob: Blob;
  /** Container without codec parameters, e.g. video/mp4 (what the upload allowlist checks). */
  mime: string;
  ext: 'mp4' | 'webm';
  durationMs: number;
  codec: string;
}

/** Never stalls when the tab is hidden (rAF stops there); frames just get coarser. */
const nextTick = (fn: () => void) => (document.hidden ? setTimeout(fn, 16) : requestAnimationFrame(fn));

/**
 * Renders the edit in real time: each trimmed clip plays into a 1080-wide canvas with the overlays,
 * the clip audio + a looped music bed (fading out at the end) are mixed with Web Audio, and the
 * canvas stream + mixed track are recorded with MediaRecorder.
 *
 * Call it straight from a click handler: the AudioContext is created before the first await.
 */
export async function renderVideo(opts: {
  state: EditorState;
  brand: BrandAssets;
  onProgress: (p: number) => void;
  signal: AbortSignal;
}): Promise<ExportResult> {
  const { state, brand, onProgress, signal } = opts;
  const codec = pickRecorderMime();
  if (!codec) throw new Error('This browser can’t record video. Try a recent Chrome, Edge or Safari.');
  const ac = new AudioContext();
  const [W, H] = renderSize(state.aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  const dest = ac.createMediaStreamDestination();
  const voice = ac.createGain();
  voice.gain.value = state.voiceVolume;
  ac.createMediaElementSource(video).connect(voice).connect(dest);

  const contentMs = totalLength(state.clips);
  const totalMs = contentMs + (state.endCard ? END_CARD_MS : 0);
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, { mimeType: codec, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let music: AudioBufferSourceNode | null = null;

  const aborted = () => {
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
  };
  const draw = (t: number, v: HTMLVideoElement | null) => drawFrame(ctx, { state, video: v, t, contentMs, brand });

  try {
    await ac.suspend();
    const src = musicSrc(state.music);
    const bed = src ? await ac.decodeAudioData(await (await fetch(src)).arrayBuffer()) : null;

    let offset = 0;
    for (const clip of state.clips) {
      aborted();
      if (recorder.state === 'recording') recorder.pause();
      await ac.suspend();
      video.src = clip.url;
      await once(video, 'loadeddata');
      video.currentTime = clip.startMs / 1000;
      await once(video, 'seeked');
      draw(offset, video);

      if (recorder.state === 'inactive') {
        recorder.start(1000);
        if (bed) {
          // Scheduled on the AudioContext clock, which stands still while we seek between clips.
          music = ac.createBufferSource();
          music.buffer = bed;
          music.loop = true;
          const gain = ac.createGain();
          const t0 = ac.currentTime;
          const end = t0 + totalMs / 1000;
          const fade = Math.min(1.2, totalMs / 4000);
          gain.gain.setValueAtTime(state.musicVolume, t0);
          gain.gain.setValueAtTime(state.musicVolume, end - fade);
          gain.gain.linearRampToValueAtTime(0, end);
          music.connect(gain).connect(dest);
          music.start(t0);
        }
      } else recorder.resume();
      await ac.resume();
      await video.play();

      const start = offset;
      await new Promise<void>((resolve, reject) => {
        const tick = () => {
          if (signal.aborted) return reject(new DOMException('Export cancelled', 'AbortError'));
          const ct = video.currentTime * 1000;
          const t = start + Math.max(0, Math.min(ct, clip.endMs) - clip.startMs);
          draw(t, video);
          onProgress(t / totalMs);
          if (ct >= clip.endMs - 1 || video.ended) {
            video.pause();
            resolve();
          } else nextTick(tick);
        };
        nextTick(tick);
      });
      offset += clipLength(clip);
    }

    if (state.endCard) {
      const t0 = performance.now();
      await new Promise<void>((resolve, reject) => {
        const tick = () => {
          if (signal.aborted) return reject(new DOMException('Export cancelled', 'AbortError'));
          const elapsed = performance.now() - t0;
          draw(contentMs + elapsed, null);
          onProgress((contentMs + elapsed) / totalMs);
          if (elapsed >= END_CARD_MS) resolve();
          else nextTick(tick);
        };
        nextTick(tick);
      });
    }

    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    recorder.stop();
    await stopped;
    onProgress(1);
    const mime = codec.split(';')[0]!;
    return { blob: new Blob(chunks, { type: mime }), mime, ext: mime === 'video/mp4' ? 'mp4' : 'webm', durationMs: totalMs, codec };
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    try {
      music?.stop();
    } catch {
      /* never started */
    }
    stream.getTracks().forEach((t) => t.stop());
    video.pause();
    video.removeAttribute('src');
    video.load();
    void ac.close();
  }
}
