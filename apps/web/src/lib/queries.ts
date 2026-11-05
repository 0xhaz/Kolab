'use client';

import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import type { ApplicationDto, AuroraMode, CampaignDto, FUNDING_SOURCES, FundingDto, SlotDto } from '@kolab/shared';
import { api } from './api';

export const keys = {
  campaigns: ['campaigns'] as const,
  campaign: (id: string) => ['campaign', id] as const,
  review: ['review'] as const,
  creators: ['creators'] as const,
  balance: ['balance'] as const,
  clock: ['clock'] as const,
  applications: (id: string) => ['applications', id] as const,
  fundings: (id: string) => ['fundings', id] as const,
  funding: (id: string) => ['funding', id] as const,
};

export interface Person {
  id: string;
  displayName: string | null;
  email: string | null;
  walletPubkey: string | null;
}

export interface BrandSlot extends SlotDto {
  submissions: { url: string | null; fileKey: string | null; submittedAt: string }[];
}

export interface BrandEnrollment {
  id: string;
  onchainPubkey: string | null;
  status: 'awaiting_shipment' | 'in_transit' | 'active' | 'not_received' | 'cancelled' | 'completed';
  voucherCode: string | null;
  trackingRef: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  salesAccrued: string;
  earnedTotal: string;
  hasAddress: boolean;
  creator: Person;
  slots: BrandSlot[];
}

export interface CampaignDetail extends CampaignDto {
  enrollments: BrandEnrollment[];
}

export interface ReviewItem {
  slot: SlotDto;
  campaign: { id: string; title: string };
  creator: Person;
  submission: {
    url: string | null;
    fileKey: string | null;
    submittedAt: string;
    checkResults: { checkType: string; passed: boolean; detailsJson: { detail?: string } | null; attestedTx: string | null }[];
  } | null;
  reviewEndsAt: string | null;
}

export interface CreatorRow {
  creator: Person;
  campaigns: number;
  earnedWithBrand: string;
  delivered: number;
  missed: number;
  deleted: number;
  onTimeRate: number | null;
}

export function useAuthed() {
  const { ready, authenticated } = usePrivy();
  return ready && authenticated;
}

export const useCampaigns = () =>
  useQuery({ queryKey: keys.campaigns, queryFn: () => api<CampaignDto[]>('/campaigns'), enabled: useAuthed() });

export const useCampaign = (id: string) =>
  useQuery({ queryKey: keys.campaign(id), queryFn: () => api<CampaignDetail>(`/campaigns/${id}`), enabled: useAuthed() });

/** `enabled: false` for creators (the review queue is brand-only). */
export const useReview = (enabled = true) =>
  useQuery({ queryKey: keys.review, queryFn: () => api<ReviewItem[]>('/review'), enabled: useAuthed() && enabled, refetchInterval: 15_000 });

export const useCreators = () =>
  useQuery({ queryKey: keys.creators, queryFn: () => api<CreatorRow[]>('/creators'), enabled: useAuthed() });

export const useBalance = () =>
  useQuery({ queryKey: keys.balance, queryFn: () => api<{ usdc: string; mint: string }>('/tx/balance'), enabled: useAuthed() });

export const useApplications = (campaignId: string) =>
  useQuery({
    queryKey: keys.applications(campaignId),
    queryFn: () => api<ApplicationDto[]>(`/campaigns/${campaignId}/applications`),
    enabled: useAuthed(),
  });

export interface FundingConfig {
  mode: AuroraMode;
  appFeeBps: number;
  simulateDeposits: boolean;
  /** Hybrid only: largest single flow (real money moves through Kolab's mainnet relay). */
  maxUsdc?: number;
  relay?: { address: string; usdc: number | null; sol: number | null };
  sources: typeof FUNDING_SOURCES;
}

export const useFundingConfig = () =>
  useQuery({ queryKey: ['funding-config'], queryFn: () => api<FundingConfig>('/funding/config'), enabled: useAuthed(), staleTime: 5 * 60_000 });

export const useFundings = (campaignId: string) =>
  useQuery({ queryKey: keys.fundings(campaignId), queryFn: () => api<FundingDto[]>(`/campaigns/${campaignId}/funding`), enabled: useAuthed() });

const TERMINAL = ['completed', 'failed', 'refunded', 'expired'];

/** One funding intent, polled while it is in flight (realtime events also refresh it). */
export const useFunding = (id: string | null) =>
  useQuery({
    queryKey: keys.funding(id ?? ''),
    queryFn: () => api<FundingDto>(`/funding/${id}`),
    enabled: useAuthed() && !!id,
    refetchInterval: (q) => (q.state.data && TERMINAL.includes(q.state.data.status) ? false : 3000),
  });
