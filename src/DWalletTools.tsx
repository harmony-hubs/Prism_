import React, { useCallback, useMemo, useState } from 'react';
import type { Connection } from '@solana/web3.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { IKA_CPI_AUTHORITY_SEED, IKA_DWALLET_PROGRAM_ID, PRISM_PROGRAM_ID } from './config';
import {
  authorityMatchesCpiPda,
  deriveCpiAuthorityPda,
  deriveMessageApprovalPda,
  fetchAccountInfoBase64,
  parseDWalletAccountData,
  parseMessageApprovalData,
} from './dwallet/solanaOnChain';
import { DWALLET_CURSOR_AGENT_PROMPT } from './dwallet/cursorAgentPrompt';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const DWalletTools: React.FC<{ connection: Connection }> = ({ connection }) => {
  const [developerMode, setDeveloperMode] = useState(false);
  const [messageUtf8, setMessageUtf8] = useState('Hello from PRISM');
  const hash32 = useMemo(() => keccak_256(new TextEncoder().encode(messageUtf8)), [messageUtf8]);

  const [dwalletAddr, setDwalletAddr] = useState('');
  const [pdaPreview, setPdaPreview] = useState<{ addr: string; bump: number } | null>(null);
  const [pdaErr, setPdaErr] = useState<string | null>(null);
  const [pdaDeriveLoading, setPdaDeriveLoading] = useState(false);
  /** `DWalletSignatureScheme` (u16) — must match `prism sign --chain` (e.g. Solana = 5). */
  const [signatureSchemeU16, setSignatureSchemeU16] = useState(5);

  const [inspectAddr, setInspectAddr] = useState('');
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectOut, setInspectOut] = useState<string | null>(null);

  const [approvalAddr, setApprovalAddr] = useState('');
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalOut, setApprovalOut] = useState<string | null>(null);
  const [agentPromptCopied, setAgentPromptCopied] = useState(false);

  const cpiLine = useMemo(() => {
    if (!PRISM_PROGRAM_ID) return '— set VITE_PRISM_PROGRAM_ID after deploy';
    try {
      const { pubkey, bump } = deriveCpiAuthorityPda(PRISM_PROGRAM_ID);
      return `${pubkey.toBase58()} (bump ${bump})`;
    } catch {
      return 'Invalid PRISM_PROGRAM_ID';
    }
  }, [PRISM_PROGRAM_ID]);

  const derivePda = useCallback(async () => {
    setPdaErr(null);
    setPdaPreview(null);
    const addr = dwalletAddr.trim();
    if (!addr) {
      setPdaErr('Enter dWallet address');
      return;
    }
    setPdaDeriveLoading(true);
    try {
      const acc = await fetchAccountInfoBase64(connection, addr);
      if (!acc) {
        setPdaErr('dWallet account not found (wrong network or address).');
        setPdaDeriveLoading(false);
        return;
      }
      const parsed = parseDWalletAccountData(acc.data);
      if (!parsed) {
        setPdaErr('Account data is not a valid Ika dWallet (disc 2 layout).');
        setPdaDeriveLoading(false);
        return;
      }
      const { pubkey, bump } = deriveMessageApprovalPda(
        parsed.curveId,
        parsed.publicKeyBytes,
        hash32,
        signatureSchemeU16,
        IKA_DWALLET_PROGRAM_ID
      );
      setPdaPreview({ addr: pubkey.toBase58(), bump });
    } catch (e) {
      setPdaErr(e instanceof Error ? e.message : 'Could not derive PDA');
    }
    setPdaDeriveLoading(false);
  }, [connection, dwalletAddr, hash32, signatureSchemeU16]);

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
      if (PRISM_PROGRAM_ID) {
        const match = authorityMatchesCpiPda(parsed.authority, PRISM_PROGRAM_ID);
        extra = match
          ? `\nAuthority matches CPI PDA for your PRISM program.`
          : `\nAuthority does not match CPI PDA for VITE_PRISM_PROGRAM_ID (expected ${deriveCpiAuthorityPda(PRISM_PROGRAM_ID).pubkey.toBase58()}).`;
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

  const copyAgentPrompt = useCallback(() => {
    void navigator.clipboard.writeText(DWALLET_CURSOR_AGENT_PROMPT).then(() => {
      setAgentPromptCopied(true);
      window.setTimeout(() => setAgentPromptCopied(false), 2500);
    });
  }, []);

  return (
    <div data-testid="dwallet-tools" className="space-y-5 border-t border-white/[0.06] pt-4">
      {!developerMode ? (
        <section
          data-testid="dwallet-tools-simple"
          className="rounded-2xl bg-gradient-to-b from-zinc-800/50 to-black/40 p-4 ring-1 ring-white/[0.08]"
        >
          <h2 className="text-[13px] font-semibold text-white/90">Technical console</h2>
          <p className="mt-2 text-[12px] leading-relaxed text-white/55">
            Optional tools here talk to Solana devnet and show long addresses — that is normal for builders following the Ika
            book. If you are just exploring PRISM as a demo wallet, you can skip them entirely.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/45">
            Use the checklist above for the story; open this when you are pasting dWallet or MessageApproval addresses from
            the Rust CLI.
          </p>
          <button
            type="button"
            data-testid="dwallet-show-developer"
            onClick={() => setDeveloperMode(true)}
            className="mt-4 w-full rounded-xl bg-emerald-500/20 py-3 text-[13px] font-semibold text-emerald-100 ring-1 ring-emerald-400/35"
          >
            Show developer tools
          </button>
        </section>
      ) : (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="dwallet-hide-developer"
              onClick={() => setDeveloperMode(false)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-white/50 ring-1 ring-white/[0.08] hover:bg-white/[0.04] hover:text-white/70"
            >
              Hide technical details
            </button>
          </div>

          <section
            data-testid="dwallet-agent-panel"
            className="rounded-xl bg-violet-950/20 p-3 ring-1 ring-violet-400/15"
          >
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/90">Cursor agent</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-white/45">
              This repo includes <code className="text-white/55">AGENTS.md</code> and a Cursor rule so the in-editor agent knows
              the prism CLI ↔ Operator console flow. Copy the prompt, open{' '}
              <strong className="text-white/70">Chat</strong> (Agent), paste — then <code className="text-white/55">@AGENTS.md</code>{' '}
              is already referenced in the text for grounding.
            </p>
            <button
              type="button"
              onClick={copyAgentPrompt}
              className="mt-2 w-full rounded-lg bg-violet-500/25 py-2 text-[12px] font-semibold text-violet-100/95 ring-1 ring-violet-400/30"
            >
              {agentPromptCopied ? 'Copied — paste in Cursor Agent' : 'Copy prompt for Cursor Agent'}
            </button>
          </section>

          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/90">Operator console</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-white/40">
          Maps to book steps 2–5: CPI PDA (authority), MessageApproval PDA (RPC fetch dWallet + Ika seed layout + keccak + scheme), inspect dWallet (verify step 2), poll MessageApproval (read signature). Same parsers as{' '}
          <code className="text-white/50">client/src/main.rs</code>.
        </p>
        <p className="mt-2 text-[10px] text-white/30">
          Step 1 (DKG) runs via <code className="text-white/45">cargo run -p prism-client -- create</code> — not in the browser.
        </p>
      </section>

      <section className="rounded-xl bg-black/30 p-3 ring-1 ring-white/[0.05]">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/35">
          <span className="mr-2 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] text-amber-200/90">2</span>
          CPI authority PDA
        </p>
        <p className="mt-1 break-all font-mono text-[11px] text-amber-200/85">{cpiLine}</p>
        <p className="mt-1 text-[10px] text-white/30">Seed: &quot;{IKA_CPI_AUTHORITY_SEED}&quot;</p>
      </section>

      <section className="rounded-xl bg-black/30 p-3 ring-1 ring-white/[0.05]">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/35">
          <span className="mr-2 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] text-amber-200/90">3</span>
          MessageApproval PDA (RPC + Ika seeds)
        </p>
        <p className="mt-1 text-[10px] text-white/30">
          Fetches the dWallet account, then derives{' '}
          <code className="text-white/45">dwallet</code> chunks ‖ <code className="text-white/45">message_approval</code> ‖
          scheme u16 ‖ keccak256(message).
        </p>
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
        <label className="mt-3 block text-[10px] text-white/35" htmlFor="dw-scheme">
          DWalletSignatureScheme (u16 — match CLI <code className="text-white/45">sign --chain</code>: eth=0, btc=2, sol=5)
        </label>
        <select
          id="dw-scheme"
          value={signatureSchemeU16}
          onChange={(e) => setSignatureSchemeU16(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white/80 outline-none focus:border-emerald-500/40"
        >
          <option value={0}>0 — EcdsaKeccak256 (Ethereum)</option>
          <option value={1}>1 — EcdsaSha256</option>
          <option value={2}>2 — EcdsaDoubleSha256 (Bitcoin-style)</option>
          <option value={3}>3 — TaprootSha256</option>
          <option value={4}>4 — EcdsaBlake2b256</option>
          <option value={5}>5 — EddsaSha512 (Solana)</option>
          <option value={6}>6 — SchnorrkelMerlin</option>
        </select>
        <button
          type="button"
          disabled={pdaDeriveLoading}
          onClick={() => void derivePda()}
          className="mt-2 w-full rounded-lg bg-emerald-500/20 py-2 text-[12px] font-semibold text-emerald-200/95 ring-1 ring-emerald-500/25 disabled:opacity-50"
        >
          {pdaDeriveLoading ? 'Fetching dWallet…' : 'Derive MessageApproval PDA'}
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
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/35">
          <span className="mr-2 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] text-amber-200/90">2</span>
          Inspect dWallet (RPC)
        </p>
        <p className="mt-1 text-[10px] text-white/30">
          Confirm authority matches CPI PDA after <code className="text-white/45">init_prism</code>.
        </p>
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
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/35">
          <span className="mr-2 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] text-amber-200/90">5</span>
          MessageApproval status (RPC)
        </p>
        <p className="mt-1 text-[10px] text-white/30">Step 4: wait for the network; then poll here for SIGNED.</p>
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
        </>
      )}
    </div>
  );
};
