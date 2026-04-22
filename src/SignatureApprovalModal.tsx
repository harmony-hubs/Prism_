import React, { useCallback, useEffect, useState } from 'react';

function randomHex(n: number): string {
  return Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

function shortHash(full: string): string {
  if (full.length < 16) return full;
  return `${full.slice(0, 6)}...${full.slice(-4)}`;
}

export type SignatureApprovalModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Called when user confirms — e.g. run practice beam or navigate to trade */
  onApprove: () => void | Promise<void>;
  /** Subtitle: chain / route context */
  contextLine: string;
  /** e.g. "Ika dWallet · MessageApproval" */
  processLine?: string;
  'data-testid'?: string;
};

/**
 * High-stakes “Sovereign” signature review — 2PC-MPC / Ika dWallet style (devnet practice UI).
 */
export const SignatureApprovalModal: React.FC<SignatureApprovalModalProps> = ({
  isOpen,
  onClose,
  onApprove,
  contextLine,
  processLine = '2PC-MPC · Ika dWallet (devnet practice)',
  'data-testid': testId = 'signature-approval-modal',
}) => {
  const [mpcSyncing, setMpcSyncing] = useState(true);
  const [messageHash, setMessageHash] = useState(`0x${randomHex(32)}`);
  const [submitting, setSubmitting] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMpcSyncing(true);
    setMessageHash(`0x${randomHex(32)}`);
    setSubmitting(false);
    const t = window.setTimeout(() => setMpcSyncing(false), 2600);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleCopyHash = useCallback(() => {
    void navigator.clipboard.writeText(messageHash);
    setCopyFlash(true);
    window.setTimeout(() => setCopyFlash(false), 1200);
  }, [messageHash]);

  const handleApprove = useCallback(async () => {
    if (mpcSyncing) return;
    setSubmitting(true);
    try {
      await Promise.resolve(onApprove());
    } finally {
      setSubmitting(false);
    }
  }, [mpcSyncing, onApprove]);

  if (!isOpen) return null;

  return (
    <div
      className="approval-overlay"
      role="dialog"
      aria-modal
      aria-labelledby="sig-approval-title"
      data-testid={testId}
      onClick={onClose}
    >
      <div className="approval-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300/80">Sovereign Command</p>
            <h2 id="sig-approval-title" className="mt-1 text-lg font-bold tracking-tight text-white/95 sm:text-xl">
              {mpcSyncing ? 'Awaiting signature' : 'Review & approve'}
            </h2>
            <p className="mt-0.5 text-[13px] text-white/50">{contextLine}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/55 transition hover:border-white/20 hover:text-white/85"
            aria-label="Close"
            data-testid="signature-approval-close"
          >
            Esc
          </button>
        </div>
        <p className="mt-1 text-[11px] text-white/38">{processLine}</p>

        {mpcSyncing ? (
          <div className="flex flex-col items-center gap-6 py-7">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <div className="absolute inset-0 animate-pulse rounded-full bg-fuchsia-500/20 blur-2xl" aria-hidden />
              <div
                className="approval-mpc-ring absolute h-[92px] w-[92px] rounded-full border-2 border-violet-500/15 border-t-violet-400/90 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                aria-hidden
              />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-violet-500/70 bg-zinc-950/95 shadow-[0_0_36px_rgba(168,85,247,0.28)]">
                <span className="inline-block bg-gradient-to-br from-white via-[#f8efd9] to-[#c9a227] bg-clip-text font-serif text-3xl font-bold leading-none text-transparent gold-glow">
                  P
                </span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-[12px] font-medium text-emerald-300/90">MPC nodes: 2/2 connected</p>
              <p className="mt-1 text-[11px] text-white/40">Keccak-256 message · polling coordinator…</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/45 p-4">
              <label className="mb-2 block text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                Message hash (Keccak-256)
              </label>
              <div className="flex items-center justify-between gap-2">
                <code className="min-w-0 break-all text-left font-mono text-[12px] text-violet-300/90">
                  {shortHash(messageHash)}
                </code>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  className="approval-copy-btn shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition hover:text-white"
                  data-testid="signature-approval-copy"
                >
                  {copyFlash ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-white/40">
              Final step: <code className="font-mono text-white/50">approve_message</code> CPI (practice — no on-chain Ika call from this build).
            </p>

            <button
              type="button"
              onClick={handleApprove}
              disabled={submitting}
              className="approve-button"
              data-testid="signature-approval-confirm"
            >
              {submitting ? '…' : 'Approve signature'}
            </button>
          </>
        )}

        {!mpcSyncing && (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full py-2.5 text-[13px] font-medium text-white/40 transition hover:text-white/65"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
