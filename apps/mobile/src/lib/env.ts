// EXPO_PUBLIC_* values are bundled into the app: never put secrets here.
export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
  wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? 'http://localhost:4000',
  rpcUrl: process.env.EXPO_PUBLIC_RPC_URL ?? 'https://api.devnet.solana.com',
  privyAppId: process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',
  privyClientId: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? '',
  /** App Store / Play builds: hides features that need per-country licensing (see `features`). */
  storeBuild: process.env.EXPO_PUBLIC_STORE_BUILD === '1',
};

/**
 * Store builds leave out cross-chain cash-out (a swap counts as exchange functionality under App
 * Store 3.1.5(iii) / Play's crypto policy and needs licensing per country). Creators can still
 * withdraw USDC to their own Solana address, which is plain wallet functionality.
 */
export const features = {
  crossChainCashout: !env.storeBuild,
};
