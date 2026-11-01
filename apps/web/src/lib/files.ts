'use client';

import { api } from './api';
import { env } from './env';

/** Opens a delivered UGC file in a new tab via a short-lived signed link. */
export async function openUpload(uploadId: string) {
  const tab = window.open('', '_blank');
  const { url } = await api<{ url: string }>(`/uploads/${uploadId}/link`);
  const full = url.startsWith('http') ? url : `${env.apiUrl}${url}`;
  if (tab) tab.location.href = full;
  else window.open(full, '_blank');
}
