'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  ApplicationDto,
  BrandReputationDto,
  CampaignDetailDto,
  CampaignDto,
  CashoutDto,
  CreatorProfileDto,
  MyEnrollmentDto,
  SlotDto,
} from '@kolab/shared';
import { api } from './api';
import { useAuthed } from './queries';

/** Query keys for the creator side of the dashboard (mirrors the mobile app's data). */
export const creatorKeys = {
  campaigns: ['creator', 'campaigns'] as const,
  campaign: (id: string) => ['creator', 'campaign', id] as const,
  enrollments: ['creator', 'enrollments'] as const,
  profile: ['creator', 'profile'] as const,
  application: (campaignId: string) => ['creator', 'application', campaignId] as const,
  reputation: (campaignId: string) => ['creator', 'reputation', campaignId] as const,
  cashouts: ['creator', 'cashouts'] as const,
};

/** Live campaigns plus the ones this creator joined. */
export const useCreatorCampaigns = () =>
  useQuery({ queryKey: creatorKeys.campaigns, queryFn: () => api<CampaignDto[]>('/campaigns'), enabled: useAuthed() });

export const useCreatorCampaign = (id: string) =>
  useQuery({ queryKey: creatorKeys.campaign(id), queryFn: () => api<CampaignDetailDto>(`/campaigns/${id}`), enabled: useAuthed() && !!id });

export const useMyEnrollments = () =>
  useQuery({ queryKey: creatorKeys.enrollments, queryFn: () => api<MyEnrollmentDto[]>('/me/enrollments'), enabled: useAuthed() });

/** A slot and its enrollment, from the cached enrollments list. */
export function useSlot(slotId: string) {
  const q = useMyEnrollments();
  for (const e of q.data ?? []) {
    const slot = e.slots.find((s) => s.id === slotId);
    if (slot) return { ...q, slot, enrollment: e };
  }
  return { ...q, slot: undefined as SlotDto | undefined, enrollment: undefined as MyEnrollmentDto | undefined };
}

export function useEnrollment(id: string) {
  const q = useMyEnrollments();
  return { ...q, enrollment: q.data?.find((e) => e.id === id) };
}

export const useMyProfile = () =>
  useQuery({ queryKey: creatorKeys.profile, queryFn: () => api<CreatorProfileDto>('/me/profile'), enabled: useAuthed() });

export const useMyApplication = (campaignId: string) =>
  useQuery({
    queryKey: creatorKeys.application(campaignId),
    queryFn: () => api<ApplicationDto | null>(`/campaigns/${campaignId}/application`),
    enabled: useAuthed() && !!campaignId,
  });

export const useBrandReputation = (campaignId: string) =>
  useQuery({
    queryKey: creatorKeys.reputation(campaignId),
    queryFn: () => api<BrandReputationDto>(`/campaigns/${campaignId}/brand-reputation`),
    enabled: useAuthed() && !!campaignId,
  });

export const useCashouts = () =>
  useQuery({ queryKey: creatorKeys.cashouts, queryFn: () => api<CashoutDto[]>('/cashouts'), enabled: useAuthed() });
