# Kolab — Workplan

> Built from `architecture_10.md` (product, on-chain design, flows, build plan §12) and `techstacks_5.md` (stack, repo layout, API, jobs), using `makeUGCads-main/` as the UI and backend-pattern reference.
> Window: **15 Oct → 30 Oct 2026** (submit 30 Oct, buffer day). Target: Solana hackathon, *Best Consumer App* track, devnet.
> Tick boxes as we go. Anything marked **[decide]** needs an answer before that day starts.

---

## 0. Before we start (today, 15 Oct)

### 0.1 Doc inconsistencies to fix first
| # | Issue | Proposed fix |
|---|---|---|
| 1 | Files are `architecture_10.md` / `techstacks_5.md`, but both docs reference `architecture.md` / `techstacks.md` | Rename to `docs/architecture.md`, `docs/techstacks.md` when the monorepo is created |
| 2 | Architecture header says "Draft v0.1", changelog is at v0.7 | Bump header to v0.7 |
| 3 | Architecture §2 design rule 1 and §6.1 say **passkey wallet**; §11 #2 resolved to **Privy email OTP** | Update §2, §6.1, §8 `(auth)` to "Privy embedded wallet, email OTP" |
| 4 | Architecture §3 says fee payer "e.g. Kora"; techstack says **backend fee-payer keypair** | Use backend keypair for the hackathon; Kora = optional |
| 5 | Architecture §3 job queue still **[OPEN]**; §12 and techstack chose **pg-boss** | Mark §11 #7 resolved: pg-boss |
| 6 | Architecture §8 lists `(brand)` mobile screens; §12 says brand = **web dashboard** for the demo | Keep mobile `(brand)` out of scope; note "post-hackathon" in §8 |
| 7 | Architecture §5.4 / §3 use **Expo push**; techstack uses in-app toasts + `simctl push` | Toasts for the demo; Expo push post-hackathon |
| 8 | Architecture §3 storage "S3-compatible"; reference app uses **Cloudinary** | **Resolved: Cloudinary** (see §0.3) — update architecture §3 + techstack `POST /uploads/sign` |
| 9 | Techstack §3.6 SDK: `@coral-xyz/anchor` vs Codama/`@solana/kit` **[verify]** | Decide on day 1 (see §1) — Privy + Anchor client still lean on web3.js v1 |

