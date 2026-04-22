import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getInjectedSolana } from './dwallet/phantomWallet';
import { PRISM_PROGRAM_ID } from './config';
import {
  buildAttestBalanceInstruction,
  buildInitSovereignInstruction,
  buildPokeInstruction,
  buildSetArmedInstruction,
  deriveSovereignPda,
  parseSovereignData,
  signAndSend,
  type SovereignState,
} from './prismSovereignIx';

const BEAM = {
  idle: 'from-white/25 via-white/10 to-white/5',
  armed: 'from-sky-400/90 via-sky-500/50 to-cyan-500/30',
  tripped: 'from-rose-500/95 via-rose-600/50 to-amber-500/20',
} as const;

type Props = {
  connection: Connection;
  ownerBase58: string | null;
};

function beamClass(state: SovereignState | null, accountMissing: boolean): string {
  if (accountMissing) return BEAM.idle;
  if (!state) return BEAM.idle;
  if (state.tripped !== 'none') return BEAM.tripped;
  if (state.isArmed) return BEAM.armed;
  return BEAM.idle;
}

export const SovereignCommand: React.FC<Props> = ({ connection, ownerBase58 }) => {
  const [currentSlot, setCurrentSlot] = useState<bigint | null>(null);
  const [onChain, setOnChain] = useState<SovereignState | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attestVal, setAttestVal] = useState('');

  const programId = useMemo((): PublicKey | null => {
    const s = PRISM_PROGRAM_ID?.trim();
    if (!s) return null;
    try {
      return new PublicKey(s);
    } catch {
      return null;
    }
  }, [PRISM_PROGRAM_ID]);
  const owner = useMemo((): PublicKey | null => {
    if (!ownerBase58?.trim()) return null;
    try {
      return new PublicKey(ownerBase58.trim());
    } catch {
      return null;
    }
  }, [ownerBase58]);
  const pda = programId && owner ? deriveSovereignPda(owner, programId).pda : null;

  const refresh = useCallback(async () => {
    if (!pda) {
      setOnChain(undefined);
      return;
    }
    try {
      const slot = await connection.getSlot('confirmed');
      setCurrentSlot(BigInt(slot));
    } catch {
      setCurrentSlot(null);
    }
    try {
      const acc = await connection.getAccountInfo(pda, 'confirmed');
      if (!acc?.data) {
        setOnChain(null);
        return;
      }
      setOnChain(parseSovereignData(acc.data) ?? null);
    } catch {
      setOnChain(null);
    }
  }, [connection, pda]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const wallet = getInjectedSolana();
  const canSign = Boolean(wallet?.signTransaction && ownerBase58);

  const runTx = useCallback(
    async (label: string, makeTx: (programId: PublicKey, o: PublicKey, sovereign: PublicKey) => Transaction) => {
      if (!programId || !owner || !pda) return;
      if (!canSign) {
        setErr('Wallet cannot sign (connect Phantom and try again).');
        return;
      }
      setBusy(label);
      setErr(null);
      try {
        const pk = new PublicKey(ownerBase58!);
        if (!pk.equals(owner)) throw new Error('Address mismatch');
        const w = getInjectedSolana()!;
        const t = makeTx(programId, pk, pda);
        const sig = await signAndSend(connection, { publicKey: pk, signTransaction: (x) => w.signTransaction!(x) }, t);
        await connection.confirmTransaction(sig, 'confirmed');
        await refresh();
        pushSovereignActivity(label, sig);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Transaction failed');
      } finally {
        setBusy(null);
      }
    },
    [programId, owner, pda, canSign, connection, ownerBase58, refresh],
  );

  /** Do not place hooks after conditional returns — it breaks the Rules of Hooks (white screen on connect / env change). */
  const st = onChain === undefined ? null : onChain;
  const heartbeatFresh = useMemo(() => {
    if (!st || !st.isArmed || st.tripped !== 'none') return false;
    if (st.inactivityLimitSlots === 0n) return true;
    if (currentSlot === null) return false;
    return st.lastHeartbeatSlot + st.inactivityLimitSlots > currentSlot;
  }, [st, currentSlot]);

  if (!PRISM_PROGRAM_ID?.trim()) {
    return (
      <section
        data-testid="sovereign-panel"
        className="sovereign-facet relative mt-5 overflow-hidden rounded-[22px] p-4 ring-1 ring-white/[0.08]"
      >
        <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-white/90">Sovereign Command Center</h2>
        <details className="mt-2 group rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-1.5">
          <summary className="cursor-pointer list-none text-[10px] text-white/40 outline-none transition hover:text-white/60 [&::-webkit-details-marker]:hidden">
            <span className="tracking-wide">Environment (devnet)</span>
          </summary>
          <p className="mt-1.5 text-[10px] leading-relaxed text-white/32">
            Set <code className="font-mono text-white/50">VITE_PRISM_PROGRAM_ID</code> in <code className="font-mono text-white/50">.env</code>, then restart
            the dev server.
          </p>
        </details>
      </section>
    );
  }

  if (!programId) {
    return (
      <section
        data-testid="sovereign-panel"
        className="sovereign-facet relative mt-5 overflow-hidden rounded-[22px] p-4 ring-1 ring-amber-500/20"
      >
        <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-white/90">Sovereign Command Center</h2>
        <p className="mt-1 text-[11px] text-amber-200/85">
          <code className="font-mono">VITE_PRISM_PROGRAM_ID</code> is not a valid Solana address. Fix <code className="font-mono">.env</code> and
          restart the dev server.
        </p>
      </section>
    );
  }

  if (!ownerBase58?.trim()) {
    return (
      <section
        data-testid="sovereign-panel"
        className="sovereign-facet relative mt-5 overflow-hidden rounded-[22px] p-4 ring-1 ring-white/[0.08]"
      >
        <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-white/90">Sovereign Command Center</h2>
        <p className="mt-1 text-[12px] text-white/40">Connect Solana to view heartbeat and trap countdown.</p>
      </section>
    );
  }

  if (!owner) {
    return (
      <section
        data-testid="sovereign-panel"
        className="sovereign-facet relative mt-5 overflow-hidden rounded-[22px] p-4 ring-1 ring-amber-500/20"
      >
        <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-white/90">Sovereign Command Center</h2>
        <p className="mt-1 text-[11px] text-amber-200/80">Connected address is not valid base58. Disconnect and reconnect your wallet.</p>
      </section>
    );
  }

  const accountMissing = onChain === null;

  const deadline =
    st && st.inactivityLimitSlots > 0n && st.tripped === 'none'
      ? st.lastHeartbeatSlot + st.inactivityLimitSlots
      : null;
  const slotsLeft =
    currentSlot != null && deadline != null
      ? deadline - currentSlot
      : null;

  return (
    <section
      data-testid="sovereign-panel"
      className="sovereign-facet relative mt-5 overflow-hidden rounded-[22px] p-4 ring-1 ring-sky-500/15"
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${beamClass(st, accountMissing)} opacity-50`}
        aria-hidden
      />
      <div className="relative">
        <h2 className="text-[15px] font-semibold tracking-tight text-white/92">Sovereign Command</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-white/42">
          Ika CPI PDA = armed · heartbeat resets inactivity · Encrypt can hide thresholds later
        </p>
        <div
          className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
          data-testid="sovereign-beam"
        >
          <div
            className={`h-full min-h-1.5 w-full bg-gradient-to-r ${beamClass(st, accountMissing)} transition-[opacity] duration-500`}
          />
        </div>
        {st && !accountMissing && (
          <div
            data-testid="sovereign-status"
            className={`mt-3 flex flex-wrap items-baseline gap-2.5 rounded-xl border px-3 py-2.5 transition ${
              st.isArmed && st.tripped === 'none' && heartbeatFresh
                ? 'border-sky-400/40 bg-sky-500/[0.12] shadow-[0_0_24px_rgba(56,189,248,0.2)]'
                : 'border-white/[0.08] bg-white/[0.04]'
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Status</span>
            <span
              className={
                st.tripped !== 'none'
                  ? 'text-[12px] font-semibold text-rose-200/90'
                  : st.isArmed
                    ? heartbeatFresh
                      ? 'text-[12px] font-semibold text-sky-100/95'
                      : 'text-[12px] font-semibold text-amber-200/85'
                    : 'text-[12px] font-medium text-white/45'
              }
            >
              {st.tripped !== 'none'
                ? st.tripped === 'inactivity'
                  ? 'TRIPPED — inactivity'
                  : 'TRIPPED — panic'
                : st.isArmed
                  ? heartbeatFresh
                    ? 'ARMED — heartbeat fresh'
                    : 'ARMED — window passed (permissionless spring_inactivity)'
                  : 'DISARMED'}
            </span>
          </div>
        )}
        {st && st.tripped !== 'none' && (
          <p className="mt-2 text-[11px] font-medium text-rose-200/90">
            Trap fired: {st.tripped === 'inactivity' ? 'inactivity' : 'balance shield'}. Re-arm in Operator flow when ready.
          </p>
        )}

        {onChain === undefined && <p className="mt-2 text-[11px] text-white/40">Loading state…</p>}

        {accountMissing && onChain !== undefined && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] text-white/50">No `prism_sovereign` PDA yet. Initialize with demo values (devnet only).</p>
            <button
              type="button"
              data-testid="sovereign-init"
              disabled={!canSign || busy !== null}
              onClick={() =>
                runTx('Initialize command center', (pid, o, s) => {
                  const t = new Transaction();
                  t.add(
                    buildInitSovereignInstruction(
                      pid,
                      o,
                      s,
                      o,
                      1_200n, // ~8 min of slots at ~400ms/slot
                      5_000n, // demo panic floor: attest below this to arm spring_panic
                      true,
                    ),
                  );
                  return t;
                })
              }
              className="rounded-xl bg-sky-500/25 px-3 py-2 text-[12px] font-medium text-sky-100/95 ring-1 ring-sky-400/30 hover:bg-sky-500/35 disabled:opacity-50"
            >
              {busy === 'Initialize command center' ? '…' : 'Initialize (demo)'}
            </button>
          </div>
        )}

        {st && !accountMissing && (
          <ul className="mt-3 space-y-1.5 text-[11px] text-white/55">
            <li>
              Armed: <span className="text-white/85">{st.isArmed ? 'yes' : 'no'}</span> · inactivity:{' '}
              <span className="font-mono text-white/80">{st.inactivityLimitSlots.toString()}</span> slots
            </li>
            <li>
              Panic floor (demo):{' '}
              <span className="font-mono text-white/80">{st.panicFloor.toString()}</span> · last attested:{' '}
              <span className="font-mono text-white/80">{st.lastAttestedNative.toString()}</span>
            </li>
            <li>
              Countdown:{' '}
              {st.inactivityLimitSlots === 0n || st.tripped !== 'none' ? (
                <span>— (off or tripped)</span>
              ) : slotsLeft !== null && slotsLeft >= 0n ? (
                <span>
                  <span className="font-mono text-sky-200/90">{slotsLeft.toString()}</span> slots (~
                  {Math.max(0, (Number(slotsLeft) * 0.4) / 60).toFixed(1)} min @ ~0.4s/slot)
                </span>
              ) : (
                <span className="text-amber-200/90">overdue — anyone can run `spring_inactivity` (CLI)</span>
              )}
            </li>
            {currentSlot != null && <li className="text-white/35">Current slot: {currentSlot.toString()}</li>}
          </ul>
        )}

        {st && !accountMissing && (st.tripped !== 'none' || !st.isArmed) && (
          <div className="mt-3">
            <button
              type="button"
              data-testid="sovereign-rearm"
              disabled={!canSign || busy !== null}
              onClick={() =>
                runTx('Re-arm', (pid, o, s) => {
                  const t = new Transaction();
                  t.add(buildSetArmedInstruction(pid, o, s, true));
                  return t;
                })
              }
              className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-[12px] text-sky-100/90 hover:bg-sky-500/15 disabled:opacity-50"
            >
              {busy === 'Re-arm' ? '…' : 'Re-arm (clears trip in state)'}
            </button>
          </div>
        )}

        {st && !accountMissing && st.tripped === 'none' && st.isArmed && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="sovereign-poke"
              disabled={!canSign || busy !== null}
              onClick={() =>
                runTx('Heartbeat', (pid, o, s) => {
                  const t = new Transaction();
                  t.add(buildPokeInstruction(pid, o, s));
                  return t;
                })
              }
              className="rounded-xl bg-white/[0.08] px-3 py-2 text-[12px] font-medium text-white/90 ring-1 ring-white/12 hover:bg-white/[0.12] disabled:opacity-50"
            >
              {busy === 'Heartbeat' ? '…' : 'Poke (heartbeat)'}
            </button>
            <button
              type="button"
              data-testid="sovereign-disarm"
              disabled={!canSign || busy !== null}
              onClick={() =>
                runTx('Disarm', (pid, o, s) => {
                  const t = new Transaction();
                  t.add(buildSetArmedInstruction(pid, o, s, false));
                  return t;
                })
              }
              className="rounded-xl border border-white/10 bg-transparent px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.04] disabled:opacity-50"
            >
              {busy === 'Disarm' ? '…' : 'Disarm'}
            </button>
            {st.panicFloor > 0n && (
              <div className="mt-2 flex w-full flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  data-testid="sovereign-attest-input"
                  value={attestVal}
                  onChange={(e) => setAttestVal(e.target.value.replace(/\D/g, ''))}
                  placeholder="Attested amount"
                  className="min-w-[8rem] flex-1 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1.5 text-[12px] text-white/90 placeholder:text-white/30"
                />
                <button
                  type="button"
                  data-testid="sovereign-attest"
                  disabled={!canSign || busy !== null || !attestVal}
                  onClick={() => {
                    const n = BigInt(attestVal || '0');
                    void runTx('Attest balance', (pid, o, s) => {
                      const t = new Transaction();
                      t.add(buildAttestBalanceInstruction(pid, o, s, n));
                      return t;
                    });
                  }}
                  className="rounded-xl bg-amber-500/20 px-3 py-2 text-[12px] text-amber-100/90 ring-1 ring-amber-400/25 disabled:opacity-50"
                >
                  {busy === 'Attest balance' ? '…' : 'Attest (demo)'}
                </button>
              </div>
            )}
            <p className="w-full text-[10px] text-white/32">
              If attested amount is below your panic floor, anyone can run spring_panic (CLI) to move dWallet authority
              to recovery.
            </p>
          </div>
        )}

        {err && <p className="mt-2 text-[11px] text-rose-300/90">{err}</p>}
      </div>
    </section>
  );
};

function pushSovereignActivity(label: string, sig: string) {
  try {
    const cur = window.localStorage.getItem('prism-sovereign-activity');
    const arr: { at: string; label: string; sig: string }[] = cur ? JSON.parse(cur) : [];
    arr.unshift({ at: new Date().toISOString(), label, sig: sig.slice(0, 8) + '…' });
    window.localStorage.setItem('prism-sovereign-activity', JSON.stringify(arr.slice(0, 5)));
  } catch {
    /* ignore */
  }
}
