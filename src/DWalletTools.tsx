import React, { useCallback, useMemo, useState } from 'react';
import type { Connection } from '@solana/web3.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { HOLLOW_PROGRAM_ID, IKA_CPI_AUTHORITY_SEED, IKA_DWALLET_PROGRAM_ID } from './config';
import {
  authorityMatchesCpiPda,
  deriveCpiAuthorityPda,
  deriveMessageApprovalPda,
  fetchAccountInfoBase64,
  parseDWalletAccountData,
  parseMessageApprovalData,
} from './dwallet/solanaOnChain';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const DWalletTools: React.FC<{ connection: Connection }> = ({ connection }) => {
  const [messageUtf8, setMessageUtf8] = useState('Hello from PRISM');
  const hash32 = useMemo(() => keccak_256(new TextEncoder().encode(messageUtf8)), [messageUtf8]);

  const [dwalletAddr, setDwalletAddr] = useState('');
  const [pdaPreview, setPdaPreview] = useState<{ addr: string; bump: number } | null>(null);
  const [pdaErr, setPdaErr] = useState<string | null>(null);

  const [inspectAddr, setInspectAddr] = useState('');
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectOut, setInspectOut] = useState<string | null>(null);

  const [approvalAddr, setApprovalAddr] = useState('');
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalOut, setApprovalOut] = useState<string | null>(null);

  const cpiLine = useMemo(() => {
    if (!HOLLOW_PROGRAM_ID) return '— set VITE_HOLLOW_PROGRAM_ID after deploy';
    try {
      const { pubkey, bump } = deriveCpiAuthorityPda(HOLLOW_PROGRAM_ID);
      return `${pubkey.toBase58()} (bump ${bump})`;
    } catch {
      return 'Invalid HOLLOW_PROGRAM_ID';
    }
  }, []);

  const derivePda = useCallback(() => {
    setPdaErr(null);
    setPdaPreview(null);
    try {
      const { pubkey, bump } = deriveMessageApprovalPda(dwalletAddr.trim(), hash32, IKA_DWALLET_PROGRAM_ID);
      setPdaPreview({ addr: pubkey.toBase58(), bump });
    } catch (e) {
      setPdaErr(e instanceof Error ? e.message : 'Could not derive PDA');
    }
  }, [dwalletAddr, hash32]);

  const runInspect = useCallback(async () => {
    setInspectLoading(true);
    setInspectOut(null);
    try {
      const acc = await fetchAccountInfoBase64(connection, inspectAddr.trim());
      if (!acc) {
        setInspectOut('No account data (wrong address or closed account).');
        setInspectLoading(false);
        return;
      }
      const parsed = parseDWalletAccountData(acc.data);
      if (!parsed) {
        setInspectOut(`Fetched ${acc.data.length} bytes — layout does not match Ika dWallet (owner: ${acc.owner}).`);
        setInspectLoading(false);
        return;
      }
      let extra = '';
      if (HOLLOW_PROGRAM_ID) {
        const match = authorityMatchesCpiPda(parsed.authority, HOLLOW_PROGRAM_ID);
        extra = match
          ? `\nAuthority matches CPI PDA for your Hollow program.`
          : `\nAuthority does not match CPI PDA for VITE_HOLLOW_PROGRAM_ID (expected ${deriveCpiAuthorityPda(HOLLOW_PROGRAM_ID).pubkey.toBase58()}).`;
      }
      setInspectOut(
        `Authority: ${parsed.authority}\nCurve: ${parsed.curveLabel}\nPubkey (${parsed.publicKeyLen} B): ${parsed.publicKeyB58}\nImported: ${parsed.importedFlag}${extra}`
      );
    } catch (e) {
      setInspectOut(e instanceof Error ? e.message : 'Inspect failed');
    }
    setInspectLoading(false);
  }, [connection, inspectAddr]);

  const runApproval = useCallback(async () => {
    setApprovalLoading(true);
    setApprovalOut(null);
    try {
      const acc = await fetchAccountInfoBase64(connection, approvalAddr.trim());
      if (!acc) {
        setApprovalOut('No account data.');
        setApprovalLoading(false);
        return;
      }
      const parsed = parseMessageApprovalData(acc.data);
      if (!parsed) {
        setApprovalOut(`Fetched ${acc.data.length} bytes — not a MessageApproval layout (owner: ${acc.owner}).`);
        setApprovalLoading(false);
        return;
      }
      if (parsed.status === 'pending') {
        setApprovalOut('Status: PENDING — Ika network has not written the signature yet.');
      } else if (parsed.status === 'signed' && parsed.signatureB58) {
        setApprovalOut(`Status: SIGNED\nSignature (base58): ${parsed.signatureB58}`);
      } else {
        setApprovalOut(`Unknown status byte: ${parsed.statusByte}`);
      }
    } catch (e) {
      setApprovalOut(e instanceof Error ? e.message : 'Status fetch failed');
    }
    setApprovalLoading(false);
  }, [connection, approvalAddr]);

  return (
    <div className="space-y-5 border-t border-white/[0.06] pt-4">
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/90">Operator console</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-white/40">
          Live devnet tools: keccak256(message) for MessageApproval seeds, PDA preview, dWallet inspect, and approval polling — same offsets as{' '}
          <code className="text-white/50">client/src/main.rs</code>.
        </p>
      </section>

      <section className="rounded-xl bg-black/30 p-3 ring-1 ring-white/[0.05]">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/35">CPI authority PDA</p>
        <p className="mt-1 break-all font-mono text-[11px] text-amber-200/85">{cpiLine}</p>
        <p className="mt-1 text-[10px] text-white/30">Seed: &quot;{IKA_CPI_AUTHORITY_SEED}&quot;</p>
      </section>

      <section className="rounded-xl bg-black/30 p-3 ring-1 ring-white/[0.05]">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/35">Keccak256 → MessageApproval PDA</p>
        <label className="mt-2 block text-[10px] text-white/35" htmlFor="dw-msg">
          Message (UTF-8)
        </label>
        <textarea
          id="dw-msg"
          value={messageUtf8}
          onChange={(e) => setMessageUtf8(e.target.value)}
          rows={2}
          className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white/80 outline-none focus:border-emerald-500/40"
        />
        <p className="mt-2 break-all font-mono text-[10px] text-white/45">
          keccak256: 0x{toHex(hash32)}
        </p>
        <label className="mt-3 block text-[10px] text-white/35" htmlFor="dw-pda">
          dWallet address (devnet)
        </label>
        <input
          id="dw-pda"
          value={dwalletAddr}
          onChange={(e) => setDwalletAddr(e.target.value)}
          placeholder="Base58 dWallet pubkey"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white/80 outline-none focus:border-emerald-500/40"
        />
        <button
          type="button"
          onClick={derivePda}
          className="mt-2 w-full rounded-lg bg-emerald-500/20 py-2 text-[12px] font-semibold text-emerald-200/95 ring-1 ring-emerald-500/25"
        >
          Derive MessageApproval PDA
        </button>
        {pdaErr && <p className="mt-2 text-[11px] text-rose-300/90">{pdaErr}</p>}
        {pdaPreview && (
          <p className="mt-2 break-all font-mono text-[11px] text-white/70">
            {pdaPreview.addr}
            <span className="text-white/35"> · bump {pdaPreview.bump}</span>
          </p>
        )}
        <p className="mt-2 text-[10px] text-white/30">
          Ika program id: {IKA_DWALLET_PROGRAM_ID}
        </p>
      </section>

      <section className="rounded-xl bg-black/30 p-3 ring-1 ring-white/[0.05]">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/35">Inspect dWallet (RPC)</p>
        <input
          value={inspectAddr}
          onChange={(e) => setInspectAddr(e.target.value)}
          placeholder="dWallet account address"
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white/80 outline-none focus:border-emerald-500/40"
        />
        <button
          type="button"
          disabled={inspectLoading}
          onClick={runInspect}
          className="mt-2 w-full rounded-lg bg-white/10 py-2 text-[12px] font-semibold text-white/90 disabled:opacity-50"
        >
          {inspectLoading ? 'Fetching…' : 'Fetch & parse'}
        </button>
        {inspectOut && (
          <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-white/55">{inspectOut}</pre>
        )}
      </section>

      <section className="rounded-xl bg-black/30 p-3 ring-1 ring-white/[0.05]">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/35">MessageApproval status (RPC)</p>
        <input
          value={approvalAddr}
          onChange={(e) => setApprovalAddr(e.target.value)}
          placeholder="MessageApproval PDA address"
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white/80 outline-none focus:border-emerald-500/40"
        />
        <button
          type="button"
          disabled={approvalLoading}
          onClick={runApproval}
          className="mt-2 w-full rounded-lg bg-violet-500/20 py-2 text-[12px] font-semibold text-violet-200/95 ring-1 ring-violet-500/25 disabled:opacity-50"
        >
          {approvalLoading ? 'Fetching…' : 'Poll status'}
        </button>
        {approvalOut && (
          <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-white/55">{approvalOut}</pre>
        )}
      </section>
    </div>
  );
};
