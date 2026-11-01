import { Inject, Injectable, Logger } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import { ENV, type Env } from '../config/env.js';

export type StoredFile = { storage: 'local' | 'cloudinary'; storageKey: string };
export type FileAccess = { kind: 'redirect'; url: string } | { kind: 'stream'; stream: Readable };

/**
 * UGC file storage. Cloudinary (private "authenticated" assets, short-lived signed URLs) when
 * configured; otherwise local disk for development. Files are keyed by their SHA-256.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly useCloudinary: boolean;
  private readonly dir: string;

  constructor(@Inject(ENV) env: Env) {
    this.useCloudinary = !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
    if (this.useCloudinary) {
      cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
    }
    this.dir = path.resolve(env.UPLOAD_DIR);
    this.logger.log(`UGC storage: ${this.useCloudinary ? 'cloudinary' : `local (${this.dir})`}`);
  }

  async put(sha256: string, bytes: Buffer, mime: string): Promise<StoredFile> {
    if (this.useCloudinary) {
      const res = await new Promise<{ public_id: string; resource_type: string }>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            { resource_type: 'auto', type: 'authenticated', folder: 'kolab/ugc', public_id: sha256, overwrite: false },
            (err, result) => (err || !result ? reject(err ?? new Error('upload failed')) : resolve(result)),
          )
          .end(bytes);
      });
      return { storage: 'cloudinary', storageKey: `${res.resource_type}:${res.public_id}` };
    }
    await mkdir(this.dir, { recursive: true });
    const ext = mime === 'video/webm' ? '.webm' : mime === 'video/quicktime' ? '.mov' : mime.startsWith('video/') ? '.mp4' : mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
    const name = `${sha256}${ext}`;
    await writeFile(path.join(this.dir, name), bytes);
    return { storage: 'local', storageKey: name };
  }

  /** Deletes the stored bytes (callers check no other upload row shares this content-addressed key). */
  async remove(file: StoredFile): Promise<void> {
    if (file.storage === 'cloudinary') {
      const [resourceType, publicId] = file.storageKey.split(':') as [string, string];
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated' });
      return;
    }
    await rm(path.join(this.dir, path.basename(file.storageKey)), { force: true });
  }

  access(file: StoredFile): FileAccess {
    if (file.storage === 'cloudinary') {
      const [resourceType, publicId] = file.storageKey.split(':') as [string, string];
      const url = cloudinary.url(publicId, {
        resource_type: resourceType,
        type: 'authenticated',
        sign_url: true,
        secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 600,
      });
      return { kind: 'redirect', url };
    }
    // storageKey is our own <sha256>.<ext>; basename() keeps it inside the upload dir
    return { kind: 'stream', stream: createReadStream(path.join(this.dir, path.basename(file.storageKey))) };
  }
}
