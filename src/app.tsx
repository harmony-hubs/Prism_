import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as WaapModule from '@human.tech/waap-sdk';
import Crystal from './Crystal';
import { SOLANA_RPC, SUI_RPC } from './config';
import {
  createSolanaConnection,
  disconnectPhantomWallet,
  getInjectedSolana,
  IKA_SOLANA_PREALPHA_GUIDE,
  PRISM_WELCOME_BULLETS,
  readConnectedPubkey,
} from './dwallet';
import { SovereignCommand } from './SovereignCommand';
import { SignatureApprovalModal } from './SignatureApprovalModal';

const PrismLearn = React.lazy(async () => {
  const m = await import('./PrismLearn');
  return { default: m.PrismLearn };
});
const PrismTrade = React.lazy(async () => {
  const m = await import('./PrismTrade');
  return { default: m.PrismTrade };
});
const PrismDashboard = React.lazy(async () => {
  const m = await import('./PrismDashboard');
  return { default: m.PrismDashboard };
});

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
  const [walletTab, setWalletTab] = useState<'assets' | 'activity'>('assets');
  const [hubMode, setHubMode] = useState<'wallet' | 'learn' | 'trade' | 'command'>('wallet');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveAsset, setReceiveAsset] = useState<'sol' | 'sui'>('sol');
  const [sigApproval, setSigApproval] = useState<null | { kind: 'chain'; chain: ChainIdentity } | { kind: 'trade' }>(null);
  const [confettiOn, setConfettiOn] = useState(false);
  const [beamFlashOn, setBeamFlashOn] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('prism-welcome-dismissed-v1') === '1';
    } catch {
      return false;
    }
  });
  const dismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    try {
      window.localStorage.setItem('prism-welcome-dismissed-v1', '1');
    } catch {
      /* ignore */
    }
  }, []);

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
    setBeamFlashOn(true);
    setTimeout(() => setBeamFlashOn(false), 900);
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
        pushActivity(`Beamed ${chain.name} (practice)`);
        setTimeout(() => setJustSigned(null), 1600);
      } catch {
        pushActivity("Couldn't complete — tap again");
      }
      setSigningId(null);
    },
    [pushActivity]
  );

  /** Full-view “white → spectrum” refraction when a practice beam completes */
  useEffect(() => {
    if (!justSigned) return;
    document.body.classList.add('prism-flash-burst');
    const t = window.setTimeout(() => {
      document.body.classList.remove('prism-flash-burst');
    }, 900);
    return () => {
      window.clearTimeout(t);
      document.body.classList.remove('prism-flash-burst');
    };
  }, [justSigned]);

  const onSignatureApprovalConfirm = useCallback(async () => {
    if (!sigApproval) return;
    if (sigApproval.kind === 'chain') {
      await handleTry(sigApproval.chain);
    } else {
      setHubMode('trade');
    }
    setSigApproval(null);
  }, [sigApproval, handleTry]);

  const solNum = solLamports !== null ? solLamports / 1e9 : 0;
  const suiNum = suiMist !== null ? suiMist / 1e9 : 0;
  const totalUsdEst = solNum * SOL_USD_EST + suiNum * SUI_USD_EST;
  const balancesReady = solLamports !== null && suiMist !== null;
  const quickPillFocus: 'receive' | 'chains' | 'activity' = receiveOpen
    ? 'receive'
    : walletTab === 'activity'
      ? 'activity'
      : 'chains';

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
          <div className="flex flex-1 flex-col items-center justify-center px-4 pb-12 pt-6 sm:px-8 sm:pb-16">
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
              <div className="mx-auto mt-5 h-px max-w-[12rem] bg-gradient-to-r from-transparent via-white/15 to-transparent" aria-hidden />
            </div>

            <div className="splash-rise splash-rise-delay-4 mt-11 flex w-full max-w-[320px] flex-col gap-3">
              <button
                type="button"
                data-testid="splash-continue"
                onClick={() => begin('passkey')}
                disabled={loading}
                className="rounded-2xl bg-gradient-to-r from-[#d4af37] via-[#c9a030] to-[#8b6d24] py-[1.05rem] text-[16px] font-semibold text-black shadow-[0_12px_40px_rgba(212,175,55,0.28)] ring-1 ring-white/20 transition duration-300 hover:scale-[1.02] hover:shadow-[0_16px_48px_rgba(212,175,55,0.3),0_0_32px_rgba(212,175,55,0.45)] active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? '…' : 'Continue'}
              </button>
              <button
                type="button"
                data-testid="splash-google"
                onClick={() => begin('google')}
                disabled={loading}
                className="rounded-2xl border border-white/[0.09] bg-white/[0.04] py-3.5 text-[15px] font-medium text-white/[0.88] shadow-[0_8px_32px_rgba(0,0,0,0.25)] backdrop-blur-sm transition hover:border-white/[0.14] hover:bg-white/[0.07] disabled:opacity-60"
              >
                Continue with Google
              </button>
            </div>
          </div>

          <p className="splash-rise splash-rise-delay-5 px-4 pb-10 text-center text-[11px] tracking-wide text-white/28 sm:pb-12 sm:text-[12px]">
            Hollow Identity · Sovereign Mode Active
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'boot') {
    return (
      <div
        data-testid="boot-screen"
        className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#0b0b0f] px-6 text-white"
      >
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

  /* hub — wallet UI or separate Learn lab */
  return (
    <div
      data-testid="hub-screen"
      className="wallet-shell flex min-h-dvh flex-col bg-zinc-950/78 text-white ring-1 ring-white/[0.04] backdrop-blur-lg backdrop-saturate-150"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col shadow-2xl shadow-black/50">
        {hubMode === 'learn' ? (
          <>
            <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.06] bg-[#0b0b0f]/90 px-3 py-3 backdrop-blur-md">
              <button
                type="button"
                data-testid="learn-back"
                onClick={() => setHubMode('wallet')}
                className="rounded-xl bg-white/[0.08] px-3 py-2 text-[12px] font-semibold text-white/90 ring-1 ring-white/10 hover:bg-white/[0.12]"
              >
                ← Wallet
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-white/90">How this demo works</p>
                <p className="truncate text-[10px] text-white/40">Ika · PRISM · optional deep dive</p>
              </div>
            </header>
            <main className="flex max-h-[calc(100dvh-56px)] flex-1 flex-col overflow-y-auto">
              <Suspense
                fallback={
                  <div className="flex min-h-[40vh] items-center justify-center text-[12px] text-white/40">Loading lab…</div>
                }
              >
                <PrismLearn connection={solanaConnection} />
              </Suspense>
            </main>
            <footer className="px-4 pb-4 pt-1 text-center text-[10px] text-white/25">
              <button
                type="button"
                onClick={() => setHubMode('wallet')}
                className="text-white/40 underline decoration-white/15 underline-offset-2 hover:text-white/55"
              >
                Back to wallet
              </button>
            </footer>
          </>
        ) : hubMode === 'command' ? (
          <Suspense
            fallback={
              <div className="flex min-h-dvh items-center justify-center bg-[#0b0b0f] text-[12px] text-white/30">
                Loading…
              </div>
            }
          >
            <PrismDashboard
              solAddressPreview={solWalletPk}
              networkLabel="Solana · Devnet"
              onBack={() => setHubMode('wallet')}
            />
          </Suspense>
        ) : hubMode === 'trade' ? (
          <>
            <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.06] bg-[#0b0b0f]/90 px-3 py-3 backdrop-blur-md">
              <button
                type="button"
                data-testid="trade-back"
                onClick={() => setHubMode('wallet')}
                className="rounded-xl bg-white/[0.08] px-3 py-2 text-[12px] font-semibold text-white/90 ring-1 ring-white/10 hover:bg-white/[0.12]"
              >
                ← Wallet
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-white/90">Split the beam</p>
                <p className="truncate text-[10px] text-white/40">Live swap · future beam agents</p>
              </div>
            </header>
            <main className="flex max-h-[calc(100dvh-56px)] flex-1 flex-col overflow-y-auto">
              <Suspense
                fallback={
                  <div className="flex min-h-[40vh] items-center justify-center text-[12px] text-white/40">
                    Loading trade…
                  </div>
                }
              >
                <PrismTrade />
              </Suspense>
            </main>
            <footer className="px-4 pb-4 pt-1 text-center text-[10px] text-white/25">
              <button
                type="button"
                onClick={() => setHubMode('wallet')}
                className="text-white/40 underline decoration-white/15 underline-offset-2 hover:text-white/55"
              >
                Back to wallet
              </button>
            </footer>
          </>
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-white/[0.06] px-4 pb-3 pt-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="wallet-logo-breathe flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-violet-500/30 ring-1 ring-white/10"
                  aria-hidden
                >
                  <span className="font-serif text-lg font-semibold text-white/95">P</span>
                </div>
                <div>
                  <h1 className="text-[17px] font-semibold leading-tight tracking-tight">PRISM</h1>
                  <p className="text-[11px] text-white/40">Your practice multi-chain pocket</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <button
                  type="button"
                  data-testid="header-connect-wallet"
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

            <main className="flex min-h-0 flex-1 flex-col px-4 pb-10">
          {/* Portfolio card (glass “anchor” balance) */}
          <section className="total-card total-card-sovereign mt-2">
            <p className="relative z-[1] text-[11px] font-medium text-white/40">Total (est.)</p>
            <p
              className="prism-balance-inscribed prism-text-glow relative z-[1] mt-1 text-3xl leading-none text-white tabular-nums sm:text-[34px]"
            >
              {formatUsd(totalUsdEst)}
            </p>
            <div className="relative z-[1] mt-2 text-[12px] text-white/32">
              {balancesReady ? (
                <p>
                  {formatCrypto(solNum, 4)} SOL · {formatCrypto(suiNum, 4)} SUI
                  <span className="text-white/25"> — devnet demo</span>
                </p>
              ) : (
                'Loading…'
              )}
            </div>
          </section>

          <div className="wallet-pill-rail mt-5 flex items-stretch gap-1.5 rounded-full px-2 py-2 sm:gap-2 sm:px-3 sm:py-2">
            <button
              type="button"
              data-testid="quick-receive"
              onClick={() => {
                setReceiveAsset('sol');
                setReceiveOpen(true);
              }}
              className={`wallet-pill-segment flex-1 rounded-full py-2.5 text-[12px] font-medium sm:py-2 ${
                quickPillFocus === 'receive' ? 'wallet-pill-segment--active' : 'border border-transparent text-white/42 hover:text-white/85'
              }`}
            >
              Receive
            </button>
            <button
              type="button"
              data-testid="quick-portfolio"
              onClick={() => {
                setWalletTab('assets');
                pushActivity('Opened portfolio');
              }}
              className={`wallet-pill-segment flex-1 rounded-full py-2.5 text-[12px] font-medium sm:py-2 ${
                quickPillFocus === 'chains' ? 'wallet-pill-segment--active' : 'border border-transparent text-white/42 hover:text-white/85'
              }`}
            >
              Chains
            </button>
            <button
              type="button"
              data-testid="quick-activity"
              onClick={() => setWalletTab('activity')}
              className={`wallet-pill-segment flex-1 rounded-full py-2.5 text-[12px] font-medium sm:py-2 ${
                quickPillFocus === 'activity' ? 'wallet-pill-segment--active' : 'border border-transparent text-white/42 hover:text-white/85'
              }`}
            >
              Activity
            </button>
          </div>

            <div className="mt-3 flex items-center justify-center gap-1 text-[12px] text-white/35">
              <button type="button" data-testid="open-learn-lab" onClick={() => setHubMode('learn')} className="px-2 py-1 underline decoration-white/15 underline-offset-2 hover:text-white/55">
                Ika &amp; dWallet
              </button>
              <span className="text-white/20">·</span>
              <button type="button" data-testid="open-command-center" onClick={() => setHubMode('command')} className="px-2 py-1 underline decoration-white/15 underline-offset-2 hover:text-white/55">
                Overview
              </button>
            </div>

          <SovereignCommand connection={solanaConnection} ownerBase58={solWalletPk} />

          {/* Tabs */}
          <div className="wallet-segment-wrap mt-6 flex rounded-2xl p-1 ring-1 ring-white/[0.07]">
            <button
              type="button"
              data-testid="tab-assets"
              onClick={() => setWalletTab('assets')}
              className={`flex-1 rounded-xl py-3 text-[12px] font-semibold tracking-tight transition sm:text-[13px] ${
                walletTab === 'assets' ? 'wallet-segment-active text-white' : 'text-white/42 hover:text-white/55'
              }`}
            >
              Assets
            </button>
            <button
              type="button"
              data-testid="tab-activity"
              onClick={() => setWalletTab('activity')}
              className={`flex-1 rounded-xl py-3 text-[12px] font-semibold tracking-tight transition sm:text-[13px] ${
                walletTab === 'activity' ? 'wallet-segment-active text-white' : 'text-white/42 hover:text-white/55'
              }`}
            >
              Activity
            </button>
          </div>

          {!welcomeDismissed && (
            <section
              data-testid="hub-welcome-card"
              className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[13px] font-medium text-white/80">First time here?</h2>
                <button
                  type="button"
                  onClick={dismissWelcome}
                  className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] text-white/45 hover:bg-white/[0.06] hover:text-white/70"
                >
                  Dismiss
                </button>
              </div>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-white/45 marker:text-white/30">
                {PRISM_WELCOME_BULLETS.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          {walletTab === 'assets' && (
            <div className="mt-6 flex flex-col gap-4">
              <div className="flex items-end justify-between px-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Your chains</p>
                <p className="text-[10px] text-white/32">Tap a row</p>
              </div>
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
                    data-testid={`facet-row-${c.id}`}
                    style={{ animationDelay: `${idx * 0.07}s` }}
                    className={`group chain-row-spectral token-row-enter overflow-hidden rounded-[20px] ring-1 transition ${
                      signed
                        ? 'ring-emerald-400/35 wallet-row-glow wallet-facet-surface'
                        : `wallet-facet-surface ring-white/[0.08] ${isSui ? 'wallet-facet-sui' : ''}`
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : c.id)}
                      className="relative z-[1] flex w-full items-center gap-3.5 px-4 py-4 text-left transition-all duration-300 group-hover:pl-5"
                    >
                      <div
                        className="wallet-chain-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-base sm:h-11 sm:w-11 sm:text-lg"
                        style={{ backgroundColor: `${c.color}28`, boxShadow: `inset 0 0 0 1px ${c.color}45` }}
                      >
                        {c.emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[15px] tracking-tight text-white/[0.96]">{c.name}</div>
                        <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-white/38">{c.symbol}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[16px] font-semibold tabular-nums tracking-tight text-white/[0.96]">
                          {isSol || isSui ? formatCrypto(bal, 4) : formatCrypto(0, 5)}
                        </div>
                        <div className="text-[11px] text-white/38">{formatUsd(usd)}</div>
                      </div>
                      <span
                        className={`shrink-0 text-[11px] font-medium text-white/35 transition ${expanded ? 'rotate-90' : ''}`}
                        aria-hidden
                      >
                        ›
                      </span>
                    </button>
                    {expanded && (
                      <div className="relative z-[1] space-y-3 border-t border-white/[0.08] bg-black/20 px-4 py-4">
                        <p className="wallet-address-box break-all rounded-xl px-3 py-2.5 font-mono text-[11px] leading-relaxed text-white/58">
                          {c.address}
                        </p>
                        <div className="flex gap-2.5">
                          <button
                            type="button"
                            onClick={() => copy(c.id, c.address)}
                            className="flex-1 rounded-xl bg-white/[0.1] py-3 text-[13px] font-semibold text-white/92 shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset] transition hover:bg-white/[0.14]"
                          >
                            {copied === c.id ? 'Copied' : 'Copy address'}
                          </button>
                          <button
                            type="button"
                            data-testid={`test-sign-${c.id}`}
                            disabled={busy || signingId !== null}
                            onClick={() => setSigApproval({ kind: 'chain', chain: c })}
                            className="wallet-btn-bounce flash-beam-btn group/flash flex flex-1 items-center justify-center rounded-xl py-3.5"
                          >
                            <span className="flash-beam-btn__sheen" aria-hidden />
                            <span className="relative z-10 text-center text-[12px] font-bold uppercase tracking-tight text-zinc-400 transition-colors group-hover/flash:text-white sm:text-[13px]">
                              {busy ? '…' : 'Flash practice beam'}
                            </span>
                          </button>
                        </div>
                        <p className="text-[10px] leading-relaxed text-white/38">
                          Opens the Sovereign signature sheet (2PC-MPC practice) before the beam.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="px-1 pt-2 text-center text-[11px] leading-relaxed text-white/32">
                Each row is a color in the beam — expand to copy or flash a practice beam
              </p>
            </div>
          )}

          {walletTab === 'activity' && (
            <div className="mt-5 flex flex-col gap-2">
              {activity.length === 0 ? (
                <div className="wallet-activity-empty rounded-[22px] px-6 py-16 text-center ring-1 ring-white/[0.07]">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400/20 to-amber-400/15 text-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]">
                    ✧
                  </div>
                  <p className="text-[15px] font-medium text-white/55">Quiet in here</p>
                  <p className="mx-auto mt-2 max-w-[240px] text-[12px] leading-relaxed text-white/38">
                    Connect Phantom, copy an address, or flash a beam — your moves show up as a little timeline.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {activity.map((a) => (
                    <li
                      key={a.id}
                      className="wallet-activity-row flex items-center justify-between gap-3 rounded-[18px] py-3.5 pl-4 pr-3"
                    >
                      <div className="flex min-w-0 items-center gap-3 pl-1">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-[14px] shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset]">
                          ✓
                        </div>
                        <span className="truncate text-[14px] font-medium text-white/82">{a.title}</span>
                      </div>
                      <span className="shrink-0 rounded-lg bg-black/30 px-2 py-1 font-mono text-[10px] text-white/40">
                        {a.at}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

            <div className="mt-auto w-full border-t border-white/[0.06] pt-5">
              <button
                type="button"
                data-testid="open-trade-beam"
                onClick={() => setSigApproval({ kind: 'trade' })}
                className="w-full rounded-2xl bg-gradient-to-r from-amber-500/20 via-violet-500/20 to-cyan-500/15 py-3.5 text-[13px] font-semibold text-white ring-1 ring-white/12 transition duration-300 hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]"
              >
                Trade (Jupiter)
              </button>
            </div>
        </main>

        <footer className="prism-engraving mt-auto space-y-2 px-4 pb-10 pt-2 text-center">
          <p className="prism-hollow-line text-[10px] font-normal leading-relaxed tracking-[0.12em] sm:text-[11px]">
            Hollow Identity · sovereign mode
          </p>
          <p className="prism-hollow-line text-[9px] tracking-[0.18em] sm:text-[10px]">
            <a href={IKA_SOLANA_PREALPHA_GUIDE} target="_blank" rel="noopener noreferrer" className="font-serif not-italic">
              dWallet book
            </a>
            <span> · </span>
            <span className="font-serif">devnet</span>
          </p>
        </footer>
          </>
        )}
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

      {beamFlashOn && (
        <div className="beam-flash pointer-events-none fixed bottom-24 left-1/2 z-[65] -translate-x-1/2 text-[15px] font-medium text-amber-200/90">
          Beamed — copied
        </div>
      )}

      {sigApproval && (
        <SignatureApprovalModal
          isOpen
          onClose={() => setSigApproval(null)}
          onApprove={onSignatureApprovalConfirm}
          contextLine={
            sigApproval.kind === 'chain'
              ? `${sigApproval.chain.name} · ${sigApproval.chain.symbol} — practice path`
              : 'Jupiter · live swap (devnet) — plugin will ask for your wallet after this sheet'
          }
          processLine={
            sigApproval.kind === 'chain'
              ? '2PC-MPC · Ika dWallet MessageApproval (devnet practice)'
              : '2PC-MPC · route attestation (devnet practice)'
          }
        />
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
            className="w-full max-w-md rounded-[28px] bg-gradient-to-b from-zinc-900/98 to-[#0f0f14] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_24px_64px_rgba(0,0,0,0.5)] ring-1 ring-white/10 backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Receive</p>
            <p className="mt-2 text-center text-[12px] leading-snug text-white/45">
              Share this address if you want someone to send you <span className="text-white/60">test</span> coins on devnet
            </p>
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
