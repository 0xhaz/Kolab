import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/expo';
import * as ImagePicker from 'expo-image-picker';
import type { AddSample, ApplicationDto, BrandReputationDto, CreatorProfileDto, UpdateProfile } from '@kolab/shared';
import { useApi } from './api';
import { keys } from './queries';
import { useUploadUgc, type PickedVideo } from './ugc';

export const profileKeys = {
  profile: ['me', 'profile'] as const,
  application: (campaignId: string) => ['application', campaignId] as const,
  reputation: (campaignId: string) => ['brand-reputation', campaignId] as const,
};

/** 12400 → "12.4K", 1_250_000 → "1.3M". */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  const [v, unit] = n < 1_000_000 ? [n / 1000, 'K'] : [n / 1_000_000, 'M'];
  return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}${unit}`;
}

/** What a brand still needs to see, in the order we ask for it. */
export function missingSteps(p: CreatorProfileDto | undefined): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (p.niches.length === 0) out.push('pick a niche');
  if (p.channels.length === 0) out.push('add a channel');
  if (p.samples.length === 0) out.push('add a sample');
  return out;
}

export function useMyProfile() {
  const api = useApi();
  const { user } = usePrivy();
  return useQuery({ queryKey: profileKeys.profile, queryFn: () => api<CreatorProfileDto>('/me/profile'), enabled: !!user });
}

export function useUpdateProfile() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfile) => api<CreatorProfileDto>('/me/profile', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (p) => qc.setQueryData(profileKeys.profile, p),
  });
}

export function useAddSample() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddSample) => api<CreatorProfileDto>('/me/samples', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (p) => qc.setQueryData(profileKeys.profile, p),
  });
}

export function useRemoveSample() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<CreatorProfileDto>(`/me/samples/${id}`, { method: 'DELETE' }),
    onSuccess: (p) => qc.setQueryData(profileKeys.profile, p),
  });
}

/** Picks a photo or video from the library and uploads it (same hashed upload as UGC). */
export function usePickAndUploadSample() {
  const upload = useUploadUgc();
  return useCallback(async (): Promise<string | null> => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.9, allowsEditing: false });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return null;
    const isVideo = a.type === 'video';
    const file: PickedVideo = {
      uri: a.uri,
      name: a.fileName ?? (isVideo ? 'sample.mp4' : 'sample.jpg'),
      mime: a.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      size: a.fileSize ?? 0,
      duration: a.duration ? a.duration / 1000 : null,
    };
    const { uploadId } = await upload(file);
    return uploadId;
  }, [upload]);
}

/** null until the creator applies to this (selective) campaign. */
export function useMyApplication(campaignId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: profileKeys.application(campaignId),
    queryFn: () => api<ApplicationDto | null>(`/campaigns/${campaignId}/application`).then((a) => a ?? null),
    enabled: enabled && !!campaignId,
  });
}

export function useApply(campaignId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pitch: string) => api<ApplicationDto>(`/campaigns/${campaignId}/apply`, { method: 'POST', body: JSON.stringify({ pitch }) }),
    onSuccess: (a) => {
      qc.setQueryData(profileKeys.application(campaignId), a);
      void qc.invalidateQueries({ queryKey: keys.campaign(campaignId) });
    },
  });
}

export function useBrandReputation(campaignId: string) {
  const api = useApi();
  return useQuery({
    queryKey: profileKeys.reputation(campaignId),
    queryFn: () => api<BrandReputationDto>(`/campaigns/${campaignId}/brand-reputation`),
    enabled: !!campaignId,
    staleTime: 5 * 60_000,
  });
}
