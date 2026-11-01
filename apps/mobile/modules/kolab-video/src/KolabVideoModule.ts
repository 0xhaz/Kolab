import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { ClipSpec, ComposeResult, ComposeSpec, KolabVideoEvents, VideoInfo } from './KolabVideo.types';

declare class KolabVideoModule extends NativeModule<KolabVideoEvents> {
  getInfo(uri: string): Promise<VideoInfo>;
  thumbnail(uri: string, atMs: number, maxSize: number): Promise<string>;
  exportAudio(clips: ClipSpec[]): Promise<{ uri: string; durationMs: number }>;
  compose(spec: ComposeSpec): Promise<ComposeResult>;
}

/** null on builds without the native module (Android for now, or an old dev client). */
export default requireOptionalNativeModule<KolabVideoModule>('KolabVideo');
