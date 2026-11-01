import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AiOutputError, withRetry } from './provider.js';
import { MockProvider } from './mock.js';

const Schema = z.object({ verdict: z.enum(['pass', 'fail']) });

describe('withRetry', () => {
  it('returns parsed output on first valid response', async () => {
    await expect(withRetry(Schema, async () => '{"verdict":"pass"}')).resolves.toEqual({
      verdict: 'pass',
    });
  });

  it('retries once after invalid output', async () => {
    const outputs = ['not json', '{"verdict":"fail"}'];
    await expect(withRetry(Schema, async () => outputs.shift())).resolves.toEqual({
      verdict: 'fail',
    });
  });

  it('throws AiOutputError after two invalid outputs', async () => {
    await expect(withRetry(Schema, async () => '{"verdict":"maybe"}')).rejects.toBeInstanceOf(
      AiOutputError,
    );
  });
});

describe('MockProvider', () => {
  it('validates canned responses against the schema', async () => {
    const ai = new MockProvider({ 'Check submission': { verdict: 'pass' } });
    await expect(
      ai.complete({ schema: Schema, system: 'Check submission rules', prompt: '' }),
    ).resolves.toEqual({ verdict: 'pass' });
  });
});
