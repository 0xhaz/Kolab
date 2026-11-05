# Kolab

**Brands hire Southeast Asian micro-creators and pay them in USDC through an on-chain escrow on Solana.**

The brand locks the budget in a program-owned escrow before any work starts. Creators deliver, an automated verifier checks the post, and the escrow pays out by itself, even if the brand never logs back in. Creators sign in with an email, get a wallet without a seed phrase, never pay a network fee, and can cash out to the chain they actually use.

| | |
|---|---|
| **Live demo** | https://kolab-web-eight.vercel.app (devnet, demo mode on) |
| **API** | https://api-production-0d06f.up.railway.app/health |
| **Demo video** | _[link to the walkthrough]_ |
| **Program (devnet)** | [`7hTBC9iCNxZ3pmfk1EHstbB4hmxu2iRrNMZ4UhhChQfv`](https://explorer.solana.com/address/7hTBC9iCNxZ3pmfk1EHstbB4hmxu2iRrNMZ4UhhChQfv?cluster=devnet) |
| **Tracks** | Best Consumer App on Solana · Aurora Intents |

## The problem

Micro-creators in Malaysia, Indonesia and the Philippines (5k–100k followers) do most of the region's sponsored posts, and they get paid last: 30–90 day invoices, brands that go quiet after the post is live, and bank fees that eat small payouts. Brands, in turn, pay up front and hope the post goes up, stays up and carries the `#ad` disclosure.

Kolab replaces trust with an escrow:

- **Creators** see that the money exists before they film anything, and get paid within minutes of approval, or automatically after 72 hours if the brand doesn't respond.
- **Brands** only release money for a post that passed the checks, and get the held-back 30% back if the creator deletes it within 7 days.

## How it works

```mermaid
sequenceDiagram
    autonumber
    actor Brand as Brand (web)
    participant Escrow as Kolab program (Solana)
    participant API as Kolab API (indexer, verifier, crank)
    actor Creator as Creator (iOS app)

    Brand->>Escrow: create_campaign + fund_campaign (USDC)
    Creator->>API: apply with pitch and profile
    Brand->>Escrow: approve_creator
    Creator->>Escrow: enroll_creator (reserves slots)
    Creator->>Escrow: submit_deliverable (post link)
    API->>API: verifier checks post, author, timing, ad disclosure
    API->>Escrow: attest_checks
    alt Brand approves
        Brand->>Escrow: approve
    else Brand silent for 72h
        API->>Escrow: auto_release (crank)
    end
    Escrow-->>Creator: 70% of the slot in USDC
    API->>Escrow: attest_live after 7 days
    Escrow-->>Creator: remaining 30% holdback
    Creator->>API: cash out to any chain (Aurora Intents)
```

Every slot follows the same state machine on-chain. Nobody, including Kolab, can move escrowed USDC outside these transitions.

```mermaid
stateDiagram-v2
    [*] --> Open: enroll_creator / init_slot
    Open --> Submitted: submit_deliverable
    Submitted --> Rejected: reject (brand, with a reason)
    Rejected --> Submitted: submit_deliverable (resubmit)
    Submitted --> Released: approve (brand) after attest_checks
    Submitted --> Released: auto_release (72h, crank)
    Open --> Missed: mark_missed (deadline passed)
    Rejected --> Missed: mark_missed
    Released --> HoldbackReleased: attest_live (post still up after 7 days)
    Released --> HoldbackForfeited: post gone, holdback returns to brand
    Missed --> [*]: slot budget returns to brand
    HoldbackReleased --> [*]
    HoldbackForfeited --> [*]
```

### Campaign types

| Type | How the creator gets paid |
|---|---|
| **Per post** | A fixed USDC rate per approved deliverable |
| **Monthly package** | A bundle of posts with one budget, released slot by slot |
| **Per sale** | The creator gets a voucher code. The store's signed webhook triggers `record_sale`, and the creator claims per confirmed sale |
| **UGC** | Content files for the brand's own channels, no holdback |

Any type can **require shipping**: the brand ships the product first (`mark_shipped`), the creator confirms receipt (`confirm_received`), then delivers.

## Architecture

```mermaid
flowchart LR
    subgraph Clients
        Web["Web dashboard<br/>Next.js 16 · brands and creators"]
        Mobile["Creator app<br/>Expo 57 · iOS, native video editor"]
    end

    subgraph Backend["Kolab API (NestJS, Railway)"]
        Tx["Tx builder<br/>fee payer signs"]
        Indexer["Indexer<br/>mirrors program events"]
        Verifier["Verifier<br/>post checks"]
        Crank["Crank<br/>auto-release, still-live"]
        Funding["Funding and cash-out<br/>Aurora Intents"]
        DB[("Postgres")]
    end

    subgraph Solana["Solana devnet"]
        Program["Kolab program<br/>Anchor"]
        Vault["Campaign escrow<br/>USDC token account"]
    end

    Privy["Privy<br/>email login + embedded wallet"]
    Aurora["Aurora Intents<br/>NEAR Intents, mainnet"]
    Platforms["Social platforms, courier, store<br/>(mock service)"]

    Web --> Privy
    Mobile --> Privy
    Web --> Backend
    Mobile --> Backend
    Tx --> Program
    Program --> Vault
    Program -. events .-> Indexer
    Indexer --> DB
    Verifier --> Platforms
    Verifier --> Program
    Crank --> Program
    Platforms -. webhooks .-> Backend
    Funding <--> Aurora
```

### Where Solana matters

- **The escrow is the product.** Budgets sit in a program-owned USDC account per campaign. Release rules (approval, the 72-hour auto-release, the 70/30 holdback, the still-live check, per-sale claims) are enforced by the program, not by Kolab's database.
- **Gasless for users.** Kolab's fee payer co-signs every transaction, so brands and creators never hold SOL.
- **Wallets without crypto UX.** Privy creates an embedded Solana wallet at email sign-up. Users sign with a tap.
- **Fast, cheap settlement.** A 10 USDC payout costs a fraction of a cent and lands in seconds, which makes per-post and per-sale payouts to small creators viable.
- **The database is a mirror.** The indexer rebuilds campaign, enrollment and slot state from program events, so the chain is the source of truth.

### Aurora Intents: any-chain in, any-chain out

Brands can fund a campaign from USDC on other chains, and creators can cash out to the chain or token they use.

```mermaid
flowchart LR
    B["Brand pays USDC on Base"] -->|"real Aurora swap, mainnet"| R["Kolab relay wallet<br/>Solana mainnet"]
    R -->|"top_up_campaign, same amount"| E["Campaign escrow<br/>Solana devnet"]
    E -->|"creator cashes out"| R2["Relay sends mainnet USDC"]
    R2 -->|"real Aurora swap, mainnet"| C["Creator receives on Base, etc."]
```

To be upfront: the escrow runs on **devnet** for this PoC, and the Aurora leg is **live on mainnet** with real quotes, deposit addresses, settlement and refunds. A small relay wallet bridges the two, capped at 10 USDC per flow and per user per day. In production the relay goes away: Intents Connect deposits straight into the mainnet program and calls `top_up_campaign`, which is already wired as `AURORA_MODE=aurora`. A fully simulated mode (`AURORA_MODE=simulated`) is available for free local runs.

## What's in the box

- **Brand dashboard (web):** create, fund and publish campaigns; review applicants by niche, audience and track record; approve on-chain; review submissions with their check results; ship products; fund from any chain.
- **Creator app (iOS) and web:** email sign-up, profile with channels and samples, Discover, apply, join, brand kit and brief, AI hook ideas (Gemini, with template fallback), a native video editor (trim, captions, music, end card), deliver, earnings, withdraw and cash out to any chain.
- **Automated verifier:** checks the post exists, the author matches the linked handle, the timing fits the campaign, and the `#ad` disclosure is present.
- **Demo mode:** a demo-clock build of the program lets the Demo panel skip the 72-hour and 7-day windows, fire mock sales and mark parcels delivered.
- **Account deletion** that refuses while money or work is outstanding (App Store 5.1.1(v)).

## Repo layout

| Path | What |
|---|---|
| `programs/kolab` | Anchor program: escrow, slots, approvals, sales, demo clock |
| `apps/api` | NestJS API: tx builder, indexer, verifier, crank, Aurora funding and cash-out |
| `apps/web` | Next.js dashboard for brands and creators |
| `apps/mobile` | Expo creator app with a native Swift video editor |
| `apps/mock` | Mock social platform (oEmbed), courier and store webhook |
| `packages/shared` | Types and zod schemas shared by every app |
| `packages/sdk` | Generated program client (Codama) |
| `packages/ai` | Gemini adapter for hooks and captions |
| `packages/ui` | Theme tokens |

## Run it locally

Prerequisites: Node 24 (`nvm use`), pnpm 12 (`corepack enable`), Docker, Rust (pinned in `rust-toolchain.toml`), Solana CLI 4.1.2, Anchor 1.2.1 (`avm use 1.2.1`), Xcode for the iOS app.

```bash
pnpm install
pnpm db:up                                   # Postgres on localhost:5433
cp apps/api/.env.example apps/api/.env       # fill PRIVY_*, keys, PROGRAM_ID, USDC_MINT
cp apps/web/.env.example apps/web/.env.local # fill NEXT_PUBLIC_PRIVY_APP_ID
cp apps/mobile/.env.example apps/mobile/.env # fill EXPO_PUBLIC_PRIVY_APP_ID / _CLIENT_ID
pnpm --filter @kolab/api exec prisma migrate deploy
pnpm --filter "./packages/*" build
```

```bash
pnpm dev                                     # packages (watch), mock, API :4000, web :3000
pnpm --filter @kolab/mobile ios              # build and install the iOS dev build
pnpm --filter @kolab/mobile start            # Metro for the installed dev build
```

Tests:

```bash
cargo test -p kolab                          # program tests (LiteSVM)
pnpm --filter @kolab/api test                # API tests
pnpm --filter @kolab/api devnet:flow         # every money path against devnet, ends with PASS 16/16
pnpm typecheck && pnpm lint
```

More detail: [architecture](docs/architecture.md) · [tech stack](docs/techstacks.md) · [workplan](docs/workplan.md).
