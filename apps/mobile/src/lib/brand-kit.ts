import { useQuery } from '@tanstack/react-query';
import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import type { BrandKitDto } from '@kolab/shared';
import { useApi } from './api';
import { env } from './env';

/** Kit links are absolute (Cloudinary) or API paths (local storage). */
export const absUrl = (url: string) => (url.startsWith('http') ? url : `${env.apiUrl}${url}`);

/** The brand kit unlocks after joining; the API answers 403 `kit_locked` otherwise. */
export function useBrandKit(campaignId: string | undefined, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: ['kit', campaignId],
    queryFn: () => api<BrandKitDto>(`/campaigns/${campaignId}/kit`),
    enabled: enabled && !!campaignId,
    staleTime: 5 * 60_000, // signed links last 10 minutes
  });
}

async function ensurePhotosPermission() {
  const perm = await requestPermissionsAsync(true);
  if (!perm.granted) throw new Error('Allow Kolab to add to your Photos in Settings');
}

/** Saves a local file (e.g. a captured template) to the photo library. */
export async function saveLocalToPhotos(localUri: string) {
  await ensurePhotosPermission();
  await Asset.create(localUri);
}

/** Downloads a brand-kit asset and saves it to the photo library. */
export async function saveRemoteToPhotos(url: string) {
  await ensurePhotosPermission();
  const dir = new Directory(Paths.cache, 'kolab-kit');
  if (!dir.exists) dir.create();
  const file = await File.downloadFileAsync(absUrl(url), dir, { idempotent: true });
  await Asset.create(file.uri);
}
