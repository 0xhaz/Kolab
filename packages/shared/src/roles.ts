import { z } from 'zod';

export const RoleSchema = z.enum(['brand', 'creator', 'admin']);
export type Role = z.infer<typeof RoleSchema>;
