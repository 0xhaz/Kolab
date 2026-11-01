export const env = {
  wsUrl: process.env.NEXT_PUBLIC_WS_URL?.replace(/^ws/, 'http') ?? 'http://localhost:4000',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '',
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? 'https://api.devnet.solana.com',
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === '1',
};
