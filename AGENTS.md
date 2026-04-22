# Agent notes — Ika dWallet + PRISM

This file maps **Ika book steps** and **CLI** behavior to paths in this repo (for reviewers and agents).

Use it when the user asks how to **run the dWallet flow**, **`prism` CLI** (`prism-client`), or **Operator console** checks in PRISM.

## What runs where

| Layer | Role |
|--------|------|
| **PRISM (`npm run dev`)** | dWallet tab → **Operator console** (`src/DWalletTools.tsx`): derive MessageApproval PDA, inspect dWallet account bytes, poll MessageApproval status. Read-only RPC; no DKG in browser. |
| **prism-client** (`client/`, binary **`prism`**) | **DKG + signing**: `create` (gRPC DKG, optional `init_prism`), `sign` / `sign --gated`, `policy-init`, `policy-set`, `inspect`, `status`. Needs **Rust** + **`protoc`** on PATH for `cargo build` (gRPC). |
| **PRISM program** (`program/`) | Solana program: `init_prism`, `approve_message` (via `approve_action` CPI), `init_encrypt_policy_gate`, `set_encrypt_policy_eligible`, `approve_action_gated`. |

## Environment

- **Frontend**: `.env` — `VITE_PRISM_PROGRAM_ID` (legacy: `VITE_HOLLOW_PROGRAM_ID` still read in `src/config.ts`), optional `VITE_SOLANA_RPC`, `VITE_IKA_DWALLET_PROGRAM_ID`, `VITE_IKA_GRPC` (see `src/config.ts`).
- **CLI**: `PRISM_PROGRAM_ID`, `SOLANA_RPC_URL`, `IKA_GRPC_URL` (defaults in `client/src/main.rs`). Flag: `--prism-program` (alias: `--hollow-program`).

## Typical flow (happy path)

1. **Deploy** PRISM controller to devnet; set `VITE_PRISM_PROGRAM_ID` and `PRISM_PROGRAM_ID` to that program id.
2. **`prism create --keypair <json>`** (or `cargo run -p prism-client -- create …`) — completes DKG; run **`init_prism`** when the CLI offers it so dWallet authority becomes the **CPI PDA** (seed `__ika_cpi_authority`).
3. In PRISM **Operator console**: confirm **CPI authority PDA** matches; **Inspect dWallet** with the dWallet pubkey from CLI output.
4. **`prism sign`** — message is keccak preimage as **64 hex chars** (see CLI `--message`). The client submits `approve_action` with the **DWalletCoordinator** PDA (`find_program_address(["dwallet_coordinator"], ika_dwallet_program_id)`) and **u16 LE** signature scheme in the instruction data, matching current `ika-dwallet-pinocchio`. Optional **`--gated`** after `policy-init` + `policy-set`.
5. **Operator console**: derive **MessageApproval PDA** (fetches dWallet account → curve + pubkey seeds + Keccak256(message) + signature scheme u16); **Poll status** on that PDA until `SIGNED`.

## Code map

- `client/src/main.rs` — CLI subcommands and instruction builders (keep in sync with UI copy).
- `src/dwallet/solanaOnChain.ts` — PDA derivations + account layout parsing (mirrors CLI offsets).
- `program/src` — instruction discriminators and policy gate seeds `["prism_policy", owner, message_hash]`.

## Snap test (judge demo)

- **`prism snap-inactivity`** / **`prism snap-panic`** (see `client/src/main.rs`) — fee `--keypair`, `--sovereign` *or* `--owner`, `--dwallet-secp`, `--dwallet-ed`, global `--prism-program`. `cargo check -p prism-client` needs `protoc` for `ika-grpc`.

## If the user is stuck

- **No program id**: deploy PRISM program first; without `VITE_PRISM_PROGRAM_ID` the UI shows a placeholder for CPI PDA.
- **`cargo build` fails on client**: install **protoc** ([gRPC install](https://grpc.io/docs/protoc-installation/)) or set `PROTOC`.
- **Authority mismatch on inspect**: re-run `init_prism` after create, or confirm `PRISM_PROGRAM_ID` matches deployment.
