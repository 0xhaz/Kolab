import { z } from 'zod';

/** Fixed list so brands can filter; creators pick up to 5. */
export const NICHES = [
  'Skincare',
  'Makeup',
  'Fashion',
  'Food',
  'Fitness',
  'Parenting',
  'Tech',
  'Gaming',
  'Travel',
  'Home',
  'Pets',
  'Finance',
  'Health',
  'Education',
  'Lifestyle',
] as const;
export const NicheSchema = z.enum(NICHES);

export const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'facebook', 'x'] as const;
export const PlatformSchema = z.enum(PLATFORMS);
export type Platform = z.infer<typeof PlatformSchema>;
export const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  x: 'X',
};

export const ChannelSchema = z.object({
  platform: PlatformSchema,
  handle: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((h) => h.replace(/^@/, '')),
  followers: z.number().int().min(0).max(500_000_000),
});
export type Channel = z.infer<typeof ChannelSchema>;

export const UpdateProfileSchema = z.object({
  bio: z.string().trim().max(280).default(''),
  country: z.enum(['MY', 'ID', 'PH', 'TH']).optional(),
  niches: z.array(NicheSchema).max(5).default([]),
  channels: z.array(ChannelSchema).max(5).default([]),
});
export type UpdateProfile = z.input<typeof UpdateProfileSchema>;

/** A sample of the creator's work: an uploaded photo/video or a link to a public post. */
export const AddSampleSchema = z.union([
  z.object({ uploadId: z.uuid(), caption: z.string().trim().max(120).optional() }),
  z.object({ url: z.url().startsWith('https://').max(500), caption: z.string().trim().max(120).optional() }),
]);
export type AddSample = z.infer<typeof AddSampleSchema>;

export interface SampleDto {
  id: string;
  kind: 'image' | 'video' | 'link';
  /** Image/video: a signed link (absolute, or an API path); link: the post URL. */
  url: string;
  caption: string | null;
}

export interface ChannelDto extends Channel {
  /** Self-declared until we pull platform insights. */
  source: 'self' | 'platform';
}

/** On-chain track record across all of Kolab (released / missed / removed early). */
export interface CreatorTrackRecord {
  campaigns: number;
  delivered: number;
  missed: number;
  removed: number;
  onTimeRate: number | null;
  earned: string;
}

export interface CreatorProfileDto {
  userId: string;
  displayName: string | null;
  bio: string;
  country: string | null;
  niches: string[];
  channels: ChannelDto[];
  totalFollowers: number;
  samples: SampleDto[];
  record: CreatorTrackRecord;
  /** What a brand needs before deciding: at least one niche, one channel and one sample. */
  complete: boolean;
}

export const ApplySchema = z.object({ pitch: z.string().trim().min(10).max(500) });
export type Apply = z.infer<typeof ApplySchema>;

export type ApplicationStatus = 'pending' | 'accepted' | 'declined';

export interface ApplicationDto {
  id: string;
  campaignId: string;
  status: ApplicationStatus;
  pitch: string;
  createdAt: string;
  decidedAt: string | null;
  /** Brand view only. */
  creator?: CreatorProfileDto;
}

/** What creators see about a brand before applying, from on-chain outcomes of its campaigns. */
export interface BrandReputationDto {
  campaigns: number;
  creatorsPaid: number;
  paidOut: string;
  /** Submitted slots the brand decided before the review window ended (vs. auto-released). */
  decidedInTimeRate: number | null;
  avgDecisionHours: number | null;
  rejectionRate: number | null;
  refundedForMissed: number;
}
