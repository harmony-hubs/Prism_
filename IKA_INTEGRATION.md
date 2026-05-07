# Ika integration — internal truth (PRISM)

This document is the **source of truth** for how this repository talks to **Ika** and why certain SDKs *do not* apply to the Solana dWallet path. Read it before adding TypeScript, new programs, or “one-click dWallet” UX.

### Team audit (is our direction correct?)

| Theme | Avoid | Do instead | Status |
|--------|--------|------------|--------|
| **Onboarding** | Sui `IkaClient` in the browser for Solana dWallet DKG | **`prism` CLI** (gRPC) for DKG/creation; **UI = glass** (show CPI/MessageApproval/dWallet material from real keys & RPC) | On track; wire CLI output → UI is the next *product* step |
| **“Bridgeless” framing** | Mixing same-ledger DEX swaps (e.g. Jupiter) into the bridgeless story; positioning PRISM as a wallet UI with a swap | **Ika story only** = **`approve_message`** / **MessageApproval** and **`approve_action_gated`** (Solana program as policy gate) for **native** signing on each chain. PRISM is a control surface, not a swap UI. | On track; same-chain DEXes are a separate product surface and not in this build |
| **Stack** | Anchor / Sui-only mental model for this program | **Pinocchio** `program/` + **Rust gRPC** `client/`; book-aligned | Correct |

**Environment:** Set **`VITE_PRISM_PROGRAM_ID`** in `.env` after deploy so the hub, Sovereign, and Learn can derive PDAs and talk about *your* controller id—not optional for a convincing “Sovereign” demo.

---

## Two Ika tracks (do not mix them)

