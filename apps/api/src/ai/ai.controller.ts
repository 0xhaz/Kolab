import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { User } from '../generated/prisma/client.js';
import { AiService } from './ai.service.js';

const BriefRequestSchema = z.object({
  productText: z.string().min(3).max(4000),
  productUrl: z.url().max(500).optional(),
  budgetUsdc: z.number().positive().max(1_000_000),
  markets: z.array(z.enum(['MY', 'ID', 'PH', 'TH'])).default(['MY']),
  goal: z.enum(['awareness', 'sales', 'ugc']).optional(),
  /** Redraft for a structure the brand set by hand: only the title and brief are rewritten. */
  setup: z
    .object({
      campaignType: z.enum(['per_post', 'monthly', 'per_sale', 'ugc']),
      slots: z.array(z.object({ kind: z.enum(['post', 'ugc']), amountUsdc: z.number().positive(), dueDays: z.number().positive() })).max(8),
      perSaleUsdc: z.number().nonnegative(),
      maxCreators: z.number().int().min(1).max(50),
    })
    .optional(),
});

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('brief')
  brief(@CurrentUser() user: User, @Body(new ZodPipe(BriefRequestSchema)) body: z.infer<typeof BriefRequestSchema>) {
    if (user.role !== 'brand') throw new ForbiddenException({ code: 'brand_only' });
    return this.ai.brief(body);
  }
}
