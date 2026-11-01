import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from './webhook-signature.js';

const secret = 'test-secret-0123456789abcdef';
const body = '{"orderRef":"ORD-1","voucher":"KOLAB-ABC123","amount":49.9}';
const sign = (t: number, b = body, s = secret) =>
  `t=${t},v1=${createHmac('sha256', s).update(`${t}.${b}`).digest('hex')}`;

describe('verifyWebhookSignature', () => {
  const now = 1_800_000_000;
  it('accepts a fresh, correctly signed body', () => {
    expect(verifyWebhookSignature(sign(now), body, secret, now)).toBe(true);
  });
  it('rejects a tampered body', () => {
    expect(verifyWebhookSignature(sign(now), body.replace('49.9', '4990'), secret, now)).toBe(false);
  });
  it('rejects the wrong secret', () => {
    expect(verifyWebhookSignature(sign(now, body, 'other-secret-0123456789'), body, secret, now)).toBe(false);
  });
  it('rejects replays outside the 5-minute window', () => {
    expect(verifyWebhookSignature(sign(now - 301), body, secret, now)).toBe(false);
  });
  it('rejects a missing or malformed header', () => {
    expect(verifyWebhookSignature(undefined, body, secret, now)).toBe(false);
    expect(verifyWebhookSignature('garbage', body, secret, now)).toBe(false);
  });
});
