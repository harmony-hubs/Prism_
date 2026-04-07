# HARMONY: Bridgeless & Encrypted Capital Markets

**The "UX-Maxxing" Self-Custody Solution for the Next Billion Users.**

Built for the **Colosseum Frontier 2026** using **Ika**, **Encrypt**, and **WaaP**.

## 🚀 The Vision
"Stop thinking privacy app. Start thinking better market primitive." 

Harmony transforms multi-chain assets into a single, unified market primitive. By combining **sub-second Parallel MPC (Ika)** with **Encrypted Execution (Encrypt)** and **Social Onboarding (WaaP)**, we've built a self-custody experience that feels like Web2 but operates with the full security of Web3.

## 🛠️ Core Primitives (How We Win)

### 1. Bridgeless Asset Control (Powered by Ika)
*   **No Bridges, No Wrapped Assets**: Control native Bitcoin, Ethereum, and Zcash directly from Solana/Sui.
*   **Program-Controlled Signing**: Uses Ika's 2PC-MPC to sign transactions only when your on-chain logic (or private Encrypt logic) is satisfied.
*   **DKG Integration**: Real-time Distributed Key Generation for every user upon login.

### 2. Encrypted Execution (Powered by Encrypt)
*   **Private Market State**: Keep sensitive data like balances, order books, and yield strategies private on-chain.
*   **Conditional Decryption**: State is only decrypted/revealed when the user authenticates via Passkey/MFA.
*   **Privacy-First UX**: A "Privacy Toggle" in the UI demonstrates the seamless transition between public and encrypted states.

### 3. UX-Maxxing Onboarding (Powered by WaaP)
*   **Passkeys & FaceID**: Non-custodial login that removes the seed phrase barrier.
*   **Social & MFA**: Google/Apple login with integrated Multi-Factor Authentication for high-value "Pulses" (transactions).
*   **Normie-to-Degen Pipeline**: A UI that scales from a simple "One-Tap" interface to a full "Degen Mode" with technical MPC insights.

## 🏗️ Technical Architecture
- `move/harmony_heart.move`: The **MarketVault** smart contract on Sui/Solana. Handles vault authority, message approval, and encrypted state storage.
- `src/app.tsx`: The **UX-Maxxed Dashboard**. Integrates the Ika SDK for signing, Encrypt for privacy, and WaaP for onboarding.

## 🏃 How to Run
1.  **Install Dependencies**: `npm install`
2.  **Configure IDs**: Update `PACKAGE_ID` and `WaaP Project ID` in `src/app.tsx`.
3.  **Launch**: `npm start`

---
**"One Login. Every Chain. Total Privacy. Zero Friction."**
    