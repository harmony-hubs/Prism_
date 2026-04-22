import bs58 from 'bs58';
import { Connection, PublicKey } from '@solana/web3.js';
import { IKA_CPI_AUTHORITY_SEED, IKA_DWALLET_PROGRAM_ID } from '../config';

/** Browser-safe utf-8 (no `Buffer` global; Solana PDA seeds accept `Uint8Array`). */
const utf8 = (s: string) => new TextEncoder().encode(s);

/**
 * Ika **DWallet** account layout (disc `2`). See ika-pre-alpha `docs/src/reference/accounts.md`.
 */
export const DWALLET_DISCRIMINATOR = 2;
export const DWALLET_AUTHORITY_OFFSET = 2;
export const DWALLET_CURVE_OFFSET = 34;
export const DWALLET_PUBKEY_LEN_OFFSET = 37;
export const DWALLET_PUBKEY_OFFSET = 38;
export const DWALLET_IMPORTED_OFFSET = 143;

/**
 * Ika **MessageApproval** account (disc `14`) — status / signature slice for Operator console.
 */
export const APPROVAL_STATUS_OFFSET = 172;
export const APPROVAL_SIG_LEN_OFFSET = 173;
export const APPROVAL_SIG_OFFSET = 175;

export type MessageApprovalStatus = 'pending' | 'signed' | 'unknown';

export function curveLabel(id: number): string {
  switch (id) {
    case 0:
      return 'Secp256k1 (BTC/ETH)';
    case 1:
      return 'Secp256r1 (WebAuthn)';
    case 2:
      return 'Curve25519 (SOL)';
    case 3:
      return 'Ristretto';
    default:
      return `Unknown (${id})`;
  }
}

/** CPI PDA: seeds `[__ika_cpi_authority]` for your controller program. */
export function deriveCpiAuthorityPda(
  prismProgramId: string
): { pubkey: PublicKey; bump: number } {
  const programId = new PublicKey(prismProgramId);
  const [pubkey, bump] = PublicKey.findProgramAddressSync(
    [utf8(IKA_CPI_AUTHORITY_SEED)],
    programId
  );
  return { pubkey, bump };
}

const SEED_DWALLET = utf8('dwallet');
const SEED_MESSAGE_APPROVAL = utf8('message_approval');

/**
 * `["dwallet", chunks_of(curve_u16_le ‖ public_key)]` — matches Ika book + `ika-setup.ts`.
 */
export function dwalletPdaSeedChunks(curveU16: number, publicKey: Uint8Array): Uint8Array[] {
  const payload = new Uint8Array(2 + publicKey.length);
  new DataView(payload.buffer, payload.byteOffset, payload.byteLength).setUint16(0, curveU16, true);
  payload.set(publicKey, 2);
  const seeds: Uint8Array[] = [SEED_DWALLET];
  for (let i = 0; i < payload.length; i += 32) {
    seeds.push(payload.subarray(i, Math.min(i + 32, payload.length)));
  }
  return seeds;
}

/**
 * MessageApproval PDA on the Ika dWallet program.
 * Seeds: dwallet chunks ‖ `message_approval` ‖ signature_scheme (u16 LE) ‖ message_digest (32).
 * When `message_metadata_digest` is non-zero, the chain adds another seed; we use zero metadata (PRISM path).
 */
export function deriveMessageApprovalPda(
  curveU16: number,
  dwalletPublicKey: Uint8Array,
  messageHash32: Uint8Array,
  signatureSchemeU16: number,
  ikaDwalletProgramId: string = IKA_DWALLET_PROGRAM_ID
): { pubkey: PublicKey; bump: number } {
  if (messageHash32.length !== 32) {
    throw new Error('message_hash must be 32 bytes');
  }
  const schemeBuf = new Uint8Array(2);
  new DataView(schemeBuf.buffer).setUint16(0, signatureSchemeU16, true);
  const seeds = [
    ...dwalletPdaSeedChunks(curveU16, dwalletPublicKey),
    SEED_MESSAGE_APPROVAL,
    schemeBuf,
    messageHash32,
  ];
  const ika = new PublicKey(ikaDwalletProgramId);
  return PublicKey.findProgramAddressSync(seeds, ika);
}

export interface ParsedDWalletAccount {
  authority: string;
  publicKeyB58: string;
  /** Raw secp/ed25519 public key bytes from account (variable length). */
  publicKeyBytes: Uint8Array;
  publicKeyLen: number;
  /** `DWalletCurve` as u16 LE (0–3). */
  curveId: number;
  curveLabel: string;
  importedFlag: boolean;
}

export function parseDWalletAccountData(data: Uint8Array): ParsedDWalletAccount | null {
  if (data.length < DWALLET_PUBKEY_OFFSET + 1) return null;
  if (data[0] !== DWALLET_DISCRIMINATOR) return null;
  const authority = new PublicKey(data.subarray(DWALLET_AUTHORITY_OFFSET, DWALLET_AUTHORITY_OFFSET + 32)).toBase58();
  const curveId = data[DWALLET_CURVE_OFFSET] | (data[DWALLET_CURVE_OFFSET + 1] << 8);
  const pubkeyLen = data[DWALLET_PUBKEY_LEN_OFFSET];
  const pkEnd = DWALLET_PUBKEY_OFFSET + pubkeyLen;
  if (pkEnd > data.length) return null;
  const pubkeyBytes = data.subarray(DWALLET_PUBKEY_OFFSET, pkEnd);
  const importedFlag = data.length > DWALLET_IMPORTED_OFFSET ? data[DWALLET_IMPORTED_OFFSET] !== 0 : false;

  return {
    authority,
    publicKeyB58: bs58.encode(pubkeyBytes),
    publicKeyBytes: pubkeyBytes,
    publicKeyLen: pubkeyLen,
    curveId,
    curveLabel: curveLabel(curveId),
    importedFlag,
  };
}

export interface ParsedMessageApproval {
  status: MessageApprovalStatus;
  statusByte: number;
  signatureB58?: string;
}

export function parseMessageApprovalData(data: Uint8Array): ParsedMessageApproval | null {
  if (data.length <= APPROVAL_STATUS_OFFSET) return null;
  const statusByte = data[APPROVAL_STATUS_OFFSET];
  if (statusByte === 0) {
    return { status: 'pending', statusByte };
  }
  if (statusByte === 1) {
    const sigLen = data[APPROVAL_SIG_LEN_OFFSET] | (data[APPROVAL_SIG_LEN_OFFSET + 1] << 8);
    const end = Math.min(APPROVAL_SIG_OFFSET + sigLen, data.length);
    const sig = data.subarray(APPROVAL_SIG_OFFSET, end);
    return { status: 'signed', statusByte, signatureB58: bs58.encode(sig) };
  }
  return { status: 'unknown', statusByte };
}

export async function fetchAccountInfoBase64(
  connection: Connection,
  address: string
): Promise<{ data: Uint8Array; owner: string } | null> {
  try {
    const pk = new PublicKey(address);
    const info = await connection.getAccountInfo(pk, 'confirmed');
    if (!info?.data) return null;
    const raw = new Uint8Array(info.data);
    return { data: raw, owner: info.owner.toBase58() };
  } catch {
    return null;
  }
}

export function authorityMatchesCpiPda(authority: string, prismProgramId: string): boolean {
  try {
    const { pubkey } = deriveCpiAuthorityPda(prismProgramId);
    return authority === pubkey.toBase58();
  } catch {
    return false;
  }
}
