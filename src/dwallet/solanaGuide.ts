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
 * Attribution for the canonical dWallet framing memo below.
 *
 * The text in `DWALLET_AUTHORITY_FRAMING_SEGMENTS` is reproduced **verbatim** from the
 * Ika team's "A dWallet Is Not a Bridge — It Is Programmable Asset Authority" positioning
 * memo (the memo references "David" — the Ika team's framing of self-custody / usability /
 * decentralization). PRISM stores it word-for-word so reviewer-facing copy stays faithful
 * to the primitive's authors rather than paraphrasing it into our voice.
 *
 * If attribution should be sharpened, weakened, or removed, edit this constant — and the
 * Learn UI byline + IKA_INTEGRATION.md attribution row will follow.
 */
export const DWALLET_AUTHORITY_FRAMING_ATTRIBUTION = {
  source: 'Ika team positioning memo',
  note: 'Reproduced verbatim in PRISM for reviewer fidelity — not authored by PRISM.',
  href: 'https://ika.xyz/',
} as const;

/**
 * Canonical dWallet positioning — verbatim source for PRISM Learn and reviewer copy.
 * Do not paraphrase; edits are product decisions. Keep README / IKA_INTEGRATION pointers in sync.
 *
 * Attribution: see `DWALLET_AUTHORITY_FRAMING_ATTRIBUTION` above.
 */
export const DWALLET_AUTHORITY_FRAMING_SEGMENTS = [
  { kind: 'h1' as const, text: 'A dWallet Is Not a Bridge.' },
  { kind: 'h2' as const, text: 'It Is Programmable Asset Authority.' },
  {
    kind: 'p' as const,
    text:
      'Most cross-chain products start with a transfer. A dWallet starts with authority.',
  },
  {
    kind: 'p' as const,
    text:
      'That difference sounds small until you trace where the risk actually lives. A bridge asks users to trust a path that creates or moves a representation of an asset. A dWallet asks a different question: under what conditions should a native asset action be signed?',
  },
  {
    kind: 'p' as const,
    text: 'That is the better primitive for serious multichain finance.',
  },
  { kind: 'h3' as const, text: 'TL;DR' },
  {
    kind: 'ul' as const,
    items: [
      'A dWallet is programmable signing authority, not a bridge, a wrapped token, or a consumer wallet app.',
      'The user is cryptographically required for signing, while application policy can also be enforced through the network path.',
      'Solana programs can define the conditions under which actions involving assets on other chains are approved.',
      'The result is not "moving Bitcoin to Solana." It is letting Solana coordinate native-asset control without making a wrapped-asset assumption.',
    ],
  },
  {
    kind: 'p' as const,
    text:
      'Bridgeless capital markets are best understood as programmable native-asset authority, not wrapped-asset transport.',
  },
  { kind: 'h3' as const, text: 'The category error' },
  {
    kind: 'p' as const,
    text: 'The default crypto mental model is representation-first.',
  },
  {
    kind: 'p' as const,
    text:
      'You have an asset somewhere. You want to use it somewhere else. So the system creates a claim, wrapper, voucher, receipt, bridged balance, or derivative. The application then builds around that representation and pretends the representation is close enough to the original asset.',
  },
  {
    kind: 'p' as const,
    text:
      'Sometimes that is useful. It is also the source of a lot of market structure pain: fragmented liquidity, extra custody assumptions, extra operational paths, and another place where users have to ask whether they are holding the thing itself or a shadow of the thing.',
  },
  {
    kind: 'p' as const,
    text: 'A dWallet is the opposite mental model.',
  },
  {
    kind: 'p' as const,
    text:
      'It does not begin with "how do we represent this asset somewhere else?" It begins with "what should be allowed to sign for this asset?"',
  },
  {
    kind: 'p' as const,
    text: 'That is why the simple definition matters:',
  },
  {
    kind: 'p' as const,
    text: 'A dWallet is programmable asset authority.',
  },
  { kind: 'h3' as const, text: 'Why signatures are the real control point' },
  {
    kind: 'p' as const,
    text:
      'Every asset action eventually reaches an authority boundary. A Bitcoin transaction needs a Bitcoin signature. An Ethereum transaction needs an Ethereum signature. A Zcash transaction needs the relevant signature. A multisig release, treasury action, rebalance, admin-key operation, collateral movement, or agent action all eventually become a question of signing.',
  },
  {
    kind: 'p' as const,
    text:
      'If the signing key is raw and binary, the product is trapped. Either the key can do everything or it can do nothing. If a centralized operator mediates the key, the user inherits the operator. If a bridge or custodian holds the asset, the user inherits the bridge or custodian.',
  },
  {
    kind: 'p' as const,
    text:
      'A dWallet changes where product logic can live. The application can express policy before the signature is completed. The policy can say which assets are in scope, which actions are allowed, which counterparties are acceptable, what limits apply, when escalation is required, and when the request must be rejected.',
  },
  {
    kind: 'p' as const,
    text:
      'The asset does not need to become a wrapper for the application to have meaningful control. The application can govern the signing path itself.',
  },
  {
    kind: 'h3' as const,
    text: 'What makes this different from normal MPC',
  },
  {
    kind: 'p' as const,
    text:
      'Normal MPC custody can still become a trusted committee problem. A group of parties may hold enough authority to move funds. If the threshold is compromised, coerced, or socially engineered, the user may have no cryptographic backstop.',
  },
  {
    kind: 'p' as const,
    text:
      "The dWallet model is more interesting because the user is not optional. The user's participation is structurally required for signature generation, while the network side can enforce policy at scale. That means the product can combine user ownership, programmable rules, and decentralized execution instead of choosing two and sacrificing the third.",
  },
  {
    kind: 'p' as const,
    text:
      'This is the point David keeps coming back to: self-custody, usability, and decentralization should not be treated as mutually exclusive.',
  },
  { kind: 'h3' as const, text: 'What Solana adds' },
  {
    kind: 'p' as const,
    text: 'Solana becomes the policy and coordination layer.',
  },
  {
    kind: 'p' as const,
    text:
      'A Solana program can decide whether a requested native-asset action should be approved. It can enforce rules at application speed. It can compose with other Solana programs. It can provide the developer surface where builders already ship fast financial products.',
  },
  {
    kind: 'p' as const,
    text:
      'The signed transaction can then be broadcast to the destination chain. The action is native to that chain, but the policy can be expressed on Solana.',
  },
  {
    kind: 'p' as const,
    text:
      'That is the heart of bridgeless capital markets: not every asset has to be recreated on Solana before Solana can become the operating system for how that asset is used.',
  },
  { kind: 'h3' as const, text: 'What builders should stop saying' },
  {
    kind: 'ul' as const,
    items: [
      'Stop saying "dWallets bridge assets." That undersells the primitive and invites the wrong comparison.',
      'Stop saying "this is just another wallet." A consumer wallet is an interface. A dWallet is a signing and control primitive.',
      'Stop saying "wrapped assets, but safer." That still centers the wrapper. The point is to remove the wrapper as the default assumption.',
    ],
  },
  {
    kind: 'p' as const,
    text: 'The sharper framing is:',
  },
  {
    kind: 'p' as const,
    text:
      'Ika lets Solana programs control native asset actions on any chain through programmable, zero-trust signing.',
  },
  {
    kind: 'p' as const,
    text:
      'That sentence is technical enough to be true and simple enough to travel.',
  },
  { kind: 'h3' as const, text: 'The product surface' },
  {
    kind: 'p' as const,
    text: 'Once you start from signing authority, the application map becomes obvious.',
  },
  {
    kind: 'ul' as const,
    items: [
      'A treasury product can manage Bitcoin, Ethereum, Zcash, stablecoins, and protocol admin keys through one policy layer.',
      'A custody product can offer passkeys, social recovery, spending limits, delayed execution, destination allowlists, dynamic thresholds, and emergency controls without becoming the custodian.',
      'An AI agent can propose actions across chains, but the policy decides what it may actually sign.',
      'A lending product can accept native collateral from another chain without assuming the first product decision is "wrap it."',
      'A multisig can become a programmable operations system instead of a static approval box.',
    ],
  },
  { kind: 'h3' as const, text: 'Build with programmable authority' },
  {
    kind: 'p' as const,
    text:
      'Build the first products where Solana does not just receive bridged assets. Build products where Solana defines asset authority.',
  },
  {
    kind: 'p' as const,
    text:
      'That is the difference between cross-chain access and bridgeless capital markets.',
  },
] as const;

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
  "Open Ika & dWallet in Learn for the dWallet, MessageApproval, and policy-gate operator path. The confirmation pattern is the same as on any production wallet — PRISM never moves your funds, it coordinates what your program is allowed to sign.",
  "Use Command center (below) for automation and the demo policy gate, or tap the prism above for the full-screen overview — flash a practice beam to exercise 2PC-MPC style signing (preview stack).",
] as const;

