import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { withRetry, type AiProvider, type CompleteRequest } from './provider.js';

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model = 'gemini-flash-latest',
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  complete<T extends z.ZodType>({ schema, system, prompt, media }: CompleteRequest<T>) {
    const contents = media
      ? [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType: media.mimeType, data: Buffer.from(media.data).toString('base64') } }, { text: prompt }],
          },
        ]
      : prompt;
    return withRetry(schema, async () => {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(schema),
        },
      });
      return res.text;
    });
  }
}
