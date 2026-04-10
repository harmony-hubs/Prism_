import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as WaapModule from '@human.tech/waap-sdk';
import Crystal from './Crystal';
import {
  HOLLOW_PROGRAM_ID,
  IKA_CPI_AUTHORITY_SEED,
  IKA_DWALLET_PROGRAM_ID,
  IKA_PREALPHA_GRPC,
  SOLANA_RPC,
  SUI_RPC,
} from './config';
import {
  createSolanaConnection,
  disconnectPhantomWallet,
  DWALLET_BOOK_PARTS,
  DWALLET_FLOW_STEPS,
  getInjectedSolana,
  IKA_PUBLIC_SITE,
  IKA_SOLANA_PREALPHA_GUIDE,
  IKA_SOLANA_PREALPHA_INTRO,
  IKA_SOLANA_PREALPHA_PRINT,
  PRE_ALPHA_DISCLAIMER_SHORT,
  readConnectedPubkey,
} from './dwallet';
import { DWalletTools } from './DWalletTools';

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

/** Sui balance in mist (1 SUI = 1e9 mist). */
async function fetchSuiBalanceMist(owner: string): Promise<number | null> {
  try {
    const res = await fetch(SUI_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_getBalance',
        params: [owner],
      }),
    });
    const data = (await res.json()) as { result?: { totalBalance?: string } };
    if (data.result?.totalBalance !== undefined) return Number(data.result.totalBalance);
  } catch {
    /* ignore */
  }
  return null;
}

async function simulateSign(chainName: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 900));
}

/** Rough USD for demo portfolio (live SOL + SUI on-chain × these rates). */
const SOL_USD_EST = 140;
const SUI_USD_EST = 3.5;

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

function formatCrypto(n: number, maxDecimals: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals, minimumFractionDigits: Math.min(2, maxDecimals) });
}

