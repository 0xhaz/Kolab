import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { usePrivy } from '@privy-io/expo';
import { ApiError } from './api';
import { env } from './env';

export interface PickedVideo {
  uri: string;
  name: string;
  mime: string;
  size: number;
  duration: number | null;
}

export async function pickVideo(): Promise<PickedVideo | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1, allowsEditing: false });
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  return {
    uri: a.uri,
    name: a.fileName ?? 'ugc.mp4',
    mime: a.mimeType ?? 'video/mp4',
    size: a.fileSize ?? 0,
    duration: a.duration ? a.duration / 1000 : null,
  };
}

/** SHA-256 of the file as hex: this exact value is recorded on-chain for the slot. */
export async function sha256Hex(uri: string): Promise<string> {
  const buf = await new File(uri).arrayBuffer();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Uploads a UGC file; the API re-hashes it and refuses a mismatch. */
export function useUploadUgc() {
  const { getAccessToken } = usePrivy();
  return useCallback(
    async (video: PickedVideo): Promise<{ uploadId: string; sha256: string }> => {
      const hash = await sha256Hex(video.uri);
      const form = new FormData();
      form.append('file', { uri: video.uri, name: video.name, type: video.mime } as unknown as Blob);
      const token = await getAccessToken();
      const res = await fetch(`${env.apiUrl}/uploads`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-content-sha256': hash },
        body: form,
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) throw new ApiError(res.status, body);
      return body as { uploadId: string; sha256: string };
    },
    [getAccessToken],
  );
}
