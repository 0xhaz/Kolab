import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/expo';
import type { CampaignDetailDto, CampaignDto, MyEnrollmentDto, SlotDto } from '@kolab/shared';
import { useApi } from './api';

export const keys = {
  campaigns: ['campaigns'] as const,
  campaign: (id: string) => ['campaign', id] as const,
  enrollments: ['enrollments'] as const,
};

export function useCampaigns() {
  const api = useApi();
  const { user } = usePrivy();
  return useQuery({ queryKey: keys.campaigns, queryFn: () => api<CampaignDto[]>('/campaigns'), enabled: !!user });
}

export function useCampaign(id: string) {
  const api = useApi();
  return useQuery({ queryKey: keys.campaign(id), queryFn: () => api<CampaignDetailDto>(`/campaigns/${id}`) });
}

export function useMyEnrollments() {
  const api = useApi();
  const { user } = usePrivy();
  return useQuery({
    queryKey: keys.enrollments,
    queryFn: () => api<MyEnrollmentDto[]>('/me/enrollments'),
    enabled: !!user,
  });
}

/** Finds a slot (and its enrollment) inside the cached enrollments list. */
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
