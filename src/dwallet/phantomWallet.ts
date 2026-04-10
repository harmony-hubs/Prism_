/** Minimal Phantom / standard wallet adapter surface (no extra npm deps). */

export type PhantomPublicKey = { toBase58(): string; toBytes?(): Uint8Array };

export interface SolanaInjectedWallet {
  isPhantom?: boolean;
  publicKey?: PhantomPublicKey | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PhantomPublicKey }>;
  disconnect(): Promise<void>;
  on?(event: 'connect' | 'disconnect' | 'accountChanged', handler: (...args: unknown[]) => void): void;
  off?(event: 'connect' | 'disconnect' | 'accountChanged', handler: (...args: unknown[]) => void): void;
}

type WinSol = {
  solana?: SolanaInjectedWallet;
  phantom?: { solana?: SolanaInjectedWallet };
};

/**
 * Resolve an injected Solana provider. Phantom may use `window.phantom.solana`;
 * most wallets also register `window.solana` (multi-wallet standard).
 */
export function getInjectedSolana(): SolanaInjectedWallet | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as WinSol;
  return w.phantom?.solana ?? w.solana;
}

export async function connectPhantomWallet(): Promise<string> {
  const s = getInjectedSolana();
  if (!s?.connect) throw new Error('No Solana wallet found. Install Phantom.');
  const res = await s.connect();
  return res.publicKey.toBase58();
}

export async function disconnectPhantomWallet(): Promise<void> {
  const s = getInjectedSolana();
  if (s?.disconnect) await s.disconnect();
}

export function readConnectedPubkey(): string | null {
  const s = getInjectedSolana();
  const pk = s?.publicKey;
  if (pk && typeof pk.toBase58 === 'function') return pk.toBase58();
  return null;
}
