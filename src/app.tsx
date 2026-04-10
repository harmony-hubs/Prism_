import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as WaapModule from '@human.tech/waap-sdk';
import Crystal from './Crystal';
import { SOLANA_RPC } from './config';

type WaapInit = (opts: { config: Record<string, unknown> }) => void;
const initWaaP =
  (WaapModule as { initWaaP?: WaapInit }).initWaaP ??
  (WaapModule as { default?: { initWaaP?: WaapInit } }).default?.initWaaP;
const loginWithPasskey =
  (WaapModule as { loginWithPasskey?: () => Promise<void> }).loginWithPasskey ??
  (WaapModule as { default?: { loginWithPasskey?: () => Promise<void> } }).default?.loginWithPasskey;
const loginWithSocial =
  (WaapModule as { loginWithSocial?: (p: string) => Promise<void> }).loginWithSocial ??
  (WaapModule as { default?: { loginWithSocial?: (p: string) => Promise<void> } }).default?.loginWithSocial;

type Phase = 'splash' | 'boot' | 'hub';

interface ChainIdentity {
  id: string;
  name: string;
  symbol: string;
  address: string;
  color: string;
  emoji: string;
}

interface ActivityItem {
  id: string;
  at: string;
  title: string;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function randomBase58(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += B58[Math.floor(Math.random() * B58.length)];
  return s;
}

function randomHex(n: number): string {
  return Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

async function deriveDevIdentities(): Promise<ChainIdentity[]> {
  await new Promise((r) => setTimeout(r, 1200));
  const solAddr = randomBase58(44);
  return [
    {
      id: 'btc',
      name: 'Bitcoin',
      symbol: 'BTC',
      address: `bc1q${randomHex(19)}`,
      color: '#F7931A',
      emoji: '₿',
    },
    {
      id: 'eth',
      name: 'Ethereum',
      symbol: 'ETH',
      address: `0x${randomHex(40)}`,
      color: '#627EEA',
      emoji: '◆',
    },
    {
      id: 'sol',
      name: 'Solana',
      symbol: 'SOL',
      address: solAddr,
      color: '#9945FF',
      emoji: '◎',
    },
    {
      id: 'sui',
      name: 'Sui',
      symbol: 'SUI',
      address: `0x${randomHex(64)}`,
      color: '#4DA2FF',
      emoji: '⬢',
    },
  ];
}

async function fetchSolBalanceLamports(pubkey: string): Promise<number | null> {
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [pubkey],
      }),
    });
    const data = (await res.json()) as { result?: { value?: number } };
    if (data.result?.value !== undefined) return data.result.value;
  } catch {
    /* ignore */
  }
  return null;
}

async function simulateSign(chainName: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 900));
}

/** Rough USD for demo portfolio total (SOL only live on-chain). */
const SOL_USD_EST = 140;

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

function formatCrypto(n: number, maxDecimals: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals, minimumFractionDigits: Math.min(2, maxDecimals) });
}

