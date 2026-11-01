import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // The dashboard is client-rendered behind a Privy login, so instant-navigation prerender
    // validation can't apply to it; only validate segments that opt in with `export const instant`.
    instantInsights: { validationLevel: 'manual-warning' },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
