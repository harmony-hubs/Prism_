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

/** Short disclaimer — full text is in the book’s introduction. */
export const PRE_ALPHA_DISCLAIMER_SHORT =
  'Pre-alpha: mock signer only, no real MPC; devnet may be wiped. Do not rely on keys or security.';

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
    detail: 'The Ika validator network produces the signature (2PC-MPC in production).',
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