export const PRISM_PREVIEW_FOOTNOTE =
  "This public build uses Solana devnet and value-free assets so anyone can try it safely. Mainnet, full MPC, and the full policy stack follow the Ika and Encrypt roadmaps. Not a bank or brokerage; estimates only.";

/**
 * Spectrum metaphor lede — rendered above the chain spectrum bar in the
 * wallet hub. Short on purpose so the bar itself does the talking; ties
 * the visual back to the canonical "programmable asset authority" framing.
 */
export const PRISM_SPECTRUM_LEDE =
  "Your assets live inside the prism as constant reflections of light. Tap a colored point to focus a chain — every action is a vote in the Ika quorum, refracting through this same glass.";

/** Plain-language gloss for jargon in the Learn tab and wallet UI. */
export const PRISM_GLOSSARY = [
  {
    term: 'Preview network (devnet)',
    plain: 'This release runs on a public value-free chain (e.g. Solana devnet) so demos are safe; the app surface is what we are shipping toward production.',
  },
  {
    term: 'dWallet',
    plain:
      'A dWallet is programmable asset authority. Programmable signing authority, not a bridge, a wrapped token, or a consumer wallet app (see Learn — canonical framing).',
  },
  { term: 'Message approval', plain: 'An on-chain note that “this exact message was approved” so the network can attach a signature.' },
  { term: 'PDA', plain: 'A special Solana address computed from seeds and a program — no seed phrase in your notebook.' },
  { term: 'Phantom', plain: 'A browser extension wallet many people use for Solana — the keys live in the extension, not in PRISM.' },
] as const;
