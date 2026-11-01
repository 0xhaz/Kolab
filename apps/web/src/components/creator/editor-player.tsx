'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { FilmIcon } from 'lucide-react';
import { drawFrame, type BrandAssets } from './editor-draw';
import { END_CARD_MS, clipLength, musicSrc, totalLength, type EditorState } from './editor-model';

export interface EditorPlayerHandle {
  /** Seek inside the selected clip (source ms). */
  seek: (ms: number) => void;
}

interface Props {
  ref?: Ref<EditorPlayerHandle>;
  state: EditorState;
  sel: number;
  brand: BrandAssets;
  playing: boolean;
  onSelect: (i: number) => void;
  onPlayingChange: (playing: boolean) => void;
  /** Current source time of the selected clip, in ms (throttled). */
  onTime: (ms: number) => void;
}

/**
 * Live preview: the selected clip plays in a hidden <video>, and every animation frame is drawn
 * onto a canvas with the same compositor the exporter uses, so what you see is what you export.
 */
export function EditorPlayer({ ref, state, sel, brand, playing, onSelect, onPlayingChange, onTime }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const latest = useRef({ state, sel, brand, playing, onSelect, onPlayingChange, onTime });
  const outroStart = useRef<number | null>(null);
  const clip = state.clips[sel];
  const clipUrl = clip?.url;
  const clipStart = clip?.startMs ?? 0;
  const src = musicSrc(state.music);

  useEffect(() => {
    latest.current = { state, sel, brand, playing, onSelect, onPlayingChange, onTime };
  });

  useImperativeHandle(ref, () => ({
    seek(ms: number) {
      const v = videoRef.current;
      outroStart.current = null;
      if (v) v.currentTime = ms / 1000;
    },
  }));

  // Load the selected clip at its trim start.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !clipUrl) return;
    if (v.getAttribute('src') !== clipUrl) v.src = clipUrl;
    v.currentTime = clipStart / 1000;
    outroStart.current = null;
    if (latest.current.playing) void v.play().catch(() => undefined);
  }, [clipUrl, clipStart]);

  useEffect(() => {
    const v = videoRef.current;
    const m = musicRef.current;
    if (v) {
      if (playing && clipUrl) void v.play().catch(() => undefined);
      else v.pause();
    }
    if (m) {
      if (playing && src) void m.play().catch(() => undefined);
      else m.pause();
    }
  }, [playing, clipUrl, src]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = state.voiceVolume;
    if (musicRef.current) musicRef.current.volume = state.musicVolume;
  }, [state.voiceVolume, state.musicVolume, src]);

  // One draw loop for the component's lifetime; it reads the latest props from the ref.
  useEffect(() => {
    let raf = 0;
    let lastReported = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      const v = videoRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !v) return;
      const { state: s, sel: i, brand: b, playing: isPlaying, onSelect: select, onPlayingChange: setPlaying, onTime: report } = latest.current;
      const c = s.clips[i];
      const contentMs = totalLength(s.clips);
      const offset = s.clips.slice(0, i).reduce((sum, x) => sum + clipLength(x), 0);
      const ct = v.currentTime * 1000;
      let t = c ? offset + Math.max(0, Math.min(ct, c.endMs) - c.startMs) : 0;

      if (isPlaying && c && (ct >= c.endMs - 30 || v.ended) && outroStart.current === null) {
        if (i < s.clips.length - 1) select(i + 1);
        else if (s.endCard) {
          v.pause();
          outroStart.current = performance.now();
        } else setPlaying(false);
      }
      if (outroStart.current !== null) {
        const elapsed = performance.now() - outroStart.current;
        t = contentMs + elapsed;
        if (elapsed >= END_CARD_MS || !isPlaying) {
          outroStart.current = null;
          if (isPlaying) setPlaying(false);
        }
      }
      drawFrame(ctx, { state: s, video: c ? v : null, t, contentMs: c ? contentMs : Number.POSITIVE_INFINITY, brand: b });
      if (Math.abs(ct - lastReported) >= 40) {
        lastReported = ct;
        report(ct);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const height = state.aspect === '9:16' ? 960 : 540;
  return (
    <div className="relative mx-auto w-full overflow-hidden rounded-3xl bg-black shadow-[0_24px_60px_-28px_rgb(139_92_246/0.6)]" style={{ maxWidth: state.aspect === '9:16' ? 340 : 440 }}>
      <canvas ref={canvasRef} width={540} height={height} className="block h-auto w-full" aria-label="Video preview with captions and brand overlays" role="img" />
      {!clip && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-2 text-sm text-white/70">
            <FilmIcon className="size-8" />
            Add clips to start
          </div>
        </div>
      )}
      <video ref={videoRef} className="hidden" playsInline preload="auto" />
      <audio ref={musicRef} src={src ?? undefined} loop preload="auto" className="hidden" />
    </div>
  );
}
