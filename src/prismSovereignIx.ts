import {
  type Connection,
  type Transaction,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { PRISM_PROGRAM_ID as VITE_PRISM_ID } from './config';

/** PDA prefix — matches `program/src/lib.rs` `SOVEREIGN_SEED`. */
export const PRISM_SOVEREIGN_SEED = 'prism_sovereign';

/** Clock sysvar — use SDK constant to avoid a one-character typo in base58 breaking the whole app at import time. */
export const SYSVAR_CLOCK = SYSVAR_CLOCK_PUBKEY;

export const IX_INIT_SOVEREIGN = 6;
export const IX_POKE_SOVEREIGN = 7;
export const IX_ATTEST_BALANCE = 8;
export const IX_SET_ARMED = 9;
export const IX_SPRING_INACTIVITY = 10;
export const IX_SPRING_PANIC = 11;

export type SovereignState = {
  isArmed: boolean;
  tripped: 'none' | 'inactivity' | 'panic';
  recovery: PublicKey;
  lastHeartbeatSlot: bigint;
  inactivityLimitSlots: bigint;
  panicFloor: bigint;
  lastAttestedNative: bigint;
};

const STATE_LEN = 104;

/**
 * Parse on-chain `prism_sovereign` account (see program layout).
 * Returns `null` if data is too short.
 */
function u64le(b: Uint8Array, off: number): bigint {
  let n = 0n;
  for (let i = 0; i < 8; i++) n |= BigInt(b[off + i] ?? 0) << (8n * BigInt(i));
  return n;
}

export function parseSovereignData(data: Uint8Array | null | undefined): SovereignState | null {
  if (!data) return null;
  const b = new Uint8Array(data);
  if (b.length < STATE_LEN) return null;
  const isArmed = b[1] === 1;
  const t = b[2];
  const tripped: SovereignState['tripped'] =
    t === 1 ? 'inactivity' : t === 2 ? 'panic' : 'none';
  return {
    isArmed,
    tripped,
    recovery: new PublicKey(b.subarray(40, 72)),
    lastHeartbeatSlot: u64le(b, 72),
    inactivityLimitSlots: u64le(b, 80),
    panicFloor: u64le(b, 88),
    lastAttestedNative: u64le(b, 96),
  };
}

export function deriveSovereignPda(
  owner: PublicKey,
  programId: PublicKey,
): { pda: PublicKey; bump: number } {
  const seed0 = new TextEncoder().encode(PRISM_SOVEREIGN_SEED);
  const o = new Uint8Array(32);
  o.set(owner.toBuffer().subarray(0, 32), 0);
  return PublicKey.findProgramAddressSync([seed0, o], programId);
}

function writeU64le(u8: Uint8Array, off: number, v: bigint) {
  for (let i = 0; i < 8; i++) u8[off + i] = Number((v >> (8n * BigInt(i))) & 0xffn) & 0xff;
}

export function buildInitSovereignData(
  recovery: PublicKey,
  inactivityLimitSlots: bigint,
  panicFloor: bigint,
  isArmed: boolean,
): Uint8Array {
  const d = new Uint8Array(1 + 32 + 8 + 8 + 1);
  d[0] = IX_INIT_SOVEREIGN;
  d.set(new Uint8Array(recovery.toBuffer().subarray(0, 32)), 1);
  writeU64le(d, 33, inactivityLimitSlots);
  writeU64le(d, 41, panicFloor);
  d[49] = isArmed ? 1 : 0;
  return d;
}

export function buildPokeInstruction(
  programId: PublicKey,
  owner: PublicKey,
  sovereign: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: sovereign, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
    ],
    data: Uint8Array.from([IX_POKE_SOVEREIGN]),
  });
}

export function buildSetArmedInstruction(
  programId: PublicKey,
  owner: PublicKey,
  sovereign: PublicKey,
  armed: boolean,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: sovereign, isSigner: false, isWritable: true },
    ],
    data: Uint8Array.from([IX_SET_ARMED, armed ? 1 : 0]),
  });
}

/** Demo “oracle” — updates `last_attested_native` (e.g. sats) for the panic floor check. */
export function buildAttestBalanceInstruction(
  programId: PublicKey,
  owner: PublicKey,
  sovereign: PublicKey,
  lastAttestedNative: bigint,
): TransactionInstruction {
  const d = new Uint8Array(1 + 8);
  d[0] = IX_ATTEST_BALANCE;
  for (let i = 0; i < 8; i++) d[1 + i] = Number((lastAttestedNative >> (8n * BigInt(i))) & 0xffn) & 0xff;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: sovereign, isSigner: false, isWritable: true },
    ],
    data: d,
  });
}

/**
 * `init_sovereign` — full ix data: [6] + recovery(32) + inactivity u64 + panic u64 + is_armed.
 * Rent payer = owner. Accounts: owner, sovereign, payer, rent, system, clock.
 */
export function buildInitSovereignInstruction(
  programId: PublicKey,
  owner: PublicKey,
  sovereign: PublicKey,
  recovery: PublicKey,
  inactivityLimitSlots: bigint,
  panicFloor: bigint,
  isArmed: boolean,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: sovereign, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
    ],
    data: buildInitSovereignData(recovery, inactivityLimitSlots, panicFloor, isArmed),
  });
}

type MinimalWallet = {
  publicKey: PublicKey;
  signTransaction(t: Transaction): Promise<Transaction>;
  signAndSendTransaction?(t: Transaction, o?: { skipPreflight?: boolean }): Promise<{ signature: string }>;
};

export async function signAndSend(
  connection: Connection,
  wallet: MinimalWallet,
  transaction: Transaction,
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.feePayer = wallet.publicKey;
  transaction.recentBlockhash = blockhash;
  if (import.meta.env.VITE_E2E === '1' && VITE_PRISM_ID?.trim()) {
    try {
      const prism = new PublicKey(VITE_PRISM_ID.trim());
      const apply = (globalThis as { e2ePrismSovereignApply?: (p: { disc: number; data: number[]; feePayer: string }) => void })
        .e2ePrismSovereignApply;
      if (typeof apply === 'function') {
        let hit = false;
        for (const ix of transaction.instructions) {
          if (ix.programId.equals(prism)) {
            await apply({
              disc: ix.data[0] ?? 0,
              data: Array.from(ix.data),
              feePayer: wallet.publicKey.toBase58(),
            });
            hit = true;
          }
        }
        if (hit) {
          return 'E2EPrismSovereign1Verif1TxSig1PadPadPadPadPadPadPadPad';
        }
      }
    } catch {
      /* fall through to real wallet path */
    }
  }
  if (typeof wallet.signAndSendTransaction === 'function') {
    const out = await wallet.signAndSendTransaction(transaction, { skipPreflight: false });
    if (out && 'signature' in out && out.signature) return out.signature;
  }
  const signed = await wallet.signTransaction(transaction);
  return connection.sendRawTransaction(signed.serialize(), {
    maxRetries: 3,
    preflightCommitment: 'processed',
  });
}
