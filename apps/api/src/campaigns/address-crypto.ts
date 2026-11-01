import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Shipping addresses at rest: AES-256-GCM, layout iv(12) | tag(16) | ciphertext. The enrollment ID
 * is bound as associated data, so a sealed address can't be copied onto another enrollment.
 */
export function sealAddress(plain: string, keyHex: string, enrollmentId: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  cipher.setAAD(Buffer.from(enrollmentId));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

export function openAddress(sealed: Uint8Array, keyHex: string, enrollmentId: string): string {
  const buf = Buffer.from(sealed);
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), buf.subarray(0, 12));
  decipher.setAAD(Buffer.from(enrollmentId));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
