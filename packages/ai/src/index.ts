import { GeminiProvider } from './gemini.js';
import { MockProvider } from './mock.js';
import type { AiProvider } from './provider.js';

export * from './provider.js';
export { GeminiProvider } from './gemini.js';
export { MockProvider } from './mock.js';

export interface AiConfig {
  provider: 'gemini' | 'mock';
  geminiApiKey?: string;
  geminiModel?: string;
  mockResponses?: Record<string, unknown>;
}

export function createProvider(config: AiConfig): AiProvider {
  if (config.provider === 'mock') return new MockProvider(config.mockResponses);
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
  return new GeminiProvider(config.geminiApiKey, config.geminiModel);
}
export * from './brief.js';
export * from './caption.js';
export * from './video.js';
