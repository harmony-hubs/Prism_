# PRISM — Sovereign command for cross-chain identity and private policy

[![CI](https://github.com/harmony-hubs/Prism_/actions/workflows/ci.yml/badge.svg)](https://github.com/harmony-hubs/Prism_/actions/workflows/ci.yml)

**One identity. Every chain. Nothing exposed.**

Public repo: **[github.com/harmony-hubs/Prism_](https://github.com/harmony-hubs/Prism_)** (MIT).

**[Colosseum Frontier 2026](https://colosseum.com/frontier)** — **Encrypt & Ika** track · [Superteam — Bridgeless & encrypted capital markets](https://superteam.fun/earn/listing/encrypt-ika-frontier-april-2026)

PRISM is a **Sovereign Command Center** for cross-chain identity. It pairs a **Solana controller** with **operator UX** and uses **Ika** (2PC-MPC **dWallets** on Solana) for bridgeless `approve_message` / **MessageApproval** flows, plus **Encrypt**-shaped **policy gating** (on-chain eligibility before that CPI).

### At a glance (Ika / reviewers)

| You want… | Start here |
|-----------|------------|
| **Book alignment** | Same high-level path as the [dWallet Developer Guide](https://solana-pre-alpha.ika.xyz/): **create dWallet → CPI authority to your program → `approve_message` → MessageApproval**. See **Ika docs ↔ this repo** below. |
| **On-chain CPI** | `program/src/lib.rs` — `approve_action` / `approve_action_gated` CPI to the Ika dWallet program; CPI PDA = `find_program_address(["__ika_cpi_authority"], PRISM_PROGRAM_ID)`. |
| **Off-chain + gRPC** | `client/` — `prism` CLI (`create`, `sign`, `policy-*`, `status`). Needs **`protoc`** on `PATH` to build (see **How to run**). |
| **Operator UI** | `npm install && npm start` → **Learn** → Operator console (`src/DWalletTools.tsx`) + on-chain helpers in `src/dwallet/`. |
| **Pre-alpha defaults** | Ika gRPC + devnet dWallet program id are documented in **Pre-alpha environment**; do not use real funds per Ika’s disclaimer. |

**Internal Ika stack (Solana vs Sui SDK):** see **[IKA_INTEGRATION.md](IKA_INTEGRATION.md)** before adding TS snippets or new flows.

### Product story (demos, press, and first-time users)

- **What it is:** a single app surface where users keep their normal wallets, while your **policy program** (plus optional Encrypt direction) can approve **Ika dWallet** signatures and native-chain message approvals without PRISM or a bridge **custodying** user funds.  
- **What you do in the app:** connect Phantom, use **Send / Receive** (wallet-signed transfers), open **Learn** for the dWallet + operator path, or **Trade** (Jupiter) with the same confirm pattern as in production.  
- **Why it matters for the industry:** the default is fragmented keys and more bridge **surface area**. A controller on Solana that approves **native** signatures and private eligibility is a path to **less bridge custody** and clearer user intent.  
- **This repo’s chain:** the web build targets **Solana devnet** (value-free) so the flow is safe to show publicly; the **UI and product narrative** are written as if the same app ships after mainnet — devnet is implementation detail, not the headline.

---

## Canonical dWallet steps (Ika Solana pre-alpha)

Follow the official book: **[dWallet Developer Guide](https://solana-pre-alpha.ika.xyz/)** · [Introduction](https://solana-pre-alpha.ika.xyz/introduction.html) · [Print / single page](https://solana-pre-alpha.ika.xyz/print.html). High level: **create dWallet → CPI authority to your program → `approve_message` → signature in MessageApproval**. Product overview: [ika.xyz](https://ika.xyz/).

In this app, the **Learn / dWallet** area mirrors that checklist, pre-alpha RPC endpoints, and an **Operator console** (CPI PDA, keccak → **MessageApproval** PDA preview, dWallet inspect, approval polling) aligned with `client/`. **Phantom** in the header can swap the Solana row to your **devnet** pubkey and live balance.

Copy **`.env.example` → `.env`** and set **`VITE_PRISM_PROGRAM_ID`** after you deploy `program/` (legacy: `VITE_HOLLOW_PROGRAM_ID` is still read as a fallback).

---

## The problem

If you use Bitcoin, Ethereum, Solana, and more, your **on-chain identity is fragmented** and **defaults to fully public** links between addresses. Proving *“I have collateral or reputation”* without revealing **where** and **how much** is hard. Traditional bridges and custodians add trust and operational overhead.

## The solution

| Piece | What it does | How PRISM uses it |
|-------|----------------|-------------------|
| **Ika** | MPC dWallets on Solana — **native** chain signing from **approved** messages, not custodial bridges | Our **PRISM program** uses **`ika-dwallet-pinocchio`**, a **CPI PDA**, and **CPI `approve_message`** to the Ika dWallet program; **off-chain** `prism-client` uses `ika-grpc` + `ika-dwallet-types`. |
| **Encrypt** | Confidential policy / FHE direction on Solana | We ship a **per–message-hash policy PDA** and **`approve_action_gated`**: the **same** Ika CPI only if **`eligible == 1`**. The **demo setter** stands in until **Encrypt `execute_graph` / real CPI** drives eligibility. |

---

## Architecture (high level)

```
┌────────────────────────────────────────────────────────────┐
│                           PRISM                            │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ Web (Vite)  │  │ PRISM on-chain  │  │ Rust CLI     │  │
│  │ + Phantom   │  │ Pinocchio +     │  │ (gRPC + RPC)  │  │
│  │ Learn/Trade  │  │ Ika CPI + gate  │  │ `prism`       │  │
│  │ Sovereign UI │  │                 │  │              │  │
│  └──────┬──────┘  └────────┬──────────┘  └──────┬───────┘  │
│         └──────────────────┴────────────────────┘         │
│                      Ika dWallet (devnet)                 │
│         ┌────────────────────────────────────────┐         │
│   Policy PDA (Encrypt hook) → then approve_message        │
│   (gated)            │     (ungated approve_action)      │
│         └────────────────────────────────────────┘         │
└────────────────────────────────────────────────────────────┘
```

---

## Repository layout

```
.
├── program/                 # `prism-program` — Ika CPI, Encrypt gate, sovereign PDAs
│   └── src/lib.rs
├── client/                  # `prism-client` — binary `prism` (Ika gRPC, txs, policy-*)
│   └── src/
├── voting/                  # `prism-voting` — quorum / voting example (Ika patterns)
├── src/                     # PRISM web app (React + Vite)
│   ├── app.tsx
│   ├── boot.tsx
│   ├── main.tsx
│   ├── PrismLearn.tsx       # dWallet / Ika + Encrypt story + Operator tools
│   ├── PrismTrade.tsx      # Jupiter-integrated live swap (separate from devnet demo)
│   ├── SovereignCommand.tsx
│   └── dwallet/             # On-chain helpers, Phantom, solanaOnChain, guides
├── e2e/                     # Playwright (splash → hub → dWallet lab)
├── move/                    # Sui — `prism.move` (vision / reference; not required for Solana)
├── scripts/                 # e.g. `prism-sign.ps1`, SBF build helpers
├── IKA_INTEGRATION.md        # Ika: Pinocchio + gRPC vs `@ika.xyz/sdk` (Sui) — read first
├── index.html
├── package.json
├── playwright.config.ts
├── vite.config.ts
├── Cargo.toml               # workspace: program, client, voting
└── README.md
```

---

## On-chain program (`program/src/lib.rs`)

Pinocchio + [`ika_dwallet_pinocchio`](https://github.com/dwallet-labs/ika-pre-alpha) → CPI to **Ika dWallet program** on devnet (`87W54k…` by default; override via env/CLI in clients).

| Instruction | What it does |
|-------------|---------------|
| `init_prism` | Bring dWallet **authorities** under the PRISM **CPI PDA** |
| `approve_action` | **CPI `approve_message`** → MessageApproval (Ika book layout) |
| `transfer_authority` | Move dWallet authority (recovery, handoff) |
| `init_encrypt_policy_gate` / `set_encrypt_policy_eligible` | **Policy PDA** `["prism_policy", owner, message_hash]` — 1 byte eligibility |
| `approve_action_gated` | Same Ika CPI as `approve_action`, only if **eligible == 1** |
| `init_sovereign` / `poke_sovereign` / `attest_balance` / `set_armed` | `prism_sovereign` PDA — **heartbeat** + demo **inactivity / panic** thresholds (devnet; plaintext state) |
| `spring_inactivity` / `spring_panic` | **Permissionless** — transfer dWallets to **recovery** when trip conditions are met (see program) |

**Signing model (Ika):** your program **CPIs** `approve_message` → **MessageApproval** account → Ika / NOA path produces the signature; **read MessageApproval** for status and sig bytes. Pre-alpha: see book for **mock signer** and wipe risk — **not for real funds**.

---

## Frontend (what you actually get)

| Area | What it is |
|------|------------|
| **Splash / hub** | Passkey- / Google-**style** entry (WaaP SDK when exports exist) → **Assets** (chain “facets” + est. portfolio), **Activity** |
| **Learn / dWallet** | Ika + Encrypt narrative, book checklist, **Operator console** (PDA, keccak, inspect, MessageApproval) |
| **Sovereign** | Devnet **heartbeat / trap** UI when `VITE_PRISM_PROGRAM_ID` is set and Phantom is connected |
| **Trade** | **Jupiter** plugin — **real Solana** swap surface (not play-money; disclaimer in UI) |
| **Test sign** (facets) | **Practice** UI feedback — not a full on-chain Ika sign by itself |

---

## Submission snapshot (hackathon reviewers)

| Ask | Where |
|-----|--------|
| Public repo | **This repo** |
| Demo video (under 5 min) | Add link in README or `VIDEO_URL` in a doc you control |
| Deployed program id | Fill after `solana program deploy` → **`VITE_PRISM_PROGRAM_ID`** |
| Live app (optional) | e.g. Vercel, or `npm start` at `http://localhost:5173` |

---

## How to run

### Prerequisites

- **Node** 18+ · **Rust** stable  
- **protoc** on `PATH` for `prism-client` (gRPC) — [gRPC install](https://grpc.io/docs/protoc-installation/)  
- **Google Chrome** for e2e: `npx playwright install chrome`

### Web app

```bash
npm install
npm start
# or: npm run dev  — Vite @ http://localhost:5173
```

```bash
npm run build
npm run verify         # build + Playwright e2e
```

### On-chain (host check, no SBF)

```bash
cargo check -p prism-program -p prism-voting
```

`cargo check` on **`prism-client`** requires **protoc**; otherwise use the line above, or install protoc and `cargo check --workspace`.

### SBF build & deploy

Use **`cargo-build-sbf`** (Agave / Solana install, or `scripts/build-sbf.ps1`). On **Windows**, symlink errors → enable **Developer Mode** or run the shell elevated once. Deploy artifact is typically under `target/deploy/` with a name derived from the crate (e.g. `prism_program`).

```bash
solana program deploy target/deploy/prism_program.so --url devnet
```

Set **`VITE_PRISM_PROGRAM_ID`** (and `PRISM_PROGRAM_ID` for CLI) to **your** deployed id — **not** Ika’s `87W54k…`.

### CLI (examples)

```bash
export PRISM_PROGRAM_ID=<your_deployed_program_id>
export IKA_GRPC_URL=https://pre-alpha-dev-1.ika.ika-network.net:443
export SOLANA_RPC_URL=https://api.devnet.solana.com

cargo run --manifest-path client/Cargo.toml -- create --keypair ~/.config/solana/id.json
cargo run --manifest-path client/Cargo.toml -- sign --keypair ~/.config/solana/id.json \
  --dwallet <DWALLET> --message <64_HEX_KECCAK> --chain sol
cargo run --manifest-path client/Cargo.toml -- policy-init --keypair ~/.config/solana/id.json --message <64_HEX_KECCAK>
cargo run --manifest-path client/Cargo.toml -- policy-set --keypair ~/.config/solana/id.json --message <64_HEX_KECCAK> --eligible 1
cargo run --manifest-path client/Cargo.toml -- sign --keypair ~/.config/solana/id.json \
  --dwallet <DWALLET> --message <64_HEX_KECCAK> --chain sol --gated
cargo run --manifest-path client/Cargo.toml -- status --approval <MESSAGE_APPROVAL_PUBKEY>
```

---

## Config

| Var | Role |
|-----|------|
| `PRISM_PROGRAM_ID` / CLI `--prism-program` | Your **PRISM** program id (CPI PDA = `["__ika_cpi_authority"], program_id`) |
| `VITE_PRISM_PROGRAM_ID` | Same for the web app (`VITE_HOLLOW_*` still works as alias) |
| `VITE_SOLANA_RPC`, `VITE_SUI_RPC`, `VITE_IKA_GRPC`, `VITE_IKA_DWALLET_PROGRAM_ID` | Optional overrides (see `.env.example`) |

---

## Pre-alpha environment (defaults)

| Resource | Value |
|----------|--------|
| Ika gRPC | `https://pre-alpha-dev-1.ika.ika-network.net:443` |
| Solana RPC | `https://api.devnet.solana.com` |
| Ika dWallet program (devnet) | `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY` |

CPI PDA: `find_program_address(["__ika_cpi_authority"], YOUR_PRISM_PROGRAM_ID)` — [Ika CPI framework](https://github.com/dwallet-labs/ika-pre-alpha/blob/main/docs/src/on-chain/cpi-framework.md).

---

## Ika docs ↔ this repo

| Topic | Where |
|-------|--------|
| `DWalletContext`, `CPI_AUTHORITY_SEED` | `program/src/lib.rs`, `voting/src/lib.rs` |
| `approve_message` / signature scheme `u16` | `approve_action`, `approve_action_gated`, voting flows |
| MessageApproval layout (Ika disc 14) | `client/src/main.rs`, `src/dwallet/solanaOnChain.ts` |
| Message hash | **keccak256** of raw message (Ika message-approval docs) |
| gRPC | `client/src/ika_client.rs` |

---

## Why PRISM (judging angle)

- **Ika:** on-chain **CPI** to **your** controller + **MessageApproval**-aligned **CLI** and **Operator UI**.  
- **Encrypt:** **Composable gate** in front of the **same** Ika CPI; roadmap to **real Encrypt** driving eligibility.  
- **UX + proof:** one shell for **dWallet** education, **Sovereign** devnet tools, and optional **Jupiter** live trading — with clear **pre-alpha** disclaimers.

---

## License

[MIT](LICENSE)

---

*PRISM — one beam; policy and bridgeless execution where you put them.*
