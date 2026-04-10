# The Hollow — Private Cross-Chain Identity

**One identity. Every chain. Nothing exposed.**

Built for **Colosseum Frontier 2026** using **Ika** (2PC-MPC dWallets on Solana) and **Encrypt** (private execution).

### Canonical dWallet steps (Solana pre-alpha)

Follow the official book: **[dWallet Developer Guide](https://solana-pre-alpha.ika.xyz/)** · [Introduction](https://solana-pre-alpha.ika.xyz/introduction.html) · [Single-page / print](https://solana-pre-alpha.ika.xyz/print.html). High level: **create dWallet → CPI authority to your program → `approve_message` → signature in MessageApproval** (see the book for prerequisites, Pinocchio/Anchor, gRPC, and testing). Product overview: [ika.xyz](https://ika.xyz/). The PRISM app includes a **dWallet** tab that mirrors this checklist and pre-alpha endpoints, plus an **Operator console**: keccak256 + MessageApproval PDA preview, dWallet inspect, and MessageApproval polling (same account layout as `client/src/main.rs`). **Phantom** in the header swaps the demo SOL row to your real devnet pubkey and balance. Copy `.env.example` to `.env` and set `VITE_HOLLOW_PROGRAM_ID` after you deploy `program/`.

---

## The Problem

If you hold assets on Bitcoin, Ethereum, and Solana, your on-chain identity is fragmented and fully public. Anyone can correlate your addresses, see your balances, and front-run your strategies. There is no way to prove "I have collateral" without revealing *which* chains and *how much* on each.

## The Solution

**The Hollow** is the first **private, unified cross-chain identity**. It combines two primitives that have never been used together:

| Primitive | What It Does | How The Hollow Uses It |
|---|---|---|
| **Ika** | One MPC key controls native BTC, ETH, and SOL addresses — no bridges, no wrapping | A single Hollow identity signs transactions on any chain from one place |
| **Encrypt** | Encrypted on-chain state with private execution | The link between your addresses is never public. Credentials are selectively disclosable |

## Architecture

```
┌───────────────────────────────────────────────────────┐
│                     The Hollow                         │
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Frontend    │  │   Solana     │  │  Rust CLI    │ │
│  │   (React)     │  │   Program    │  │  (gRPC)      │ │
│  │              │  │  (Pinocchio) │  │              │ │
│  │  Login via   │  │              │  │  Create      │ │
│  │  WaaP/FaceID │  │  init_hollow │  │  dWallets    │ │
│  │  View worlds │  │  approve_act │  │  via Ika     │ │
│  │  Prove badges│  │  transfer    │  │  DKG         │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                  │         │
│         └────────────┬────┴──────────────────┘         │
│                      ▼                                  │
│         ┌─────────────────────────────┐                │
│         │    Ika dWallet (2PC-MPC)     │                │
│         │    Program: 87W54k...q1oY    │                │
│         │                              │                │
│         │  ┌────────┐ ┌────────┐ ┌────────┐           │
│         │  │Bitcoin │ │Ethereum│ │Solana  │           │
│         │  │(native)│ │(native)│ │(native)│           │
│         │  └────────┘ └────────┘ └────────┘           │
│         └─────────────────────────────┘                │
│                                                        │
│         ┌─────────────────────────────┐                │
│         │       Encrypt Layer          │                │
│         │  Encrypted credentials       │                │
│         │  Selective disclosure         │                │
│         │  Private condition evaluation │                │
│         └─────────────────────────────┘                │
└───────────────────────────────────────────────────────┘
```

## Project Structure

```
The_Hollow/
├── program/                    # Solana on-chain program (Rust/Pinocchio)
│   ├── Cargo.toml
│   └── src/lib.rs              # init_hollow, approve_action, transfer_authority
├── voting/                     # Voting-controlled dWallet (create_proposal, cast_vote)
│   ├── Cargo.toml
│   └── src/lib.rs
├── client/                     # Off-chain CLI client (Rust/gRPC)
│   ├── Cargo.toml
│   └── src/main.rs             # Create dWallets, sign messages, check status
├── move/                       # Reference contract (Sui Move — vision artifact)
│   ├── hollow.move
│   └── Move.toml
├── src/                        # Frontend (React/Vite)
│   ├── app.tsx                 # Gamified dashboard with Worlds, Badges, Traps
│   └── main.tsx                # Entry point
├── Cargo.toml                  # Rust workspace
├── index.html
├── package.json
├── vite.config.ts
└── README.md
```

## Solana Program (`program/src/lib.rs`)

Built with Pinocchio + `ika-dwallet-pinocchio` for CPI into the Ika dWallet program.

| Instruction | What It Does |
|---|---|
| `init_hollow` | Transfers dWallet authority to The Hollow's CPI PDA, making it the sole signer |
| `approve_action` | Approves a cross-chain message for Ika MPC signing — creates a MessageApproval PDA |
| `transfer_authority` | Transfers dWallet ownership (recovery, DAO handoff) |

**How signing works:**
1. Your program calls `approve_message` via CPI → creates a MessageApproval PDA (status = Pending)
2. The Ika network detects the MessageApproval account
3. The NOA (Network Operated Authority) signs using 2PC-MPC
4. The signature is written on-chain (status = Signed)
5. Anyone can read the signature from the MessageApproval account

## CLI Client (`client/src/main.rs`)

```bash
# Create a Hollow identity (dWallet via Ika DKG)
cargo run -- create --keypair ~/.config/solana/id.json

# Approve a cross-chain message for signing
cargo run -- sign --keypair ~/.config/solana/id.json \
  --dwallet <DWALLET_ADDRESS> \
  --message <HEX_HASH> \
  --scheme ed25519

# Check if the signature is ready
cargo run -- status --approval <APPROVAL_ADDRESS>
```

## Frontend (`src/app.tsx`)

Gamified UI that hides all the crypto complexity:

| Tab | What It Does | Under The Hood |
|---|---|---|
| **Worlds** | BTC/ETH/SOL shown as game worlds with XP | Ika dWallet controls native addresses |
| **Badges** | Encrypted credentials with rarity tiers | Encrypt stores data, proofs on reveal |
| **Team Vote** | Squad missions / proposals | Quorum → CPI `approve_message` on the dWallet |
| **Quest Log** | Activity feed with +XP rewards | Every action logged |

## Pre-Alpha Environment

| Resource | Endpoint |
|---|---|
| dWallet gRPC | `https://pre-alpha-dev-1.ika.ika-network.net:443` |
| Solana RPC | `https://api.devnet.solana.com` |
| **Ika dWallet program** (devnet) | `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY` |

That last id is the **Ika dWallet program** (MessageApproval PDAs, `approve_message` CPI target). Your **own** Pinocchio program gets its own id when you `solana program deploy`. The CPI authority PDA is always `find_program_address(["__ika_cpi_authority"], YOUR_PROGRAM_ID)` — see Ika [CPI framework](https://github.com/dwallet-labs/ika-pre-alpha/blob/main/docs/src/on-chain/cpi-framework.md).

## Ika documentation checklist (this repo)

Aligned with the [ika-pre-alpha](https://github.com/dwallet-labs/ika-pre-alpha) docs:

| Topic | Where in this repo |
|--------|---------------------|
| Pinocchio deps + `crate-type` | `program/Cargo.toml`, `voting/Cargo.toml` |
| `DWalletContext` + `CPI_AUTHORITY_SEED` | `program/src/lib.rs`, `voting/src/lib.rs` |
| `approve_message` / `transfer_dwallet` data & schemes (0/1/2) | `approve_action`, `cast_vote` |
| MessageApproval offsets (139 / 140 / 142) | `client/src/main.rs` |
| **Message hash** | Must be **keccak256** of the raw message (Ika `message-approval.md`) — enforced off-chain when you build txs |
| gRPC + `ika-dwallet-types` (off-chain) | `client/Cargo.toml` — wire `ika-grpc` calls where marked `TODO` |
| SBF static syscalls | `solana-define-syscall` in program `Cargo.toml` under `target_os = "solana"` / `target_arch = "bpf"` |
| Voting example (full layout) | Ika `docs/src/examples/voting/` — our `voting/` crate is a slimmer variant; CPI rules match |

CLI: set **`HOLLOW_PROGRAM_ID`** (or `--hollow-program`) to **your** deployed program id when deriving the CPI PDA — **not** `87W54k...`.

## How to Run

### Frontend
```bash
npm install
npm start
```

### Solana programs (Rust + `cargo-build-sbf`)

Host check (no Solana CLI required):

```bash
cargo check -p the-hollow -p hollow-voting
```

**On-chain (SBF) build** needs the [Agave release](https://github.com/anza-xyz/agave/releases) (includes `cargo-build-sbf`) or a full Solana/Agave install with `cargo-build-sbf` on your `PATH`.

**Windows:** the first build downloads *platform-tools* into your user cache. That step creates **symlinks**. If you see error **1314** (“required privilege…”):

- Turn on **Developer Mode**: Settings → System → **For developers** → **Developer Mode**, then run the build again, **or**
- Run the terminal **as Administrator** once so the toolchain can install.

From the repo root (PowerShell), after extracting a Windows release to `tools/solana-release/` *or* putting `cargo-build-sbf` on `PATH`:

```powershell
.\scripts\build-sbf.ps1 -Target all
# or one crate:
.\scripts\build-sbf.ps1 -Target program -Verbose
```

Deploy to devnet (artifact path is printed by the build; name is usually `the_hollow` / `hollow_voting` with underscores):

```bash
solana program deploy target/deploy/the_hollow.so --url devnet
```

### CLI Client
```bash
# Set your deployed Hollow program id (CPI PDA derivation — see Ika docs)
export HOLLOW_PROGRAM_ID=<your_deployed_program_pubkey>

cargo run --manifest-path client/Cargo.toml -- create --keypair ~/.config/solana/id.json
```

## What Makes This Win

- **Novel**: First project combining private identity + multi-chain MPC signing on Solana
- **Uses Both Primitives**: Ika for bridgeless dWallet control, Encrypt for private credentials
- **Real Ika Integration**: Solana program with CPI into the Ika dWallet pre-alpha
- **Real Use Case**: Cross-chain reputation unlocks undercollateralized lending, private DAO membership, anonymous trading
- **UX-Maxxed**: Gamified UI — normies see zones, loot, and team votes instead of chains, credentials, and governance
- **Demo-Ready**: User enters The Hollow, proves a cross-chain balance, and signs a BTC transaction from Solana — all without revealing their addresses

---

*The Hollow — an identity shell that reveals nothing until you decide otherwise.*
