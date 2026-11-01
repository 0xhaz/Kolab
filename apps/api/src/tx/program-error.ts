import { kolabErrorMessage } from '@kolab/sdk';

/** Pulls a Kolab custom error code (6000+) out of a failed send/simulation, if there is one. */
export function extractProgramErrorCode(err: unknown): number | null {
  const seen = new Set<unknown>();
  const parts: string[] = [];
  const walk = (e: unknown) => {
    if (!e || seen.has(e)) return;
    seen.add(e);
    if (e instanceof Error) {
      parts.push(e.message);
      walk((e as { context?: unknown }).context);
      walk(e.cause);
    } else if (typeof e === 'object') {
      try {
        parts.push(JSON.stringify(e, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
      } catch {
        // circular
      }
    } else if (typeof e === 'string' || typeof e === 'number') {
      parts.push(String(e));
    }
  };
  walk(err);
  const text = parts.join(' ');
  const hex = /custom program error: 0x([0-9a-f]+)/i.exec(text);
  if (hex) return parseInt(hex[1]!, 16);
  const dec = /"Custom"\s*:\s*(\d+)/.exec(text);
  return dec ? Number(dec[1]) : null;
}

/** API error body for a failed transaction: friendly text for our program errors. */
export function txErrorBody(err: unknown, code: string) {
  const programCode = extractProgramErrorCode(err);
  const friendly = programCode !== null ? kolabErrorMessage(programCode) : null;
  return {
    code: friendly ? 'program_error' : code,
    programCode: friendly ? programCode : undefined,
    message: friendly ?? (err instanceof Error ? err.message : 'Transaction failed'),
  };
}
