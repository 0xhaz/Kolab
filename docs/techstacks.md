# Kolab — Tech Stack & Technical Spec (Draft v0.2)

> Companion to `architecture.md` (product, on-chain design, flows). This file says **what we build it with and how the pieces are wired**.
> Versions: use the latest stable release at scaffold time and pin them in the lockfile / `Anchor.toml`. Items marked **[verify]** need a quick check against current docs during setup.

---

## 1. Overview

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript everywhere off-chain; Rust (Anchor) on-chain |
| Runtime | Node.js LTS |
| Mobile (creator) | Expo dev build, React Native, expo-router |
| Web (brand + demo panel) | Next.js (App Router) |
| Backend | NestJS on Express |
| Database | PostgreSQL + Prisma |
| Jobs | pg-boss (Postgres-backed queue) |
| Realtime | Socket.IO (backend → app + dashboard) + Solana RPC account subscriptions |
| Chain | Solana devnet (primary), local validator (offline fallback) |
| Program | Anchor 1.x |
| Token | SPL Token, USDC devnet / test mint (6 decimals) |
| Wallet | Privy embedded Solana wallets (Expo SDK + React SDK), email OTP login |
| Gas | Backend fee-payer keypair sponsors all user transactions |
| Credentials | Metaplex Bubblegum compressed NFTs (via Umi) |
| AI | Gemini behind provider interface, JSON-schema outputs |
| File storage | Cloudinary |
| Hosting | Vercel (web) + Railway (api, mock, Postgres) |
| Mock services | Small Express app: fake embeds, courier tracking, store sales |
| Payments API (optional) | x402 V2 packages (`@x402/core`, `@x402/svm`, Express middleware) |

---

## 2. Repository layout

```
kolab/
├── apps/
│   ├── mobile/                # Expo app (creator side)
│   ├── web/                   # Next.js (brand dashboard + /demo panel)
│   ├── api/                   # NestJS backend
│   └── mock/                  # mock platform server (embeds, tracking, sales)
├── programs/
│   └── kolab/                 # Anchor program (Rust)
├── packages/
│   ├── sdk/                   # TS client for the program (IDL types, PDA helpers, ix builders)
│   ├── shared/                # shared types, zod schemas, event names, constants
│   ├── ai/                    # prompts, schemas, provider adapter
│   ├── ui/                    # shared theme / design tokens
│   └── config/                # eslint, tsconfig, prettier presets
├── scripts/                   # demo:chain, demo:seed, demo:reset
├── tests/                     # Anchor/LiteSVM program tests
├── docker-compose.yml         # postgres
├── Anchor.toml
├── turbo.json
├── pnpm-workspace.yaml
├── reference/                 # makeUGCads-main UI + backend-pattern reference
└── docs/                      # architecture.md, techstacks.md, workplan.md
```

---

## 3. On-chain program (`programs/kolab`)

### 3.1 Tooling
- Rust stable, Solana CLI (Agave), Anchor CLI via `avm` — versions pinned in `Anchor.toml` / `rust-toolchain.toml`.
- Crates: `anchor-lang`, `anchor-spl` (token, associated_token).
- Cargo features:
  - `demo-clock` — enables `Config.demo_offset` and `set_demo_offset` instruction. **Never** in devnet "release" builds shown as production.
- Two builds:
  - `anchor build -- --features demo-clock` → local / presentation
  - `anchor build` → devnet deployment referenced in README

### 3.2 Accounts (summary — full fields in architecture.md §4.1)
| Account | Seeds | Purpose |
|---|---|---|
| `Config` | `["config"]` | Admin, treasury, verifier, stablecoin allowlist, `demo_offset` (feature-gated) |
| `Campaign` | `["campaign", brand, campaign_id]` | Terms, timings, fee, shipping, totals |
| Vault (ATA) | owned by Campaign PDA | Holds USDC |
| `Enrollment` | `["enroll", campaign, creator]` | Shipping state, sales accrual, earnings |
| `Slot` | `["slot", enrollment, period_index, slot_idx]` | One deliverable |

