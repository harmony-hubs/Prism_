import bs58 from 'bs58';
import { Connection, PublicKey } from '@solana/web3.js';
import { IKA_CPI_AUTHORITY_SEED, IKA_DWALLET_PROGRAM_ID } from '../config';

/** Match `hollow-client` / on-chain MessageApproval layout (Ika devnet). */
export const DWALLET_AUTHORITY_OFFSET = 0;
export const DWALLET_PUBKEY_OFFSET = 32;
export const DWALLET_PUBKEY_LEN_OFFSET = 97;
export const DWALLET_CURVE_OFFSET = 98;

export const APPROVAL_STATUS_OFFSET = 139;
export const APPROVAL_SIG_LEN_OFFSET = 140;
export const APPROVAL_SIG_OFFSET = 142;

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
  hollowProgramId: string
): { pubkey: PublicKey; bump: number } {
  const programId = new PublicKey(hollowProgramId);
  const [pubkey, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(IKA_CPI_AUTHORITY_SEED, 'utf8')],
    programId
  );
  return { pubkey, bump };
}

/**
 * MessageApproval PDA on the Ika dWallet program (not your Hollow program).
 * Seeds: `message_approval` ‖ dwallet_pubkey ‖ message_hash (32 bytes).
 */
export function deriveMessageApprovalPda(
  dwalletPubkey: string,
  messageHash32: Uint8Array,
  ikaDwalletProgramId: string = IKA_DWALLET_PROGRAM_ID
): { pubkey: PublicKey; bump: number } {
  if (messageHash32.length !== 32) {
    throw new Error('message_hash must be 32 bytes');
  }
  const dw = new PublicKey(dwalletPubkey);
  const ika = new PublicKey(ikaDwalletProgramId);
  const [pubkey, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('message_approval', 'utf8'), dw.toBuffer(), Buffer.from(messageHash32)],
    ika
  );
  return { pubkey, bump };
}

export interface ParsedDWalletAccount {
  authority: string;
  publicKeyB58: string;
  publicKeyLen: number;
  curveId: number;
  curveLabel: string;
  importedFlag: boolean;
}

export function parseDWalletAccountData(data: Uint8Array): ParsedDWalletAccount | null {
  if (data.length <= DWALLET_CURVE_OFFSET) return null;
  const authority = new PublicKey(data.subarray(DWALLET_AUTHORITY_OFFSET, DWALLET_AUTHORITY_OFFSET + 32)).toBase58();
  const pubkeyLen = data[DWALLET_PUBKEY_LEN_OFFSET];
  const pkEnd = DWALLET_PUBKEY_OFFSET + pubkeyLen;
  if (pkEnd > data.length) return null;
  const pubkeyBytes = data.subarray(DWALLET_PUBKEY_OFFSET, pkEnd);
  const curveId = data[DWALLET_CURVE_OFFSET];
  const importedFlag = data.length > DWALLET_CURVE_OFFSET + 1 ? data[DWALLET_CURVE_OFFSET + 1] !== 0 : false;

  return {
    authority,
    publicKeyB58: bs58.encode(pubkeyBytes),
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
  if (data.length <= APPROVAL_SIG_OFFSET) return null;
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

export function authorityMatchesCpiPda(authority: string, hollowProgramId: string): boolean {
  try {
    const { pubkey } = deriveCpiAuthorityPda(hollowProgramId);
    return authority === pubkey.toBase58();
  } catch {
    return false;
  }
}
