import { z } from 'zod';

export interface CompleteRequest<T extends z.ZodType> {
  schema: T;
  system: string;
  prompt: string;
  /** Optional inline media (e.g. audio for transcription), sent before the prompt. */
  media?: { mimeType: string; data: Uint8Array };
}

/** One structured-output call. Implementations must return data that already passed `schema`. */
export interface AiProvider {
  readonly name: string;
  complete<T extends z.ZodType>(req: CompleteRequest<T>): Promise<z.infer<T>>;
}

export class AiOutputError extends Error {
  constructor(
    message: string,
    public readonly raw: string | undefined,
  ) {
    super(message);
  }
}

/** Parses + validates model output; one retry, then the caller marks it "needs manual review". */
export async function withRetry<T extends z.ZodType>(
  schema: T,
  call: () => Promise<string | undefined>,
): Promise<z.infer<T>> {
  let lastRaw: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    lastRaw = await call();
    if (!lastRaw) continue;
    try {
      const parsed = schema.safeParse(JSON.parse(lastRaw));
      if (parsed.success) return parsed.data;
    } catch {
      // invalid JSON: retry
    }
  }
  throw new AiOutputError('Model output did not match schema after retry', lastRaw);
}