### 3.3 Instructions
`init_config`, `set_demo_offset`*, `create_campaign`, `fund_campaign`, `enroll_creator`, `mark_shipped`, `confirm_received`, `report_not_received`, `submit_deliverable`, `attest_checks`, `approve`, `reject`, `auto_release`, `mark_missed`, `attest_live`, `record_sale`, `claim_sales`, `request_cancel`, `renew_period`, `close_campaign`.
(*demo-clock only)

### 3.4 Program rules
- Time: `fn now() = Clock::get()?.unix_timestamp + config.demo_offset` (offset is 0 / absent without the feature).
- Fee: on every release, `fee = amount * fee_bps / 10_000` to treasury; creator receives `amount - fee`. Refunds carry no fee.
- Permissionless: `auto_release`, `mark_missed`, `confirm_received` (after window).
- Verifier-only: `attest_checks`, `attest_live`, `record_sale` (signer must equal `config.verifier`).
- `record_sale` is idempotent: order ref hash stored in a small `SaleReceipt` PDA `["sale", enrollment, ref_hash]`.
- Mint must be on the allowlist; reject Token-2022 mints with transfer fee / hook extensions.
- Checked arithmetic everywhere; custom error codes per failure (`ReviewWindowOpen`, `SlotNotDue`, `NotVerifier`, …).
- Events (`emit!`): `CampaignFunded`, `CreatorEnrolled`, `Shipped`, `Received`, `Submitted`, `Released`, `HoldbackReleased`, `Missed`, `SaleRecorded`, `Refunded` — consumed by the indexer.

### 3.5 Testing
- **LiteSVM** (TypeScript) for fast tests with clock manipulation; one suite per slot path:
  approve, auto-release, reject→resubmit, missed, holdback kept, holdback forfeited, not-received refund, per-sale idempotency, fee maths, unauthorised verifier.
- `anchor test` smoke test against local validator.

### 3.6 Client SDK (`packages/sdk`)
- Generated from the Anchor IDL (`@anchor-lang/core` (Anchor 1.x TS client) types) **[verify: or Codama-generated client if we move to `@solana/kit`]**.
- Exports: PDA derivation, instruction builders, account decoders, error-code mapper (program error → friendly message).
- Used by api (tx building), web (reads), mobile (reads + signing).

---

## 4. Mobile app (`apps/mobile`)

| Concern | Choice |
|---|---|
| Framework | Expo SDK (latest), **dev build** via `npx expo run:ios` (not Expo Go) |
| Navigation | expo-router (file-based) |
| Auth + wallet | `@privy-io/expo` — email OTP login, auto-create embedded Solana wallet; install Privy's listed peer deps |
| Solana | `@solana/web3.js` v1 (matches Privy provider + Anchor client) **[verify]**; polyfills: `react-native-get-random-values`, `buffer` |
| Data fetching | TanStack Query |
| Local state | Zustand |
| Styling | NativeWind (Tailwind for RN) |
| Realtime | `socket.io-client` + `connection.onAccountChange` for the user's Enrollment/Slots |
| Share extension | Community Expo share-extension config plugin **[verify current package]**; fallback: paste link |
| Secure storage | `expo-secure-store` (demo signer keypair in offline mode) |
| Notifications | In-app toasts; `xcrun simctl push` for simulated banners |
| i18n | `i18next` + `expo-localization`: EN, BM, ID (TH, TL later) |
| Media | `expo-image-picker` / `expo-document-picker` for UGC upload |

### 4.1 Signing flow (sponsored)
1. App calls `POST /tx/<action>` with intent (e.g. `{ slotId, contentUrl }`).
2. API builds the transaction with the program SDK, sets `feePayer = sponsor`, partially signs as fee payer, returns base64.
3. App deserialises, asks Privy embedded wallet to sign (`signTransaction`).
4. App sends the signed transaction to `POST /tx/submit` (API submits + confirms) — keeps RPC keys server-side and lets the API retry.
5. API emits the WebSocket event after confirmation.

### 4.2 Screens
`(auth)/login` · `(creator)/home` · `campaigns` · `campaign/[id]` · `slot/[id]` · `shipping/[enrollmentId]` · `earnings` · `profile` · `settings` — plus `share-extension` entry.

