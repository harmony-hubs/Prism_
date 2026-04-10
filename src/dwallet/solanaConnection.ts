import { Connection } from '@solana/web3.js';
import { SOLANA_RPC } from '../config';

/** Shared JSON-RPC connection for Solana devnet (Ika pre-alpha book default). */
export function createSolanaConnection(rpcUrl: string = SOLANA_RPC): Connection {
  return new Connection(rpcUrl, { commitment: 'confirmed' });
}
