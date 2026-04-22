/// <reference path="./types/jupiter-plugin.d.ts" />
import React, { useCallback, useEffect, useState } from 'react';

const JUPITER_SCRIPT = 'https://plugin.jup.ag/plugin-v1.js';
const JUPITER_TARGET_ID = 'prism-jupiter-root';

function loadJupiterScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('no window'));
      return;
    }
    if (window.Jupiter?.init) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${JUPITER_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Jupiter script failed')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = JUPITER_SCRIPT;
    s.async = true;
    s.dataset.prismJupiter = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Jupiter script failed'));
    document.head.appendChild(s);
  });
}

export const PrismTrade: React.FC = () => {
  const [sub, setSub] = useState<'dex' | 'agents'>('dex');
  const [jupiterErr, setJupiterErr] = useState<string | null>(null);
  const [agentSwitches, setAgentSwitches] = useState({
    sweep: false,
    guard: false,
    mirror: false,
  });

  useEffect(() => {
    if (sub !== 'dex') {
      try {
        window.Jupiter?.close?.();
      } catch {
        /* ignore */
      }
      return;
    }

    let cancelled = false;
    setJupiterErr(null);

    void (async () => {
      try {
        await loadJupiterScript();
        if (cancelled) return;
        const el = document.getElementById(JUPITER_TARGET_ID);
        if (!el) {
          setJupiterErr('Trade panel root missing — try again.');
          return;
        }
        window.Jupiter?.init({
          displayMode: 'integrated',
          integratedTargetId: JUPITER_TARGET_ID,
          autoConnect: false,
        });
      } catch {
        if (!cancelled) setJupiterErr('Could not load Jupiter. Check network or try opening jup.ag in a new tab.');
      }
    })();

    return () => {
      cancelled = true;
      try {
        window.Jupiter?.close?.();
      } catch {
        /* ignore */
      }
    };
  }, [sub]);

  const toggleAgent = useCallback((key: keyof typeof agentSwitches) => {
    setAgentSwitches((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div data-testid="trade-hub" className="flex flex-col gap-4 px-4 pb-8 pt-2">
      <div className="rounded-[20px] bg-amber-500/10 p-3 ring-1 ring-amber-400/25">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">Live trading</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-100/55">
          Jupiter runs on <span className="text-amber-100/80">real Solana</span>. Swaps are signed in your wallet — not
          devnet play-money. This is not financial advice; slippage and loss of funds are possible.
        </p>
      </div>

      <div className="wallet-segment-wrap flex rounded-2xl p-1 ring-1 ring-white/[0.07]">
        <button
          type="button"
          data-testid="trade-tab-dex"
          onClick={() => setSub('dex')}
          className={`flex-1 rounded-xl py-2.5 text-[12px] font-semibold transition ${
            sub === 'dex' ? 'wallet-segment-active text-white' : 'text-white/42 hover:text-white/55'
          }`}
        >
          Beam swap
        </button>
        <button
          type="button"
          data-testid="trade-tab-agents"
          onClick={() => setSub('agents')}
          className={`flex-1 rounded-xl py-2.5 text-[12px] font-semibold transition ${
            sub === 'agents' ? 'wallet-segment-active text-white' : 'text-white/42 hover:text-white/55'
          }`}
        >
          Beam agents
        </button>
      </div>

      {sub === 'dex' && (
        <section className="flex flex-col gap-3">
          <p className="text-[12px] leading-relaxed text-white/50">
            Each route is a <span className="text-white/75">beam</span> through Jupiter&apos;s liquidity — you choose
            tokens and size; the plugin handles quotes and submission after you approve.
          </p>
          {jupiterErr && (
            <p className="rounded-xl bg-rose-500/15 px-3 py-2 text-[11px] text-rose-200/90 ring-1 ring-rose-400/25">
              {jupiterErr}{' '}
              <a
                href="https://jup.ag/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-rose-100 underline underline-offset-2"
              >
                Open jup.ag ↗
              </a>
            </p>
          )}
          <div
            id={JUPITER_TARGET_ID}
            className="min-h-[28rem] overflow-hidden rounded-[20px] bg-[#0c0c10] ring-1 ring-white/[0.08]"
          />
        </section>
      )}

      {sub === 'agents' && (
        <section className="space-y-4">
          <p className="text-[12px] leading-relaxed text-white/55">
            <span className="font-semibold text-white/80">Vision:</span> personal beam agents could watch markets, size
            orders, or mirror strategies — always with your keys and explicit limits.{' '}
            <span className="text-amber-200/70">Nothing here executes trades yet;</span> these toggles are a UI sketch
            only.
          </p>

          <ul className="flex flex-col gap-3">
            {(
              [
                {
                  key: 'sweep' as const,
                  title: 'Sweep beam',
                  desc: 'Round stray balances into one asset on a schedule (concept only).',
                },
                {
                  key: 'guard' as const,
                  title: 'Guard beam',
                  desc: 'Pause or cap trades outside a price band you set (concept only).',
                },
                {
                  key: 'mirror' as const,
                  title: 'Mirror beam',
                  desc: 'Surface swaps from a wallet you follow — you still confirm each tx (concept only).',
                },
              ] as const
            ).map(({ key, title, desc }) => (
              <li
                key={key}
                className="flex items-start justify-between gap-3 rounded-[18px] bg-white/[0.04] p-3.5 ring-1 ring-white/[0.07]"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-white/88">{title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/42">{desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={agentSwitches[key]}
                  onClick={() => toggleAgent(key)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                    agentSwitches[key] ? 'bg-emerald-500/40 ring-1 ring-emerald-400/40' : 'bg-white/10 ring-1 ring-white/10'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                      agentSwitches[key] ? 'left-6' : 'left-0.5'
                    }`}
                  />
                </button>
              </li>
            ))}
          </ul>

          <p className="text-[10px] leading-relaxed text-white/35">
            Future builds could connect an LLM or rules engine to suggest beams — never auto-sign without your wallet
            approval and clear risk caps.
          </p>
        </section>
      )}

    </div>
  );
};
