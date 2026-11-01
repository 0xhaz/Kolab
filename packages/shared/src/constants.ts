export const USDC_DECIMALS = 6;

/** Platform fee on released amounts only, in basis points (architecture §1.2). */
export const DEFAULT_FEE_BPS = 500;
/** Share of each slot held back until the still-live check (architecture §4.1). */
export const DEFAULT_HOLDBACK_BPS = 3000;

export const DEFAULT_REVIEW_WINDOW_SECS = 72 * 60 * 60;
export const DEFAULT_GRACE_SECS = 48 * 60 * 60;
export const SHIPPING_WINDOW_DOMESTIC_SECS = 14 * 24 * 60 * 60;
export const SHIPPING_WINDOW_CROSS_BORDER_SECS = 21 * 24 * 60 * 60;

export const MARKETS = ['MY', 'ID', 'PH', 'TH'] as const;
export type Market = (typeof MARKETS)[number];

export const DISPLAY_CURRENCIES = ['MYR', 'IDR'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
