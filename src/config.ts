/** Solana RPC — swap for mainnet-beta or your own endpoint when wiring Ika / clear-msig. */
export const SOLANA_RPC =
  (import.meta as ImportMeta & { env?: { VITE_SOLANA_RPC?: string } }).env?.VITE_SOLANA_RPC ??
  'https://api.devnet.solana.com';
