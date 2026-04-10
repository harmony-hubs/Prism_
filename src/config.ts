/** Solana RPC — swap for mainnet-beta or your own endpoint when wiring Ika / clear-msig. */
export const SOLANA_RPC =
  (import.meta as ImportMeta & { env?: { VITE_SOLANA_RPC?: string } }).env?.VITE_SOLANA_RPC ??
  'https://api.devnet.solana.com';

/** Sui fullnode JSON-RPC — devnet by default; override with VITE_SUI_RPC for testnet/mainnet. */
export const SUI_RPC =
  (import.meta as ImportMeta & { env?: { VITE_SUI_RPC?: string } }).env?.VITE_SUI_RPC ??
  'https://fullnode.devnet.sui.io';

/**
 * Ika pre-alpha (Solana dWallet book — Installation / Pre-Alpha Environment).
 * @see https://solana-pre-alpha.ika.xyz/print.html
 */
export const IKA_PREALPHA_GRPC =
  (import.meta as ImportMeta & { env?: { VITE_IKA_GRPC?: string } }).env?.VITE_IKA_GRPC ??
  'https://pre-alpha-dev-1.ika.ika-network.net:443';

/** Ika dWallet program on devnet (MessageApproval, approve_message CPI target). Not your controller program id. */
export const IKA_DWALLET_PROGRAM_ID =
  (import.meta as ImportMeta & { env?: { VITE_IKA_DWALLET_PROGRAM_ID?: string } }).env
    ?.VITE_IKA_DWALLET_PROGRAM_ID ?? '87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY';

/**
 * Your deployed program id (CPI authority PDA = seeds ["__ika_cpi_authority"], YOUR_PROGRAM_ID).
 * Set in .env as VITE_HOLLOW_PROGRAM_ID after deploy.
 */
export const HOLLOW_PROGRAM_ID =
  (import.meta as ImportMeta & { env?: { VITE_HOLLOW_PROGRAM_ID?: string } }).env?.VITE_HOLLOW_PROGRAM_ID ??
  '';

/** Matches ika `CPI_AUTHORITY_SEED` / find_program_address(["__ika_cpi_authority"], program_id). */
export const IKA_CPI_AUTHORITY_SEED = '__ika_cpi_authority';
