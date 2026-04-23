# Ika integration — internal truth (PRISM)

This document is the **source of truth** for how this repository talks to **Ika** and why certain SDKs *do not* apply to the Solana dWallet path. Read it before adding TypeScript, new programs, or “one-click dWallet” UX.

### Team audit (is our direction correct?)

| Theme | Avoid | Do instead | Status |
|--------|--------|------------|--------|
| **Onboarding** | Sui `IkaClient` in the browser for Solana dWallet DKG | **`prism` CLI** (gRPC) for DKG/creation; **UI = glass** (show CPI/MessageApproval/dWallet material from real keys & RPC) | On track; wire CLI output → UI is the next *product* step |
| **“Bridgeless” policy** | Framing **Jupiter** as “the bridge problem” for **same-ledger** SOL swaps | **Jupiter** = optional **Solana DEX** liquidity (different concern). **Ika story** = **`approve_message`** / **MessageApproval** and **`approve_action_gated`** (Solana program as gate) for **native** signing *per book* | On track; keep the two ideas separate in talks |
| **Stack** | Anchor / Sui-only mental model for this program | **Pinocchio** `program/` + **Rust gRPC** `client/`; book-aligned | Correct |

**Environment:** Set **`VITE_PRISM_PROGRAM_ID`** in `.env` after deploy so the hub, Sovereign, and Learn can derive PDAs and talk about *your* controller id—not optional for a convincing “Sovereign” demo.

---

## Two Ika tracks (do not mix them)

| Track | What it is | Role in this repo |
|--------|------------|-------------------|
| **Solana dWallet (pre-alpha)** | [dWallet Developer Guide](https://solana-pre-alpha.ika.xyz/print.html): gRPC (DKG, sign), Pinocchio CPIs to the **Ika dWallet program** on Solana, `approve_message` → **MessageApproval** | **Primary.** `client/` (binary **`prism`**), `program/`, `src/dwallet/` (RPC parsing, PDA preview). |
| **Sui + `@ika.xyz/sdk` (`IkaClient`)** | TypeScript client centered on a **Sui** `suiClient`, Mysten `Transaction`, Ika on-chain objects | **Not** the driver for browser-side **Solana** DKG. The same npm package can ship both Sui and other helpers; **`IkaClient` is not a drop-in “create Solana dWallet from Phantom.”** |

**Rule:** If a snippet uses `IkaClient({ suiClient, config })` and `@mysten/sui`, it targets the **Sui Ika** surface. **Solana** dWallet work follows the **book + gRPC** path below.

**Rule:** The **`@ika.xyz/sdk`** entry in `package.json` is **not** permission to do Solana MPC from the Vite app without a designed bridge. Treat it as **separate** until explicitly wired and documented in this file.

---

## The three layers (PRISM)

### 1. Hub (browser — Vite)

- **Role:** “Sovereign” **vision**, Phantom **Solana** connect, read-only or **user-signed Solana** txs, **Learn** (Operator console), portfolio **estimates** where applicable.
- **Reality:** No **DKG** and no **full `approve_message` submit** in the browser as the main path **today**; the **prism** CLI and Ika gRPC do that.
- **On-chain program:** Needs **`VITE_PRISM_PROGRAM_ID`** (after deploy) for PDAs, Sovereign UI, and consistent checklist copy in Learn.

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
| Sui in npm (`@ika.xyz/sdk`) | **Not** the Solana dWallet DKG path until stated otherwise in this file |

---

## Changelog (edit when architecture changes)

| Date | Change |
|------|--------|
| 2026-04-22 | Initial: Pinocchio + `prism` gRPC = Solana dWallet; `@ika.xyz/sdk` `IkaClient` = Sui-oriented; no browser DKG by default. |
| 2026-04-22 | Added team audit table + Jupiter / Ika framing; env note for `VITE_PRISM_PROGRAM_ID`. |
