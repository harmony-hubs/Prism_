# PRISM — programmable asset authority on Solana

[![CI](https://github.com/harmony-hubs/Prism_/actions/workflows/ci.yml/badge.svg)](https://github.com/harmony-hubs/Prism_/actions/workflows/ci.yml)

> **Threshold-signed asset authority.** A **Solana program** decides what's allowed to sign; an **Ika 2PC-MPC** quorum produces a **native signature**; the asset never leaves its home chain. On top of that primitive, PRISM adds **Encrypt-shaped policy gates**, **sovereign-recovery PDAs**, and (next) **paired intents** that settle bridgeless markets on the same gate.

**[Colosseum Frontier 2026](https://colosseum.com/frontier)** — **Encrypt & Ika** track · [Superteam — Bridgeless & encrypted capital markets](https://superteam.fun/earn/listing/encrypt-ika-frontier-april-2026)

### Status

| | |
|---|---|
| Stage | Pre-alpha · Solana **devnet** only · not audited |
| Solana controller | `prism-program` (Pinocchio + [`ika-dwallet-pinocchio`](https://github.com/dwallet-labs/ika-pre-alpha)) — set `VITE_PRISM_PROGRAM_ID` after deploy |
| CPI authority | `find_program_address(["__ika_cpi_authority"], PRISM_PROGRAM_ID)` (bound after `init_prism`) |
| Ika dWallet program (devnet) | `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY` |
| Engine | `prism` CLI — Rust + gRPC ([`client/`](client/)); needs `protoc` on `PATH` to build |
| UI | React + Vite + Three.js (R3F) — 3D quorum-vote prism (`src/PrismCore3D.tsx`) |
| Sui twin | Tracked, not yet shipped |
| Public repo | [github.com/harmony-hubs/Prism_](https://github.com/harmony-hubs/Prism_) (MIT) |
| Internal architecture truth | [IKA_INTEGRATION.md](IKA_INTEGRATION.md) — read before adding TS snippets or new flows |

### What PRISM adds over plain dWallet custody

| Layer | Primitive | Where in this repo |
|---|---|---|
| **Custody** (parity with Ika dWallet references — see [Adjacent reference implementations](#adjacent-reference-implementations) below) | `approve_message` CPI → MessageApproval | `program/src/lib.rs::approve_action`; CLI `client/src/main.rs::sign` |
| **Encrypt policy gate** | `approve_action_gated` only fires when `["prism_policy", owner, message_hash][0] == 1` | `program/src/lib.rs::{init_encrypt_policy_gate, set_encrypt_policy_eligible, approve_action_gated}` |
| **Sovereign recovery** | `prism_sovereign` PDA — heartbeat / inactivity / panic / recovery state machine | `program/src/lib.rs` (`init_sovereign` / `poke_sovereign` / `spring_inactivity` / `spring_panic`); UI `src/SovereignCommand.tsx` |
| **Paired intents** *(designed, not yet implemented)* | `place_intent` + `match_intents` flip two paired Encrypt gates **atomically** — cryptographic atomic settlement, no bridge contract anywhere in the path | Builds on `approve_action_gated`; design notes in [IKA_INTEGRATION.md](IKA_INTEGRATION.md) |
| **Quorum-vote UI** | 3D refractive prism; chains live as colored light reflections inside; every signature renders as quorum particles spiraling through the glass | `src/PrismCore3D.tsx` |

> **Pre-alpha disclaimer (Ika, abridged from the book).** *Pre-alpha only: no real MPC — a single mock signer; interfaces and formats may change; devnet state may be wiped before Ika Alpha 1. Do not use real funds, do not rely on keys or security, software is as-is.* See the [dWallet Developer Guide](https://solana-pre-alpha.ika.xyz/print.html) — search **“Pre-Alpha Disclaimer”** for the full text, and our `PRE_ALPHA_DISCLAIMER_SHORT` constant in `src/dwallet/solanaGuide.ts`.

### dWallet: authority, not transport

PRISM reproduces the **Ika team's** dWallet positioning memo **verbatim** in [`DWALLET_AUTHORITY_FRAMING_SEGMENTS`](src/dwallet/solanaGuide.ts), with attribution at [`DWALLET_AUTHORITY_FRAMING_ATTRIBUTION`](src/dwallet/solanaGuide.ts) and a byline in **Learn** (`data-testid="dwallet-authority-attribution"`). PRISM **did not author** that text — we render it word-for-word so reviewer-facing copy stays faithful to the primitive's authors. Edit the segments only when the source memo changes; the UI and docs follow.

**Pull quote (one line from that memo):** *Ika lets Solana programs control native asset actions on any chain through programmable, zero-trust signing.*

### Adjacent reference implementations

If you've seen **[ikavery v0.1](https://www.ikavery.com/)** ([@iamknownasfesal](https://github.com/iamknownasfesal)) — the clean two-chain reference for Ika 2PC-MPC custody (a **Sui Move** package and a **Solana `Quasar`** program, each with a published TypeScript SDK) — that is the **custody-layer peer** to PRISM. ikavery answers *"how do you place a key under threshold MPC and recover it?"* PRISM answers *"now that you have that key, what can a Solana program decide is allowed to sign with it?"*

Reviewers familiar with ikavery should expect **parity at the dWallet primitive** (same Ika 2PC-MPC, same `approve_message` → MessageApproval flow on Solana) and find PRISM sitting one layer up. The diff:

| | ikavery | PRISM |
|---|---|---|
| Solana controller | `Quasar` program | `prism-program` (Pinocchio) |
| Sui controller | Sui Move package | not yet (tracked) |
| TypeScript SDK | `@fesal-packages/ikavery-{sui,solana}-sdk` | embedded in the wallet UI; standalone SDK on the roadmap |
| Encrypt policy gate | — | `approve_action_gated` + per-message-hash policy PDA |
| Sovereign / recovery state | "Recovery proposals" (generic) | `prism_sovereign` PDA: heartbeat + inactivity + panic + recovery |
| Bridgeless-market path | — | paired intents on the same Encrypt gate (in design) |
| UI | text + lists | 3D refractive prism; signing renders as quorum particles converging through the glass |

ikavery is custody-only and ships it cleanly on two chains; PRISM is **custody + programmable signing authority + sovereign recovery + (next) paired intents**, all on top of the same Ika dWallet primitive. The two projects are complementary, not competing.

### Ika docs ↔ this repo (60-second cross-walk)

| Ika doc / concept | Where in this repo |
|---|---|
| [dWallet Developer Guide — Introduction](https://solana-pre-alpha.ika.xyz/introduction.html) | `src/dwallet/solanaGuide.ts` (`DWALLET_FLOW_STEPS`, `DWALLET_PRISM_CHECKLIST`) — same five-step flow with checklist parity |
| [Print / single page](https://solana-pre-alpha.ika.xyz/print.html) | `IKA_INTEGRATION.md` — internal stack truth, Solana dWallet vs Sui SDK |
| **CPI authority** seed `["__ika_cpi_authority"]` | `program/src/lib.rs` (`init_prism`); preview in `src/dwallet/solanaOnChain.ts::deriveCpiAuthorityPda` |
| **`approve_message`** CPI | `program/src/lib.rs::approve_action` (and `approve_action_gated` for the policy-PDA path) |
| **DWallet account** / disc 2 layout (`docs/src/reference/accounts.md`) | Single source: `client/src/ika_client.rs::parse_ika_dwallet_account` (disc=2, authority@2, curve@34 u16 LE, pubkey_len@37, pubkey@38); browser mirror: `src/dwallet/solanaOnChain.ts::parseDWalletAccountData` |
| **MessageApproval** account / disc 14 layout | `src/dwallet/solanaOnChain.ts::parseMessageApprovalData` (status @172, sig_len @173–174, sig @175+) |
| **MessageApproval PDA** seeds (`["dwallet", chunks(curve_u16‖pubkey)], "message_approval", scheme_u16_le, keccak256(message)`) | `src/dwallet/solanaOnChain.ts::deriveMessageApprovalPda` + `dwalletPdaSeedChunks` |
| **DWalletCoordinator** PDA `find_program_address(["dwallet_coordinator"], ika_dwallet_program_id)` | `client/src/main.rs` (CLI) — used in `approve_action` instruction account list |
| **Signature scheme** encoding (u16 LE in ix data) | `client/src/main.rs`, mirrored in `AGENTS.md` |
| **gRPC: SubmitTransaction / Sign / DKG** | `client/src/ika_client.rs` (`prism-client` binary `prism`) |
| **Sui `IkaClient` (`@ika.xyz/sdk`)** | **Not** the Solana DKG path — see [`IKA_INTEGRATION.md`](IKA_INTEGRATION.md) §"Two Ika tracks" |

### Product story (demos, press, and first-time users)

- **What it is:** a single app surface where users keep their normal wallets, while your **policy program** (plus optional Encrypt direction) can approve **Ika dWallet** signatures and native-chain message approvals without PRISM or a bridge **custodying** user funds.  
- **What you do in the app:** connect Phantom, use **Send / Receive** (wallet-signed transfers), and open **Learn** for the dWallet + operator path. PRISM is a **control surface**, not a swap UI; same-chain DEXes are a separate product layer.  
- **Why it matters for the industry:** the default is *representation-first* (more wrappers, more bridges). A program on Solana that approves **native** signatures and private eligibility moves logic to *what should be allowed to sign* — that is bridgeless capital markets per the canonical memo.  
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
| **Ika dWallet** | **Programmable signing authority**: native-chain signatures conditioned on a Solana program — not a bridge, not a wrapped balance, not a wallet UI. | Our **PRISM program** uses **`ika-dwallet-pinocchio`**, a **CPI PDA**, and **CPI `approve_message`** to the Ika dWallet program; **off-chain** `prism-client` uses `ika-grpc` + `ika-dwallet-types`. |
| **Encrypt** | Confidential policy / FHE direction on Solana | We ship a **per–message-hash policy PDA** and **`approve_action_gated`**: the **same** Ika CPI only if **`eligible == 1`**. The **demo setter** stands in until **Encrypt `execute_graph` / real CPI** drives eligibility. |

---

## Architecture (high level)

```
┌──────────────────────────────────────────────────────────────┐
│                            PRISM                             │
│                                                              │
│  ┌──────────────┐    ┌──────────────────┐    ┌─────────────┐ │
│  │ Web (Vite)   │    │ PRISM on-chain   │    │ Rust CLI    │ │
│  │ + Phantom    │    │ Pinocchio +      │    │ `prism`     │ │
│  │ Learn /      │    │ Ika CPI +        │    │ Ika gRPC    │ │
│  │ Command ctr  │    │ policy + sov.    │    │ DKG, sign   │ │
│  └──────┬───────┘    └────────┬─────────┘    └──────┬──────┘ │
│         └─────────────────────┴─────────────────────┘        │
│                                                              │
│             Ika dWallet program (Solana devnet)              │
│        — approve_message → MessageApproval (disc 14)         │
│        — approve_action_gated → policy PDA gate              │
└──────────────────────────────────────────────────────────────┘
```

---

## Repository layout

```
.
├── program/                 # `prism-program` — Ika CPI, Encrypt gate, sovereign PDAs
│   └── src/lib.rs
├── client/                  # `prism-client` — binary `prism` (Ika gRPC, txs, policy-*)
│   └── src/
│       ├── main.rs          # CLI subcommands + ix builders (mirrors program disc)
│       └── ika_client.rs    # canonical dWallet account parser + PDA seeds (book §accounts)
├── voting/                  # `prism-voting` — quorum / voting example (Ika patterns)
├── src/                     # PRISM web app (React + Vite + Three.js / R3F)
│   ├── app.tsx
│   ├── boot.tsx
│   ├── main.tsx
│   ├── PrismCore3D.tsx      # 3D refractive prism: chains as inner light, signing = quorum particles
│   ├── PrismGlyph.tsx       # SVG silhouette / fallback behind the WebGL canvas
│   ├── Crystal.tsx          # splash-screen R3F crystal (separate scene)
│   ├── PrismLearn.tsx       # dWallet / Ika + Encrypt story + Operator tools
│   ├── SovereignCommand.tsx # rendered as "Command center" in the UI
│   └── dwallet/             # solanaOnChain (mirrors ika_client.rs) + canonical memo
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
| **Command center** | Devnet **heartbeat / trap** UI (PRISM `prism_sovereign` PDA) when `VITE_PRISM_PROGRAM_ID` is set and Phantom is connected — armed / inactivity / panic / recovery |
| **Test sign** (facets) | **Practice** UI feedback for the dWallet path — not a full on-chain Ika sign by itself |

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
- **UX + proof:** one shell for **dWallet** education, **command center** devnet tools (heartbeat / inactivity / panic / recovery), and **Operator console** (PDA, keccak, MessageApproval) — with clear **pre-alpha** disclaimers. PRISM stays a **control surface**, not a swap UI.

---

## License

[MIT](LICENSE)

---

*PRISM — Solana programs control native asset actions on any chain through programmable, zero-trust signing.*