export const Prism: React.FC = () => {
  /** Connected Solana address via injected wallet (Phantom / compatible). Direct connect — no wallet-adapter “install” modal. */
  const [solWalletPk, setSolWalletPk] = useState<string | null>(null);
  const [solWalletBusy, setSolWalletBusy] = useState(false);

  const solanaConnection = useMemo(() => createSolanaConnection(), []);
  const initialSolAddressRef = useRef<string>('');

  const [phase, setPhase] = useState<Phase>('splash');
  const [chains, setChains] = useState<ChainIdentity[]>([]);
  const [solLamports, setSolLamports] = useState<number | null>(null);
  const [suiMist, setSuiMist] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [justSigned, setJustSigned] = useState<string | null>(null);
  const [walletTab, setWalletTab] = useState<'assets' | 'activity' | 'guide'>('assets');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveAsset, setReceiveAsset] = useState<'sol' | 'sui'>('sol');
  const [confettiOn, setConfettiOn] = useState(false);
  const [sparkleOn, setSparkleOn] = useState(false);

  const pushActivity = useCallback((title: string) => {
    const at = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    setActivity((prev) => [{ id: crypto.randomUUID(), at, title }, ...prev].slice(0, 8));
  }, []);

  useEffect(() => {
    const existing = readConnectedPubkey();
    if (existing) setSolWalletPk(existing);
  }, []);

  useEffect(() => {
    const w = getInjectedSolana();
    if (!w?.on) return;
    const onAcct = (...args: unknown[]) => {
      const next = args[0] as { toBase58?: () => string } | undefined;
      if (next && typeof next.toBase58 === 'function') setSolWalletPk(next.toBase58());
    };
    const onDisc = () => setSolWalletPk(null);
    w.on('accountChanged', onAcct);
    w.on('disconnect', onDisc);
    return () => {
      w.off?.('accountChanged', onAcct);
      w.off?.('disconnect', onDisc);
    };
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
    const connected = readConnectedPubkey();
    if (connected) setSolWalletPk(connected);
    initialSolAddressRef.current = list.find((c) => c.id === 'sol')?.address ?? '';
    const listWithSol = connected
      ? list.map((c) => (c.id === 'sol' ? { ...c, address: connected } : c))
      : list;
    setChains(listWithSol);
    setExpandedId('sol');
    const solAddr = listWithSol.find((c) => c.id === 'sol')?.address ?? '';
    const suiAddr = listWithSol.find((c) => c.id === 'sui')?.address ?? '';
    const [lamports, mist] = await Promise.all([
      fetchSolBalanceLamports(solAddr),
      fetchSuiBalanceMist(suiAddr),
    ]);
    setSolLamports(lamports !== null ? lamports : 0);
    setSuiMist(mist !== null ? mist : 0);
    pushActivity('Welcome — your spectrum is ready');
    setPhase('hub');
  }, [pushActivity]);

  useEffect(() => {
    if (phase !== 'hub') return;
    const addr = solWalletPk ?? initialSolAddressRef.current;
    if (!addr) return;
    void (async () => {
      const lamports = await fetchSolBalanceLamports(addr);
      setSolLamports(lamports !== null ? lamports : 0);
    })();
  }, [solWalletPk, phase]);

  useEffect(() => {
    if (phase !== 'hub') return;
    setChains((prev) => {
      const sol = prev.find((c) => c.id === 'sol');
      if (!sol) return prev;
      const nextAddr = solWalletPk ?? initialSolAddressRef.current;
      if (sol.address === nextAddr) return prev;
      return prev.map((c) => (c.id === 'sol' ? { ...c, address: nextAddr } : c));
    });
  }, [solWalletPk, phase]);

  const connectSolanaWallet = useCallback(async () => {
    setSolWalletBusy(true);
    try {
      const w = getInjectedSolana();
      if (!w?.connect) {
        pushActivity('Open this page in Chrome or Edge where Phantom is installed — or copy the URL below');
        return;
      }
      const { publicKey } = await w.connect();
      setSolWalletPk(publicKey.toBase58());
      pushActivity('Solana wallet connected');
    } catch {
      pushActivity('Connection cancelled or failed');
    }
    setSolWalletBusy(false);
  }, [pushActivity]);

  const disconnectSolanaWallet = useCallback(async () => {
    setSolWalletBusy(true);
    try {
      await disconnectPhantomWallet();
      setSolWalletPk(null);
      pushActivity('Solana wallet disconnected');
    } catch {
      /* ignore */
    }
    setSolWalletBusy(false);
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
  const suiNum = suiMist !== null ? suiMist / 1e9 : 0;
  const totalUsdEst = solNum * SOL_USD_EST + suiNum * SUI_USD_EST;
  const balancesReady = solLamports !== null && suiMist !== null;

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
  const suiChain = chains.find((c) => c.id === 'sui');
  const receiveChain = receiveAsset === 'sol' ? solChain : suiChain;

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
          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              disabled={solWalletBusy}
              onClick={() => (solWalletPk ? void disconnectSolanaWallet() : void connectSolanaWallet())}
              className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-white/90 ring-1 ring-white/10 hover:bg-white/[0.12] disabled:opacity-50"
            >
              {solWalletBusy
                ? '…'
                : solWalletPk
                  ? `Solana · ${solWalletPk.slice(0, 4)}…${solWalletPk.slice(-4)}`
                  : 'Connect wallet'}
            </button>
            <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-emerald-400/90 ring-1 ring-emerald-500/20">
              Devnet
            </span>
          </div>
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
            <div className="relative mt-2 text-[12px] text-white/35">
              {balancesReady ? (
                <div className="space-y-1.5">
                  <div className="text-white/40">
                    {formatCrypto(solNum, 4)} SOL <span className="text-white/30">· est.</span>
                  </div>
                  <div className="border-l border-white/15 pl-3 text-white/30">
                    {formatCrypto(suiNum, 4)} SUI <span className="text-white/25">· under Solana · est.</span>
                  </div>
                  <div className="pt-0.5 text-[11px] text-white/25">Practice</div>
                </div>
              ) : (
                'Loading…'
              )}
            </div>
          </section>

          {/* Solana — direct injected-wallet connect (avoids wallet-adapter “install” UI on localhost) */}
          <section className="mt-4 rounded-[20px] bg-gradient-to-br from-emerald-950/40 to-zinc-900/80 p-4 ring-1 ring-emerald-500/15">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/90">Solana · devnet</p>
            <p className="mt-1 text-[12px] leading-snug text-white/50">
              Uses your browser wallet (Phantom, etc.) directly — no app-store step. Open this app in{' '}
              <strong className="font-medium text-white/65">Chrome or Edge</strong> with the extension; IDE previews cannot inject wallets.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={solWalletBusy}
                onClick={() => (solWalletPk ? void disconnectSolanaWallet() : void connectSolanaWallet())}
                className="flex-1 rounded-xl bg-emerald-500/25 py-3 text-[13px] font-semibold text-emerald-100 ring-1 ring-emerald-400/30 disabled:opacity-50"
              >
                {solWalletBusy ? '…' : solWalletPk ? 'Disconnect wallet' : 'Connect wallet'}
              </button>
              <button
                type="button"
                onClick={() => copy('app-origin', typeof window !== 'undefined' ? window.location.href : '')}
                className="rounded-xl bg-white/[0.06] px-4 py-3 text-[12px] font-medium text-white/75 ring-1 ring-white/[0.08]"
              >
                {copied === 'app-origin' ? 'Copied' : 'Copy page URL'}
              </button>
            </div>
            <p className="mt-2 text-[10px] text-white/35">
              Don&apos;t have Phantom?{' '}
              <a
                href="https://phantom.app/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400/80 underline decoration-white/15 underline-offset-2"
              >
                phantom.app/download
              </a>
            </p>
            {solWalletPk && (
              <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-3">
                <p className="break-all font-mono text-[11px] leading-relaxed text-white/55">{solWalletPk}</p>
                <button
                  type="button"
                  onClick={() => copy('wallet-full', solWalletPk)}
                  className="w-full rounded-lg bg-white/[0.06] py-2 text-[12px] font-medium text-white/80 ring-1 ring-white/[0.08]"
                >
                  {copied === 'wallet-full' ? 'Copied address' : 'Copy devnet address'}
                </button>
              </div>
            )}
          </section>

          {/* Quick actions */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setReceiveAsset('sol');
                setReceiveOpen(true);
              }}
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
              className={`flex-1 rounded-lg py-2.5 text-[12px] font-semibold transition sm:text-[13px] ${
                walletTab === 'assets' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40'
              }`}
            >
              Assets
            </button>
            <button
              type="button"
              onClick={() => setWalletTab('activity')}
              className={`flex-1 rounded-lg py-2.5 text-[12px] font-semibold transition sm:text-[13px] ${
                walletTab === 'activity' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40'
              }`}
            >
              Activity
            </button>
            <button
              type="button"
              onClick={() => setWalletTab('guide')}
              className={`flex-1 rounded-lg py-2.5 text-[12px] font-semibold transition sm:text-[13px] ${
                walletTab === 'guide' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40'
              }`}
            >
              dWallet
            </button>
          </div>

          {walletTab === 'assets' && (
            <div className="mt-4 flex flex-col gap-1">
              <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-white/35">Facets</p>
              {chains.map((c, idx) => {
                const isSol = c.id === 'sol';
                const isSui = c.id === 'sui';
                const bal = isSol ? solNum : isSui ? suiNum : 0;
                const usd = isSol ? solNum * SOL_USD_EST : isSui ? suiNum * SUI_USD_EST : 0;
                const busy = signingId === c.id;
                const signed = justSigned === c.id;
                const expanded = expandedId === c.id;
                return (
                  <div
                    key={c.id}
                    style={{ animationDelay: `${idx * 0.07}s` }}
                    className={`token-row-enter overflow-hidden rounded-2xl ring-1 transition ${
                      signed ? 'bg-emerald-500/5 ring-emerald-500/25 wallet-row-glow' : 'bg-white/[0.04] ring-white/[0.06]'
                    } ${isSui ? 'ml-2 border-l border-white/15 pl-2' : ''}`}
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
                          {isSol || isSui ? formatCrypto(bal, 4) : formatCrypto(0, 5)}
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

          {walletTab === 'guide' && (
            <div className="mt-4 flex max-h-[min(52vh,420px)] flex-col gap-4 overflow-y-auto rounded-[20px] bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
              <p className="text-[11px] leading-relaxed text-amber-200/70">{PRE_ALPHA_DISCLAIMER_SHORT}</p>
              <p className="text-[11px] text-white/35">
                Official book:{' '}
                <a
                  href={IKA_SOLANA_PREALPHA_INTRO}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-200/90 underline decoration-white/20 underline-offset-2"
                >
                  Introduction
                </a>
                {' · '}
                <a
                  href={IKA_SOLANA_PREALPHA_PRINT}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-200/90 underline decoration-white/20 underline-offset-2"
                >
                  Full guide (print)
                </a>
                {' · '}
                <a
                  href={IKA_PUBLIC_SITE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-200/90 underline decoration-white/20 underline-offset-2"
                >
                  ika.xyz
                </a>
              </p>

              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/45">How it works</h2>
                <ol className="mt-2 list-decimal space-y-2 pl-4 text-[13px] text-white/70">
                  {DWALLET_FLOW_STEPS.map((s) => (
                    <li key={s.title}>
                      <span className="font-medium text-white/85">{s.title}</span>
                      <span className="text-white/45"> — {s.detail}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/45">What you will learn</h2>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12px] text-white/55">
                  {DWALLET_BOOK_PARTS.map((p) => (
                    <li key={p.title}>
                      <span className="font-medium text-white/75">{p.title}</span>
                      <span className="text-white/40"> — {p.detail}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Pre-alpha environment (book)</h2>
                <dl className="mt-2 space-y-1.5 font-mono text-[10px] leading-snug text-white/50">
                  <div>
                    <dt className="text-white/35">dWallet gRPC</dt>
                    <dd className="break-all text-white/60">{IKA_PREALPHA_GRPC}</dd>
                  </div>
                  <div>
                    <dt className="text-white/35">Solana RPC</dt>
                    <dd className="break-all text-white/60">{SOLANA_RPC}</dd>
                  </div>
                  <div>
                    <dt className="text-white/35">Ika dWallet program (devnet)</dt>
                    <dd className="break-all text-white/60">{IKA_DWALLET_PROGRAM_ID}</dd>
                  </div>
                  <div>
                    <dt className="text-white/35">CPI authority seed</dt>
                    <dd className="text-white/60">{IKA_CPI_AUTHORITY_SEED}</dd>
                  </div>
                  <div>
                    <dt className="text-white/35">Your program (VITE_HOLLOW_PROGRAM_ID)</dt>
                    <dd className="break-all text-white/60">
                      {HOLLOW_PROGRAM_ID || '— set after deploy'}
                    </dd>
                  </div>
                </dl>
              </section>

              <p className="text-[10px] leading-relaxed text-white/30">
                Rust path: <code className="text-white/45">program/</code>, <code className="text-white/45">client/</code> — wire{' '}
                <code className="text-white/45">ika-grpc</code> per the book; TS SDK <code className="text-white/45">@ika.xyz/sdk</code> targets Sui-side Ika
                flows (see package README). Message hashes: keccak256 per Ika message-approval docs.
              </p>

              <DWalletTools connection={solanaConnection} />
            </div>
          )}
        </main>

        <footer className="space-y-2 px-4 pb-6 pt-0 text-center text-[10px] text-white/25">
          <p>Practice wallet · one beam, many chains · not real funds</p>
          <p>
            <a
              href={IKA_SOLANA_PREALPHA_GUIDE}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/40 underline decoration-white/15 underline-offset-2 hover:text-white/55"
            >
              dWallet Developer Guide (Solana pre-alpha)
            </a>
          </p>
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

      {receiveOpen && receiveChain && (
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
            <p className="text-center text-[11px] font-medium uppercase tracking-wider text-white/40">Receive</p>
            <div className="mt-4 flex rounded-xl bg-black/40 p-1 ring-1 ring-white/[0.06]">
              <button
                type="button"
                onClick={() => setReceiveAsset('sol')}
                className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition ${
                  receiveAsset === 'sol' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40'
                }`}
              >
                SOL
              </button>
              <button
                type="button"
                onClick={() => setReceiveAsset('sui')}
                className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition ${
                  receiveAsset === 'sui' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40'
                }`}
              >
                SUI
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-white/35">
              {receiveAsset === 'sol' ? 'Solana devnet' : 'Sui devnet'}
            </p>
            <p className="mt-4 break-all text-center font-mono text-[12px] leading-relaxed text-white/70">{receiveChain.address}</p>
            <button
              type="button"
              onClick={() => {
                const key = receiveAsset === 'sol' ? 'sheet-sol' : 'sheet-sui';
                copy(key, receiveChain.address);
              }}
              className="mt-5 w-full rounded-2xl bg-white py-3.5 text-[15px] font-semibold text-black"
            >
              {copied === (receiveAsset === 'sol' ? 'sheet-sol' : 'sheet-sui') ? 'Copied' : 'Copy address'}
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
