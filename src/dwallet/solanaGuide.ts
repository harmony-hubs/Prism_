/**
 * Canonical steps from the official Solana dWallet pre-alpha book.
 * @see https://solana-pre-alpha.ika.xyz/introduction.html
 * @see https://solana-pre-alpha.ika.xyz/print.html (full single-page)
 */

export const IKA_SOLANA_PREALPHA_GUIDE = 'https://solana-pre-alpha.ika.xyz/';
export const IKA_SOLANA_PREALPHA_INTRO = 'https://solana-pre-alpha.ika.xyz/introduction.html';
export const IKA_SOLANA_PREALPHA_PRINT = 'https://solana-pre-alpha.ika.xyz/print.html';
export const IKA_PUBLIC_SITE = 'https://ika.xyz/';
export const IKA_TYPESCRIPT_SDK_DOCS = 'https://docs.ika.xyz/sdk';
export const IKA_GITHUB = 'https://github.com/dwallet-labs/ika';

/** Encrypt on Solana (FHE-style flows; pre-alpha — see site disclaimer). */
export const ENCRYPT_DEVELOPER_GUIDE = 'https://docs.encrypt.xyz/';

/**
 * How Ika and Encrypt compose for PRISM: bridgeless native signing + private policy.
 * Both stacks are separate SDKs and pre-alpha programs; this is the product architecture story.
 */
export const IKA_ENCRYPT_BRIDGELESS_STORY = {
  title: 'Bridgeless identity: Ika + Encrypt',
  lede:
    'Ika lets one program-controlled policy produce signatures on native chains—no wrapped assets or liquidity bridges. Encrypt lets that same program reason about eligibility and links on ciphertext, so validators never see raw balances or which chains you use.',
  pillars: [
    {
      name: 'Ika (dWallet)',
      detail:
        'Cross-chain signing from Solana: your program approves messages; the network fills MessageApproval with a signature for native UTXO/account models.',
    },
    {
      name: 'Encrypt',
      detail:
        'Private execution graph: credentials, scores, and thresholds live as ciphertext; `execute_graph` commits results without exposing plaintext on-chain (see Encrypt pre-alpha disclaimer).',
    },
  ],
  together:
    'One controller program can gate `approve_message` on Encrypt-backed checks—prove you qualify in private, then sign on Bitcoin, Ethereum, or Solana natively. On-chain, `program/src/lib.rs` implements this as `approve_action_gated` after a policy PDA (`init_encrypt_policy_gate` / `set_encrypt_policy_eligible`); replace the setter with Encrypt CPI when you integrate `encrypt-pre-alpha`.',
  encryptNote:
    'Encrypt pre-alpha: explorer-only; data may be plaintext on devnet per their disclaimer—do not treat as confidential yet.',
} as const;

/**
 * Condensed from the book’s Pre-Alpha Disclaimer (same obligations: exploratory only).
 * @see https://solana-pre-alpha.ika.xyz/print.html — search “Pre-Alpha Disclaimer”
 */
export const PRE_ALPHA_DISCLAIMER_SHORT =
  'Pre-alpha only: no real MPC — a single mock signer; interfaces and formats may change; devnet state may be wiped before Ika Alpha 1. Do not use real funds, do not rely on keys or security, software is as-is.';

/** “How it works” (Introduction) — the five-step dWallet flow on Solana. */
export const DWALLET_FLOW_STEPS = [
  {
    title: 'Create a dWallet',
    detail: 'The Ika network runs DKG and produces a public key.',
  },
  {
    title: 'Your program controls it',
    detail: 'Transfer dWallet authority to your program’s CPI authority PDA.',
  },
  {
    title: 'Approve messages',
    detail: 'When conditions are met, your program CPI-calls approve_message.',
  },
  {
    title: 'Network signs',
    detail:
      'Pre-alpha uses a mock signer (book disclaimer); production targets 2PC-MPC. Signature ends up on-chain in MessageApproval.',
  },
  {
    title: 'Signature on-chain',
    detail: 'Read the MessageApproval account to obtain the signature.',
  },
] as const;

/** “What you’ll learn” — book parts (use print.html to jump via search). */
export const DWALLET_BOOK_PARTS = [
  { title: 'Getting Started', detail: 'Dependencies, first dWallet-controlled program' },
  { title: 'Tutorial', detail: 'Voting app — quorum triggers signing' },
  { title: 'On-chain integration', detail: 'dWallet accounts, message approval, CPI, gas deposits' },
  { title: 'gRPC API', detail: 'SubmitTransaction, request/response types' },
  { title: 'Testing', detail: 'Mollusk, LiteSVM, E2E' },
  { title: 'Reference', detail: 'Instructions, accounts, events' },
] as const;

/**
 * Actionable checklist: same five steps as the book’s Introduction, with what you do in PRISM vs the Rust CLI.
 */
