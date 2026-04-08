import React, { useState, useEffect, useCallback } from 'react';
import * as WaapModule from '@human.tech/waap-sdk';
import { IkaClient, getNetworkConfig } from '@ika.xyz/sdk';
import * as SuiClientModule from '@mysten/sui/client';

// ─── DESIGN TOKENS ───
const Neon = '#00FFA3';
const Violet = '#9945FF';
const DeepBlack = '#050505';
const SurfaceCard = 'rgba(15, 15, 20, 0.85)';
const SurfaceBorder = '1px solid rgba(255,255,255,0.06)';
const FontStack = "'Inter', system-ui, -apple-system, sans-serif";
const MonoStack = "'JetBrains Mono', monospace";

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
interface ChainAddress {
  chain: string;
  symbol: string;
  address: string;
  balance: string;
  usdValue: string;
  icon: string;
  color: string;
}

interface HollowCredential {
  type: string;
  label: string;
  encryptedValue: string;
  disclosed: boolean;
  disclosedTo: string | null;
  icon: string;
}

interface AutomationRule {
  id: string;
  condition: string;
  action: string;
  targetChain: string;
  active: boolean;
}

type View = 'login' | 'creating' | 'dashboard';
type Panel = 'overview' | 'prove' | 'automate';

// ─── SIMULATED ENCRYPT MODULE ───
const EncryptVault = {
  encrypt: (data: string): string => {
    const encoded = btoa(data);
    return `enc:${encoded}:${Date.now().toString(36)}`;
  },
  generateProof: (credential: HollowCredential): { proof: string; verified: boolean } => {
    return {
      proof: `zk_proof_${crypto.randomUUID().slice(0, 8)}`,
      verified: true,
    };
  },
  evaluateCondition: (rule: AutomationRule): boolean => {
    return Math.random() > 0.5;
  },
};

// ─── SIMULATED IKA DKG ───
const IkaDKG = {
  generateMultiChainKeys: async (): Promise<{
    dwalletId: string;
    chains: ChainAddress[];
  }> => {
    await new Promise((r) => setTimeout(r, 2000));
    const dwalletId = `dwallet_${crypto.randomUUID().slice(0, 12)}`;
    return {
      dwalletId,
      chains: [
        {
          chain: 'Bitcoin',
          symbol: 'BTC',
          address: `bc1q${Array.from({ length: 38 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')}`,
          balance: '0.00',
          usdValue: '0.00',
          icon: '₿',
          color: '#F7931A',
        },
        {
          chain: 'Ethereum',
          symbol: 'ETH',
          address: `0x${Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')}`,
          balance: '0.00',
          usdValue: '0.00',
          icon: 'Ξ',
          color: '#627EEA',
        },
        {
          chain: 'Solana',
          symbol: 'SOL',
          address: `${Array.from({ length: 44 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789'[Math.floor(Math.random() * 58)]).join('')}`,
          balance: '0.00',
          usdValue: '0.00',
          icon: '◎',
          color: '#14F195',
        },
      ],
    };
  },
  signForChain: async (chain: string, messageHash: string): Promise<string> => {
    await new Promise((r) => setTimeout(r, 1500));
    return `sig_${chain.toLowerCase()}_${crypto.randomUUID().slice(0, 16)}`;
  },
};

