import { describe, expect, it } from 'vitest';
import { DeleteAccountSchema, WithdrawSchema } from '@kolab/shared';

describe('account schemas', () => {
  it('only deletes with the typed confirmation', () => {
    expect(DeleteAccountSchema.safeParse({ confirm: 'DELETE' }).success).toBe(true);
    expect(DeleteAccountSchema.safeParse({ confirm: 'delete' }).success).toBe(false);
    expect(DeleteAccountSchema.safeParse({}).success).toBe(false);
  });

  it('withdraws only to Solana addresses', () => {
    expect(WithdrawSchema.safeParse({ to: '5JeZ2i6VAPZDpdnwu6GgpXjrXYhodQibSrh6QwmXTQxD', amountUsdc: 5 }).success).toBe(true);
    expect(WithdrawSchema.safeParse({ to: '0x52908400098527886E0F7030069857D2E4169EE7', amountUsdc: 5 }).success).toBe(false);
    expect(WithdrawSchema.safeParse({ to: '5JeZ2i6VAPZDpdnwu6GgpXjrXYhodQibSrh6QwmXTQxD', amountUsdc: 0 }).success).toBe(false);
  });
});