### 0.2 Decisions
- [x] **AI provider** — **Gemini** via `@google/genai`, reusing the reference's `configs/ai.ts` pattern. Still behind the `complete(schema, prompt)` adapter in `packages/ai`; `AI_PROVIDER=gemini|mock` (`mock` = canned responses for offline rehearsal and tests).
- [x] **UGC file storage** — **Cloudinary** (see §0.3).
- [x] **Chain** — **Solana devnet** is the primary target for development and the demo (see §0.3).
- [ ] **Hackathon rules**: presentation length, one codebase in two tracks, pre-existing code rules (§11 #15). Matters for how much of the reference code we can copy verbatim.
- [x] **Deployment** — hosted for judges, live demo on the presenting Mac (see §0.3).
- [x] **Hosting providers** — **Vercel** (web) + **Railway** (API + workers, mock, Postgres in one project).
- [ ] **Dedicated devnet RPC** (§11 #29) — sign up day 1; public devnet RPC rate-limits and has no DAS for cNFT reads.

### 0.3 Environments
Two environments, both on **Solana devnet**. The live demo runs **locally** because it needs the iOS Simulator (creator app) talking to the dashboard in real time; the **hosted** copy is what judges open afterwards.

| Concern | Local demo (presenting Mac) | Hosted (judges) |
|---|---|---|
| Purpose | Three-pane live demo + video: simulator · dashboard · `/demo` panel | Public URL in README / submission; judges try the brand dashboard and verify on-chain |
| Program | **Demo-clock build**, its own devnet program ID (`Config.demo_offset` is global, so it must not be shared) | **Non-demo build**, separate devnet program ID — the one quoted in README |
| `DEMO_MODE` | `1` (`/demo` panel, clock offset, mock triggers) | `0` (`/demo` hidden, no clock shifting) |
| Web | `localhost:3000` | **Vercel** — root `apps/web`, Turborepo build (`turbo build --filter=web`) |
| API + workers | `localhost:4000` (Nest, pg-boss crank/verifier/indexer, Socket.IO) | **Railway** service `api` — always-on, WebSockets + pg-boss run in the same process; `prisma migrate deploy` as pre-deploy command |
| Mock server | `localhost:4100` | **Railway** service `mock`; API reaches it over Railway private networking |
| Postgres | Docker | **Railway** Postgres plugin; `DATABASE_URL` referenced into `api` |
| Mobile | iOS Simulator dev build, `EXPO_PUBLIC_API_URL=http://localhost:4000` | Not distributed for the hackathon; video shows it. Optional: EAS internal build pointing at the hosted API |
| RPC | Dedicated devnet RPC (HTTP + WS, DAS-enabled) | same provider, separate key |
| Wallet | Privy, email OTP | Privy — add hosted domain to the app's allowed origins |
| Files | Cloudinary folder `kolab/local/` | Cloudinary folder `kolab/prod/` |
| AI | Gemini (`mock` for offline rehearsal) | Gemini |
| Explorer | `?cluster=devnet` | `?cluster=devnet` |
| Offline fallback | local validator + `DEMO_SIGNER=1` + `AI_PROVIDER=mock` | — |

Rules: one `.env.local` / `.env.production` per app, `demo:chain` takes a `--target local-demo|hosted` flag so it writes the right program ID, mint and tree, and each environment has its own fee-payer / verifier keypairs so cranks never act on the other environment's accounts.

| Concern | Detail |
|---|---|
| File storage | **Cloudinary**, uploads as `authenticated` delivery type so files aren't public; brand views via short-lived signed URLs from the API |

Upload flow (replaces `POST /uploads/sign`): app sends multipart to `POST /uploads` → multer memory storage (reference pattern) → API computes SHA-256, rejects if it doesn't match the hash the app computed → `cloudinary.uploader.upload_stream({ resource_type: 'auto', type: 'authenticated', public_id: <sha256> })` → returns `{ fileKey, sha256 }` → app calls `submit_deliverable(slot, sha256)`. Going through the API (not direct-to-Cloudinary) is what lets us verify the hash recorded on-chain. Size + MIME limits on multer; `demo:reset` deletes the demo folder in Cloudinary.

---

## 1. Versions (checked on npm, 15 Oct 2026)

Pin these at scaffold time. Reference app versions shown for comparison — almost everything moves up.

| Package | Reference (`makeUGCads-main`) | Kolab target | Notes |
|---|---|---|---|
| Node | — | current LTS | `.nvmrc` |
| pnpm / turbo | npm, no monorepo | pnpm 12.11 / turbo 2.11 | |
| TypeScript | 5.9 (client) / 6.0 (server) | **6.0.3** | TS 7 tried on day 1: typescript-eslint supports `<6.1`, so pinned 6.0 |
| React | 19.2 | 19.3 | |
| Next.js | — (reference is Vite 7) | **16.4** (App Router) | Replaces Vite for the brand dashboard |
| Tailwind CSS | 4.1 | 4.3 | Same v4 `@theme` syntax — reference CSS ports directly |
| framer-motion | 12.23 | **`motion` 14.2** | Package renamed; import from `motion/react` |
| lucide-react | 0.555 | 1.57 | Some icon names changed in 1.x — check each import |
| lenis | 1.3.16 | 1.3.26 | Use `lenis/react` on the landing page only, not inside the dashboard |
| react-hot-toast | 2.6 | **sonner 2.0** | Ships with shadcn |
| shadcn CLI | — | 4.21 | |
| TanStack Query / zustand | — | 5.104 / 5.0 | |
| zod / react-hook-form | — | 4.6 / 7.90 | |
| recharts | — | 3.10 | |
| Auth | Clerk (`@clerk/react` 6) | **Privy** `@privy-io/react-auth` 3.49, `@privy-io/expo` 0.76 | Clerk removed entirely |
| Backend | Express 5 | **NestJS 12.1** (Express adapter) | |
| Prisma | 7.8 | **7.10 (stable)** | npm shows 8.0 RC — do **not** take the RC |
| pg-boss / socket.io | — | 12.38 / 4.8 | |
| AI (Gemini) | `@google/genai` 1.51 | 2.30 | Major bump — config API changed, re-check `generateContent` + structured output |
| Uploads | multer 2.1 + cloudinary 2.10 | multer 2.4 (via Nest `FileInterceptor`) + cloudinary 2.11 | Memory storage → `upload_stream`, no temp files on disk |
| Sentry | `@sentry/node` 10 | optional | Nice-to-have; Pino logging is the requirement |
| Expo / expo-router | — | SDK 57 / 57.0 | Dev build, not Expo Go |
| NativeWind | — | 4.2 | **[verify]** works with Tailwind 4.3 / Expo 57; else NativeWind v5 preview or StyleSheet |
| Anchor | — | CLI + `anchor-lang` 1.2.1 (`solana-v4`), TS client `@anchor-lang/core` 1.2.1; Solana CLI 4.1.2; Rust 1.97.1 | Program tests in Rust LiteSVM 0.18 |
| Solana JS | — | `@solana/web3.js` 1.99 | Kit 8.5 exists; stay on web3.js v1 unless Privy + Anchor both support Kit cleanly |
| Bubblegum | — | `mpl-bubblegum` 6.0 | Via Umi |
| LiteSVM | — | 1.6 | |
| x402 | — | `@x402/core`, `@x402/svm` 2.28 | Optional |

---

## 2. How we use the reference (`makeUGCads-main`)

The reference is a **Vite + React SPA (marketing site + generator) and an Express + Prisma + Clerk + Gemini + Cloudinary server**. Kolab is a different product with a different stack, so we take its **visual language and a few backend patterns**, not its structure.

### 2.1 Keep (port over)
| From reference | Into Kolab | Change needed |
|---|---|---|
| `index.css` theme: dark `bg-gray-950`, Outfit font, `--color-primary` violet / `--color-secondary` pink, `.glass-panel`, `.btn-secondary`, `animate-float`, `animate-marquee` | `packages/config/tailwind/theme.css` shared by web (and mirrored into NativeWind config) | Move tokens to shadcn CSS variables (`--primary`, `--card`, …); load Outfit via `next/font/google` not `@import url()`; add a light theme (dashboard used in daylight demos) |
| `SoftBackdrop` (blurred violet/fuchsia blobs) | Landing page + login only | Too heavy behind dense tables — keep off dashboard routes |
| `Buttons.tsx` (`PrimaryButton` gradient pill, `GhostButton`) | shadcn `Button` variants `gradient` and `ghost-glass` | Rebuild with `cva`, keep the look |
| `Navbar` floating glass pill | Public landing navbar | Dashboard gets a sidebar shell instead (see 2.2) |
| `Hero`, `Features`, `Faq`, `CTA`, `Pricing`, `Footer`, `Title` | `apps/web/app/(marketing)/` landing page | Rewrite copy for Kolab (brands × micro-creators, USDC escrow, 5% only on released money, 0% creator fee — architecture §1.2). Pricing section shows Kolab vs classic platforms table |
| `UploadZone` | UGC file upload (mobile picker on creator side; web for brand assets) | Add SHA-256 hashing client-side, multipart `POST /uploads` → Cloudinary |
| `ProjectCard` / `MyGenerations` grid | Campaign cards (`/campaigns`) and review queue cards (`/review`) | New data shape: slot status chips, check badges, tx explorer link |
| `Loading` page | Tx pending / confirming states | |
| Server: `configs/ai.ts` (GenAI client) | `packages/ai` provider adapter — Gemini + mock implementations | Upgrade to `@google/genai` 2.x; JSON-schema output, zod validation + one retry |
| Server: `prisma.config.ts` + `prisma-client` generator + `@prisma/adapter-pg` | `apps/api/prisma` | Same Prisma 7 pattern; new schema from architecture §7 |
| Server: `configs/multer.ts` + Cloudinary upload | `uploads` module | Memory storage instead of disk temp files; SHA-256 as `public_id`, verify hash, `authenticated` type + signed read URLs |
| Server: credit deduction + refund-on-failure in `projectController` | Pattern only — AI quota per brand (architecture §1.2 "included up to a monthly quota") | Wrap in a Prisma transaction |

### 2.2 Change (layout)
- **Reference layout**: one global `Navbar` + `Footer` around every route, full-page marketing feel.
- **Kolab web layout** (Next.js route groups):
  - `(marketing)/` — `/` landing: floating glass navbar, SoftBackdrop, footer (reference look).
  - `(app)/` — authenticated **app shell**: collapsible left sidebar (Campaigns, Review, Creators, Wallet), top bar (USDC balance + MYR/IDR display, network badge "Devnet", Privy user menu), content area with `max-w-7xl`. No backdrop blobs, no Lenis.
  - `demo/` — full-width control panel, big buttons, live event log (WebSocket feed + tx links). Hidden unless `DEMO_MODE=1`.
- **Mobile layout** (Expo Router): bottom tabs `Home · Campaigns · Earnings · Profile`; stack screens for `campaign/[id]`, `slot/[id]`, `shipping/[enrollmentId]`. Same tokens, dark by default.
- **Three-pane demo** (architecture §9.1): dashboard must stay usable at ~1/3 of a laptop screen → sidebar collapses to icons < 1280px, tables become card lists < 768px.

### 2.3 Drop
- Clerk (all of it, incl. `/api/clerk` webhook) → Privy.
- Credits / Plans pages → no subscription in Kolab.
- Community page, generated-image/video assets and dummy data.
- Vite config, `react-router-dom` (Next.js routing instead).
- `ts-node` + `nodemon` (Nest CLI watch / `tsx`).

---

## 3. Target repo layout

From techstack §2 (unchanged), plus where the reference bits land:

```
kolab/
├── apps/
│   ├── mobile/      Expo SDK 57 creator app (tabs + share extension)
│   ├── web/         Next.js 16: (marketing) landing · (app) brand dashboard · /demo
│   ├── api/         NestJS 12 + Prisma 7 + pg-boss + Socket.IO
│   └── mock/        Express: oEmbed, tracking, store sales
├── programs/kolab/  Anchor program
├── packages/
│   ├── sdk/         IDL types, PDAs, ix builders, error mapper
│   ├── shared/      zod schemas, event names, constants
│   ├── ai/          provider adapter (Gemini), prompts, eval set
│   ├── ui/          shared tokens (ported reference theme) + web components
│   └── config/      eslint, tsconfig, prettier, tailwind preset
├── scripts/         demo:chain · demo:seed · demo:reset
├── tests/           LiteSVM program tests
├── docs/            architecture.md · techstacks.md · workplan.md
├── reference/       makeUGCads-main (read-only, git-ignored or removed before submit)
└── docker-compose.yml · Anchor.toml · turbo.json · pnpm-workspace.yaml
```

Defaults from architecture §12 that we build against (changeable later): one `Slot` account per deliverable · credential per completed package · 30% holdback at period end · Instagram manual-only · pg-boss · brand on web only · x402 + swaps only if ahead · MYR + IDR display · 14d/21d shipping, brand pays duties, gifted products.

---

## 4. Day-by-day plan

### Day 1–2 · 15–16 Oct — Foundations
**Done when:** creator logs in on the iOS simulator and sees a devnet address; brand logs in on web and sees the same. ✅ **Met 15 Oct** (same account + wallet on simulator and web at localhost:3010).
- [x] Fix doc inconsistencies (§0.1), move docs into `docs/` (reference app moved to `reference/`, git-ignored)
- [x] Answer §0.2 decisions (still open: hackathon rules, RPC provider)
- [x] Tooling: Node 24 LTS (`.nvmrc`), pnpm 12.11, Docker, Rust 1.97.1 (pinned in `rust-toolchain.toml`), Solana CLI 4.1.2 (Agave), Anchor 1.2.1 via `avm`, Xcode 27 + simulator, Watchman
- [x] Monorepo scaffold: pnpm workspaces + turbo, `packages/config` (eslint flat config, tsconfig base, prettier)
- [x] Verify TS 7 — **not usable**: typescript-eslint supports `<6.1`. Pinned **TypeScript 6.0.3** everywhere
- [x] `docker-compose.yml` Postgres 18 on **port 5433** (a local Postgres already uses 5432); `apps/api` Nest 12 (ESM, Vitest, oxlint), Prisma 7.10 schema + first migration, `/health`, Pino with auth headers redacted, Swagger at `/docs`, throttler
- [x] `apps/web` Next 16.4.0 + Tailwind 4 + shadcn (base-nova); reference theme ported into `packages/ui` (`theme.css` + TS tokens); route groups `(marketing)` / `(app)` / `demo`; landing hero, login, app shell with collapsible sidebar
- [x] Privy app created (app ID, mobile client for `com.kolab.app`, secret in `apps/api/.env`). **Verified on simulator:** email login → embedded Solana wallet → API `/me` → `users` row with the Privy wallet. Needed `apps/mobile/metro.config.js` (jose browser build)
- [x] `apps/mobile` Expo 57 dev build: **native iOS build succeeded** on iPhone 17 Pro sim; Privy email OTP login, creator tabs, Home shows wallet + `/me`. Styling via `StyleSheet` + `@kolab/ui` tokens (NativeWind deferred — v4 targets Tailwind 3)
- [x] API: Privy token guard (`@privy-io/node`) → `users` row; email + wallet always read from Privy, never from the client
- [ ] Create Vercel + Railway projects and deploy the skeletons — **needs your accounts**
- [ ] Dedicated devnet RPC account — **needs your account**
- [x] Backend keypairs generated in `keys/` (git-ignored): fee-payer `6KWUdgA3ddNFX6xSMm9HAGBn68aKZtMu5gyJDMS8pM1M`, verifier `HSjuuYmkRL89sCC8ZoiDweLPvA6656fWux6jkfcx1Jcb`, treasury `CWHSw3UvfiAFHpa1S7dxCmkTBb36Vc6w17Uo5w3ytrij`
- [ ] Fund fee-payer + verifier — public faucet rate-limited; use faucet.solana.com or the RPC provider's faucet
- [x] `packages/ai` adapter: Gemini (`@google/genai` 2.x, JSON-schema output, zod + one retry) and `mock`; 4 unit tests pass. Live Gemini call pending `GEMINI_API_KEY`
- [ ] Cloudinary account + API keys — **needs your account**
- [x] Anchor 1.2.1 program skeleton in `programs/kolab` with `demo-clock` feature; builds (SBPF v3) and the LiteSVM 0.18 test passes
- [x] Sponsored tx flow built (day 2): API `POST /tx/memo` (DEMO_MODE only) builds a v0 tx with `@solana/kit`, fee payer pre-signed → app signs the bytes with Privy (mobile Profile / web Wallet "Send test transaction") → `POST /tx/submit` verifies our fee-payer signature + the logged-in user's signature, sends, confirms. 6 unit tests cover tampering, wrong user, unsigned, foreign fee payer
- [x] **Live run on devnet (15 Oct):** tx `55z6bJfRXvLeEYNayPfhtcth7qX76rxun4HuhD4aibTk3ukUyEtck1fv86VsFg3fewnabzSrmWsoKnWmUYa8K8uX`. Fee payer paid the 10,000-lamport fee, creator wallet signed with 0 SOL
- [x] Role onboarding (day 2): `role` is null until chosen and can be set only once (409 `role_already_set`). Web asks brand/creator and shows creators a "use the app" screen; mobile claims `creator` automatically

**Day 1 findings that change later days**
- **Solana JS library — decided (day 2):** both Privy SDKs sign raw transaction bytes, so clients need no Solana library for signing. The API builds everything with **`@solana/kit` 8**; `packages/sdk` will be a **Codama-generated Kit client** from the Anchor IDL (day 3–5).
- **Anchor 1.x:** program uses `anchor-lang` with `default-features = false, features = ["solana-v4"]` so it matches LiteSVM 0.18. Program tests are **Rust LiteSVM** (Anchor 1.x default), not TS LiteSVM.
- **SBPF v3:** confirmed on devnet 15 Oct (hosted program deployed as v3).
- **pnpm 12 `minimumReleaseAge`** rejects packages younger than a day. Kept on; we install the previous patch instead (Next 16.4.0, Expo 57.0.28). Run `npx expo install --fix` in `apps/mobile` **after 16 Oct 00:35 (MYT)** — tried on 15 Oct and the patches were still <24h old. If pnpm ever adds a `minimumReleaseAgeExclude` block to `pnpm-workspace.yaml` on its own, remove it.
- **Blocked build scripts** (in `pnpm-workspace.yaml` `allowBuilds`): `@scarf/scarf` (telemetry), `@reown/appkit`, `keccak` (JS fallback).
- **Ports:** other projects hold 3000 / 4000 (Nebius) and 4100 (HouseFull) on this Mac, so local `.env` files use **web 3010 / API 4010 / mock 4110** (API `CORS_ORIGINS` allows 3000 and 3010). Defaults in `.env.example` stay 3000/4000/4100. Run web with `npx next dev --port 3010`, mock with `PORT=4110`.

### Day 3–5 · 17–19 Oct — Anchor program (started early, 15 Oct)
**Done when:** every slot path passes in LiteSVM with the demo clock.
- [x] Accounts: `Config`, `Campaign` (+ vault ATA owned by the campaign PDA), `Enrollment`, `Slot`, `SaleReceipt`
- [x] `demo-clock` Cargo feature + `now()` helper + `set_demo_offset` (always in the IDL; errors `DemoClockDisabled` in release builds)
- [x] 22 instructions: `init_config`, `allow_mint`, `set_verifier`, `set_demo_offset`, `create_campaign`, `fund_campaign`, `close_campaign`, `enroll_creator`, `init_slot`, `mark_shipped`, `confirm_received`, `report_not_received`, `cancel_enrollment`, `submit_deliverable`, `attest_checks`, `reject`, `approve`, `auto_release`, `mark_missed`, `attest_live`, `record_sale`, `claim_sales`
- [x] **Hosted (release) program deployed to devnet (15 Oct):** `5JeZ2i6VAPZDpdnwu6GgpXjrXYhodQibSrh6QwmXTQxD`, upgrade authority = default CLI wallet `8xSWC3FN3HJV3d9V84iJLpc7mKpmUKZURAaBHdBxNvu5`, 2.25 SOL rent. **Devnet accepts SBPF v3** — no `--arch` fallback needed. Deploy with a saved buffer (`--buffer keys/deploy-buffer-*.json`, no `--use-rpc`): public RPC uploads hit rate limits
- [x] **Demo-clock program deployed (15 Oct):** `7hTBC9iCNxZ3pmfk1EHstbB4hmxu2iRrNMZ4UhhChQfv` (rent paid by the fee payer, upgrade authority `8xSW…Nvu5`). `chain:setup --target demo` → mint `FaabaM2eyobjw2Wdyzan4WwSLKpTVcaz8yHLjn6MNBE6`. `demo:clock` verified: offset moves on demo, hosted refuses with `DemoClockDisabled`
- [ ] Deferred: `request_cancel`, `renew_period` (only if ahead; monthly renewals = new campaign for the demo)
- [x] Fee on every release → treasury ATA; refunds fee-free; checked math; mint allowlist (classic SPL Token only, so Token-2022 fee/hook mints can't be allowlisted)
- [x] Events (`emit!`) for the indexer; 30 custom error codes
- [x] LiteSVM (Rust) suites — **23 passing**: approve + holdback, UGC (no holdback), auto-release window, auto-release blocked on failed checks, reject→resubmit (once), reject only inside review window, missed refund, rejected→missed, submitted not missable, holdback forfeited, signer checks, full 4-slot demo script, allowlist, bad params, enroll commitment, shipping (due from received), permissionless receipt confirm, not-received refund, no cancel after arrival, per-sale idempotency + claim fee, verifier-only sales, close returns only uncommitted, release build refuses clock shifts
- [x] `packages/sdk`: Codama-generated `@solana/kit` client (instructions, accounts, PDAs, errors, events) + `KOLAB_PROGRAM_IDS` + friendly error text; 3 tests
- [x] Two program IDs from one codebase: release `5JeZ2i6VAPZDpdnwu6GgpXjrXYhodQibSrh6QwmXTQxD` (hosted), demo-clock `7hTBC9iCNxZ3pmfk1EHstbB4hmxu2iRrNMZ4UhhChQfv` (local). `scripts/build-program.sh` builds both as SBPF v3; keypairs in `keys/program-*.json`

**Program design decisions (for architecture.md)**
- Slots are created by a permissionless `init_slot(idx)` appended after `enroll_creator` in the same tx (contents fixed by the campaign template), instead of one instruction creating N accounts.
- Slot due dates are stored as offsets and computed from `Enrollment.received_ts`, so receiving the product never has to touch every slot.
- Enrollment commits the creator's whole schedule up front (`Campaign.available()` must cover it); per-sale commits per recorded sale.
- `reject` only inside the review window (after it, the creator is owed an auto-release). `auto_release` is blocked only if the verifier explicitly **failed** the checks; pending checks don't block it, so a backend outage can't freeze payouts.
- Holdback applies to post slots only; UGC file slots pay in full on approval.
- `cancel_enrollment` (brand) is allowed only before the product arrives (awaiting shipment / not received) and refunds everything outstanding.
- `close_campaign` after `end_ts` returns only uncommitted funds; outstanding slots stay payable.
- Rent for every account (campaign, enrollment, slots, token accounts) is paid by the sponsor, never the user.

### Day 6–7 · 20–21 Oct — API core + mock server (done early, 15 Oct)
**Done when:** a slot goes submit → auto-release driven from the API. ✅ **Met 15 Oct on devnet** (`pnpm --filter @kolab/api devnet:flow`, 7/7 checks).
- [x] Chain setup: `pnpm --filter @kolab/api chain:setup -- --target hosted|demo` — test USDC mint (6 dp, authority `keys/admin.json`), `init_config` (5% fee), `allow_mint`; idempotent; writes `keys/chain-<target>.json`. Hosted: mint `GZZnvVFn9gSTYVXnDyngf7JXJw7FYj4p3FqQS5EW9v2d`, config `84iFFkcRDkS3oMY7ErwVxEV3pkoAnMcox82hr5L9Hdjv`
- [x] `tx/` module: sponsored build (`buildSponsored`), user submit with signature checks, server-signed send (`sendServer`) for crank/verifier; RPC transport retries 429/5xx with backoff
- [x] Campaign tx builders + routes: `POST /campaigns`, `GET /campaigns[/:id]`, `GET /me/enrollments`, `POST /campaigns/:id/tx/{create-and-fund,enroll}`, `POST /slots/:id/tx/{submit,approve,reject}`, `POST /enrollments/:id/tx/{mark-shipped,confirm-received,report-not-received,cancel,claim-sales}`. Ownership checked on every route
- [x] `indexer/`: events from tx logs (only lines emitted by our program) → re-read the touched accounts → mirror into Postgres (can rebuild from chain, incl. campaigns created outside the app); ingest on our own submits + signature poll every 4s; `ProcessedSignature` cursor
- [x] `crank/` (pg-boss, every minute + `/demo/crank`): `auto_release`, `mark_missed`, `confirm_received`, still-live after `STILL_LIVE_AFTER_SECS` (7d)
- [x] `realtime/` Socket.IO gateway: Privy token in handshake, `user:<id>` rooms, `subscribe:campaign` needs membership; events from techstacks §6.4 with `txSignature` (not yet exercised by a client — day 8–12)
- [x] `apps/mock` (port **4110** locally): oEmbed (404 once deleted), courier tracking, store orders → HMAC-signed webhook; 5 tests
- [x] `verifier/`: on `Submitted` → oEmbed exists + author + timing + `#ad`/local disclosure → `attest_checks` (+ `CheckResult` rows); still-live → `attest_live`; `POST /webhooks/store-sales` (HMAC, 5-min replay window) → `record_sale`, idempotent per order ref
- [x] `demo/` (DEMO_MODE only): faucet (1,000 test USDC), crank now, clock offset, fire sale, delete post, deliver parcel, still-live now, reset (off-chain data + mock)
- [ ] `scripts/demo:seed` / `demo:reset` wrappers — the demo endpoints cover it; add thin scripts on day 11–12 with the demo panel
- [ ] AI content check (`packages/ai` `checkSubmission`) on top of the deterministic checks — day 11–12
- [x] Local API now runs on the **demo-clock program** (`apps/api/.env` PROGRAM_ID/USDC_MINT from `keys/chain-demo.json`); `devnet:flow` 7/7 on it too. Campaign queries are scoped to the configured program ID

### Day 8–10 · 22–24 Oct — Creator mobile app (started 15 Oct)
**Done when:** full creator flow on simulator.
- [x] **Program fix (15 Oct): fees are paid on top by the brand.** Creators receive their full slot amount (architecture §1.2); enrollment reserves amount + 5%, releases pay creator in full + fee to treasury, refunds return amount + unused fee. Fee computed once per slot and split, so no dust (new test). 24 LiteSVM tests; both devnet programs upgraded (extended 10 KB each); `devnet:flow` 7/7 on new numbers
- [x] API: `PUT/GET /enrollments/:id/address` (AES-256-GCM at rest, AAD = enrollment id; brand or creator only; sealed blob never returned); program errors translated to friendly copy in tx responses (`program_error` + `programCode`)
- [x] Seed: `pnpm --filter @kolab/api seed:campaign [-- --shipping | --per-sale]` (script-held demo brand `keys/demo-brand.json`); `demo:brand -- list | ship <enrollmentId> | approve <slotId> | reject <slotId>` stands in for the brand until the dashboard exists
- [x] Join via link `kolab://campaign/<id>` (deep link registered; opens Campaign screen) → enroll tx (enroll + init slots) signed with Privy
- [x] Shipping: encrypted address form, status, tracking, "I received it" / "It hasn't arrived"
- [x] Home: earnings rollup, "Needs you" (address / parcel), up next by due date, waiting for brand with check status
- [x] Slot screen: paste/clipboard submit, review countdown to auto-release, checks, paid / holdback / missed states, resubmit
- [x] Earnings: paid (USDC + ≈MYR/IDR), holdback pending, sales to claim + claim, per-campaign
- [x] Profile: track record from on-chain outcomes ("3/4 on time"), dev tx test, sign out
- [x] Live updates: Socket.IO (Privy token auth) → refetch + in-app toasts
- [ ] Share extension (Safari → Kolab) — paste works; extension only if ahead (cut order #5)
- [ ] i18n EN / BM / ID
- [ ] Manual run-through on the simulator (join → submit → approve via `demo:brand` → paid)

### Day 11–12 · 25–26 Oct — Brand dashboard + demo panel (built 16 Oct)
**Done when:** brand flow end to end; the three-pane demo works.
- [x] `packages/ai`: `generateBrief` (JSON schema, zod, retry) + deterministic `templateBrief` used when no Gemini key is set (`AI_PROVIDER=mock` or empty key); 7 tests
- [x] API: `POST /ai/brief` (brand only; product URL fetched with SSRF guard — no private/loopback/metadata hosts, no redirects, 5 s, text only); `GET /review`, `GET /creators` (on-time rate from on-chain outcomes), richer `GET /campaigns/:id` (creator names, latest submission per slot), `GET /tx/balance`, `GET /demo/clock`; 42 API unit tests
- [x] `/campaigns`: stat tiles (live, in escrow, paid incl. fee, refunded) + campaign cards with settled-budget bar
- [x] `/campaigns/new`: brief builder → editable draft (type, deliverables, max creators, duration, review window incl. "2 minutes (live demo)", holdback, shipping) → live cost summary (fee on top, creators covered) → create + fund in one wallet signature
- [x] `/campaigns/[id]`: escrow tiles, Explorer link, copyable join link, per-creator slot grid (status label + dot, never colour alone), post links, approve / request changes, ship dialog with decrypted address + courier/tracking
- [x] `/review`: queue with check badges + details, "attested on-chain" link, auto-pay countdown, approve & pay / request changes
- [x] `/creators`: on-time %, delivered, missed, removed early, earned with brand
- [x] `/wallet`: test-USDC balance, faucet (demo), sponsored tx test
- [x] `/demo` (inside the shell, brand login, DEMO_MODE): program clock +72h / +7d / reset (then crank), run crank, still-live checks, reset demo data, per-campaign deliver parcel / fire sale / delete post, live event log with Explorer links
- [x] Web realtime: Socket.IO → invalidate queries + toasts + event log
- [x] Recharts dropped (stat tiles carry the numbers; cut-list item)
- [ ] Gemini key (`GEMINI_API_KEY`, `AI_PROVIDER=gemini`) for real AI briefs; AI `checkSubmission` on top of the deterministic checks
- [ ] Manual three-pane run-through (brand on web + creator on simulator + /demo)

### Creator kit (added 16 Oct, ahead of schedule)
Decision: no in-app video editor (TikTok editor / CapCut are free and better; ffmpeg-kit was archived Apr 2025) and no direct posting (TikTok Direct Post from unaudited apps is private-only, max 5 users/day). Instead a kit that feeds Kolab's own checks and payouts:
- [x] Caption builder: `POST /slots/:id/caption` (EN / BM / ID × casual / honest review / tutorial / hype) → Gemini or template; required tags (#ad, brand tag, voucher) are appended if the model drops them; plus a 3-second hook line
- [x] Pre-check: `POST /slots/:id/precheck`, live while editing; same rules as the verifier (`postRequirements` / `precheckCaption` in `@kolab/shared`)
- [x] Post: pick video → caption copied → iOS share sheet (TikTok, Instagram, YouTube); TikTok Share Kit once a TikTok client key exists
- [x] UGC delivery: pick video → SHA-256 on device → `POST /uploads` (server re-hashes, rejects mismatch, 150 MB cap, mp4/mov/jpg/png/heic) → submit by `uploadId` → on-chain content hash = file SHA-256 → verifier checks file / hash / format → brand watches via 10-minute signed link (`/uploads/:id/link`). Storage: Cloudinary (authenticated) when `CLOUDINARY_*` set, local disk otherwise
- [x] Demo seed now includes a UGC campaign (2 videos × 25 USDC)
- [x] `devnet:flow` 12/12 incl. UGC: wrong hash rejected, on-chain hash = file SHA-256, verifier attests, signed link serves the exact file, auto-release pays the full 25
- [ ] Disclosure / brand stickers for photos (last; video uses TikTok's paid-partnership toggle)
- [ ] TikTok Share Kit (needs TikTok developer app + client key) · Cloudinary keys · Gemini key

### Brand kit + content studio (added 16 Oct)
- [x] Seller uploads a **brand kit** per campaign on the dashboard (logo, 1–6 product photos, 2 colours, notes) with a rights confirmation ("I own these and allow joined creators to use them"); first product photo becomes the public campaign cover
- [x] `PUT/GET /campaigns/:id/kit` (GET: brand or **joined creators only**, else 403 `kit_locked`; signed 10-min links), public `GET /campaigns/:id/cover`; brands may upload images only; `hasBrandKit` + `kitAssetCount` on every campaign
- [x] Creators see a **"Brand kit ready"** badge on Discover / campaign screens before joining (locked preview lists what's inside); after joining: gallery, tap-to-save, "Save video pack to Photos", **Create content**
- [x] Content studio: **Story 9:16, Square post (scrapbook), Review card (stars + quote), Voucher card (per-sale)** using logo, colours, brand or own photo, headline; non-removable "#ad · Paid partnership" sticker; export 1080 px → Photos or share sheet
- [x] Demo: generated original Glow Lab artwork (logo + 3 product shots, SVG→PNG via sharp) attached by "Load Glow Lab demo campaigns" / `pnpm --filter @kolab/api demo:kits`
- [x] ~~Video compositing stays out~~ → reversed 18 Oct: in-app video editor (see below)

### Web redesign to match mobile (added 16 Oct)
- [x] Shared tokens: `packages/ui/theme.css` dark palette = mobile `lib/theme.ts` (canvas #07070B, surfaces #111118/#1A1A24, glow gradient, `--money` mint); utilities `bg-glow`, `text-glow`
- [x] `components/dashboard.tsx`: HeroStat (gradient balance card), StatTile with icon, Panel, Chip, SlotBadge with icons, SlotStrip, Avatar with gradient ring, CampaignCover (kit photo or generated gradient), KitBadge
- [x] Shell: glass sidebar with gradient active icon + review count badge; topbar with greeting, Devnet pill, USDC wallet chip, avatar
- [x] Pages: campaigns (hero + image-led cards), detail (cover banner, creator cards), review, creators (cards), wallet (hero), new campaign (steps), demo, login (split screen)
- [x] Landing: hero with CSS phone mockup + floating cards, how it works, seller journey (6 steps), creator journey (6 steps), payment release walkthrough (100 USDC post: 105 locked → 70%+fee → 30% holdback+fee; what-if outcomes), why Kolab, pricing, CTA

### Selective campaigns + two-sided reputation (added 16 Oct)
- [x] Program: `Approval` PDA, `approve_creator` / `revoke_approval`; `enroll_creator` requires an approval (own, or the open invite `creator = default`). Campaign layout unchanged, so existing devnet campaigns still deserialize (they default to selective). 27 LiteSVM tests; both devnet programs upgraded
- [x] API: `Campaign.selective`, `Application`, `PortfolioItem`, `SocialAccount.followers`, `Slot.autoReleased`; `/me/profile`, `/me/samples`, `/campaigns/:id/apply|application|applications|brand-reputation`, `/applications/:id/tx/accept|decline`; indexer maps `CreatorApproved` → accepted; open campaigns get the open invite in the create tx; verifier matches the post author to the handle for that platform
- [x] Mobile: creator profile (niches, channels + self-declared followers, up to 6 samples), apply sheet with pitch, application states, "About the brand" from on-chain payouts, "Apply" chip on selective campaigns
- [x] Web: "Who can join" on new campaign, Applicants panel (pitch, reach per channel, samples, on-chain track record / "New creator") with on-chain Approve + Decline, pending count on campaign cards
- [x] `devnet:flow` covers: join refused before approval → profile → apply → approve_creator → enroll; open invite on per-sale/UGC
- [ ] Later: platform-verified follower counts (OAuth insights), structured star ratings both ways, demo-seeded applicant profiles

### In-app video editor (added 18 Oct; ideas from VibeCut, no code reused)
- [x] Native Expo module `apps/mobile/modules/kolab-video` (Swift/AVFoundation, iOS): trim + join clips, aspect-fill incl. rotated phone video, burned-in text (hook, captions, `#ad · Paid partnership`), logo watermark, brand end card, looped music bed with fade + voice volume, MP4 export with progress; `exportAudio` for transcription; `getInfo`, `thumbnail`
- [x] Overlays use a per-frame Core Image compositor (AVVideoCompositionCoreAnimationTool crashes in the iOS Simulator renderer)
- [x] Verified on the simulator: 2 clips (landscape + portrait / rotated) → 8.5 s 1080×1920 H.264 + AAC in 3.7 s; frames match ffmpeg's orientation; audio mean −19.8 dB, peak −0.7 dB
- [x] API: `POST /slots/:id/hooks` (Gemini, template fallback), `POST /slots/:id/transcribe` (Gemini audio → timed caption segments; 503 `auto_captions_unavailable` without a key; audio not stored)
- [x] 3 original music loops generated by `apps/mobile/scripts/gen-music.mjs` (no licensing)
- [x] Mobile editor `editor/[id]` from the deliverable screen: Clips / Text / Brand / Music tools, live preview with overlays, export → Save / Share / Deliver to the brand (UGC: pre-fills the submit sheet, so the edited file's SHA-256 goes on-chain)
- [x] Build fixes for Xcode 27.1 (Swift 6.4): `EXPO_USE_PRECOMPILED_MODULES=false` in `ios/Podfile.properties.json`; `pnpm patch` for `expo-modules-jsi@57.1.2` (strip pattern for `__ObjC::` module selectors); Metro ignores `ios/build`
- [ ] Needs `GEMINI_API_KEY` for AI hooks/auto-captions; Android renderer (Kotlin/Media3) later

### Aurora Intents sponsor track: fund from any chain (added 23 Oct)
Aurora Intents (NEAR Intents) is **mainnet-only**, so the flow is built end to end and runs in `AURORA_MODE=simulated` on devnet; switch to `aurora` after the mainnet deploy.
- [x] Program: `top_up_campaign(amount)`: any signer adds USDC to a campaign escrow (Intents Connect's intermediary is the signer after bridging in). 28 LiteSVM tests; both devnet programs upgraded
- [x] API `funding` module: `GET /funding/config`, `POST /campaigns/:id/funding/quote`, `POST /campaigns/:id/funding`, `GET /campaigns/:id/funding`, `GET /funding/:id`, `POST /funding/:id/simulate-deposit` (demo); `POST /campaigns/:id/tx/create` (escrow without funds). `FundingIntent` model; `Campaign.onchainAt`; realtime `funding.updated`
- [x] Aurora client: Intents Connect `POST /api/v1/executions/{wallet}` (bridge-in → Solana step = `top_up_campaign`, amount `{MIN_AMOUNT_OUT}`, signer `{INTERMEDIARY}`), status mapping CREATED…SUCCESS/DEPOSIT_FAILED/EXPIRED → funding timeline, token lookup via `/api/tokens/{key}`, integrator fee `AURORA_APP_FEE_BPS`
- [x] Simulation: deterministic per-chain deposit address, indicative quote, timeline detected → swapping → escrow; the demo admin plays the intermediary (mints "bridged" test USDC + real `top_up_campaign`). `devnet:flow` phase 5 checks 40 USDC lands in escrow
- [x] Web: "Fund from any chain" (9 chains: Tron, BNB, Ethereum, Base, Arbitrum, Solana, TON, Bitcoin, NEAR) with live quote, deposit QR + address, memo, refund address, status timeline, devnet "Simulate deposit"; escrow funding panel with history; "Create & fund from any chain" on new campaign
- [ ] Mainnet: deploy program (~3.5 SOL rent, refundable via `solana program close`), `USDC_MINT` = real USDC, `AURORA_MODE=aurora` + API key; verify the intermediary token account step (dry run → `intermediaryAddress` → ATA) against the live API; small real deposit for the demo
- [x] **Cash out to any chain** (Swap API, added 23 Oct): `POST /cashouts/quote`, `POST /cashouts`, `POST /cashouts/:id/tx` (sponsored USDC transfer to Aurora's deposit address, user signs), `POST /cashouts/:id/sent` (verifies the transfer on-chain, `submitDeposit`), `GET /cashouts[/:id]`; status `PENDING_DEPOSIT…SUCCESS/REFUNDED/FAILED` → timeline; `Cashout` model; realtime `cashout.updated`. Devnet: real USDC transfer to a stand-in account, swap leg simulated. Mobile: Earnings → "Cash out to any chain" screen; web: Wallet → "Move funds to any chain". `devnet:flow` phase 6 (14/14 pass)
- [ ] Swap Widget: not needed (iFrame/React web only, own wallet connection; our native flows cover funding in and cashing out)
- [x] **Hybrid mode** (added 4 Nov): Aurora has no testnet, and the program deploy costs about 5 SOL, so `AURORA_MODE=hybrid` runs the Aurora leg for real on mainnet while the escrow stays on devnet. Funding: real Swap API quote (EXACT_OUTPUT), recipient = Kolab's mainnet relay wallet; on `SUCCESS` the relay credits the devnet escrow 1:1 (`top_up_campaign`, claimed once). Cash-out: the user's devnet USDC goes to the stand-in account, then the relay pays mainnet USDC into a real Aurora swap; on refund or failure the devnet USDC is returned. Capped by `HYBRID_MAX_USDC` per flow and per user per 24h, and by the relay balance. Explorer links for origin, Aurora delivery and relay transfer. Fixed the `/api/tokens` parsing (`{ tokens }` envelope) and the TON→GRAM and NEAR→wNEAR aliases
- [ ] Hybrid live run: Studio API key, fund the relay (about 0.02 SOL plus 5–10 USDC), one real Base→escrow deposit and one cash-out, recorded for the demo video
- [ ] Optional: persistent deposit address per brand (needs Aurora org approval)

### App Store / Google Play readiness (added 24 Oct)
- [x] 3.1.1 (business registration / external purchases): mobile is creator-only (no brand sign-up, campaigns or payments in the app); brand-account note is plain text with no link to the dashboard
- [x] Store-build flag `EXPO_PUBLIC_STORE_BUILD=1`: hides cross-chain cash-out (Apple 3.1.5(iii) / Play crypto exchange policy need licensing per country); stale links redirect to Withdraw
- [x] Withdraw USDC to any Solana address (`POST /tx/withdraw`, sponsored, user signs) on mobile Earnings
- [x] Account deletion: `GET /me/deletion` (blocked while the wallet holds USDC, campaigns are live or work is unpaid), `DELETE /me` (`{confirm:"DELETE"}`: removes profile, channels, samples + files, addresses, pending applications, email; anonymises the user; deletes the Privy user and its wallet keys; keeps money records), in-app screen (Profile → Delete account) and public web page `/delete-account` (Play's deletion URL; footer link)
- [x] `devnet:flow` phase 7: withdraw + deletion blockers (16/16 pass)
- [ ] Submit under an **Organization** developer account (Apple 3.1.5(i) wallets, 3.2.1(viii) financial); privacy policy + terms URLs; review notes with a demo creator login; Play Data safety form
- [ ] Report/flag option for user content (Apple 1.2) before public launch

### Creator tools on the web dashboard (added 24 Oct)
Store plan: personal developer accounts after the hackathon; move to an organisation if Apple/Google require it. Creators can use everything on the web too.
- [x] Role-aware shell: role gate keeps creators on `/creator/*` and brands on campaign pages; creator nav Home / Discover / My work / Earnings / Profile; role-aware wallet link and live toasts
- [x] `/creator` home (earnings hero, needs you, up next, with the brand, brands looking for you, profile nudge), `/creator/discover` (filters), `/creator/campaigns/[id]` (brief, deliverables, how you get paid, about the brand, brand kit locked/unlocked, apply/join states), `/creator/profile` (niches, channels, samples, track record, sign out, delete account)
- [x] `/creator/work` + `/creator/work/[id]` (shipping address, received / not received, voucher, claim sales, brand kit downloads), `/creator/slots/[id]` (timeline, submit link / deliver UGC file), `/kit` (AI caption + pre-check + TikTok), `/studio` (Story/Square/Review/Voucher templates → 1080 px PNG, #ad sticker always drawn)
- [x] `/creator/slots/[id]/editor`: browser video editor (canvas + Web Audio + MediaRecorder; MP4 when the browser supports it, else WebM): clips/trim/reorder, AI hook, auto-captions (WAV → /transcribe), watermark, end card, music, deliver to brand; API accepts `video/webm` uploads
- [x] `/creator/earnings` (buckets, claim sales, cash out to any chain, withdraw USDC, recent cash-outs)
- [ ] Click-through with a real creator login (enroll/apply, sample upload, studio PNG, editor export + deliver)

### Day 13 · 27 Oct — Per-sale + credentials + devnet
**Done when:** demo script steps 1–8 run on devnet.
- [ ] Per-sale campaign: voucher per creator, mock order → webhook → `record_sale` → live accrual → `claim_sales`
- [ ] Bubblegum tree (in `demo:chain`), mint credential per completed package; metadata JSON served by API; DAS read with Postgres fallback
- [ ] Final devnet deploys: demo-clock program (local demo) + non-demo program (hosted, ID in README)
- [ ] Hosting: Vercel project for `apps/web` (env: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, Privy app ID, RPC URL); Railway project with `api`, `mock`, Postgres (watch paths per service so a web-only change doesn't redeploy the API); API CORS allows the Vercel domain; Privy allowed origins; seed hosted env with `demo:seed --target hosted`
- [ ] Smoke test hosted: brand login → create + fund campaign → explorer link works

### Day 14 · 28 Oct — Rehearse + README
**Done when:** two clean runs in a row from `demo:reset`.
- [ ] Run the 8-step demo script (architecture §9) repeatedly; fix failures
- [ ] Failure cases: RPC down, tx timeout, AI invalid output, socket reconnect
- [ ] README: setup, env vars (`AI_PROVIDER`, `GEMINI_API_KEY`, `CLOUDINARY_*`), both demo modes (devnet / offline), "How Solana powers Kolab", failure handling, program ID
- [ ] Security pass: role + ownership checks on every route, no secrets in `EXPO_PUBLIC_*`, logs free of addresses/tokens

### Day 15 · 29 Oct — Video
- [ ] Offline mode check (local validator + `DEMO_SIGNER=1`)
- [ ] Record: `xcrun simctl io booted recordVideo` + QuickTime three-pane; edit to 2–4 min; export

### Day 16 · 30 Oct — Submit (buffer)
- [ ] Repo public + license; remove `reference/` and any copied assets we don't have rights to
- [ ] Hosted URL + devnet program ID in README and submission form; confirm hosted env still up
- [ ] Submission form, video, docs links

---

## 5. Cut order if behind
(from architecture §12, in order)
1. x402 surfaces
2. Swap in / swap out
3. cNFT credentials (keep reliability as off-chain stats)
4. Per-sale campaigns
5. Share extension (keep paste)
6. Two-sided ratings

Also cuttable without hurting the demo: landing page polish, Recharts, i18n beyond EN + BM, Sentry.

## 6. Risks to watch this build
| Risk | Early check |
|---|---|
| TS 7 / NativeWind / Privy Expo compatibility with newest versions | Day 1 smoke test; pin older version per package if it breaks |
| `@google/genai` 1 → 2 API changes | Port `configs/ai.ts` on day 1 with one structured-output call |
| Devnet RPC rate limits / outage during the live demo | Dedicated RPC from day 1; offline fallback (local validator + `DEMO_SIGNER=1` + `AI_PROVIDER=mock`) |
| Large UGC videos through the API → Cloudinary | Size cap on multer (e.g. 100 MB); short clips in the demo |
| Cloudinary free-tier limits | `demo:reset` cleans the demo folder; check quota day 1 |
| Local and hosted environments interfering on devnet | Separate program IDs, keypairs, DBs and Cloudinary folders per environment |
| Hosted API sleeping (cold starts kill WebSockets / crank) | Railway serverless/sleep **off** for `api`; Hobby plan through the judging window |
| Anchor TS client vs Privy signer (web3.js v1 vs Kit) | Sign one sponsored tx end-to-end on day 2 |
| Slot rent cost | Close accounts after period; measure on day 5 |

## 7. Post-hackathon roadmap: escrow contract v2
The current program (22 instructions, 24 LiteSVM tests, devnet) is the **MVP**. It follows the same job-escrow pattern as [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) (client / provider / evaluator; Open → Funded → Submitted → Completed / Rejected / Expired; fee only on completion; refunds that can't be blocked), extended for creator campaigns:
- many creators × many slots per campaign
- auto-release when the brand is silent (ERC-8183 refunds the client instead)
- 70/30 still-live holdback, resubmits, shipping, per-sale accrual
- fee snapshot per campaign, capped at `MAX_FEE_BPS`

Known gaps to close in v2, in priority order:
- [ ] **Bad-faith rejection.** `handle_reject` (programs/kolab/src/instructions/slot.rs) ignores on-chain check results. A brand can reject passing work until `mark_missed` refunds it. Fix: once `checks == Passed`, allow at most one reject with a reason code. After that, the slot auto-releases instead of becoming missable. Add a LiteSVM test for the "reject → resubmit → reject again" path.
- [ ] **Single verifier key.** `attest_checks`, `attest_live` and `record_sale` trust one backend key. Options: multisig / threshold attestors, a stake and slash bond for the verifier, or signed store webhooks verified on-chain (Ed25519 program) for sales.
- [ ] **Disputes.** No arbitration today (same as ERC-8183). Option: an optional arbiter set per campaign with a short dispute window before refund or release finalises.
- [ ] **Admin powers.** Limit `set_verifier` / config changes with a timelock + multisig upgrade authority; then freeze or verify the build (`solana-verify`).
- [ ] **Audit.** External review + fuzzing (Trident) before mainnet; extend LiteSVM tests to every state transition and every account constraint.
- [ ] **Interop.** Emit ERC-8183-style events/terminology in the SDK so agent tooling can read Kolab jobs; consider reputation export (ERC-8004-style) from on-chain outcomes.

## 8. Post-hackathon roadmap: services, not just products
Escrow, slot payouts, checks and reputation already work for any offering. To make services (salons, clinics, F&B, gyms, tutors, hotels) and apps first-class:
- [ ] Campaign field "What are you promoting?": product / service / app; drives labels everywhere
- [ ] AI brief + caption prompts per offering (visit, booking, trial, download instead of unboxing); brief form accepts a service description or booking page link
- [ ] Visit flow on the existing shipping instructions (no program change: `requires_shipping` = "creator must receive something before deadlines start"): brand "Confirm booking" (date, time, location) instead of "Ship product" (`mark_shipped`, tracking hash = booking ref); creator "I visited" (`confirm_received`) / "Booking didn't happen" (`report_not_received`); booking details instead of a shipping address
- [ ] Brand kit copy: "photos" (venue, menu, app screens) instead of "product photos"
- [ ] Per-sale for services: bookings/orders reported by a booking or POS webhook, with brand-confirmed sales as the fallback
- [ ] Discover filters and chips: "Free visit / trial" next to "Free product"
