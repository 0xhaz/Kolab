import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Skips the Privy auth guard for this route. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
