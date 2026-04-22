import React from 'react';

export type PrismDashboardProps = {
  networkLabel?: string;
  solAddressPreview?: string | null;
  onBack?: () => void;
};

/**
 * Sparse overview: one column, no sidebar chrome — calmer than the first glass pass.
 */
export const PrismDashboard: React.FC<PrismDashboardProps> = ({
  networkLabel = 'Devnet',
  solAddressPreview,
  onBack,
}) => {
  const sol =
    solAddressPreview && solAddressPreview.length > 8
      ? `${solAddressPreview.slice(0, 4)}…${solAddressPreview.slice(-4)}`
      : '—';

  return (
    <div className="min-h-dvh bg-[#0b0b0f] px-4 pb-12 pt-4 text-white/90">
      {onBack && (
        <button
          type="button"
          data-testid="command-back"
          onClick={onBack}
          className="mb-8 text-[13px] text-white/45 transition hover:text-white/80"
        >
          ← Back
        </button>
      )}

      <div className="mx-auto max-w-md">
        <h1 className="text-lg font-medium tracking-tight">Overview</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-white/40">
          Same app as the pocket view — this screen is a quiet read of demo identity rows.{' '}
          <span className="text-white/50">{networkLabel}</span>
        </p>

        <ul className="mt-8 divide-y divide-white/[0.06] border-t border-b border-white/[0.06]">
          <li className="flex items-center justify-between py-3 text-[14px]">
            <span className="text-white/50">BTC</span>
            <span className="font-mono text-[13px] text-white/35">demo</span>
          </li>
          <li className="flex items-center justify-between py-3 text-[14px]">
            <span className="text-white/50">ETH</span>
            <span className="font-mono text-[13px] text-white/35">demo</span>
          </li>
          <li className="flex items-center justify-between py-3 text-[14px]">
            <span className="text-white/50">SOL</span>
            <span className="font-mono text-[13px] text-white/70">{sol}</span>
          </li>
          <li className="flex items-center justify-between py-3 text-[14px]">
            <span className="text-white/50">SUI</span>
            <span className="font-mono text-[13px] text-white/35">demo</span>
          </li>
        </ul>

        <p className="mt-6 text-center text-[11px] text-white/25">Ika dWallet tools stay in Learn — connect Phantom on the wallet tab for a live SOL line.</p>
      </div>
    </div>
  );
};
