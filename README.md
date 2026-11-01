# Kolab

Brands hire Southeast Asian micro-creators and pay them in USDC through an on-chain escrow on Solana.
Docs: [architecture](docs/architecture.md) · [tech stack](docs/techstacks.md) · [workplan](docs/workplan.md).

## Prerequisites
Node 24 (`nvm use`), pnpm 12, Docker, Rust (toolchain pinned in `rust-toolchain.toml`), Solana CLI 4.1.2, Anchor 1.2.1 (`avm use 1.2.1`), Xcode + iOS Simulator.

## Setup
```bash
pnpm install
pnpm db:up                                   # Postgres on localhost:5433
cp apps/api/.env.example apps/api/.env       # fill PRIVY_*, GEMINI_API_KEY, CLOUDINARY_*
cp apps/web/.env.example apps/web/.env.local # fill NEXT_PUBLIC_PRIVY_APP_ID
cp apps/mobile/.env.example apps/mobile/.env # fill EXPO_PUBLIC_PRIVY_APP_ID / _CLIENT_ID
pnpm --filter @kolab/api exec prisma migrate dev
```

## Run
```bash
pnpm dev                                   # shared packages (watch), API :4000, web :3000
pnpm --filter @kolab/mobile ios            # build + install the iOS dev build (first time / native changes)
pnpm --filter @kolab/mobile start          # Metro for the installed dev build
anchor build && cargo test -p kolab        # program + LiteSVM tests
```

## Layout
`apps/api` NestJS · `apps/web` Next.js · `apps/mobile` Expo · `programs/kolab` Anchor ·
`packages/shared` types/schemas · `packages/ui` theme tokens · `packages/ai` Gemini adapter · `packages/config` lint/ts presets.
