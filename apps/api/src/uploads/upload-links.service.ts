import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ENV, type Env } from '../config/env.js';
import type { Upload } from '../generated/prisma/client.js';
import { StorageService } from './storage.service.js';

const TTL_SECS = 600;

/** Short-lived links for files a client can't fetch with an auth header (img/video tags, downloads). */
@Injectable()
export class UploadLinksService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly storage: StorageService,
  ) {}

  sign(id: string, exp: number) {
    return createHmac('sha256', Buffer.from(this.env.ADDRESS_ENC_KEY, 'hex')).update(`upload:${id}:${exp}`).digest('hex');
  }

  verify(id: string, exp: number, sig: string) {
    const expected = Buffer.from(this.sign(id, exp), 'hex');
    const given = Buffer.from(sig ?? '', 'hex');
    return Number.isFinite(exp) && exp >= Date.now() / 1000 && given.length === expected.length && timingSafeEqual(given, expected);
  }

  /** Cloudinary signed URL, or an API path (`/uploads/:id/raw?…`) for local storage. */
  link(up: Pick<Upload, 'id' | 'storage' | 'storageKey'>): string {
    if (up.storage === 'cloudinary') {
      const access = this.storage.access({ storage: 'cloudinary', storageKey: up.storageKey });
      if (access.kind === 'redirect') return access.url;
    }
    const exp = Math.floor(Date.now() / 1000) + TTL_SECS;
    return `/uploads/${up.id}/raw?exp=${exp}&sig=${this.sign(up.id, exp)}`;
  }
}
