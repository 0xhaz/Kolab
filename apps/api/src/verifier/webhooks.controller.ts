import { Body, Controller, Headers, HttpCode, Inject, Post, Req, UnauthorizedException, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../auth/public.decorator.js';
import { ENV, type Env } from '../config/env.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { VerifierService } from './verifier.service.js';
import { verifyWebhookSignature } from './webhook-signature.js';

const StoreSaleSchema = z.object({
  orderRef: z.string().min(1).max(64),
  voucher: z.string().min(1).max(32),
  amount: z.number().nonnegative().optional(),
});

@Controller('webhooks')
export class WebhooksController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly verifier: VerifierService,
  ) {}

  /** Store → verifier → record_sale (architecture §6.3). Authenticated by HMAC, not a user token. */
  @Public()
  @Post('store-sales')
  @HttpCode(200)
  async storeSale(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-kolab-signature') signature: string | undefined,
    @Body(new ZodPipe(StoreSaleSchema)) body: z.infer<typeof StoreSaleSchema>,
  ) {
    if (!req.rawBody || !verifyWebhookSignature(signature, req.rawBody, this.env.STORE_WEBHOOK_SECRET)) {
      throw new UnauthorizedException({ code: 'bad_signature' });
    }
    return this.verifier.recordSale(body.orderRef, body.voucher);
  }
}
