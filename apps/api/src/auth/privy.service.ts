import { Inject, Injectable } from '@nestjs/common';
import { PrivyClient, type User as PrivyUser } from '@privy-io/node';
import { ENV, type Env } from '../config/env.js';

export interface PrivyIdentity {
  privyId: string;
  email: string | null;
  solanaAddress: string | null;
}

@Injectable()
export class PrivyService {
  private readonly client: PrivyClient;

  constructor(@Inject(ENV) env: Env) {
    this.client = new PrivyClient({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET });
  }

  /** Verifies the access token; throws if invalid or expired. */
  async verify(accessToken: string): Promise<string> {
    const claims = await this.client.utils().auth().verifyAccessToken(accessToken);
    return claims.user_id;
  }

  /** Deletes the Privy user, including its embedded wallet's key shares (irreversible). */
  async deleteUser(privyId: string): Promise<void> {
    await this.client.users().delete(privyId);
  }

  async identity(privyId: string): Promise<PrivyIdentity> {
    const user: PrivyUser = await this.client.users()._get(privyId);
    let email: string | null = null;
    let solanaAddress: string | null = null;
    for (const account of user.linked_accounts) {
      if (account.type === 'email') email = account.address;
      if (
        account.type === 'wallet' &&
        'chain_type' in account &&
        account.chain_type === 'solana' &&
        'connector_type' in account &&
        account.connector_type === 'embedded'
      ) {
        solanaAddress = account.address;
      }
    }
    return { privyId, email, solanaAddress };
  }
}
