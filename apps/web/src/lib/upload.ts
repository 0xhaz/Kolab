'use client';

import { getAccessToken } from '@privy-io/react-auth';
import { ApiError } from './api';
import { env } from './env';

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Uploads an image for the brand kit; the API re-hashes it and refuses a mismatch. */
export async function uploadFile(file: File): Promise<{ uploadId: string }> {
  const form = new FormData();
  form.append('file', file);
  const token = await getAccessToken();
  const res = await fetch(`${env.apiUrl}/uploads`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-content-sha256': await sha256Hex(file) },
    body: form,
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as { uploadId: string };
}

/** Kit links are absolute (Cloudinary) or API paths (local storage). */
export const assetUrl = (url: string) => (url.startsWith('http') ? url : `${env.apiUrl}${url}`);
