import { createHmac, timingSafeEqual } from 'node:crypto';

const REPLAY_WINDOW_SECS = 5 * 60;

/**
 * Verifies `x-kolab-signature: t=<unix>,v1=<hex>` where v1 = HMAC-SHA256(secret, "t.rawBody").
 * Rejects bad signatures and anything older/newer than 5 minutes (techstacks §13).
 */
export function verifyWebhookSignature(
  header: string | undefined,
  rawBody: Buffer | string,
  secret: string,
  nowSecs = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=', 2) as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1 || Math.abs(nowSecs - t) > REPLAY_WINDOW_SECS) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody.toString()}`).digest();
  const given = Buffer.from(v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