export const DWALLET_PRISM_CHECKLIST = [
  {
    step: 1,
    title: 'Create a dWallet',
    summary: 'DKG via gRPC; a dWallet account is created on devnet under the Ika dWallet program.',
    inThisTab: 'Connect Phantom (header) so RPC calls use your devnet wallet context. DKG itself runs from the CLI (gRPC), not inside the browser.',
    elsewhere:
      '`cargo run -p prism-client -- create --keypair <id.json>` (or `--manifest-path client/Cargo.toml`) — see README. Wait until coordinator + on-chain dWallet accounts exist.',
  },
  {
    step: 2,
    title: 'Your program controls it',
    summary: 'Transfer dWallet authority to your program’s CPI PDA: seeds `["__ika_cpi_authority"]`, your deployed program id.',
    inThisTab:
      'Set `VITE_PRISM_PROGRAM_ID` after deploy. Use **CPI authority PDA** below, then **Inspect dWallet** — authority should match that PDA after `init_prism`.',
    elsewhere: 'CLI `create` can submit `init_prism` when `PRISM_PROGRAM_ID` is set.',
  },
  {
    step: 3,
    title: 'Approve messages',
    summary:
      'Your program CPI-calls `approve_message`; MessageApproval PDA seeds are `["dwallet", chunks(curve_u16‖pubkey)], "message_approval", scheme_u16_le, keccak256(message)` (zero metadata digest on this path).',
    inThisTab:
      '**MessageApproval PDA** loads your dWallet account from RPC, reads curve + pubkey, then derives with Keccak256(message) + signature scheme. Submitting `approve_action` is via your program (CLI or future in-app tx).',
    elsewhere: '`prism sign …` (or `cargo run -p prism-client -- sign …`) or your own tx builder targeting the PRISM program.',
  },
  {
    step: 4,
    title: 'Network signs',
    summary: 'Pre-alpha: mock signer; signature is also obtainable via gRPC after approval proof.',
    inThisTab: 'No separate action here — wait after your approval tx lands.',
    elsewhere: 'Optional: `prism sign` continues with presign + gRPC Sign.',
  },
  {
    step: 5,
    title: 'Signature on-chain',
    summary: 'Read status at offsets 172 (status) / 173–174 (sig len) / 175+ (sig) on the MessageApproval account (Ika disc 14 layout).',
    inThisTab: '**MessageApproval status** — paste the PDA and poll until status is SIGNED.',
    elsewhere: 'Same layout as `prism status` / Rust client.',
  },
] as const;

/**
 * Public positioning: production-quality vision. Network (devnet) is a footnote, not the story.
 * Used in the hub welcome card and re-exported for comms; keep honest about preview / pre-alpha in footnotes.
 */
export const PRISM_VISION_LEDE =
  "PRISM is a sovereign home for the next kind of multi-chain account: Ika dWallet program signing, optional private policy, and the wallet apps you already use in one flow. PRISM does not custody funds — it coordinates what you are allowed to sign and when.";

export const PRISM_INDUSTRY_SHIFT =
  "The industry default is fragmenting identity and routing every action through more bridges and more exposure. A policy layer on Solana can approve native signatures and eligibility checks without moving collateral across wrapped bridges — that is the architecture PRISM demonstrates.";

export const PRISM_HOW_STEPS = [
  "Connect Phantom to see your Solana line. Use Receive to copy an address, or Send for a short checklist in Phantom or a Sui wallet. Every transfer is signed in your extension — PRISM never pushes your money for you.",
  "Open Ika & dWallet in Learn for the dWallet and MessageApproval operator path, or Trade (Jupiter) to swap. The confirmation pattern is the same as on any production wallet, without PRISM in the spend path.",
  "Use Command center (below) for automation and the demo policy gate, or tap the prism above for the full-screen overview — flash a practice beam to exercise 2PC-MPC style signing (preview stack).",
] as const;

export const PRISM_PREVIEW_FOOTNOTE =
  "This public build uses Solana devnet and value-free assets so anyone can try it safely. Mainnet, full MPC, and the full policy stack follow the Ika and Encrypt roadmaps. Not a bank or brokerage; estimates only.";

/** Plain-language gloss for jargon in the Learn tab and wallet UI. */
export const PRISM_GLOSSARY = [
  {
    term: 'Preview network (devnet)',
    plain: 'This release runs on a public value-free chain (e.g. Solana devnet) so demos are safe; the app surface is what we are shipping toward production.',
  },
  { term: 'dWallet', plain: 'A signing key lives on-chain and can be controlled by your program, not only by a phone app.' },
  { term: 'Message approval', plain: 'An on-chain note that “this exact message was approved” so the network can attach a signature.' },
  { term: 'PDA', plain: 'A special Solana address computed from seeds and a program — no seed phrase in your notebook.' },
  { term: 'Phantom', plain: 'A browser extension wallet many people use for Solana — the keys live in the extension, not in PRISM.' },
] as const;
