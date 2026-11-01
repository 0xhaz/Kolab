'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddSample, ApplicationDto, BrandKitDto, CampaignDto, CreatorProfileDto, Me, UpdateProfile } from '@kolab/shared';
import { api } from '@/lib/api';
import { creatorKeys } from '@/lib/creator';
import { useAuthed } from '@/lib/queries';
import { usdc } from '@/lib/format';

/** What the creator earns, in one line (mirrors mobile `payout()`). */
export function payout(camp: CampaignDto): { amount: string; detail: string; total: bigint } {
  if (camp.type === 'per_sale') return { amount: usdc(camp.perSaleAmount, 0), detail: 'per confirmed sale', total: BigInt(camp.perSaleAmount) };
  const total = camp.slots.reduce((sum, sl) => sum + BigInt(sl.amount), 0n);
  const weeks = Math.max(1, Math.round(Math.max(0, ...camp.slots.map((sl) => sl.dueOffsetSecs)) / 604_800));
  const kind = camp.slots.every((sl) => sl.kind === 'ugc') ? 'video' : 'post';
  return {
    amount: usdc(total, 0),
    detail: `${camp.slots.length} ${kind}${camp.slots.length === 1 ? '' : 's'} · ${weeks} week${weeks === 1 ? '' : 's'}`,
    total,
  };
}

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

/** "siti.reviews@gmail.com" → "Siti" */
export function firstName(displayName: string | null | undefined, email: string | null | undefined): string {
  const raw = displayName ?? email?.split('@')[0] ?? 'there';
  const first = raw.split(/[\s._-]+/)[0] ?? raw;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfile) => api<CreatorProfileDto>('/me/profile', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (p) => qc.setQueryData(creatorKeys.profile, p),
  });
}

export function useAddSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddSample) => api<CreatorProfileDto>('/me/samples', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (p) => qc.setQueryData(creatorKeys.profile, p),
  });
}

export function useRemoveSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<CreatorProfileDto>(`/me/samples/${id}`, { method: 'DELETE' }),
    onSuccess: (p) => qc.setQueryData(creatorKeys.profile, p),
  });
}

/** Display name lives on the account (PATCH /me), not the creator profile. */
export function useRename() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => api<Me>('/me', { method: 'PATCH', body: JSON.stringify({ displayName }) }),
    onSuccess: (me) => {
      qc.setQueryData(['me'], me);
      void qc.invalidateQueries({ queryKey: creatorKeys.profile });
    },
  });
}

export function useApply(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pitch: string) => api<ApplicationDto>(`/campaigns/${campaignId}/apply`, { method: 'POST', body: JSON.stringify({ pitch }) }),
    onSuccess: (a) => {
      qc.setQueryData(creatorKeys.application(campaignId), a);
      void qc.invalidateQueries({ queryKey: creatorKeys.campaign(campaignId) });
    },
  });
}

/** Brand kit assets; the API only serves them to creators who joined (403 kit_locked otherwise). */
export const useBrandKit = (campaignId: string, enabled: boolean) =>
  useQuery({
    queryKey: ['creator', 'kit', campaignId] as const,
    queryFn: () => api<BrandKitDto>(`/campaigns/${campaignId}/kit`),
    enabled: useAuthed() && enabled && !!campaignId,
    staleTime: 5 * 60_000,
  });