| Track | What it is | Role in this repo |
|--------|------------|-------------------|
| **Solana dWallet (pre-alpha)** | [dWallet Developer Guide](https://solana-pre-alpha.ika.xyz/print.html): gRPC (DKG, sign), Pinocchio CPIs to the **Ika dWallet program** on Solana, `approve_message` → **MessageApproval** | **Primary.** `client/` (binary **`prism`**), `program/`, `src/dwallet/` (RPC parsing, PDA preview). |
| **Sui + `@ika.xyz/sdk` (`IkaClient`)** | TypeScript client centered on a **Sui** `suiClient`, Mysten `Transaction`, Ika on-chain objects | **Not** the driver for browser-side **Solana** DKG. The same npm package can ship both Sui and other helpers; **`IkaClient` is not a drop-in “create Solana dWallet from Phantom.”** |

**Rule:** If a snippet uses `IkaClient({ suiClient, config })` and `@mysten/sui`, it targets the **Sui Ika** surface. **Solana** dWallet work follows the **book + gRPC** path below.

**Rule:** The **`@ika.xyz/sdk`** entry in `package.json` is **kept on purpose** as a tracking dependency for the Sui Ika surface (typings + reference) — it is **not** wired into the Vite app for Solana MPC, and is **not** permission to do Solana DKG in the browser. If we ever wire a Solana-side helper from this package, the architecture must be added to this doc first.

---

## The three layers (PRISM)

### 1. Hub (browser — Vite)

- **Role:** “Sovereign” **vision**, Phantom **Solana** connect, read-only or **user-signed Solana** txs, **Learn** (Operator console), portfolio **estimates** where applicable.
- **Reality:** No **DKG** and no **full `approve_message` submit** in the browser as the main path **today**; the **prism** CLI and Ika gRPC do that.
- **On-chain program:** Needs **`VITE_PRISM_PROGRAM_ID`** (after deploy) for PDAs, the Command center UI (`SovereignCommand.tsx`, rendered as **"Command center"**), and consistent checklist copy in Learn.

### 2. Engine (Rust — `prism` CLI + gRPC)

- **Crate:** `prism-client` (binary name **`prism`**) in `client/`.
- **Transport:** **`ika_client.rs`** and **`ika-grpc`** to the Ika pre-alpha gRPC URL (see `src/config.ts` / `.env.example` for the web; CLI env in `client/src/main.rs`).
- **Responsibility:** DKG / create flow, `sign`, `policy-*`, `status`, and staying aligned with **`program/`** instruction layout.

**Build note:** `protoc` on `PATH` is required to compile `prism-client` (see `README.md`).

### 3. Policy (on-chain — Pinocchio)

- **Framework:** **Pinocchio** + **`ika_dwallet_pinocchio`** — **not** Anchor for this program.
- **Crate:** `prism-program` in `program/src/lib.rs`.
- **Ika CPI:** `approve_action` and **`approve_action_gated`** (policy PDA) → Ika dWallet `approve_message` / MessageApproval story per the book.
- **Value:** Lightweight CPIs; moving to Anchor would be a **new** project, not a small tweak.

---

## What the web UI is allowed to claim

- It can show **CPI PDA**, **MessageApproval** derivation, **dWallet** account bytes (when addr known), and **message-hash / policy** story — see **`src/DWalletTools.tsx`**, **`src/dwallet/solanaOnChain.ts`**.
- It should **not** imply that **connect Phantom** alone runs **DKG** or that **`@ika.xyz/sdk`** (Sui `IkaClient`) replaces the **Solana** gRPC `create` path—unless and until this document is updated with a new architecture.

---

## Product framing: dWallet (verbatim canonical)

The full positioning memo — **word-for-word** — is **`DWALLET_AUTHORITY_FRAMING_SEGMENTS`** in `src/dwallet/solanaGuide.ts`. It renders in **Learn** (`data-testid="dwallet-authority-framing"`). **Do not paraphrase** in product-facing surfaces; change the segments array only when the canonical doc changes.

**Attribution (mandatory):** the memo is attributed to the **Ika team positioning** (constant `DWALLET_AUTHORITY_FRAMING_ATTRIBUTION` in the same file, rendered as a byline above the section in Learn). PRISM **did not author** this text — we reproduce it verbatim because the primitive's authors framed it best. If attribution should change, edit the constant; the UI byline follows.

**Pull quote (one line from that memo):** *Ika lets Solana programs control native asset actions on any chain through programmable, zero-trust signing.*

---

## The gap: browser ↔ MPC

- **Today:** dWallet **creation** and **MPC** sessions are **out of process** (CLI, keys on disk, gRPC to Ika).  
- **Future “easiest onboarding”** options (choose explicitly):  
  - a **small service** that proxies gRPC with auth, or  
  - a **documented** gRPC-to-web strategy once Ika supports it safely, or  
  - **export/import** of dWallet pub material from CLI into UI state (no DKG in browser).

**Do not** paste Sui `IkaClient` samples into the Solana hub and expect a working dWallet DKG.

---

## Vertical slice priorities (grounded)

1. **Onboarding (visibility):** After **`prism create`** (and `init_prism` as the book/CLI allow), the **dWallet** pubkey and chain-facing material should be **visible** in the app—whether by manual paste, a small import file, or `localStorage`—so **Learn / Operator** matches **reality** instead of **placeholder** multi-chain rows.
2. **Bridgeless capital (policy):** Tighten **`approve_action_gated`** and the **policy PDA** story so a **visible Solana-gated** condition (demo setter today; Encrypt / real policy later) must pass before the **same** Ika CPI as ungated `approve_action`. Prove **Solana as gatekeeper** for the signature request, not “replace DEX with one button.”

---

## Reference map

| Concern | Location |
|---------|----------|
| Solana dWallet book | [print.html](https://solana-pre-alpha.ika.xyz/print.html) |
| Ika gRPC + CLI commands | `client/src/main.rs`, `client/src/ika_client.rs` |
| On-chain instructions / CPI | `program/src/lib.rs` |
| Web config (RPC, gRPC URL, Ika program id) | `src/config.ts` |
| Operator + PDA / MessageApproval | `src/DWalletTools.tsx`, `src/dwallet/solanaOnChain.ts` |
| Agent runbook (CLI + console) | `AGENTS.md` |
| dWallet vs bridge (product copy) | **`DWALLET_AUTHORITY_FRAMING_SEGMENTS`** in `src/dwallet/solanaGuide.ts` (verbatim), Learn tab |
| Sui in npm (`@ika.xyz/sdk`) | **Not** the Solana dWallet DKG path until stated otherwise in this file |

---

## Adjacent reference implementations (where PRISM sits)

PRISM is **not** the only Ika 2PC-MPC reference on Solana, and that is on purpose — the field is small enough that reviewers benefit from being told where each project sits.

| Project | Layer | Where the work lives |
|---|---|---|
| **[ikavery v0.1](https://www.ikavery.com/)** ([@iamknownasfesal](https://github.com/iamknownasfesal)) | **Custody layer**: threshold-signed key custody + recovery proposals. Two-chain reference (Sui Move package + Solana `Quasar` program) with a published TypeScript SDK per chain (`@fesal-packages/ikavery-{sui,solana}-sdk`). | Sui: `0x7addf236…afedef`. Solana (devnet): `ikavRY1xV8…1bxFHa`. |
| **PRISM** (this repo) | **Authority + policy + recovery + (next) intent layer** on top of an Ika dWallet. Solana-first today; Sui twin tracked. | `program/src/lib.rs` (Pinocchio), `client/` (Rust + gRPC), `src/` (React + R3F). |

**How to read the relationship.** ikavery proves the Ika dWallet primitive cleanly — *"place a key under k-of-n MPC and recover it."* PRISM **assumes** that primitive and asks the next question — *"what should be allowed to sign with it, under what condition, and what visualises the vote?"* That is why PRISM ships:

1. **Encrypt policy gate** (`approve_action_gated` + `["prism_policy", owner, message_hash]` PDA) — the cryptographic precondition for atomicity (a signature literally cannot be produced unless the gate byte is `1`).
2. **`prism_sovereign` PDA** — a typed state machine for heartbeat / inactivity / panic / recovery, not a generic "recovery proposal" object.
3. **Paired intents (in design)** — `place_intent` + `match_intents` flip two paired Encrypt gates atomically in one Solana transaction; both Ika signatures release together or neither does. This is the "true bridgeless market" path: the only trust root is the Ika quorum (the same one ikavery already proves at the custody layer); no wrapped IOU, no bridge contract, no extra validator set.
4. **3D quorum-vote UI** (`src/PrismCore3D.tsx`) — votes are not text rows; they are visible particles converging through a refractive prism in the active chain's color.

**Not competing.** If a reviewer wants to vet *just* the Ika 2PC-MPC custody primitive, ikavery is the clean read. If they want to vet what a Solana program plus Encrypt buys you on top of that primitive, this repo is the read. Future cross-references go in this section, not scattered across the codebase.

---

## Changelog (edit when architecture changes)

| Date | Change |
|------|--------|
| 2026-04-22 | Initial: Pinocchio + `prism` gRPC = Solana dWallet; `@ika.xyz/sdk` `IkaClient` = Sui-oriented; no browser DKG by default. |
| 2026-04-22 | Added team audit table; env note for `VITE_PRISM_PROGRAM_ID`. |
| 2026-04-30 | Removed Jupiter swap UI; PRISM is a control surface only — same-chain DEXes are not in this build. |
| 2026-04-22 | Product framing: verbatim memo in `DWALLET_AUTHORITY_FRAMING_SEGMENTS` + Learn section. |
| 2026-04-30 | Attribution: memo attributed to Ika team positioning (`DWALLET_AUTHORITY_FRAMING_ATTRIBUTION`) — byline in Learn + this doc. |
| 2026-04-30 | Book conformance pass: CLI `Inspect` was using stale dWallet account offsets (authority@0, curve@98 u8, pubkey_len@97, pubkey@32). All three layers now share the canonical book layout (disc=2, authority@2, curve@34 u16 LE, pubkey_len@37, pubkey@38) via `client/src/ika_client.rs::parse_ika_dwallet_account` (single source of truth). Added unit tests locking the layout. |
| 2026-04-30 | Wallet UI rebuilt around the Ika quorum metaphor: `src/PrismCore3D.tsx` (R3F) renders the wallet as a refractive prism — chains are colored light points orbiting inside; signing animates as outer particles spiralling through the prism in the active chain's colour. Replaces the SVG glyph + horizontal spectrum bar + chain rows. |
| 2026-05-06 | Documented adjacent reference implementations: [ikavery v0.1](https://www.ikavery.com/) sits at the **custody layer** (Sui Move + Solana `Quasar` + TS SDK per chain). PRISM sits one layer up — same Ika dWallet primitive, plus Encrypt policy gate + `prism_sovereign` PDAs + (next) paired-intent atomic settlement. New "Adjacent reference implementations" section in this file and in `README.md`. |
