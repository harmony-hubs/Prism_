import { PublicKey } from '@solana/web3.js';

/** Matches `SOVEREIGN_STATE_LEN` + `pack_sovereign` in `program/src/lib.rs` (v1 layout). */
const STATE_LEN = 104;
const TRIPPED_NONE = 0;

function writeU64le(buf: Uint8Array, off: number, v: bigint) {
  for (let i = 0; i < 8; i++) buf[off + i] = Number((v >> (8n * BigInt(i))) & 0xffn) & 0xff;
}

function u64leFromArr(data: number[], off: number): bigint {
  let n = 0n;
  for (let i = 0; i < 8; i++) n |= BigInt(data[off + i] ?? 0) << (8n * BigInt(i));
  return n;
}

function u64leFromBuf(s: Uint8Array, off: number): bigint {
  let n = 0n;
  for (let i = 0; i < 8; i++) n |= BigInt(s[off + i] ?? 0) << (8n * BigInt(i));
  return n;
}

function copySovereign(
  s: Uint8Array,
  owner: PublicKey,
  lastH: bigint,
  ina: bigint,
  panic: bigint,
  att: bigint,
  armed: 0 | 1,
  tripped: number,
) {
  s[0] = 1;
  s[1] = armed;
  s[2] = tripped;
  s.subarray(3, 8).fill(0);
  s.set(owner.toBuffer(), 8);
  writeU64le(s, 72, lastH);
  writeU64le(s, 80, ina);
  writeU64le(s, 88, panic);
  writeU64le(s, 96, att);
}

export class SovereignMockState {
  private buf: Uint8Array | null = null;
  private slot = 1_000_000n;
  public readonly programId: PublicKey;
  public readonly owner: PublicKey;
  public readonly sovereignPda: PublicKey;

  constructor(programId: PublicKey, owner: PublicKey) {
    this.programId = programId;
    this.owner = owner;
    const [pda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode('prism_sovereign'), owner.toBuffer()],
      programId,
    );
    this.sovereignPda = pda;
  }

  nextSlot() {
    this.slot += 1n;
  }

  getSlot() {
    return this.slot;
  }

  getAccountData(): Uint8Array | null {
    return this.buf;
  }

  /** Apply one PRISM sovereign instruction; `data` is the full `TransactionInstruction.data` (disc first). */
  apply(disc: number, data: number[], feePayerBase58: string) {
    if (feePayerBase58 !== this.owner.toBase58()) return;
    this.nextSlot();

    if (disc === 6) {
      if (data.length < 50) return;
      const recovery = new PublicKey(Uint8Array.from(data.slice(1, 33)));
      const inactivity = u64leFromArr(data, 33);
      const panicFloor = u64leFromArr(data, 41);
      const isArmed = (data[49] ?? 0) as 0 | 1;
      this.buf = new Uint8Array(STATE_LEN);
      this.buf.set(this.owner.toBuffer(), 8);
      this.buf.set(recovery.toBuffer(), 40);
      copySovereign(this.buf, this.owner, this.slot, inactivity, panicFloor, 0n, isArmed, TRIPPED_NONE);
      return;
    }
    if (!this.buf) return;
    const s = this.buf;
    const ina = u64leFromBuf(s, 80);
    const panic = u64leFromBuf(s, 88);
    const att = u64leFromBuf(s, 96);

    if (disc === 7) {
      // poke: refresh heartbeat
      const armed = s[1] as 0 | 1;
      const tripped = s[2];
      copySovereign(s, this.owner, this.slot, ina, panic, att, armed, tripped);
      return;
    }
    if (disc === 8) {
      if (data.length < 9) return;
      const v = u64leFromArr(data, 1);
      const lastH = u64leFromBuf(s, 72);
      const armed = s[1] as 0 | 1;
      const tripped = s[2];
      copySovereign(s, this.owner, lastH, ina, panic, v, armed, tripped);
      return;
    }
    if (disc === 9) {
      const isArmed = (data[1] ?? 0) as 0 | 1;
      const wasTripped = s[2];
      const newTripped = isArmed === 1 ? TRIPPED_NONE : wasTripped;
      const lastH = u64leFromBuf(s, 72);
      const armed: 0 | 1 = isArmed;
      copySovereign(s, this.owner, lastH, ina, panic, att, armed, newTripped);
    }
  }

  /** For asserting TRIPPED UI without running `spring_*` CPI. */
  forceTripInactivity() {
    if (!this.buf) return;
    const s = this.buf;
    const ina = u64leFromBuf(s, 80);
    const panic = u64leFromBuf(s, 88);
    const att = u64leFromBuf(s, 96);
    const lastH = u64leFromBuf(s, 72);
    copySovereign(s, this.owner, lastH, ina, panic, att, 1, 1);
  }
}
