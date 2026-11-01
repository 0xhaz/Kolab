import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  createProvider,
  generateBrief,
  generateCaption,
  generateHooks,
  templateBrief,
  templateCaption,
  templateHooks,
  transcribeCaptions,
  type Hooks,
  type HooksInput,
  type Transcript,
  type AiProvider,
  type Brief,
  type BriefInput,
  type Caption,
  type CaptionInput,
} from '@kolab/ai';
import { ENV, type Env } from '../config/env.js';
import { fetchProductText } from './safe-fetch.js';

/** Brief builder (architecture §5.3). The model proposes copy and sizing; it never sets wallets or amounts on-chain. */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: AiProvider | null;

  constructor(@Inject(ENV) env: Env) {
    this.provider =
      env.AI_PROVIDER === 'gemini' && env.GEMINI_API_KEY
        ? createProvider({ provider: 'gemini', geminiApiKey: env.GEMINI_API_KEY, geminiModel: env.GEMINI_MODEL })
        : null;
  }

  get mode(): 'gemini' | 'template' {
    return this.provider ? 'gemini' : 'template';
  }

  async caption(input: CaptionInput): Promise<Caption & { source: 'gemini' | 'template' }> {
    if (this.provider) {
      try {
        return { ...(await generateCaption(this.provider, input)), source: 'gemini' };
      } catch (err) {
        this.logger.warn({ err }, 'model caption failed; using template');
      }
    }
    return { ...templateCaption(input), source: 'template' };
  }

  async hooks(input: HooksInput): Promise<Hooks & { source: 'gemini' | 'template' }> {
    if (this.provider) {
      try {
        return { ...(await generateHooks(this.provider, input)), source: 'gemini' };
      } catch (err) {
        this.logger.warn({ err }, 'model hooks failed; using template');
      }
    }
    return { ...templateHooks(input), source: 'template' };
  }

  /** Speech → timed captions. There is no honest offline fallback, so this needs Gemini. */
  async transcribe(audio: { mimeType: string; data: Uint8Array; durationMs: number }): Promise<Transcript> {
    if (!this.provider) throw new ServiceUnavailableException({ code: 'auto_captions_unavailable' });
    return transcribeCaptions(this.provider, audio);
  }

  async brief(input: BriefInput): Promise<Brief & { source: 'gemini' | 'template' }> {
    const pageText = input.productUrl ? await fetchProductText(input.productUrl) : null;
    const full: BriefInput = { ...input, productText: [input.productText, pageText].filter(Boolean).join('\n\n') };
    if (this.provider) {
      try {
        return { ...(await generateBrief(this.provider, full)), source: 'gemini' };
      } catch (err) {
        this.logger.warn({ err }, 'model brief failed; using template');
      }
    }
    return { ...templateBrief(input), source: 'template' };
  }
}
