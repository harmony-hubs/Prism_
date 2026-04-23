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

function statusLine(
  st: SovereignState,
  heartbeatFresh: boolean,
): { label: string; detail?: string; tone: 'ok' | 'warn' | 'off' | 'alert' } {
  if (st.tripped === 'inactivity') {
    return { label: 'Tripped: inactivity', detail: 'The inactivity window passed while armed.', tone: 'alert' };
  }
  if (st.tripped === 'panic') {
    return { label: 'Tripped: balance', detail: 'Attested value fell below the demo floor.', tone: 'alert' };
  }
  if (st.isArmed) {
    if (heartbeatFresh) {
      return { label: 'Armed & checked in', detail: 'Heartbeat is inside your inactivity window.', tone: 'ok' };
    }
    return {
      label: 'Armed — check-in needed',
      detail: 'Poke to refresh the timer, or anyone may run the inactivity path (CLI on devnet).',
      tone: 'warn',
    };
  }
  return { label: 'Disarmed', detail: 'Traps are off. Re-arm to start monitoring again.', tone: 'off' };
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

  const st = onChain === undefined ? null : onChain;
  const heartbeatFresh = useMemo(() => {
    if (!st || !st.isArmed || st.tripped !== 'none') return false;
    if (st.inactivityLimitSlots === 0n) return true;
    if (currentSlot === null) return false;
    return st.lastHeartbeatSlot + st.inactivityLimitSlots > currentSlot;
  }, [st, currentSlot]);

  const sectionShell =
    'sovereign-facet relative mt-5 overflow-hidden rounded-[22px] p-4 ring-1 ring-white/[0.08]';

  if (!PRISM_PROGRAM_ID?.trim()) {
    return (
      <section data-testid="sovereign-panel" className={sectionShell}>
        <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-white/90">Command center</h2>
        <details className="mt-2 group rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-1.5">
          <summary className="cursor-pointer list-none text-[10px] text-white/40 outline-none transition hover:text-white/60 [&::-webkit-details-marker]:hidden">
            <span className="tracking-wide">Environment (devnet)</span>
          </summary>
          <p className="mt-1.5 text-[10px] leading-relaxed text-white/32">
            Set <code className="font-mono text-white/50">VITE_PRISM_PROGRAM_ID</code> in <code className="font-mono text-white/50">.env</code>, then
            restart the dev server.
          </p>
        </details>
      </section>
    );
  }

  if (!programId) {
    return (
      <section data-testid="sovereign-panel" className={`${sectionShell} ring-amber-500/20`}>
        <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-white/90">Command center</h2>
        <p className="mt-1 text-[11px] text-amber-200/85">
          <code className="font-mono">VITE_PRISM_PROGRAM_ID</code> is not a valid Solana address. Fix <code className="font-mono">.env</code> and
          restart the dev server.
        </p>
      </section>
    );
  }

  if (!ownerBase58?.trim()) {
    return (
      <section data-testid="sovereign-panel" className={sectionShell}>
        <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-white/90">Command center</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">
          Connect Solana to use this devnet demo: a small on-chain “watch” for inactivity and (optional) a demo balance
          floor, backed by your PRISM program.
        </p>
      </section>
    );
  }

  if (!owner) {
    return (
      <section data-testid="sovereign-panel" className={`${sectionShell} ring-amber-500/20`}>
        <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-white/90">Command center</h2>
        <p className="mt-1 text-[11px] text-amber-200/80">Connected address is not valid base58. Disconnect and reconnect your wallet.</p>
      </section>
    );
  }

  const accountMissing = onChain === null;
  const deadline =
    st && st.inactivityLimitSlots > 0n && st.tripped === 'none' ? st.lastHeartbeatSlot + st.inactivityLimitSlots : null;
  const slotsLeft =
    currentSlot != null && deadline != null ? deadline - currentSlot : null;
  const line = st && !accountMissing ? statusLine(st, heartbeatFresh) : null;

  return (
    <section
      data-testid="sovereign-panel"
      className="sovereign-facet relative mt-5 overflow-hidden rounded-[22px] p-4 ring-1 ring-sky-500/15"
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${beamClass(st, accountMissing)} opacity-50`}
        aria-hidden
      />
      <div className="relative space-y-4">
        {/* —— Intro —— */}
        <header className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">On-chain (devnet)</p>
          <h2 className="text-[15px] font-semibold tracking-tight text-white/92">Command center</h2>
          <p className="text-[11px] leading-relaxed text-white/45">
            One PDA on your program keeps demo timers: while <span className="text-white/70">armed</span>, a periodic check-in
            and optional attested value can trigger <span className="text-white/70">traps</span> (inactivity or balance, per
            program). Advanced paths use the Ika book + CLI; this card is a simple control surface.
          </p>
        </header>

        <div
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
          data-testid="sovereign-beam"
        >
          <div
            className={`h-full min-h-1.5 w-full bg-gradient-to-r ${beamClass(st, accountMissing)} transition-[opacity] duration-500`}
          />
        </div>

        {/* —— Status —— */}
        {onChain === undefined && <p className="text-[11px] text-white/40">Loading…</p>}

        {st && !accountMissing && line && (
          <div
            data-testid="sovereign-status"
            className={`rounded-xl border px-3 py-3 ${
              line.tone === 'ok'
                ? 'border-sky-400/40 bg-sky-500/[0.12] shadow-[0_0_20px_rgba(56,189,248,0.15)]'
                : line.tone === 'warn'
                  ? 'border-amber-500/30 bg-amber-500/[0.08]'
                  : line.tone === 'alert'
                    ? 'border-rose-500/35 bg-rose-500/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.04]'
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">Status</p>
            <p
              className={
                line.tone === 'ok'
                  ? 'mt-1 text-[13px] font-semibold text-sky-100/95'
                  : line.tone === 'warn'
                    ? 'mt-1 text-[13px] font-semibold text-amber-200/90'
                    : line.tone === 'alert'
                      ? 'mt-1 text-[13px] font-semibold text-rose-200/90'
                      : 'mt-1 text-[13px] font-medium text-white/55'
              }
            >
              {line.label}
            </p>
            {line.detail && <p className="mt-1.5 text-[11px] leading-relaxed text-white/50">{line.detail}</p>}
          </div>
        )}

        <details className="group rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-[11px] text-white/50">
          <summary className="cursor-pointer list-none text-[11px] font-medium text-white/60 outline-none transition hover:text-white/75 [&::-webkit-details-marker]:hidden">
            What do the buttons do?
          </summary>
          <ul className="mt-2 space-y-1.5 pl-3 text-[10px] leading-relaxed text-white/40 [list-style:disc]">
            <li>
              <span className="text-white/55">Initialize</span> — create the PDA with demo limits (devnet, first time only).
            </li>
            <li>
              <span className="text-white/55">Check in</span> — refresh the inactivity clock while armed.
            </li>
            <li>
              <span className="text-white/55">Disarm</span> — pause traps without closing the PDA.
            </li>
            <li>
              <span className="text-white/55">Attest</span> — set a demo number for the balance floor (optional).
            </li>
            <li>
              <span className="text-white/55">Re-arm</span> — turn monitoring back on or clear a trip in this demo.
            </li>
          </ul>
        </details>

        {/* —— First time —— */}
        {accountMissing && onChain !== undefined && (
          <div className="space-y-2 border-t border-white/[0.06] pt-4" data-testid="sovereign-setup">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">Set up (once)</h3>
            <p className="text-[11px] text-white/50">No <code className="font-mono text-[10px] text-white/60">prism_sovereign</code> PDA for this
              wallet yet. Create it with the defaults below.</p>
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
                      1_200n,
                      5_000n,
                      true,
                    ),
                  );
                  return t;
                })
              }
              className="w-full rounded-xl bg-sky-500/25 px-3 py-2.5 text-[12px] font-medium text-sky-100/95 ring-1 ring-sky-400/30 hover:bg-sky-500/35 disabled:opacity-50"
            >
              {busy === 'Initialize command center' ? '…' : 'Create PDA (demo defaults)'}
            </button>
          </div>
        )}

        {/* —— Numbers —— */}
        {st && !accountMissing && (
          <div className="space-y-2 border-t border-white/[0.06] pt-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">Snapshot</h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="list">
              <div className="rounded-lg bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/[0.05]" role="listitem">
                <p className="text-[10px] text-white/38">Inactivity window</p>
                <p className="mt-0.5 font-mono text-[12px] text-white/80">
                  {st.inactivityLimitSlots === 0n ? 'off' : `${st.inactivityLimitSlots.toString()} slots`}
                </p>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/[0.05]" role="listitem">
                <p className="text-[10px] text-white/38">Demo panic floor</p>
                <p className="mt-0.5 font-mono text-[12px] text-white/80">{st.panicFloor.toString()}</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/[0.05] sm:col-span-2" role="listitem">
                <p className="text-[10px] text-white/38">Last attested (demo unit)</p>
                <p className="mt-0.5 font-mono text-[12px] text-white/80">{st.lastAttestedNative.toString()}</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/[0.05] sm:col-span-2" role="listitem">
                <p className="text-[10px] text-white/38">Time left (inactivity)</p>
                <p className="mt-0.5 text-[12px] text-white/75">
                  {st.inactivityLimitSlots === 0n || st.tripped !== 'none' ? (
                    <span className="text-white/45">— (off or tripped)</span>
                  ) : slotsLeft !== null && slotsLeft >= 0n ? (
                    <span>
                      <span className="font-mono text-sky-200/90">{slotsLeft.toString()}</span> slots (~
                      {Math.max(0, (Number(slotsLeft) * 0.4) / 60).toFixed(1)} min)
                    </span>
                  ) : (
                    <span className="text-amber-200/90">Overdue (CLI can run inactivity path)</span>
                  )}
                </p>
                {currentSlot != null && <p className="mt-1 text-[10px] text-white/32">Current slot: {currentSlot.toString()}</p>}
              </div>
            </div>
          </div>
        )}

        {/* —— After trip / disarmed: re-arm —— */}
        {st && !accountMissing && (st.tripped !== 'none' || !st.isArmed) && (
          <div className="space-y-2 border-t border-white/[0.06] pt-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">Monitoring</h3>
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
              className="w-full rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-[12px] font-medium text-sky-100/90 hover:bg-sky-500/15 disabled:opacity-50"
            >
              {busy === 'Re-arm' ? '…' : 'Re-arm (turn monitoring on)'}
            </button>
          </div>
        )}

        {/* —— Armed, not tripped: day-to-day —— */}
        {st && !accountMissing && st.tripped === 'none' && st.isArmed && (
          <div className="space-y-3 border-t border-white/[0.06] pt-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">While armed</h3>
            <div className="flex flex-wrap gap-2">
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
                className="flex-1 min-w-[7rem] rounded-xl bg-white/[0.08] px-3 py-2.5 text-[12px] font-medium text-white/90 ring-1 ring-white/12 hover:bg-white/[0.12] disabled:opacity-50"
              >
                {busy === 'Heartbeat' ? '…' : 'Check in'}
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
                className="flex-1 min-w-[7rem] rounded-xl border border-white/10 bg-transparent px-3 py-2.5 text-[12px] text-white/60 hover:bg-white/[0.04] disabled:opacity-50"
              >
                {busy === 'Disarm' ? '…' : 'Disarm'}
              </button>
            </div>
            {st.panicFloor > 0n && (
              <div className="space-y-2">
                <p className="text-[10px] text-white/38">Optional — demo value for the balance floor</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    data-testid="sovereign-attest-input"
                    value={attestVal}
                    onChange={(e) => setAttestVal(e.target.value.replace(/\D/g, ''))}
                    placeholder="Amount"
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
                    {busy === 'Attest balance' ? '…' : 'Attest'}
                  </button>
                </div>
                <p className="text-[10px] leading-relaxed text-white/32">
                  Below the floor while armed, a separate CLI step can run the program&apos;s balance trap (see README).
                </p>
              </div>
            )}
          </div>
        )}

        {err && <p className="text-[11px] text-rose-300/90">{err}</p>}
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