### 4.3 Config
```
EXPO_PUBLIC_API_URL=http://localhost:4000
EXPO_PUBLIC_WS_URL=ws://localhost:4000
EXPO_PUBLIC_RPC_URL=https://api.devnet.solana.com   # or dedicated devnet RPC
EXPO_PUBLIC_PRIVY_APP_ID=...
EXPO_PUBLIC_PRIVY_CLIENT_ID=...
EXPO_PUBLIC_DEMO_SIGNER=0                            # 1 = offline mode
```
`EXPO_PUBLIC_*` values are public — no secrets in the app.

---

## 5. Web dashboard (`apps/web`)

| Concern | Choice |
|---|---|
| Framework | Next.js App Router, React Server Components where useful |
| UI | Tailwind CSS + shadcn/ui |
| Auth + wallet | `@privy-io/react-auth` (Solana embedded wallet, email login) |
| Data | TanStack Query; server actions only for non-chain forms |
| Charts | Recharts (campaign spend, delivery rate) |
| Realtime | `socket.io-client` + RPC account subscriptions |
| Forms | react-hook-form + zod (shared schemas) |

### 5.1 Routes
`/login` · `/campaigns` · `/campaigns/new` (AI brief builder) · `/campaigns/[id]` (slot grid, enrollments, shipping) · `/review` (submission queue with check badges) · `/creators` (search, Kolab Score breakdown) · `/creators/[id]` · `/demo` (control panel, dev only).

---

## 6. Backend (`apps/api`)

### 6.1 Stack
| Concern | Choice |
|---|---|
| Framework | NestJS (Express adapter) |
| Validation | zod (shared schemas) via a Nest pipe |
| ORM | Prisma + PostgreSQL |
| Queue / scheduler | pg-boss (crank, verifier jobs, still-live checks) |
| Realtime | `@nestjs/websockets` + Socket.IO gateway, rooms per user / campaign |
| Auth | Verify Privy access tokens server-side (Privy server SDK); map Privy user → `users` row → role |
| Solana | `@solana/web3.js` + `packages/sdk`; fee-payer + verifier keypairs from env |
| Logging | Pino (`nestjs-pino`) with request IDs |
| API docs | `@nestjs/swagger` OpenAPI at `/docs` |
| Rate limiting | `@nestjs/throttler` |
| Encryption | libsodium (`sodium-native`) sealed boxes for shipping addresses |
| x402 (optional) | `@x402/core` + `@x402/svm` + Express middleware mounted on `/x402/*` |

### 6.2 Modules
```
auth/         Privy token guard, roles (brand | creator | admin)
users/        profiles, social accounts
campaigns/    CRUD for off-chain campaign data, brief, rules
enrollments/  join, shipping address (encrypted), tracking
slots/        submissions, review actions
tx/           build + partial-sign + submit + confirm
verifier/     embed checks, AI content checks, still-live, sales ingestion → attest_* ixs
crank/        auto_release / mark_missed / confirm_received sweeps
indexer/      program log subscription → upsert Postgres; replay from signatures on startup
scoring/      Kolab Score computation + snapshots
ai/           brief builder, submission checker, fraud flags (uses packages/ai)
realtime/     Socket.IO gateway + event fan-out
demo/         reset, clock offset, mock triggers (disabled unless DEMO_MODE=1)
x402/         optional paid endpoints (§5.5 architecture)
```

### 6.3 REST API (v1, JSON)
| Method & path | Purpose |
|---|---|
| `GET /me` | Current user, role, wallet |
| `POST /campaigns` | Create off-chain draft (brief, rules, schedule) |
| `POST /campaigns/:id/brief:generate` | AI brief from product URL |
| `GET /campaigns` / `GET /campaigns/:id` | List / detail (merged off-chain + on-chain) |
| `POST /tx/create-campaign` · `/tx/fund` | Build sponsored txs |
| `POST /campaigns/:id/enroll` → `POST /tx/enroll` | Join |
| `PUT /enrollments/:id/address` | Store encrypted shipping address |
| `POST /tx/mark-shipped` · `/tx/confirm-received` · `/tx/report-not-received` | Shipping |
| `POST /slots/:id/submissions` → `POST /tx/submit` | Submit link or file |
| `POST /uploads` | Multipart UGC upload via API; API verifies SHA-256 then streams to Cloudinary (`authenticated`) → `{ fileKey, sha256 }` |
| `GET /uploads/:key/url` | Short-lived signed read URL (brand of the campaign only) |
| `POST /tx/approve` · `/tx/reject` | Brand review |
| `POST /tx/claim-sales` | Per-sale claim |
| `POST /tx/submit` | Submit a signed tx, confirm, return signature |
| `GET /creators` · `GET /creators/:id` | Search + score breakdown |
| `POST /ratings` | Two-sided ratings |
| `POST /webhooks/store-sales` | Store → verifier (HMAC-signed) |
| `POST /demo/*` | reset, clock, deliver parcel, fire sale, delete post, run crank (DEMO_MODE only) |

