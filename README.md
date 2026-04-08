# The Hollow — Private Cross-Chain Identity

**One identity. Every chain. Nothing exposed.**

Built for **Colosseum Frontier 2026** using **Ika** (2PC-MPC dWallets) and **Encrypt** (private execution).

---

## The Problem

Today, if you hold assets on Bitcoin, Ethereum, and Solana, your on-chain identity is fragmented and fully public. Anyone can correlate your addresses, see your balances, and front-run your strategies. There is no way to prove "I have collateral" without revealing *which* chains and *how much* on each.

## The Solution

**The Hollow** is the first **private, unified cross-chain identity**. It combines two primitives that have never been used together:

| Primitive | What It Does | How The Hollow Uses It |
|---|---|---|
| **Ika** | One MPC key controls native BTC, ETH, and SOL addresses (no bridges, no wrapping) | A single Hollow identity can sign transactions on any chain from one place |
| **Encrypt** | Encrypted on-chain state with private execution | The link between your addresses is never public. Credentials are selectively disclosable |

## Core Features

### 1. Universal Identity via Ika DKG
- User enters The Hollow via FaceID or Google login (WaaP)
- Ika's Distributed Key Generation produces a single dWallet that controls **native addresses on BTC, ETH, and SOL**
- The user can sign transactions on **any chain** from one dashboard

### 2. Encrypted Credential Vault via Encrypt
- Cross-chain balances, wallet age, reputation, and chain activity are aggregated and **encrypted on-chain**
- The link between BTC/ETH/SOL addresses is **never public**
- Only the Hollow owner can decrypt or selectively disclose

### 3. Selective Disclosure (The "Wow" Factor)
A DeFi protocol asks: *"Does this user have collateral?"*

The Hollow proves **"Yes, I hold > $10k"** WITHOUT revealing which chains or addresses hold it. This is a zero-knowledge-style proof powered by Encrypt's private execution.

**Unlocks**: undercollateralized cross-chain lending, private DAO membership, anonymous trading reputation.

### 4. Encrypted Cross-Chain Automations
- Set encrypted conditions: *"If ETH drops below $2k, sell my SOL position"*
- The Hollow evaluates conditions **privately** and signs via Ika when triggered
- No one sees your strategy until it executes

## Architecture

```
┌────────────────────────────────────────────────────┐
│                    The Hollow                       │
│                                                     │
│  ┌─────────────┐    ┌─────────────────────────┐    │
│  │  WaaP SDK   │    │      Encrypt Layer       │    │
│  │  (FaceID /  │    │  ┌───────────────────┐   │    │
│  │   Google)   │    │  │ Encrypted Creds   │   │    │
│  └──────┬──────┘    │  │ • Balance Proofs  │   │    │
│         │           │  │ • Chain Activity  │   │    │
│         ▼           │  │ • Reputation      │   │    │
│  ┌─────────────┐    │  └───────────────────┘   │    │
│  │  Hollow     │    │  ┌───────────────────┐   │    │
│  │  Identity   │◄──►│  │ Selective         │   │    │
│  │  (Sui Move) │    │  │ Disclosure Engine │   │    │
│  └──────┬──────┘    │  └───────────────────┘   │    │
│         │           └─────────────────────────┘    │
│         ▼                                           │
│  ┌─────────────────────────────────────────┐       │
│  │            Ika dWallet (2PC-MPC)         │       │
│  │                                          │       │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐   │       │
│  │  │ Bitcoin  │ │Ethereum │ │ Solana  │   │       │
│  │  │ (native)│ │(native) │ │(native) │   │       │
│  │  └─────────┘ └─────────┘ └─────────┘   │       │
│  └─────────────────────────────────────────┘       │
└────────────────────────────────────────────────────┘
```

## Project Structure

| File | Purpose |
|---|---|
| `move/hollow.move` | Sui Move contract — `HollowIdentity` struct, `create_hollow()`, `add_credential()`, `selective_disclose()`, `approve_action()` |
| `move/Move.toml` | Move package config for `TheHollow` |
| `src/app.tsx` | React dashboard — Hollow creation flow, chain overview, Prove panel (selective disclosure), Automate panel (encrypted conditions) |
| `src/main.tsx` | App entry point |
| `index.html` | Vite HTML shell |
| `vite.config.ts` | Vite + React config |
| `package.json` | Dependencies: `@ika.xyz/sdk`, `@human.tech/waap-sdk`, `@mysten/sui`, React |

## How to Run

```bash
npm install
npm start
```

The app opens at `http://localhost:5173`. Click **"Enter with FaceID"** to see the full flow:

1. **Authentication** via WaaP Passkey/Google
2. **Ika DKG** generates native BTC, ETH, and SOL addresses from one MPC key
3. **Encrypt** creates encrypted credentials (balance proofs, chain activity, reputation)
4. **Dashboard** shows your Hollow identity with all controlled chains
5. **Prove panel** lets you selectively disclose a credential to a verifier
6. **Automate panel** lets you set encrypted cross-chain conditions

## Smart Contract API

### `create_hollow(dwallet_id, dwallet_pubkey, encrypted_chain_addresses)`
Mints a new HollowIdentity linked to an Ika dWallet. Emits `HollowCreated`.

### `add_credential(hollow, credential_type, encrypted_value)`
Encrypts and stores a credential on the Hollow. Emits `CredentialAdded`.

### `selective_disclose(hollow, credential_index, verifier)`
Reveals a specific credential to a verifier without exposing other data. Emits `SelectiveDisclosure`.

### `approve_action(hollow, target_chain, message_hash)`
Triggers Ika 2PC-MPC signing when encrypted conditions are met. Emits `CrossChainActionApproved`.

## What Makes This Win

- **Novel**: First project to combine private identity + multi-chain MPC signing
- **Uses Both Primitives**: Ika for bridgeless control, Encrypt for private credentials
- **Real Use Case**: Cross-chain reputation unlocks undercollateralized lending, private DAO membership, anonymous trading
- **UX-Maxxed**: One FaceID tap to create an identity that works on every chain
- **Demo-Ready**: User enters The Hollow, proves a cross-chain balance, and signs a BTC transaction from Solana — all without revealing their addresses

---

*The Hollow — an identity shell that reveals nothing until you decide otherwise.*