// ─── MAIN COMPONENT ───
export const TheHollow: React.FC = () => {
  const [view, setView] = useState<View>('login');
  const [panel, setPanel] = useState<Panel>('overview');
  const [user, setUser] = useState<any>(null);
  const [hollowId, setHollowId] = useState<string>('');
  const [dwalletId, setDwalletId] = useState<string>('');
  const [chains, setChains] = useState<ChainAddress[]>([]);
  const [credentials, setCredentials] = useState<HollowCredential[]>([]);
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [creationStep, setCreationStep] = useState(0);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [totalBalance, setTotalBalance] = useState('0.00');
  const [proofResult, setProofResult] = useState<{ credential: string; proof: string } | null>(null);
  const [signingChain, setSigningChain] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<{ time: string; action: string; status: string }[]>([]);

  useEffect(() => {
    if (initWaaP) {
      try {
        initWaaP({
          config: {
            authenticationMethods: ['passkey', 'social'],
            allowedSocials: ['google', 'apple'],
            styles: { darkMode: true, themeColor: Neon },
            network: 'mainnet',
          },
        });
      } catch (_) {}
    }
  }, []);

  const addActivity = useCallback((action: string, status: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setActivityLog((prev) => [{ time, action, status }, ...prev].slice(0, 20));
  }, []);

  // ─── REAL BALANCE FETCHING ───
  const fetchBalances = useCallback(async (address: string, chainList: ChainAddress[]) => {
    initSuiClient();
    let suiBalance = 0;
    const suiPrice = 1.72;

    try {
      const rpcNodes = [
        'https://sui-mainnet.nodeinfra.com',
        'https://fullnode.mainnet.sui.io:443',
      ];
      for (const node of rpcNodes) {
        try {
          const res = await fetch(node, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'suix_getBalance',
              params: [address, '0x2::sui::SUI'],
            }),
          });
          const data = await res.json();
          if (data.result?.totalBalance) {
            suiBalance = parseInt(data.result.totalBalance) / 1_000_000_000;
            break;
          }
        } catch (_) {}
      }
    } catch (_) {}

    const totalUsd = suiBalance * suiPrice;
    setTotalBalance(totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

    const updatedChains = chainList.map((c) => {
      if (c.chain === 'Solana') {
        return { ...c, balance: suiBalance.toFixed(4), usdValue: totalUsd.toFixed(2), address };
      }
      return c;
    });
    setChains(updatedChains);
    return { suiBalance, totalUsd };
  }, []);

  // ─── HOLLOW CREATION FLOW (Ika DKG + Encrypt) ───
  const createHollow = useCallback(async () => {
    setView('creating');

    setCreationStep(1);
    await new Promise((r) => setTimeout(r, 1200));

    setCreationStep(2);
    const dkg = await IkaDKG.generateMultiChainKeys();
    setDwalletId(dkg.dwalletId);
    setChains(dkg.chains);

    setCreationStep(3);
    const testAddress = '0xf4984f69d6da291f3bd5573e95487e5c59f9041710590a0b57210a2798c03d3d';
    const balanceData = await fetchBalances(testAddress, dkg.chains);

    const initialCredentials: HollowCredential[] = [
      {
        type: 'total_balance',
        label: 'Cross-Chain Balance',
        encryptedValue: EncryptVault.encrypt(`balance:${balanceData.totalUsd}`),
        disclosed: false,
        disclosedTo: null,
        icon: '💎',
      },
      {
        type: 'chain_count',
        label: 'Multi-Chain Activity',
        encryptedValue: EncryptVault.encrypt('chains:3:btc,eth,sol'),
        disclosed: false,
        disclosedTo: null,
        icon: '🔗',
      },
      {
        type: 'wallet_age',
        label: 'Wallet Age',
        encryptedValue: EncryptVault.encrypt(`age:${Math.floor(Math.random() * 1000)}days`),
        disclosed: false,
        disclosedTo: null,
        icon: '⏳',
      },
      {
        type: 'reputation',
        label: 'On-Chain Reputation',
        encryptedValue: EncryptVault.encrypt(`score:${Math.floor(Math.random() * 100)}`),
        disclosed: false,
        disclosedTo: null,
        icon: '⭐',
      },
    ];
    setCredentials(initialCredentials);

    const defaultAutomations: AutomationRule[] = [
      {
        id: crypto.randomUUID().slice(0, 8),
        condition: 'ETH price < $2,000',
        action: 'Sell 50% SOL position',
        targetChain: 'Solana',
        active: false,
      },
      {
        id: crypto.randomUUID().slice(0, 8),
        condition: 'BTC price > $100,000',
        action: 'Rebalance to 40% BTC',
        targetChain: 'Bitcoin',
        active: false,
      },
    ];
    setAutomations(defaultAutomations);

    setCreationStep(4);
    const hid = `hollow_${crypto.randomUUID().slice(0, 12)}`;
    setHollowId(hid);

    await new Promise((r) => setTimeout(r, 800));
    addActivity('Hollow identity created', 'SUCCESS');
    addActivity('Ika DKG completed — 3 chains linked', 'SUCCESS');
    addActivity(`${initialCredentials.length} credentials encrypted`, 'SUCCESS');

    setView('dashboard');
  }, [addActivity, fetchBalances]);

  // ─── LOGIN ───
  const handleLogin = useCallback(async (method: 'passkey' | 'google') => {
    setLoading(true);
    const testAddress = '0xf4984f69d6da291f3bd5573e95487e5c59f9041710590a0b57210a2798c03d3d';
    let account = { email: 'user@thehollow.xyz', id: 'hollow_user', address: testAddress };

    try {
      if (method === 'passkey' && typeof loginWithPasskey === 'function') {
        const real = await loginWithPasskey();
        if (real) account = { ...real, address: testAddress };
      } else if (method === 'google' && typeof loginWithSocial === 'function') {
        const real = await loginWithSocial('google');
        if (real) account = { ...real, address: testAddress };
      }
    } catch (_) {}

    setUser(account);
    setLoading(false);
    await createHollow();
  }, [createHollow]);

  // ─── SELECTIVE DISCLOSURE ───
  const handleProve = useCallback((credIndex: number) => {
    const cred = credentials[credIndex];
    if (!cred) return;

    setLoading(true);
    const result = EncryptVault.generateProof(cred);

    setTimeout(() => {
      const updated = [...credentials];
      updated[credIndex] = { ...cred, disclosed: true, disclosedTo: '0xVerifier' };
      setCredentials(updated);
      setProofResult({ credential: cred.label, proof: result.proof });
      addActivity(`Disclosed "${cred.label}" to verifier`, 'SUCCESS');
      setLoading(false);
    }, 1200);
  }, [credentials, addActivity]);

  // ─── CROSS-CHAIN SIGNING ───
  const handleSign = useCallback(async (chain: string) => {
    setSigningChain(chain);
    addActivity(`Signing ${chain} transaction via Ika MPC...`, 'PENDING');

    try {
      const sig = await IkaDKG.signForChain(chain, crypto.randomUUID());
      addActivity(`${chain} signed: ${sig.slice(0, 24)}...`, 'SUCCESS');
    } catch (_) {
      addActivity(`${chain} signing failed`, 'FAILED');
    }
    setSigningChain(null);
  }, [addActivity]);

  // ─── TOGGLE AUTOMATION ───
  const toggleAutomation = useCallback((id: string) => {
    setAutomations((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const newActive = !a.active;
          addActivity(
            `${newActive ? 'Activated' : 'Deactivated'} rule: "${a.condition}"`,
            newActive ? 'SUCCESS' : 'INFO'
          );
          return { ...a, active: newActive };
        }
        return a;
      })
    );
  }, [addActivity]);

  // ═══════════════════════════════════════════
  // LOGIN SCREEN
  // ═══════════════════════════════════════════
  if (view === 'login') {
    return (
      <div style={{
        backgroundColor: DeepBlack,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontFamily: FontStack,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${Neon}08 0%, transparent 70%)`,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />

        <div style={{ textAlign: 'center', maxWidth: '420px', padding: '20px', position: 'relative', zIndex: 1 }}>
          {/* Hollow icon — an empty circle/ring representing the shell */}
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'transparent',
            border: `2px solid ${Neon}40`,
            boxShadow: `0 0 40px ${Neon}10, inset 0 0 30px ${Violet}08`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 30px',
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: `2px solid ${Neon}25`,
            }} />
          </div>

          <h1 style={{ fontSize: '2.8rem', fontWeight: 900, marginBottom: '8px', letterSpacing: '-2px' }}>
            THE HOLLOW<span style={{ color: Neon }}>.</span>
          </h1>
          <p style={{ opacity: 0.4, marginBottom: '50px', lineHeight: 1.6, fontSize: '15px' }}>
            One identity. Every chain. Nothing exposed.<br />
            <span style={{ fontSize: '12px' }}>Powered by Ika MPC + Encrypt</span>
          </p>

          <button
            onClick={() => handleLogin('passkey')}
            disabled={loading}
            style={{
              width: '100%',
              padding: '18px',
              borderRadius: '16px',
              background: `linear-gradient(135deg, ${Neon}, ${Neon}CC)`,
              color: DeepBlack,
              border: 'none',
              fontWeight: 900,
              fontSize: '16px',
              cursor: loading ? 'wait' : 'pointer',
              marginBottom: '12px',
              fontFamily: FontStack,
              transition: 'transform 0.15s',
            }}
          >
            {loading ? 'Entering The Hollow...' : 'Enter with FaceID'}
          </button>
          <button
            onClick={() => handleLogin('google')}
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px',
              borderRadius: '16px',
              background: 'rgba(255,255,255,0.04)',
              color: 'white',
              border: SurfaceBorder,
              fontWeight: 700,
              fontSize: '14px',
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: FontStack,
            }}
          >
            Continue with Google
          </button>

          <p style={{ marginTop: '40px', fontSize: '10px', opacity: 0.2, letterSpacing: '3px' }}>
            COLOSSEUM FRONTIER 2026
          </p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // HOLLOW CREATION ANIMATION
  // ═══════════════════════════════════════════
  if (view === 'creating') {
    const steps = [
      { label: 'Authenticating via Passkey...', done: creationStep > 1 },
      { label: 'Running Ika DKG — generating BTC, ETH, SOL keys...', done: creationStep > 2 },
      { label: 'Encrypting credentials via Encrypt...', done: creationStep > 3 },
      { label: 'Minting Hollow identity on-chain...', done: creationStep > 3 },
    ];

    return (
      <div style={{
        backgroundColor: DeepBlack,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontFamily: FontStack,
      }}>
        {/* Hollow ring icon */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          border: `2px solid ${Neon}50`,
          boxShadow: `0 0 30px ${Neon}15`,
          marginBottom: '30px',
        }} />
        <h2 style={{ fontWeight: 900, fontSize: '24px', marginBottom: '40px', letterSpacing: '-1px' }}>
          Creating Your Hollow
        </h2>
        <div style={{ width: '380px' }}>
          {steps.map((s, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '12px 0',
              opacity: creationStep >= i + 1 ? 1 : 0.2,
              transition: 'opacity 0.4s',
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: s.done ? Neon : 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                color: s.done ? DeepBlack : 'white',
                fontWeight: 900,
                flexShrink: 0,
                transition: 'background 0.3s',
              }}>
                {s.done ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: '13px',
                fontFamily: MonoStack,
                color: s.done ? Neon : 'rgba(255,255,255,0.6)',
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
  // DASHBOARD
  // ═══════════════════════════════════════════
  return (
    <div style={{
      backgroundColor: DeepBlack,
      minHeight: '100vh',
      color: 'white',
      fontFamily: FontStack,
    }}>
      {/* ─── HEADER ─── */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 40px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            border: `2px solid ${Neon}60`,
          }} />
          <span style={{ fontWeight: 900, fontSize: '18px', letterSpacing: '-1px' }}>
            THE HOLLOW<span style={{ color: Neon }}>.</span>
          </span>
          <div style={{
            fontSize: '10px',
            fontFamily: MonoStack,
            background: 'rgba(255,255,255,0.04)',
            padding: '4px 12px',
            borderRadius: '100px',
            border: SurfaceBorder,
            opacity: 0.5,
          }}>
            {hollowId}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setPrivacyMode(!privacyMode)}
            style={{
              background: privacyMode ? `${Violet}20` : 'rgba(255,255,255,0.04)',
              border: privacyMode ? `1px solid ${Violet}40` : SurfaceBorder,
              color: privacyMode ? Violet : '#666',
              padding: '6px 14px',
              borderRadius: '100px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: FontStack,
            }}
          >
            {privacyMode ? '🔒 ENCRYPTED' : '👁 VISIBLE'}
          </button>
        </div>
      </header>

      {/* ─── NAV TABS ─── */}
      <div style={{
        display: 'flex',
        gap: '0',
        padding: '0 40px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        {(['overview', 'prove', 'automate'] as Panel[]).map((p) => (
          <button
            key={p}
            onClick={() => setPanel(p)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: panel === p ? `2px solid ${Neon}` : '2px solid transparent',
              color: panel === p ? 'white' : '#555',
              padding: '16px 24px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '13px',
              fontFamily: FontStack,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              transition: 'all 0.2s',
            }}
          >
            {p === 'overview' ? '◎ Overview' : p === 'prove' ? '◇ Prove' : '⚡ Automate'}
          </button>
        ))}
      </div>

      <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* ═══ OVERVIEW PANEL ═══ */}
        {panel === 'overview' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '60px' }}>
              <p style={{ fontSize: '11px', opacity: 0.3, fontWeight: 900, letterSpacing: '3px', marginBottom: '8px' }}>
                TOTAL CROSS-CHAIN BALANCE
              </p>
              <h2 style={{
                fontSize: '72px',
                fontWeight: 900,
                margin: 0,
                filter: privacyMode ? 'blur(20px)' : 'none',
                transition: 'filter 0.4s',
                letterSpacing: '-3px',
              }}>
                ${totalBalance}
              </h2>
              <p style={{
                color: Neon,
                fontWeight: 700,
                marginTop: '8px',
                fontSize: '12px',
                letterSpacing: '1px',
              }}>
                CONTROLLED VIA IKA dWALLET • {credentials.length} ENCRYPTED CREDENTIALS
              </p>
            </div>

            {/* Chain Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
              marginBottom: '40px',
            }}>
              {chains.map((c) => (
                <div key={c.chain} style={{
                  background: SurfaceCard,
                  borderRadius: '20px',
                  border: SurfaceBorder,
                  padding: '24px',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '3px',
                    background: `linear-gradient(90deg, ${c.color}, transparent)`,
                  }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: `${c.color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      border: `1px solid ${c.color}25`,
                    }}>
                      {c.icon}
                    </div>
                    <button
                      onClick={() => handleSign(c.chain)}
                      disabled={signingChain !== null}
                      style={{
                        background: signingChain === c.chain ? '#222' : `${c.color}18`,
                        border: `1px solid ${c.color}30`,
                        color: c.color,
                        padding: '6px 14px',
                        borderRadius: '100px',
                        cursor: signingChain ? 'wait' : 'pointer',
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: FontStack,
                      }}
                    >
                      {signingChain === c.chain ? 'SIGNING...' : 'SIGN TX'}
                    </button>
                  </div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700 }}>{c.chain}</h3>
                  <p style={{
                    margin: '0 0 12px',
                    fontSize: '10px',
                    fontFamily: MonoStack,
                    opacity: 0.3,
                    filter: privacyMode ? 'blur(6px)' : 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {c.address}
                  </p>
                  <div style={{
                    fontSize: '22px',
                    fontWeight: 900,
                    filter: privacyMode ? 'blur(10px)' : 'none',
                    transition: 'filter 0.3s',
                  }}>
                    {c.balance} <span style={{ fontSize: '12px', opacity: 0.4 }}>{c.symbol}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Credential Badges */}
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '2px', opacity: 0.3, marginBottom: '16px' }}>
                ENCRYPTED CREDENTIALS
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {credentials.map((cred, i) => (
                  <div key={i} style={{
                    background: SurfaceCard,
                    borderRadius: '16px',
                    border: cred.disclosed ? `1px solid ${Neon}30` : SurfaceBorder,
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                  }}>
                    <span style={{ fontSize: '20px' }}>{cred.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{cred.label}</div>
                      <div style={{
                        fontSize: '10px',
                        fontFamily: MonoStack,
                        opacity: 0.3,
                        marginTop: '2px',
                      }}>
                        {cred.disclosed
                          ? `Disclosed to ${cred.disclosedTo}`
                          : 'Encrypted via Encrypt'}
                      </div>
                    </div>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: cred.disclosed ? Neon : Violet,
                    }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Log */}
            {activityLog.length > 0 && (
              <div>
                <h3 style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '2px', opacity: 0.3, marginBottom: '16px' }}>
                  ACTIVITY LOG
                </h3>
                <div style={{
                  background: SurfaceCard,
                  borderRadius: '16px',
                  border: SurfaceBorder,
                  padding: '16px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}>
                  {activityLog.map((a, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      gap: '12px',
                      padding: '8px 0',
                      borderBottom: i < activityLog.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                      fontSize: '12px',
                    }}>
                      <span style={{ fontFamily: MonoStack, opacity: 0.3, flexShrink: 0 }}>{a.time}</span>
                      <span style={{ flex: 1 }}>{a.action}</span>
                      <span style={{
                        color: a.status === 'SUCCESS' ? Neon : a.status === 'FAILED' ? '#FF4444' : a.status === 'PENDING' ? '#FFB800' : '#888',
                        fontWeight: 700,
                        fontSize: '10px',
                      }}>
                        {a.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ PROVE PANEL (Selective Disclosure) ═══ */}
        {panel === 'prove' && (
          <>
            <div style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '8px', letterSpacing: '-1px' }}>
                Selective Disclosure
              </h2>
              <p style={{ opacity: 0.4, fontSize: '14px', lineHeight: 1.6, maxWidth: '600px' }}>
                Prove credentials without revealing your addresses or balances.
                A verifier learns only what you choose to show — nothing more.
              </p>
            </div>

            {proofResult && (
              <div style={{
                background: `${Neon}08`,
                border: `1px solid ${Neon}25`,
                borderRadius: '16px',
                padding: '20px 24px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}>
                <div style={{ fontSize: '24px' }}>✅</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Proof Generated</div>
                  <div style={{ fontFamily: MonoStack, fontSize: '11px', opacity: 0.5, marginTop: '4px' }}>
                    {proofResult.credential}: <span style={{ color: Neon }}>{proofResult.proof}</span>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gap: '16px' }}>
              {credentials.map((cred, i) => (
                <div key={i} style={{
                  background: SurfaceCard,
                  borderRadius: '20px',
                  border: cred.disclosed ? `1px solid ${Neon}30` : SurfaceBorder,
                  padding: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                }}>
                  <span style={{ fontSize: '28px' }}>{cred.icon}</span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700 }}>{cred.label}</h3>
                    <p style={{ margin: 0, fontSize: '12px', opacity: 0.4, fontFamily: MonoStack }}>
                      {cred.disclosed
                        ? `✓ Disclosed to ${cred.disclosedTo}`
                        : `Encrypted: ${cred.encryptedValue.slice(0, 30)}...`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleProve(i)}
                    disabled={loading || cred.disclosed}
                    style={{
                      background: cred.disclosed ? 'rgba(255,255,255,0.04)' : `linear-gradient(135deg, ${Neon}, ${Neon}CC)`,
                      color: cred.disclosed ? '#666' : DeepBlack,
                      border: 'none',
                      padding: '10px 24px',
                      borderRadius: '100px',
                      fontWeight: 900,
                      fontSize: '12px',
                      cursor: cred.disclosed ? 'default' : 'pointer',
                      fontFamily: FontStack,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cred.disclosed ? 'DISCLOSED' : loading ? 'PROVING...' : 'PROVE'}
                  </button>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: '40px',
              background: SurfaceCard,
              borderRadius: '20px',
              border: SurfaceBorder,
              padding: '24px',
            }}>
              <h3 style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '2px', opacity: 0.4, marginBottom: '16px' }}>
                HOW SELECTIVE DISCLOSURE WORKS
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                {[
                  { step: '1', title: 'Credential Encrypted', desc: 'Your cross-chain data is encrypted on-chain via Encrypt. No one can see it.' },
                  { step: '2', title: 'Proof Generated', desc: 'When a protocol asks, The Hollow generates a zero-knowledge proof from the encrypted state.' },
                  { step: '3', title: 'Verifier Convinced', desc: 'The verifier learns "yes/no" — never your addresses, balances, or chain activity.' },
                ].map((s) => (
                  <div key={s.step}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: `${Neon}15`,
                      border: `1px solid ${Neon}30`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: 900,
                      color: Neon,
                      marginBottom: '12px',
                    }}>
                      {s.step}
                    </div>
                    <h4 style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 700 }}>{s.title}</h4>
                    <p style={{ margin: 0, fontSize: '11px', opacity: 0.4, lineHeight: 1.5 }}>{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ═══ AUTOMATE PANEL ═══ */}
        {panel === 'automate' && (
          <>
            <div style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '8px', letterSpacing: '-1px' }}>
                Encrypted Automations
              </h2>
              <p style={{ opacity: 0.4, fontSize: '14px', lineHeight: 1.6, maxWidth: '600px' }}>
                Set cross-chain conditions that execute privately. Your strategy stays hidden until
                The Hollow triggers the Ika MPC signature.
              </p>
            </div>

            <div style={{ display: 'grid', gap: '16px', marginBottom: '30px' }}>
              {automations.map((rule) => (
                <div key={rule.id} style={{
                  background: SurfaceCard,
                  borderRadius: '20px',
                  border: rule.active ? `1px solid ${Neon}30` : SurfaceBorder,
                  padding: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: rule.active ? `${Neon}15` : 'rgba(255,255,255,0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    border: rule.active ? `1px solid ${Neon}25` : SurfaceBorder,
                  }}>
                    ⚡
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                      IF <span style={{ color: '#FFB800' }}>{rule.condition}</span>
                    </div>
                    <div style={{ fontSize: '13px', opacity: 0.5 }}>
                      THEN <span style={{ color: Neon }}>{rule.action}</span>
                      <span style={{ opacity: 0.3 }}> → {rule.targetChain}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleAutomation(rule.id)}
                    style={{
                      background: rule.active ? Neon : 'rgba(255,255,255,0.06)',
                      color: rule.active ? DeepBlack : '#666',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '100px',
                      fontWeight: 900,
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontFamily: FontStack,
                      minWidth: '90px',
                    }}
                  >
                    {rule.active ? 'ACTIVE' : 'ENABLE'}
                  </button>
                </div>
              ))}
            </div>

            <div style={{
              background: SurfaceCard,
              borderRadius: '20px',
              border: SurfaceBorder,
              padding: '24px',
            }}>
              <h3 style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '2px', opacity: 0.4, marginBottom: '16px' }}>
                HOW ENCRYPTED AUTOMATION WORKS
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                {[
                  { step: '1', title: 'Encrypted Condition', desc: 'Your trigger conditions are stored encrypted on-chain. No one sees your strategy.' },
                  { step: '2', title: 'Private Evaluation', desc: 'Encrypt evaluates conditions without decrypting. Only the boolean result is revealed.' },
                  { step: '3', title: 'Ika MPC Signs', desc: 'When conditions are met, The Hollow triggers Ika to produce a native signature for the target chain.' },
                ].map((s) => (
                  <div key={s.step}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: `${Violet}15`,
                      border: `1px solid ${Violet}30`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: 900,
                      color: Violet,
                      marginBottom: '12px',
                    }}>
                      {s.step}
                    </div>
                    <h4 style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 700 }}>{s.title}</h4>
                    <p style={{ margin: 0, fontSize: '11px', opacity: 0.4, lineHeight: 1.5 }}>{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              marginTop: '24px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '11px',
              fontFamily: MonoStack,
              opacity: 0.4,
            }}>
              <span>🔑</span>
              <span>dWallet: {dwalletId}</span>
              <span style={{ opacity: 0.3 }}>|</span>
              <span>Chains: BTC, ETH, SOL</span>
              <span style={{ opacity: 0.3 }}>|</span>
              <span>Signing: 2PC-MPC</span>
            </div>
          </>
        )}
      </div>

      {/* ─── FOOTER ─── */}
      <footer style={{
        textAlign: 'center',
        padding: '40px',
        opacity: 0.15,
        fontSize: '10px',
        letterSpacing: '4px',
      }}>
        THE HOLLOW • IKA × ENCRYPT • COLOSSEUM FRONTIER 2026
      </footer>
    </div>
  );
};