Errors: RFC 7807 problem+json with stable `code` values; program errors mapped through `packages/sdk`.

### 6.4 WebSocket events
`campaign.funded` · `enrollment.created` · `enrollment.shipped` · `enrollment.received` · `slot.submitted` · `slot.checks` · `slot.approved` · `slot.rejected` · `slot.released` · `slot.missed` · `slot.holdback` · `sale.recorded` · `payout.claimed` · `demo.clock`.
Payload always includes `txSignature` (when on-chain) for explorer links.

### 6.5 Jobs (pg-boss)
| Job | Trigger | Action |
|---|---|---|
| `verify-submission` | `slot.submitted` | Embed check + timing + AI check → `attest_checks` |
| `crank-sweep` | every 1 min (and on demand) | `auto_release`, `mark_missed`, `confirm_received` where due |
| `still-live` | +7d and period end per slot | Embed check → `attest_live` |
| `record-sale` | store webhook | Match voucher → `record_sale` |
| `score-refresh` | slot outcome events | Recompute Kolab Score snapshot |
| `address-purge` | daily | Delete addresses 30d after campaign end |

All jobs idempotent (keyed by slot/order/signature) and retried with backoff.

### 6.6 Environment
```
DATABASE_URL=postgres://...
RPC_URL=https://api.devnet.solana.com
RPC_WS_URL=wss://api.devnet.solana.com
PROGRAM_ID=...
USDC_MINT=...
FEE_PAYER_SECRET=...        # base58, devnet only
VERIFIER_SECRET=...         # base58, devnet only
TREASURY_PUBKEY=...
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
AI_PROVIDER=gemini          # gemini | mock
GEMINI_API_KEY=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
ADDRESS_ENC_KEY=...         # 32-byte key for sealed boxes
STORE_WEBHOOK_SECRET=...
MOCK_BASE_URL=http://localhost:4100
DEMO_MODE=1
```

---

## 7. Mock platform server (`apps/mock`)

Express, in-memory state, reset via API.
| Endpoint | Mimics |
|---|---|
| `GET /oembed?url=` | oEmbed-shaped response for fake TikTok/YouTube posts; 404 if "deleted" |
| `POST /posts/:id/delete` | Toggle deleted (demo panel) |
| `GET /tracking/:ref` | Courier status: `in_transit` / `delivered` |
| `POST /tracking/:ref/deliver` | Demo panel "Mark parcel delivered" |
| `POST /store/orders` | Creates an order with a voucher code → calls API webhook (HMAC) |

Verifier talks to `MOCK_BASE_URL` in demo mode and to real oEmbed endpoints otherwise (same interface).

---

## 8. AI (`packages/ai`)

| Function | Input | Output (zod schema) |
|---|---|---|
| `generateBrief` | product URL/text, budget, markets | `{ title, brief_md, campaign_type, slots[], suggested_rate, ships_to[] }` |
| `checkSubmission` | caption, transcript/frame text, campaign rules, creator country | `{ product_mentioned, hashtag_ok, voucher_ok, disclosure_ok, language, issues[], verdict }` |
| `fraudSignals` | audience snapshot history, engagement stats | `{ flags[], risk: low|medium|high, reasons[] }` |
| `qualityScore` | portfolio item metadata/frames | `{ hook, clarity, production, overall }` |

- Provider adapter interface (`complete(schema, prompt)`) so the model can be swapped; provider = **Gemini** via `@google/genai` (`AI_PROVIDER=gemini|mock`, `mock` = canned responses for offline rehearsal and tests).
- Structured output enforced by JSON schema; invalid output → one retry → mark "needs manual review".
- Eval set: ~20 labelled sample submissions (EN/BM/ID) run in CI to catch prompt regressions.
- The AI never receives or returns wallet addresses or amounts used for transactions.

