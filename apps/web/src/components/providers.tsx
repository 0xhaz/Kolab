'use client';

import { useState, type ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { colors } from '@kolab/ui';
import { env } from '@/lib/env';
import { RealtimeProvider } from '@/lib/realtime';

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
      }}
    >
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>{children}</RealtimeProvider>
        <Toaster theme="dark" position="top-center" />
      </QueryClientProvider>
    </PrivyProvider>
  );
}
