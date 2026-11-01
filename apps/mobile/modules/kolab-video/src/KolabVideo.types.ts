/** One source clip and its trim (ms). `endMs: 0` = until the end of the source. */
export interface ClipSpec {
  uri: string;
  startMs: number;
  endMs: number;
}

export type TextPosition = 'top' | 'center' | 'bottom';

/** Burned-in text, shown between startMs and endMs of the output timeline. */
export interface TextSpec {
  text: string;
  startMs: number;
  endMs: number;
  position: TextPosition;
  fontSize?: number;
  /** #RRGGBB or #RRGGBBAA */
  color?: string;
  /** Pill behind the text; omit for a drop shadow only. */
  background?: string;
}

/** Image overlay (logo watermark, #ad label). Coordinates are 0–1, top-left origin. */
export interface ImageSpec {
  uri: string;
  x: number;
  y: number;
  width: number;
  height: number;
  startMs?: number;
  /** 0 = until the end card. */
  endMs?: number;
  opacity?: number;
  cornerRadius?: number;
}

export interface EndCardSpec {
  durationMs: number;
  imageUri?: string;
  logoUri?: string;
  title?: string;
  subtitle?: string;
  colors?: string[];
}

export interface ComposeSpec {
  clips: ClipSpec[];
  width: number;
  height: number;
  texts?: TextSpec[];
  images?: ImageSpec[];
  endCard?: EndCardSpec;
  music?: { uri: string; volume: number };
  voiceVolume?: number;
}

export interface ComposeResult {
  uri: string;
  durationMs: number;
  bytes: number;
}

export interface VideoInfo {
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export type KolabVideoEvents = {
  onProgress: (e: { progress: number }) => void;
};