---

## 9. Data (PostgreSQL via Prisma)

Tables as in architecture.md §7: `users`, `social_accounts`, `creator_profiles`, `brand_profiles`, `campaigns`, `enrollments` (+ encrypted `shipping_address`, `tracking_ref`), `slots`, `submissions`, `check_results`, `sales`, `ratings`, `audience_snaps`, `portfolio_items`, `score_snapshots`, `credentials`, `notifications`, `processed_signatures` (indexer cursor).

Rules:
- On-chain is the source of truth for money and slot status; Postgres mirrors it via the indexer.
- Personal data (addresses, audience demographics) never on-chain; addresses encrypted at rest.
- Soft-delete user data on request; purge job for addresses.

---

## 10. Credentials (compressed NFTs)

- Metaplex Umi + `mpl-bubblegum`: one Merkle tree created by `demo:chain`, owned by the platform.
- Mint one credential per completed package/period to the creator's wallet.
- Metadata JSON (stored off-chain, hosted by API): brand name, campaign type, period, slots on time / total, sales count. No personal data.
- Reads via a DAS-compatible RPC **[verify devnet DAS availability on chosen RPC]**; fallback: show from Postgres.

---

## 11. x402 (optional, only if ahead of schedule)

- Mounted on `/x402/*` in the API using the Express middleware from the x402 V2 packages; network devnet (CAIP-2), USDC mint.
- `exact` for search/lookups/licences; `upto` for AI checks.
- Facilitator: hosted facilitator with Solana support **[verify which supports devnet + upto at build time]**.
- Idempotency: key = hash(payment payload + request body); duplicate → cached 200.
- Failed fulfilment after payment → refund via backend transfer + log.

---

## 12. Local environment & scripts

Prerequisites: Node LTS, pnpm, Docker, Rust, Solana CLI, Anchor (avm), Xcode + iOS Simulator, Watchman.

```
pnpm i
pnpm demo:up        # docker postgres + mock + api + web (turbo dev)
pnpm demo:chain     # anchor build (demo-clock) + deploy + test USDC mint + bubblegum tree + init_config
pnpm demo:seed      # brand, 2 creators, funded campaign, monthly package
pnpm demo:reset     # wipe DB + mock state + reseed (chain: new campaign PDA)
pnpm --filter mobile ios   # npx expo run:ios
pnpm test           # unit + LiteSVM program tests
```

Ports: web 3000 · api 4000 · mock 4100 · postgres 5432 · local validator 8899.

---

## 13. Quality, security, CI

- **CI (GitHub Actions):** lint (ESLint), typecheck, unit tests (Vitest for packages, Jest for Nest), `anchor build` + LiteSVM tests, AI eval set (non-blocking).
- **Secrets:** `.env` files git-ignored; devnet-only keys; no secrets in `EXPO_PUBLIC_*`.
- **AuthZ:** every route checks role + ownership (brand owns campaign, creator owns enrollment).
- **Webhooks:** HMAC verification; replay window 5 min.
- **Program safety:** signer/owner checks on all accounts, PDA seeds validated, checked math, no admin path that can move vault funds to anyone other than brand/creator/treasury.
- **Rate limits:** per-user on submissions and tx builds.
- **Logging:** never log addresses, tokens or secrets.

---

## 14. Deliverables checklist (submission)

- [ ] Program deployed to devnet; program ID in README
- [ ] README: setup, both demo modes, env vars, "How Solana powers Kolab", failure handling
- [ ] 2–4 min demo video
- [ ] Repo public with license
- [ ] Architecture + tech stack docs (this file + architecture.md)

---

## Changelog
- **v0.2 (2026-10-15)** — aligned with `workplan.md`: Anchor 1.x + `@anchor-lang/core`; AI = Gemini (`AI_PROVIDER`, `GEMINI_API_KEY`); Cloudinary uploads via `POST /uploads` + signed read URLs, Cloudinary env vars; hosting = Vercel + Railway; repo layout adds `packages/ui/`, `reference/`, `docs/`.
- **v0.1 (2026-10-15)** — initial tech spec: monorepo, program, mobile, web, API, mock server, AI, data, credentials, x402 (optional), local env, CI.