export const Prism: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('splash');
  const [chains, setChains] = useState<ChainIdentity[]>([]);
  const [solLamports, setSolLamports] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [justSigned, setJustSigned] = useState<string | null>(null);
  const [walletTab, setWalletTab] = useState<'assets' | 'activity'>('assets');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [confettiOn, setConfettiOn] = useState(false);
  const [sparkleOn, setSparkleOn] = useState(false);

  const pushActivity = useCallback((title: string) => {
    const at = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    setActivity((prev) => [{ id: crypto.randomUUID(), at, title }, ...prev].slice(0, 8));
  }, []);

  useEffect(() => {
    if (!initWaaP) return;
    try {
      initWaaP({
        config: {
          authenticationMethods: ['passkey', 'social'],
          allowedSocials: ['google', 'apple'],
          styles: { darkMode: true, themeColor: '#d4af37' },
          network: 'mainnet',
        },
      });
    } catch {
      /* non-fatal */
    }
  }, []);

  const runBoot = useCallback(async () => {
    setPhase('boot');
    const list = await deriveDevIdentities();
    setChains(list);
    setExpandedId('sol');
    const lamports = await fetchSolBalanceLamports(list.find((c) => c.id === 'sol')?.address ?? '');
    setSolLamports(lamports);
    pushActivity('Welcome — your spectrum is ready');
    setPhase('hub');
  }, [pushActivity]);

  const begin = useCallback(
    async (method: 'passkey' | 'google') => {
      setLoading(true);
      try {
        if (method === 'passkey' && typeof loginWithPasskey === 'function') await loginWithPasskey();
        else if (method === 'google' && typeof loginWithSocial === 'function') await loginWithSocial('google');
      } catch {
        /* demo continues */
      }
      setLoading(false);
      await runBoot();
    },
    [runBoot]
  );

  const copy = useCallback((key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setSparkleOn(true);
    setTimeout(() => setSparkleOn(false), 900);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleTry = useCallback(
    async (chain: ChainIdentity) => {
      setSigningId(chain.id);
      setJustSigned(null);
      try {
        await simulateSign(chain.name);
        setJustSigned(chain.id);
        setConfettiOn(true);
        setTimeout(() => setConfettiOn(false), 2200);
        pushActivity(`Done — ${chain.name} (practice)`);
        setTimeout(() => setJustSigned(null), 1600);
      } catch {
        pushActivity("Couldn't complete — tap again");
      }
      setSigningId(null);
    },
    [pushActivity]
  );

  const solNum = solLamports !== null ? solLamports / 1e9 : 0;
  const totalUsdEst = solNum * SOL_USD_EST;

  if (phase === 'splash') {
    return (
      <div className="relative min-h-dvh overflow-hidden text-white">
        <div className="splash-ambient pointer-events-none absolute inset-0 z-0" aria-hidden />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[min(52vh,560px)]">
          <Canvas
            gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
            dpr={[1, 2]}
            className="h-full w-full"
          >
            <Suspense fallback={null}>
              <Crystal />
            </Suspense>
          </Canvas>
          <div className="splash-crystal-shade pointer-events-none absolute inset-0 z-[2]" aria-hidden />
        </div>

        <div className="relative z-10 flex min-h-dvh flex-col">
          <div className="flex flex-1 flex-col items-center justify-center px-5 pb-10 pt-6 sm:px-8">
            <p className="splash-kicker splash-rise mb-5 text-center">Multi-chain wallet</p>

            <h1 className="splash-rise splash-rise-delay-1 font-serif text-[2.85rem] font-normal leading-none tracking-tight sm:text-7xl md:text-8xl">
              <span className="splash-title-track gold-glow inline-block bg-gradient-to-br from-white via-[#f8efd9] to-[#c9a227] bg-clip-text text-transparent">
                PRISM
              </span>
            </h1>

            <div
              className="splash-rise splash-rise-delay-2 splash-spectrum-bar mt-7"
              role="presentation"
              aria-hidden
            />

            <div className="splash-rise splash-rise-delay-3 splash-copy-panel mt-10 w-full max-w-[26rem] rounded-[22px] px-6 py-7 sm:px-8 sm:py-8">
              <p className="text-center font-serif text-[17px] italic leading-relaxed text-white/[0.72] sm:text-[18px]">
                We don&apos;t invent the colors,{' '}
                <span className="text-white/[0.88] not-italic">we reveal the spectrum</span>
                {' '}in a single beam.
              </p>
              <div className="mx-auto my-6 h-px max-w-[12rem] bg-gradient-to-r from-transparent via-white/15 to-transparent" aria-hidden />
              <p className="text-center text-[15px] leading-relaxed text-white/45 sm:text-[16px]">
                <span className="font-medium text-white/65">Bitcoin · Ethereum · Solana · Sui</span>
                <br />
                <span className="mt-2 block text-white/38">No seed phrase — just you</span>
              </p>
            </div>

            <div className="splash-rise splash-rise-delay-4 mt-11 flex w-full max-w-[320px] flex-col gap-3">
              <button
                type="button"
                onClick={() => begin('passkey')}
                disabled={loading}
                className="rounded-2xl bg-gradient-to-r from-[#d4af37] via-[#c9a030] to-[#8b6d24] py-[1.05rem] text-[16px] font-semibold text-black shadow-[0_12px_40px_rgba(212,175,55,0.28)] ring-1 ring-white/20 transition hover:scale-[1.02] hover:shadow-[0_16px_48px_rgba(212,175,55,0.32)] active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? '…' : 'Continue'}
              </button>
              <button
                type="button"
                onClick={() => begin('google')}
                disabled={loading}
                className="rounded-2xl border border-white/[0.09] bg-white/[0.04] py-3.5 text-[15px] font-medium text-white/[0.88] shadow-[0_8px_32px_rgba(0,0,0,0.25)] backdrop-blur-sm transition hover:border-white/[0.14] hover:bg-white/[0.07] disabled:opacity-60"
              >
                Continue with Google
              </button>
            </div>
          </div>

          <p className="splash-rise splash-rise-delay-5 px-4 pb-8 text-center text-[11px] tracking-wide text-white/28 sm:text-[12px]">
            Practice app · not real money
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'boot') {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#0b0b0f] px-6 text-white">
        <div className="boot-aurora pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mb-8 flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-emerald-400/20 wallet-boot-ring" />
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-emerald-400/80" />
        </div>
        <p className="relative text-[15px] font-medium text-white/80">Revealing your spectrum…</p>
        <p className="relative mt-2 text-[12px] text-white/35">One beam · test network</p>
      </div>
    );
  }

  const solChain = chains.find((c) => c.id === 'sol');

  /* hub — wallet UI */
  return (
    <div className="wallet-shell min-h-dvh bg-[#0b0b0f] text-white">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col shadow-2xl shadow-black/50">
        <header className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2.5">
            <div
              className="wallet-logo-breathe flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-violet-500/30 ring-1 ring-white/10"
              aria-hidden
            >
              <span className="font-serif text-lg font-semibold text-white/95">P</span>
            </div>
            <div>
              <h1 className="text-[17px] font-semibold leading-tight tracking-tight">PRISM</h1>
              <p className="text-[11px] text-white/40">One identity · many chains</p>
            </div>
          </div>
          <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-emerald-400/90 ring-1 ring-emerald-500/20">
            Devnet
          </span>
        </header>

        <main className="flex flex-1 flex-col px-4 pb-6">
          {/* Portfolio card */}
          <section className="relative mt-2 overflow-hidden rounded-[22px] bg-gradient-to-br from-zinc-800/90 via-zinc-900/95 to-black p-5 ring-1 ring-white/10">
            <div className="wallet-hero-shine pointer-events-none absolute inset-0 rounded-[22px] opacity-90" aria-hidden />
            <div className="wallet-pulse-ring pointer-events-none absolute -inset-px rounded-[22px] opacity-40" aria-hidden />
            <p className="relative text-[11px] font-medium uppercase tracking-wider text-white/40">Balance across chains</p>
            <p className="relative mt-1 text-[34px] font-semibold leading-none tracking-tight text-white tabular-nums">
              {formatUsd(totalUsdEst)}
            </p>
            <p className="relative mt-2 text-[12px] text-white/35">
              {solLamports !== null ? (
                <>
                  {formatCrypto(solNum, 4)} SOL · est. · Practice
                </>
              ) : (
                'Loading…'
              )}
            </p>
          </section>

          {/* Quick actions */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setReceiveOpen(true)}
              className="wallet-quick-tap group flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.06] py-3.5 ring-1 ring-white/[0.06] transition-transform duration-200 active:scale-[0.94]"
            >
              <span className="wallet-action-icon flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/20 to-cyan-500/15 text-[20px] ring-1 ring-white/10">
                ✦
              </span>
              <span className="text-[12px] font-medium text-white/85">Receive</span>
            </button>
            <button
              type="button"
              onClick={() => setWalletTab('assets')}
              className="wallet-quick-tap group flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.06] py-3.5 ring-1 ring-white/[0.06] transition-transform duration-200 active:scale-[0.94]"
            >
              <span className="wallet-action-icon flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/15 text-[20px] ring-1 ring-white/10">
                ↑
              </span>
              <span className="text-[12px] font-medium text-white/85">Send</span>
            </button>
            <button
              type="button"
              onClick={() => setWalletTab('activity')}
              className="wallet-quick-tap group flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.06] py-3.5 ring-1 ring-white/[0.06] transition-transform duration-200 active:scale-[0.94]"
            >
              <span className="wallet-action-icon flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-400/25 to-fuchsia-500/15 text-[18px] ring-1 ring-white/10">
                ✧
              </span>
              <span className="text-[12px] font-medium text-white/85">Activity</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex rounded-xl bg-black/40 p-1 ring-1 ring-white/[0.06]">
            <button
              type="button"
              onClick={() => setWalletTab('assets')}
              className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition ${
                walletTab === 'assets' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40'
              }`}
            >
              Assets
            </button>
            <button
              type="button"
              onClick={() => setWalletTab('activity')}
              className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition ${
                walletTab === 'activity' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40'
              }`}
            >
              Activity
            </button>
          </div>

          {walletTab === 'assets' && (
            <div className="mt-4 flex flex-col gap-1">
              <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-white/35">Facets</p>
              {chains.map((c, idx) => {
                const isSol = c.id === 'sol';
                const bal = isSol ? solNum : 0;
                const usd = isSol ? solNum * SOL_USD_EST : 0;
                const busy = signingId === c.id;
                const signed = justSigned === c.id;
                const expanded = expandedId === c.id;
                return (
                  <div
                    key={c.id}
                    style={{ animationDelay: `${idx * 0.07}s` }}
                    className={`token-row-enter overflow-hidden rounded-2xl ring-1 transition ${
                      signed ? 'bg-emerald-500/5 ring-emerald-500/25 wallet-row-glow' : 'bg-white/[0.04] ring-white/[0.06]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : c.id)}
                      className="flex w-full items-center gap-3 px-3 py-3.5 text-left transition hover:bg-white/[0.03]"
                    >
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg"
                        style={{ backgroundColor: `${c.color}22`, boxShadow: `inset 0 0 0 1px ${c.color}35` }}
                      >
                        {c.emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[15px] text-white/95">{c.name}</div>
                        <div className="text-[11px] text-white/35">{c.symbol}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[15px] font-medium tabular-nums text-white/95">
                          {isSol ? formatCrypto(bal, 4) : formatCrypto(0, 5)}
                        </div>
                        <div className="text-[11px] text-white/35">{formatUsd(usd)}</div>
                      </div>
                    </button>
                    {expanded && (
                      <div className="space-y-3 border-t border-white/[0.06] px-3 py-3">
                        <p className="break-all font-mono text-[11px] leading-relaxed text-white/45">{c.address}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => copy(c.id, c.address)}
                            className="flex-1 rounded-xl bg-white/10 py-2.5 text-[13px] font-semibold text-white/90"
                          >
                            {copied === c.id ? 'Copied' : 'Copy address'}
                          </button>
                          <button
                            type="button"
                            disabled={busy || signingId !== null}
                            onClick={() => handleTry(c)}
                            className="wallet-btn-bounce flex-1 rounded-xl bg-emerald-500/20 py-2.5 text-[13px] font-semibold text-emerald-300/95 disabled:opacity-40"
                          >
                            {busy ? '…' : 'Test sign'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="px-1 pt-3 text-center text-[11px] text-white/25">
                Each chain is a color in the beam—tap a row · Test sign is practice
              </p>
            </div>
          )}

          {walletTab === 'activity' && (
            <div className="mt-4 flex flex-col gap-0">
              {activity.length === 0 ? (
                <div className="rounded-2xl bg-white/[0.03] py-14 text-center ring-1 ring-white/[0.06]">
                  <p className="text-[14px] text-white/45">Nothing in the beam yet</p>
                  <p className="mt-1 text-[12px] text-white/35">When you move, it shows up here</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {activity.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-3 py-3.5 ring-1 ring-white/[0.05]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[13px]">
                          ✓
                        </div>
                        <span className="text-[14px] text-white/80">{a.title}</span>
                      </div>
                      <span className="shrink-0 text-[11px] text-white/35">{a.at}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </main>

        <footer className="px-4 pb-6 pt-0 text-center text-[10px] text-white/25">
          Practice wallet · one beam, many chains · not real funds
        </footer>
      </div>

      {confettiOn && (
        <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
          {Array.from({ length: 22 }, (_, i) => (
            <span
              key={i}
              className="wallet-confetti-bit absolute top-[12%] text-[14px] will-change-transform"
              style={{
                left: `${6 + (i * 4.1) % 88}%`,
                animationDelay: `${i * 35}ms`,
                color: ['#d4af37', '#a78bfa', '#34d399', '#f472b6', '#38bdf8', '#4da2ff'][i % 6],
              }}
            >
              {['✦', '·', '✧', '·', '✦'][i % 5]}
            </span>
          ))}
        </div>
      )}

      {sparkleOn && (
        <div className="sparkle-float pointer-events-none fixed bottom-24 left-1/2 z-[65] -translate-x-1/2 text-[15px] font-medium text-amber-200/90">
          Nice — copied
        </div>
      )}

      {receiveOpen && solChain && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal
          onClick={() => setReceiveOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setReceiveOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-[#16161c] p-6 ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-[11px] font-medium uppercase tracking-wider text-white/40">Receive SOL</p>
            <p className="mt-4 break-all text-center font-mono text-[12px] leading-relaxed text-white/70">{solChain.address}</p>
            <button
              type="button"
              onClick={() => {
                copy('sheet-sol', solChain.address);
              }}
              className="mt-5 w-full rounded-2xl bg-white py-3.5 text-[15px] font-semibold text-black"
            >
              {copied === 'sheet-sol' ? 'Copied' : 'Copy address'}
            </button>
            <button
              type="button"
              onClick={() => setReceiveOpen(false)}
              className="mt-3 w-full py-3 text-[14px] font-medium text-white/45"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
