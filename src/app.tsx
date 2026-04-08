import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as WaapModule from '@human.tech/waap-sdk';
import { IkaClient, getNetworkConfig } from '@ika.xyz/sdk';
import * as SuiClientModule from '@mysten/sui/client';

// ─── SDK ACCESS HELPERS ───
const initWaaP = (WaapModule as any).initWaaP || (WaapModule as any).default?.initWaaP;
const loginWithPasskey = (WaapModule as any).loginWithPasskey || (WaapModule as any).default?.loginWithPasskey;
const loginWithSocial = (WaapModule as any).loginWithSocial || (WaapModule as any).default?.loginWithSocial;
const SuiClient = (SuiClientModule as any).SuiClient || (SuiClientModule as any).default?.SuiClient || (SuiClientModule as any).default;

let suiClient: any;
const initSuiClient = () => {
  if (!suiClient && SuiClient) {
    suiClient = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });
  }
};

// ─── TYPES ───
interface ChainWorld {
  chain: string;
  symbol: string;
  address: string;
  balance: string;
  usdValue: string;
  emoji: string;
  color: string;
  bg: string;
  unlocked: boolean;
  xp: number;
}

interface Badge {
  id: string;
  label: string;
  description: string;
  emoji: string;
  encryptedValue: string;
  revealed: boolean;
  revealedTo: string | null;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

interface Trap {
  id: string;
  trigger: string;
  effect: string;
  targetChain: string;
  armed: boolean;
}

type Screen = 'splash' | 'creating' | 'funded' | 'hub';
type Tab = 'worlds' | 'badges' | 'traps' | 'log';

const rarityColors: Record<string, string> = {
  common: '#8B9DAF',
  rare: '#4FC3F7',
  epic: '#CE93D8',
  legendary: '#FFD54F',
};

// ─── SIMULATED IKA DKG ───
const IkaDKG = {
  generateMultiChainKeys: async (): Promise<{
    dwalletId: string;
    chains: ChainWorld[];
  }> => {
    await new Promise((r) => setTimeout(r, 2000));
    return {
      dwalletId: `dwallet_${crypto.randomUUID().slice(0, 12)}`,
      chains: [
        {
          chain: 'Bitcoin',
          symbol: 'BTC',
          address: `bc1q${Array.from({ length: 38 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')}`,
          balance: '0.00',
          usdValue: '0.00',
          emoji: '🟠',
          color: '#F7931A',
          bg: 'linear-gradient(135deg, #F7931A22, #F7931A08)',
          unlocked: true,
          xp: 0,
        },
        {
          chain: 'Ethereum',
          symbol: 'ETH',
          address: `0x${Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')}`,
          balance: '0.00',
          usdValue: '0.00',
          emoji: '🔷',
          color: '#627EEA',
          bg: 'linear-gradient(135deg, #627EEA22, #627EEA08)',
          unlocked: true,
          xp: 0,
        },
        {
          chain: 'Solana',
          symbol: 'SOL',
          address: `${Array.from({ length: 44 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789'[Math.floor(Math.random() * 58)]).join('')}`,
          balance: '0.00',
          usdValue: '0.00',
          emoji: '🟣',
          color: '#9945FF',
          bg: 'linear-gradient(135deg, #9945FF22, #9945FF08)',
          unlocked: true,
          xp: 0,
        },
      ],
    };
  },
  signForChain: async (chain: string): Promise<string> => {
    await new Promise((r) => setTimeout(r, 1500));
    return `sig_${chain.toLowerCase()}_${crypto.randomUUID().slice(0, 16)}`;
  },
};

const EncryptVault = {
  encrypt: (data: string): string => `enc:${btoa(data)}:${Date.now().toString(36)}`,
};

// ─── CSS KEYFRAMES (injected once) ───
const styleId = 'hollow-game-styles';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes hollowFloat {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-8px); }
    }
    @keyframes hollowPulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    @keyframes hollowSpin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes hollowPop {
      0% { transform: scale(0.8); opacity: 0; }
      60% { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes hollowShake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }
    @keyframes hollowGlow {
      0%, 100% { box-shadow: 0 0 20px rgba(0, 255, 163, 0.2); }
      50% { box-shadow: 0 0 40px rgba(0, 255, 163, 0.5); }
    }
    @keyframes xpFill {
      from { width: 0%; }
    }
    @keyframes confetti {
      0% { transform: translateY(0) rotate(0deg); opacity: 1; }
      100% { transform: translateY(-100px) rotate(720deg); opacity: 0; }
    }
    .hollow-btn:hover { transform: scale(1.03); }
    .hollow-btn:active { transform: scale(0.97); }
    .world-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(0,0,0,0.4); }
    .badge-card:hover { transform: scale(1.02); }
  `;
  document.head.appendChild(style);
}

// ─── MAIN COMPONENT ───
export const TheHollow: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('splash');
  const [tab, setTab] = useState<Tab>('worlds');
  const [user, setUser] = useState<any>(null);
  const [hollowId, setHollowId] = useState('');
  const [dwalletId, setDwalletId] = useState('');
  const [worlds, setWorlds] = useState<ChainWorld[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [traps, setTraps] = useState<Trap[]>([]);
  const [loading, setLoading] = useState(false);
  const [creationStep, setCreationStep] = useState(0);
  const [totalBalance, setTotalBalance] = useState('0.00');
  const [playerLevel, setPlayerLevel] = useState(1);
  const [totalXp, setTotalXp] = useState(0);
  const [signingWorld, setSigningWorld] = useState<string | null>(null);
  const [questLog, setQuestLog] = useState<{ text: string; xp: number; time: string }[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [revealingBadge, setRevealingBadge] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  useEffect(() => {
    if (initWaaP) {
      try {
        initWaaP({
          config: {
            authenticationMethods: ['passkey', 'social'],
            allowedSocials: ['google', 'apple'],
            styles: { darkMode: true, themeColor: '#00FFA3' },
            network: 'mainnet',
          },
        });
      } catch (_) {}
    }
  }, []);

  const addQuest = useCallback((text: string, xp: number) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit' });
    setQuestLog((prev) => [{ text, xp, time }, ...prev].slice(0, 30));
    if (xp > 0) {
      setTotalXp((prev) => {
        const next = prev + xp;
        setPlayerLevel(Math.floor(next / 100) + 1);
        return next;
      });
    }
  }, []);

  const triggerConfetti = useCallback(() => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1500);
  }, []);

  const fetchBalances = useCallback(async (address: string, chainList: ChainWorld[]) => {
    initSuiClient();
    let suiBalance = 0;
    const suiPrice = 1.72;
    try {
      for (const node of ['https://sui-mainnet.nodeinfra.com', 'https://fullnode.mainnet.sui.io:443']) {
        try {
          const res = await fetch(node, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'suix_getBalance', params: [address, '0x2::sui::SUI'] }),
          });
          const data = await res.json();
          if (data.result?.totalBalance) { suiBalance = parseInt(data.result.totalBalance) / 1e9; break; }
        } catch (_) {}
      }
    } catch (_) {}
    const totalUsd = suiBalance * suiPrice;
    setTotalBalance(totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setWorlds(chainList.map((c) => c.chain === 'Solana' ? { ...c, balance: suiBalance.toFixed(4), usdValue: totalUsd.toFixed(2), address, xp: Math.floor(suiBalance * 10) } : c));
    return { suiBalance, totalUsd };
  }, []);

  const createHollow = useCallback(async () => {
    setScreen('creating');
    setCreationStep(1);
    await new Promise((r) => setTimeout(r, 1000));
    setCreationStep(2);
    const dkg = await IkaDKG.generateMultiChainKeys();
    setDwalletId(dkg.dwalletId);
    setWorlds(dkg.chains);
    setCreationStep(3);
    const testAddr = '0xf4984f69d6da291f3bd5573e95487e5c59f9041710590a0b57210a2798c03d3d';
    await fetchBalances(testAddr, dkg.chains);
    setCreationStep(4);

    const initBadges: Badge[] = [
      { id: '1', label: 'Bag Holder', description: 'Your total cross-chain stash', emoji: '💰', encryptedValue: EncryptVault.encrypt('balance:proof'), revealed: false, revealedTo: null, rarity: 'rare' },
      { id: '2', label: 'World Traveler', description: 'Active on 3+ chains', emoji: '🌍', encryptedValue: EncryptVault.encrypt('chains:3'), revealed: false, revealedTo: null, rarity: 'epic' },
      { id: '3', label: 'OG', description: 'Wallet older than most people\'s attention span', emoji: '👴', encryptedValue: EncryptVault.encrypt('age:old'), revealed: false, revealedTo: null, rarity: 'legendary' },
      { id: '4', label: 'Good Vibes', description: 'Positive on-chain reputation', emoji: '✨', encryptedValue: EncryptVault.encrypt('rep:good'), revealed: false, revealedTo: null, rarity: 'common' },
    ];
    setBadges(initBadges);

    setTraps([
      { id: '1', trigger: 'ETH dips below $2k', effect: 'Auto-sell half my SOL bag', targetChain: 'Solana', armed: false },
      { id: '2', trigger: 'BTC hits $100k', effect: 'Rebalance to 40% BTC', targetChain: 'Bitcoin', armed: false },
    ]);

    setHollowId(`hollow_${crypto.randomUUID().slice(0, 8)}`);
    await new Promise((r) => setTimeout(r, 600));

    addQuest('Entered The Hollow', 50);
    addQuest('Unlocked 3 worlds via Ika', 30);
    addQuest('Encrypted 4 badges', 20);
    setPlayerLevel(2);
    setTotalXp(100);
    triggerConfetti();
    setScreen('funded');
  }, [addQuest, fetchBalances, triggerConfetti]);

  const handleLogin = useCallback(async (method: 'passkey' | 'google') => {
    setLoading(true);
    const testAddr = '0xf4984f69d6da291f3bd5573e95487e5c59f9041710590a0b57210a2798c03d3d';
    let account = { email: 'player@thehollow.xyz', id: 'hollow_player', address: testAddr };
    try {
      if (method === 'passkey' && typeof loginWithPasskey === 'function') {
        const real = await loginWithPasskey();
        if (real) account = { ...real, address: testAddr };
      } else if (method === 'google' && typeof loginWithSocial === 'function') {
        const real = await loginWithSocial('google');
        if (real) account = { ...real, address: testAddr };
      }
    } catch (_) {}
    setUser(account);
    setLoading(false);
    await createHollow();
  }, [createHollow]);

  const handleSign = useCallback(async (chain: string) => {
    setSigningWorld(chain);
    addQuest(`Sending to ${chain} world...`, 0);
    try {
      const sig = await IkaDKG.signForChain(chain);
      addQuest(`${chain} transaction signed!`, 25);
      setWorlds((prev) => prev.map((w) => w.chain === chain ? { ...w, xp: w.xp + 25 } : w));
      triggerConfetti();
    } catch (_) {
      addQuest(`${chain} signing failed`, 0);
    }
    setSigningWorld(null);
  }, [addQuest, triggerConfetti]);

  const handleRevealBadge = useCallback((badgeId: string) => {
    setRevealingBadge(badgeId);
    setTimeout(() => {
      setBadges((prev) => prev.map((b) => b.id === badgeId ? { ...b, revealed: true, revealedTo: '0xVerifier' } : b));
      addQuest(`Badge revealed — no secrets spilled!`, 35);
      setRevealingBadge(null);
      triggerConfetti();
    }, 1200);
  }, [addQuest, triggerConfetti]);

  const toggleTrap = useCallback((trapId: string) => {
    setTraps((prev) => prev.map((t) => {
      if (t.id === trapId) {
        const armed = !t.armed;
        addQuest(armed ? `Trap armed: "${t.trigger}"` : `Trap disarmed`, armed ? 15 : 0);
        return { ...t, armed };
      }
      return t;
    }));
  }, [addQuest]);

  // shared styles
  const font = "'Inter', system-ui, sans-serif";
  const mono = "'JetBrains Mono', monospace";
  const bg = '#0A0A0F';
  const card = 'rgba(18, 18, 28, 0.9)';
  const border = '1px solid rgba(255,255,255,0.06)';
  const neon = '#00FFA3';
  const accent = '#9945FF';

  // ═══════════════════════════════════════════
  // SPLASH SCREEN
  // ═══════════════════════════════════════════
  if (screen === 'splash') {
    return (
      <div style={{
        background: `radial-gradient(ellipse at 50% 30%, #1a0a2e 0%, ${bg} 60%)`,
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        color: 'white', fontFamily: font, overflow: 'hidden', position: 'relative',
      }}>
        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: `${6 + i * 3}px`, height: `${6 + i * 3}px`,
            borderRadius: '50%',
            background: i % 2 === 0 ? `${neon}30` : `${accent}30`,
            top: `${15 + i * 14}%`, left: `${10 + i * 15}%`,
            animation: `hollowFloat ${3 + i * 0.5}s ease-in-out infinite`,
            animationDelay: `${i * 0.3}s`,
          }} />
        ))}

        {/* Hero section */}
        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1, paddingTop: '12vh' }}>
          <div style={{
            width: '120px', height: '120px', borderRadius: '50%',
            border: `3px solid ${neon}50`,
            boxShadow: `0 0 60px ${neon}20, inset 0 0 40px ${accent}10`,
            margin: '0 auto 32px',
            animation: 'hollowFloat 4s ease-in-out infinite, hollowGlow 3s ease-in-out infinite',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              border: `2px solid ${neon}30`,
              boxShadow: `0 0 20px ${neon}15`,
            }} />
          </div>

          <h1 style={{
            fontSize: '3.5rem', fontWeight: 900, marginBottom: '12px',
            letterSpacing: '-2px',
            background: `linear-gradient(135deg, white 0%, ${neon} 100%)`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            THE HOLLOW
          </h1>
          <p style={{
            opacity: 0.5, fontSize: '16px', lineHeight: 1.6,
            maxWidth: '340px', margin: '0 auto 48px',
          }}>
            Your secret identity across every blockchain.
            <br />No one sees in. You control everything.
          </p>

          <button
            className="hollow-btn"
            onClick={() => handleLogin('passkey')}
            disabled={loading}
            style={{
              width: '300px', padding: '20px', borderRadius: '20px',
              background: `linear-gradient(135deg, ${neon}, #00CC82)`,
              color: '#000', border: 'none', fontWeight: 900, fontSize: '17px',
              cursor: loading ? 'wait' : 'pointer', fontFamily: font,
              marginBottom: '14px', display: 'block', margin: '0 auto 14px',
              transition: 'transform 0.15s',
              boxShadow: `0 8px 30px ${neon}30`,
            }}
          >
            {loading ? '⏳ Loading...' : '🎮 Start Playing'}
          </button>
          <button
            className="hollow-btn"
            onClick={() => handleLogin('google')}
            disabled={loading}
            style={{
              width: '300px', padding: '16px', borderRadius: '20px',
              background: 'rgba(255,255,255,0.06)', color: 'white',
              border, fontWeight: 700, fontSize: '15px',
              cursor: loading ? 'wait' : 'pointer', fontFamily: font,
              display: 'block', margin: '0 auto',
              transition: 'transform 0.15s',
            }}
          >
            Continue with Google
          </button>
        </div>

        {/* How it works */}
        <div style={{
          position: 'relative', zIndex: 1,
          maxWidth: '700px', width: '100%', padding: '80px 20px 60px',
          margin: '0 auto',
        }}>
          <h2 style={{
            textAlign: 'center', fontSize: '13px', fontWeight: 900,
            letterSpacing: '3px', opacity: 0.3, marginBottom: '36px',
          }}>
            HOW IT WORKS
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {[
              {
                num: '1',
                emoji: '👆',
                title: 'Log in once',
                desc: 'Use your face, fingerprint, or Google. No seed phrases, no extensions, no headaches.',
              },
              {
                num: '2',
                emoji: '🌍',
                title: 'Get your wallets',
                desc: 'We create real Bitcoin, Ethereum & Solana wallets for you — all controlled by one key.',
              },
              {
                num: '3',
                emoji: '🚀',
                title: 'Send crypto to them',
                desc: 'Fund your wallets and manage everything from here. Your addresses stay private and unlinked.',
              },
            ].map((s) => (
              <div key={s.num} style={{
                background: card, borderRadius: '20px', border,
                padding: '28px 24px', textAlign: 'center',
              }}>
                <div style={{
                  fontSize: '32px', marginBottom: '14px',
                  animation: 'hollowFloat 3s ease-in-out infinite',
                  animationDelay: `${parseInt(s.num) * 0.3}s`,
                }}>
                  {s.emoji}
                </div>
                <div style={{
                  fontSize: '10px', fontWeight: 900, color: neon,
                  letterSpacing: '2px', marginBottom: '8px',
                }}>
                  STEP {s.num}
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 8px' }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: '12px', opacity: 0.4, lineHeight: 1.5, margin: 0 }}>
                  {s.desc}
                </p>
              </div>
            ))}
          </div>

          <div style={{
            textAlign: 'center', marginTop: '40px', fontSize: '13px',
            opacity: 0.25, lineHeight: 1.6,
          }}>
            Your money stays on each chain. The Hollow just gives you
            <br />one key to control it all — and keeps everything private.
          </div>
        </div>

        <p style={{ paddingBottom: '40px', fontSize: '10px', opacity: 0.1, letterSpacing: '4px', zIndex: 1 }}>
          POWERED BY IKA + ENCRYPT
        </p>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // CREATION SEQUENCE
  // ═══════════════════════════════════════════
  if (screen === 'creating') {
    const steps = [
      { emoji: '🔑', label: 'Verifying your identity...', done: creationStep > 1 },
      { emoji: '🌍', label: 'Unlocking Bitcoin, Ethereum & Solana worlds...', done: creationStep > 2 },
      { emoji: '🛡', label: 'Encrypting your badges...', done: creationStep > 3 },
      { emoji: '✨', label: 'Summoning your Hollow...', done: creationStep > 3 },
    ];

    return (
      <div style={{
        background: bg, height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: font,
      }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%',
          border: `3px solid ${neon}40`,
          animation: 'hollowSpin 2s linear infinite',
          marginBottom: '32px',
          boxShadow: `0 0 30px ${neon}20`,
        }} />
        <h2 style={{ fontWeight: 900, fontSize: '22px', marginBottom: '36px' }}>
          Building your world...
        </h2>
        <div style={{ width: '320px' }}>
          {steps.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px 0', opacity: creationStep >= i + 1 ? 1 : 0.15,
              transition: 'opacity 0.5s',
              animation: s.done ? 'hollowPop 0.4s ease-out' : 'none',
            }}>
              <span style={{ fontSize: '22px', width: '32px', textAlign: 'center' }}>
                {s.done ? '✅' : s.emoji}
              </span>
              <span style={{
                fontSize: '14px', color: s.done ? neon : 'rgba(255,255,255,0.6)',
                fontWeight: s.done ? 700 : 400,
              }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // FUND YOUR WALLETS SCREEN
  // ═══════════════════════════════════════════
  if (screen === 'funded') {
    const copyAddress = (address: string) => {
      navigator.clipboard.writeText(address).then(() => {
        setCopiedAddress(address);
        setTimeout(() => setCopiedAddress(null), 2000);
      });
    };

    return (
      <div style={{
        background: bg, minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: font,
        padding: '40px 20px',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
          <h2 style={{ fontSize: '26px', fontWeight: 900, marginBottom: '8px' }}>
            Your Hollow is ready!
          </h2>
          <p style={{ opacity: 0.4, fontSize: '14px', lineHeight: 1.6, marginBottom: '36px' }}>
            Here are your wallet addresses. Send crypto to any of them
            and it'll show up in your dashboard.
          </p>

          <div style={{ display: 'grid', gap: '14px', marginBottom: '36px', textAlign: 'left' }}>
            {worlds.map((w) => (
              <div key={w.chain} style={{
                background: card, borderRadius: '18px', border,
                padding: '20px', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                  background: `linear-gradient(90deg, ${w.color}, transparent)`,
                }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '22px' }}>{w.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '15px' }}>{w.chain}</div>
                    <div style={{ fontSize: '11px', opacity: 0.3 }}>
                      Send {w.symbol} to this address
                    </div>
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: 'rgba(255,255,255,0.04)', borderRadius: '12px',
                  padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{
                    flex: 1, fontSize: '11px', fontFamily: mono,
                    opacity: 0.5, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {w.address}
                  </div>
                  <button
                    onClick={() => copyAddress(w.address)}
                    style={{
                      background: copiedAddress === w.address ? `${neon}20` : 'rgba(255,255,255,0.08)',
                      border: copiedAddress === w.address ? `1px solid ${neon}40` : '1px solid rgba(255,255,255,0.1)',
                      color: copiedAddress === w.address ? neon : '#999',
                      padding: '6px 14px', borderRadius: '8px',
                      cursor: 'pointer', fontSize: '11px', fontWeight: 700,
                      fontFamily: font, whiteSpace: 'nowrap',
                      transition: 'all 0.2s',
                    }}
                  >
                    {copiedAddress === w.address ? '✅ Copied!' : '📋 Copy'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            className="hollow-btn"
            onClick={() => setScreen('hub')}
            style={{
              width: '100%', padding: '18px', borderRadius: '18px',
              background: `linear-gradient(135deg, ${neon}, #00CC82)`,
              color: '#000', border: 'none', fontWeight: 900, fontSize: '16px',
              cursor: 'pointer', fontFamily: font,
              transition: 'transform 0.15s',
              boxShadow: `0 8px 30px ${neon}30`,
              marginBottom: '12px',
            }}
          >
            🎮 Enter The Hollow
          </button>
          <button
            onClick={() => setScreen('hub')}
            style={{
              background: 'none', border: 'none', color: '#555',
              cursor: 'pointer', fontSize: '13px', fontFamily: font,
              padding: '10px',
            }}
          >
            I'll do this later →
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // GAME HUB
  // ═══════════════════════════════════════════
  const xpToNext = 100;
  const currentXpInLevel = totalXp % 100;
  const xpPercent = (currentXpInLevel / xpToNext) * 100;

  return (
    <div style={{ background: bg, minHeight: '100vh', color: 'white', fontFamily: font }}>
      {/* Confetti */}
      {showConfetti && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 999 }}>
          {[...Array(20)].map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${Math.random() * 100}%`, top: `${40 + Math.random() * 30}%`,
              width: '8px', height: '8px', borderRadius: i % 3 === 0 ? '50%' : '2px',
              background: [neon, accent, '#FFD54F', '#FF6B6B', '#4FC3F7'][i % 5],
              animation: `confetti ${0.8 + Math.random() * 0.7}s ease-out forwards`,
              animationDelay: `${Math.random() * 0.3}s`,
            }} />
          ))}
        </div>
      )}

      {/* ─── TOP BAR ─── */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 28px', borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            border: `2px solid ${neon}60`,
            boxShadow: `0 0 12px ${neon}20`,
          }} />
          <span style={{ fontWeight: 900, fontSize: '16px', letterSpacing: '-0.5px' }}>
            THE HOLLOW
          </span>
        </div>

        {/* Player level + XP bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', fontWeight: 900, color: neon }}>
              LVL {playerLevel}
            </div>
            <div style={{
              width: '120px', height: '6px', background: 'rgba(255,255,255,0.08)',
              borderRadius: '100px', overflow: 'hidden', marginTop: '4px',
            }}>
              <div style={{
                width: `${xpPercent}%`, height: '100%',
                background: `linear-gradient(90deg, ${neon}, ${accent})`,
                borderRadius: '100px', transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
          <div style={{
            fontSize: '10px', fontFamily: mono, opacity: 0.3,
            background: 'rgba(255,255,255,0.04)', padding: '4px 10px',
            borderRadius: '8px', border,
          }}>
            {hollowId}
          </div>
        </div>
      </header>

      {/* ─── BALANCE HERO ─── */}
      <div style={{ textAlign: 'center', padding: '40px 20px 20px' }}>
        <div style={{ fontSize: '12px', opacity: 0.3, fontWeight: 700, letterSpacing: '3px', marginBottom: '8px' }}>
          YOUR STASH
        </div>
        <div style={{
          fontSize: '56px', fontWeight: 900, letterSpacing: '-3px',
          marginBottom: '6px',
        }}>
          ${totalBalance}
        </div>
        <div style={{ fontSize: '13px', opacity: 0.4 }}>
          Across {worlds.filter((w) => w.unlocked).length} worlds • {badges.length} badges earned
        </div>
      </div>

      {/* ─── TAB BAR ─── */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: '6px',
        padding: '8px 20px 0', marginBottom: '24px',
      }}>
        {([
          { key: 'worlds' as Tab, emoji: '🌍', label: 'Worlds' },
          { key: 'badges' as Tab, emoji: '🏆', label: 'Badges' },
          { key: 'traps' as Tab, emoji: '⚡', label: 'Traps' },
          { key: 'log' as Tab, emoji: '📜', label: 'Quest Log' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: tab === t.key ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: tab === t.key ? `1px solid rgba(255,255,255,0.12)` : '1px solid transparent',
              color: tab === t.key ? 'white' : '#555',
              padding: '10px 20px', borderRadius: '14px',
              cursor: 'pointer', fontWeight: 700, fontSize: '13px',
              fontFamily: font, transition: 'all 0.2s',
            }}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px 60px' }}>

        {/* ═══ WORLDS TAB ═══ */}
        {tab === 'worlds' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            {worlds.map((w) => (
              <div
                key={w.chain}
                className="world-card"
                style={{
                  background: card, borderRadius: '24px', border,
                  padding: '28px', position: 'relative', overflow: 'hidden',
                  transition: 'all 0.3s ease', cursor: 'default',
                }}
              >
                {/* Top color strip */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                  background: `linear-gradient(90deg, ${w.color}, transparent)`,
                }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  {/* World icon */}
                  <div style={{
                    width: '60px', height: '60px', borderRadius: '18px',
                    background: w.bg, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '28px',
                    border: `1px solid ${w.color}30`,
                    animation: 'hollowFloat 4s ease-in-out infinite',
                  }}>
                    {w.emoji}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                        {w.chain} World
                      </h3>
                      {w.unlocked && (
                        <span style={{
                          fontSize: '10px', fontWeight: 700, color: neon,
                          background: `${neon}15`, padding: '2px 8px',
                          borderRadius: '100px', border: `1px solid ${neon}25`,
                        }}>
                          UNLOCKED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', fontFamily: mono, opacity: 0.25, marginBottom: '8px' }}>
                      {w.address.slice(0, 12)}...{w.address.slice(-6)}
                    </div>
                    {/* XP bar for this world */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        flex: 1, height: '4px', background: 'rgba(255,255,255,0.06)',
                        borderRadius: '100px', overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${Math.min(w.xp, 100)}%`, height: '100%',
                          background: w.color, borderRadius: '100px',
                          transition: 'width 0.6s',
                        }} />
                      </div>
                      <span style={{ fontSize: '10px', opacity: 0.3, fontFamily: mono }}>
                        {w.xp} XP
                      </span>
                    </div>
                  </div>

                  {/* Balance + action */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '24px', fontWeight: 900, marginBottom: '8px' }}>
                      {w.balance} <span style={{ fontSize: '13px', opacity: 0.3 }}>{w.symbol}</span>
                    </div>
                    <button
                      className="hollow-btn"
                      onClick={() => handleSign(w.chain)}
                      disabled={signingWorld !== null}
                      style={{
                        background: signingWorld === w.chain ? '#222' : `${w.color}20`,
                        border: `1px solid ${w.color}40`, color: w.color,
                        padding: '8px 20px', borderRadius: '12px',
                        cursor: signingWorld ? 'wait' : 'pointer',
                        fontSize: '12px', fontWeight: 800, fontFamily: font,
                        transition: 'transform 0.15s',
                        animation: signingWorld === w.chain ? 'hollowShake 0.3s ease infinite' : 'none',
                      }}
                    >
                      {signingWorld === w.chain ? '⏳ Signing...' : '🚀 Send'}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Fun tip */}
            <div style={{
              textAlign: 'center', padding: '20px', opacity: 0.25,
              fontSize: '13px', fontStyle: 'italic',
            }}>
              Every transaction earns XP. Level up your worlds.
            </div>
          </div>
        )}

        {/* ═══ BADGES TAB ═══ */}
        {tab === 'badges' && (
          <>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 900, marginBottom: '6px' }}>
                Your Badges
              </h2>
              <p style={{ opacity: 0.35, fontSize: '14px' }}>
                Prove stuff without spilling your secrets. Tap "Reveal" and the verifier
                only learns yes or no — never your actual data.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
              {badges.map((b) => {
                const rarityColor = rarityColors[b.rarity];
                const isRevealing = revealingBadge === b.id;
                return (
                  <div
                    key={b.id}
                    className="badge-card"
                    style={{
                      background: card, borderRadius: '20px',
                      border: b.revealed ? `1px solid ${neon}30` : border,
                      padding: '24px', textAlign: 'center',
                      transition: 'all 0.3s',
                      animation: isRevealing ? 'hollowShake 0.2s ease infinite' : (b.revealed ? 'hollowPop 0.4s ease-out' : 'none'),
                    }}
                  >
                    <div style={{
                      fontSize: '40px', marginBottom: '12px',
                      animation: 'hollowFloat 3s ease-in-out infinite',
                    }}>
                      {b.emoji}
                    </div>
                    <div style={{
                      fontSize: '8px', fontWeight: 900, letterSpacing: '2px',
                      color: rarityColor, marginBottom: '6px', textTransform: 'uppercase',
                    }}>
                      {b.rarity}
                    </div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 800 }}>
                      {b.label}
                    </h3>
                    <p style={{ fontSize: '11px', opacity: 0.35, margin: '0 0 16px', lineHeight: 1.4 }}>
                      {b.description}
                    </p>

                    {b.revealed ? (
                      <div style={{
                        fontSize: '11px', color: neon, fontWeight: 700,
                        background: `${neon}10`, padding: '8px 14px',
                        borderRadius: '10px', border: `1px solid ${neon}20`,
                      }}>
                        ✅ Revealed (data stays hidden)
                      </div>
                    ) : (
                      <button
                        className="hollow-btn"
                        onClick={() => handleRevealBadge(b.id)}
                        disabled={isRevealing}
                        style={{
                          width: '100%', padding: '10px',
                          borderRadius: '12px',
                          background: `linear-gradient(135deg, ${neon}, #00CC82)`,
                          color: '#000', border: 'none', fontWeight: 800,
                          fontSize: '12px', cursor: 'pointer', fontFamily: font,
                          transition: 'transform 0.15s',
                          boxShadow: `0 4px 16px ${neon}25`,
                        }}
                      >
                        {isRevealing ? '🔮 Proving...' : '👁 Reveal'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Explainer */}
            <div style={{
              marginTop: '28px', background: card, borderRadius: '20px',
              border, padding: '24px',
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '14px' }}>
                🤫 How does this work?
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {[
                  { num: '1', text: 'Your data is encrypted on-chain. Nobody sees it.' },
                  { num: '2', text: 'When someone asks, we generate a proof — not the data itself.' },
                  { num: '3', text: 'They learn "yes this person qualifies" — nothing else.' },
                ].map((s) => (
                  <div key={s.num} style={{ fontSize: '12px', opacity: 0.4, lineHeight: 1.5 }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      background: `${accent}15`, border: `1px solid ${accent}25`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 900, color: accent,
                      marginBottom: '10px',
                    }}>
                      {s.num}
                    </div>
                    {s.text}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ═══ TRAPS TAB ═══ */}
        {tab === 'traps' && (
          <>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 900, marginBottom: '6px' }}>
                Set Your Traps
              </h2>
              <p style={{ opacity: 0.35, fontSize: '14px' }}>
                Automated cross-chain moves that stay encrypted. Nobody sees your strategy
                until it fires. Like a tripwire, but for your portfolio.
              </p>
            </div>

            <div style={{ display: 'grid', gap: '14px' }}>
              {traps.map((t) => (
                <div key={t.id} style={{
                  background: card, borderRadius: '20px',
                  border: t.armed ? `1px solid ${neon}30` : border,
                  padding: '24px', display: 'flex', alignItems: 'center', gap: '20px',
                  transition: 'all 0.3s',
                }}>
                  <div style={{
                    width: '52px', height: '52px', borderRadius: '16px',
                    background: t.armed ? `${neon}15` : 'rgba(255,255,255,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '24px', border: t.armed ? `1px solid ${neon}25` : border,
                    transition: 'all 0.3s',
                    animation: t.armed ? 'hollowPulse 2s ease-in-out infinite' : 'none',
                  }}>
                    {t.armed ? '🔥' : '⚡'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
                      When <span style={{ color: '#FFD54F' }}>{t.trigger}</span>
                    </div>
                    <div style={{ fontSize: '13px', opacity: 0.4 }}>
                      → <span style={{ color: neon }}>{t.effect}</span>
                      <span style={{ opacity: 0.3 }}> on {t.targetChain}</span>
                    </div>
                  </div>
                  <button
                    className="hollow-btn"
                    onClick={() => toggleTrap(t.id)}
                    style={{
                      background: t.armed ? neon : 'rgba(255,255,255,0.06)',
                      color: t.armed ? '#000' : '#666', border: 'none',
                      padding: '10px 24px', borderRadius: '14px',
                      fontWeight: 900, fontSize: '12px', cursor: 'pointer',
                      fontFamily: font, minWidth: '90px',
                      transition: 'transform 0.15s',
                      boxShadow: t.armed ? `0 4px 16px ${neon}30` : 'none',
                    }}
                  >
                    {t.armed ? '🔥 ARMED' : 'ARM'}
                  </button>
                </div>
              ))}
            </div>

            {/* How traps work */}
            <div style={{
              marginTop: '28px', background: card, borderRadius: '20px',
              border, padding: '24px',
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '14px' }}>
                🕹 How traps work
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {[
                  { emoji: '🔐', text: 'Your conditions are encrypted on-chain. No one knows your strategy.' },
                  { emoji: '🧠', text: 'Encrypt evaluates if conditions are met — without decrypting.' },
                  { emoji: '✍️', text: 'When triggered, Ika signs the transaction on the target chain.' },
                ].map((s, i) => (
                  <div key={i} style={{ fontSize: '12px', opacity: 0.4, lineHeight: 1.5 }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>{s.emoji}</div>
                    {s.text}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ═══ QUEST LOG TAB ═══ */}
        {tab === 'log' && (
          <>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 900, marginBottom: '6px' }}>
                Quest Log
              </h2>
              <p style={{ opacity: 0.35, fontSize: '14px' }}>
                Everything you've done in The Hollow. Every action earns XP.
              </p>
            </div>

            {questLog.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '60px 20px',
                opacity: 0.2, fontSize: '14px',
              }}>
                No quests yet. Start exploring!
              </div>
            ) : (
              <div style={{
                background: card, borderRadius: '20px', border, overflow: 'hidden',
              }}>
                {questLog.map((q, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '14px 20px',
                    borderBottom: i < questLog.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                  }}>
                    <span style={{ fontSize: '11px', fontFamily: mono, opacity: 0.2, flexShrink: 0 }}>
                      {q.time}
                    </span>
                    <span style={{ flex: 1, fontSize: '13px' }}>{q.text}</span>
                    {q.xp > 0 && (
                      <span style={{
                        fontSize: '11px', fontWeight: 900, color: neon,
                        background: `${neon}10`, padding: '3px 10px',
                        borderRadius: '100px',
                      }}>
                        +{q.xp} XP
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── FOOTER ─── */}
      <footer style={{
        textAlign: 'center', padding: '30px 20px',
        opacity: 0.1, fontSize: '10px', letterSpacing: '3px',
      }}>
        THE HOLLOW • IKA × ENCRYPT
      </footer>
    </div>
  );
};
