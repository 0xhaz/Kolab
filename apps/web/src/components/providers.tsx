'use client';

import { useState, type ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { colors } from '@kolab/ui';
import { env } from '@/lib/env';
import { RealtimeProvider } from '@/lib/realtime';

const wsOf = (url: string) => url.replace(/^http/, 'ws');

/** Privy needs an RPC per chain it signs for; without it, signing throws "No RPC configuration found". */
const solanaRpcs = {
  'solana:devnet': {
    rpc: createSolanaRpc(env.rpcUrl),
    rpcSubscriptions: createSolanaRpcSubscriptions(wsOf(env.rpcUrl)),
    blockExplorerUrl: 'https://explorer.solana.com?cluster=devnet',
  },
  'solana:mainnet': {
    rpc: createSolanaRpc('https://api.mainnet-beta.solana.com'),
    rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com'),
    blockExplorerUrl: 'https://explorer.solana.com',
  },
};

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <PrivyProvider
      appId={env.privyAppId}
      config={{
        loginMethods: ['email'],
        appearance: {
          theme: 'dark',
          accentColor: colors.dark.primary,
          walletChainType: 'solana-only',
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'off' },
          solana: { createOnLogin: 'users-without-wallets' },
        },
        solana: { rpcs: solanaRpcs },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>{children}</RealtimeProvider>
        <Toaster theme="dark" position="top-center" />
      </QueryClientProvider>
    </PrivyProvider>
  );
}
