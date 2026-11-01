import { z } from 'zod';
import type { AiProvider, CompleteRequest } from './provider.js';

/**
 * Offline provider for rehearsals and tests. Responses are keyed by a prefix of the system prompt;
 * each one is still validated against the caller's schema.
 */
export class MockProvider implements AiProvider {
  readonly name = 'mock';

  constructor(private readonly responses: Record<string, unknown> = {}) {}

  async complete<T extends z.ZodType>({ schema, system }: CompleteRequest<T>) {
    const key = Object.keys(this.responses).find((k) => system.startsWith(k));
    if (!key) throw new Error(`MockProvider: no canned response for "${system.slice(0, 40)}…"`);
    return schema.parse(this.responses[key]);
  }
}
