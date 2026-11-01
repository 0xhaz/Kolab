import { z } from 'zod';
import { RoleSchema } from './roles.js';

export const MeSchema = z.object({
  id: z.string(),
  /** null until the user picks brand or creator; set once. */
  role: RoleSchema.nullable(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  walletPubkey: z.string().nullable(),
  locale: z.string(),
});
export type Me = z.infer<typeof MeSchema>;

export const UpdateMeSchema = z.object({
  role: z.enum(['brand', 'creator']).optional(),
  displayName: z.string().min(1).max(80).optional(),
  locale: z.enum(['en', 'ms', 'id']).optional(),
});
export type UpdateMe = z.infer<typeof UpdateMeSchema>;
