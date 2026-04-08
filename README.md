# The Hollow — Private Cross-Chain Identity

**One identity. Every chain. Nothing exposed.**

Built for **Colosseum Frontier 2026** using **Ika** (2PC-MPC dWallets on Solana) and **Encrypt** (private execution).

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
| **Traps** | IF/THEN automations you arm/disarm | Encrypted conditions, Ika signs on trigger |
| **Quest Log** | Activity feed with +XP rewards | Every action logged |

## Pre-Alpha Environment

| Resource | Endpoint |
|---|---|
| dWallet gRPC | `https://pre-alpha-dev-1.ika.ika-network.net:443` |
| Solana RPC | `https://api.devnet.solana.com` |
| Ika Program ID | `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY` |

## How to Run

### Frontend
```bash
npm install
npm start
```

### Solana Program (requires Rust + Solana CLI)
```bash
# Build the program
cargo build-sbf --manifest-path program/Cargo.toml

# Deploy to devnet
solana program deploy target/deploy/the_hollow.so --url devnet
```

### CLI Client
```bash
cargo run --manifest-path client/Cargo.toml -- create --keypair ~/.config/solana/id.json
```

## What Makes This Win

- **Novel**: First project combining private identity + multi-chain MPC signing on Solana
- **Uses Both Primitives**: Ika for bridgeless dWallet control, Encrypt for private credentials
- **Real Ika Integration**: Solana program with CPI into the Ika dWallet pre-alpha
- **Real Use Case**: Cross-chain reputation unlocks undercollateralized lending, private DAO membership, anonymous trading
- **UX-Maxxed**: Gamified UI — normies see Worlds, Badges, and Traps instead of chains, credentials, and automations
- **Demo-Ready**: User enters The Hollow, proves a cross-chain balance, and signs a BTC transaction from Solana — all without revealing their addresses

---

*The Hollow — an identity shell that reveals nothing until you decide otherwise.*
