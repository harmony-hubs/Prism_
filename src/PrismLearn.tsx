import React, { useState } from 'react';
import type { Connection } from '@solana/web3.js';
import {
  IKA_CPI_AUTHORITY_SEED,
  IKA_DWALLET_PROGRAM_ID,
  IKA_PREALPHA_GRPC,
  PRISM_PROGRAM_ID,
  SOLANA_RPC,
} from './config';
import {
  DWALLET_BOOK_PARTS,
  DWALLET_FLOW_STEPS,
  DWALLET_PRISM_CHECKLIST,
  ENCRYPT_DEVELOPER_GUIDE,
  IKA_ENCRYPT_BRIDGELESS_STORY,
  IKA_PUBLIC_SITE,
  IKA_SOLANA_PREALPHA_GUIDE,
  IKA_SOLANA_PREALPHA_INTRO,
  IKA_SOLANA_PREALPHA_PRINT,
  PRISM_GLOSSARY,
  PRE_ALPHA_DISCLAIMER_SHORT,
} from './dwallet';
import { DWalletTools } from './DWalletTools';

export const PrismLearn: React.FC<{ connection: Connection }> = ({ connection }) => {
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  return (
    <div
      data-testid="dwallet-tab-panel"
      className="flex flex-col gap-4 px-4 pb-8 pt-2 sm:px-5"
    >
      <p className="text-[12px] leading-relaxed text-white/65">
        <span className="font-semibold text-white/85">Builder lab.</span> Everything here is optional background: Ika
        pre-alpha, Encrypt, and the PRISM on-chain program. Your wallet screen stays clean — this is the appendix.
      </p>
      <p className="text-[11px] leading-relaxed text-amber-200/70">{PRE_ALPHA_DISCLAIMER_SHORT}</p>

      <div>
        <button
          type="button"
          data-testid="learn-glossary-toggle"
          onClick={() => setGlossaryOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2.5 text-left ring-1 ring-white/[0.06] transition hover:bg-white/[0.06]"
        >
          <span className="text-[12px] font-medium text-white/75">Glossary — plain English</span>
          <span className="text-[11px] text-white/40">{glossaryOpen ? 'Hide' : 'Show'}</span>
        </button>
        {glossaryOpen && (
          <dl
            data-testid="learn-glossary"
            className="mt-2 space-y-2.5 rounded-xl bg-black/35 p-3 ring-1 ring-white/[0.05]"
          >
            {PRISM_GLOSSARY.map(({ term, plain }) => (
              <div key={term}>
                <dt className="text-[12px] font-semibold text-white/80">{term}</dt>
                <dd className="mt-0.5 text-[11px] leading-relaxed text-white/50">{plain}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <section
        data-testid="ika-encrypt-pitch"
        className="rounded-2xl bg-gradient-to-b from-violet-500/[0.08] to-transparent p-3 ring-1 ring-violet-500/20"
      >
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-violet-200/90">
          {IKA_ENCRYPT_BRIDGELESS_STORY.title}
        </h2>
        <p className="mt-2 text-[11px] leading-relaxed text-white/50">{IKA_ENCRYPT_BRIDGELESS_STORY.lede}</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {IKA_ENCRYPT_BRIDGELESS_STORY.pillars.map((p) => (
            <li
              key={p.name}
              className="rounded-lg bg-black/30 px-2.5 py-2 text-[10px] leading-relaxed ring-1 ring-white/[0.06]"
            >
              <span className="font-semibold text-violet-200/85">{p.name}</span>
              <span className="text-white/45"> — {p.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-white/55">{IKA_ENCRYPT_BRIDGELESS_STORY.together}</p>
        <p className="mt-2 text-[10px] leading-relaxed text-amber-200/50">{IKA_ENCRYPT_BRIDGELESS_STORY.encryptNote}</p>
        <p className="mt-2 text-[10px] text-white/35">
          <a
            href={ENCRYPT_DEVELOPER_GUIDE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-200/80 underline decoration-white/15 underline-offset-2"
          >
            Encrypt Developer Guide
          </a>
          {' · '}
          <a
            href={IKA_SOLANA_PREALPHA_GUIDE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-200/75 underline decoration-white/15 underline-offset-2"
          >
            dWallet Developer Guide
          </a>
        </p>
      </section>

      <section className="rounded-2xl bg-gradient-to-b from-emerald-500/[0.07] to-transparent p-3 ring-1 ring-emerald-500/15">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-200/80">
          Follow the book — your checklist
        </h2>
        <p className="mt-1 text-[10px] leading-relaxed text-white/40">
          Same five steps as the Introduction. In PRISM Learn you verify PDAs and poll accounts; DKG and program txs use
          the CLI until we wire a browser flow.
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {DWALLET_PRISM_CHECKLIST.map((row) => (
            <li key={row.step} className="rounded-xl bg-black/25 p-3 ring-1 ring-white/[0.06]">
              <div className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-200/95">
                  {row.step}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-white/90">{row.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/45">{row.summary}</p>
                  <p className="mt-2 text-[10px] leading-relaxed text-emerald-200/55">
                    <span className="font-semibold text-emerald-200/75">In Learn (below): </span>
                    {row.inThisTab}
                  </p>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
                    <span className="font-medium text-white/45">CLI / elsewhere: </span>
                    {row.elsewhere}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {PRISM_PROGRAM_ID ? (
          <p className="mt-3 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-200/80 ring-1 ring-emerald-500/20">
            Step 2: <span className="font-medium">VITE_PRISM_PROGRAM_ID</span> is set — compare CPI PDA below to dWallet
            authority after <code className="text-white/60">init_prism</code>.
          </p>
        ) : (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200/85 ring-1 ring-amber-500/20">
            Step 2: set <span className="font-medium">VITE_PRISM_PROGRAM_ID</span> in <code className="text-white/50">.env</code>{' '}
            after you deploy <code className="text-white/50">program/</code> so the CPI line is real.
          </p>
        )}
      </section>

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
            <dt className="text-white/35">Your program (VITE_PRISM_PROGRAM_ID)</dt>
            <dd className="break-all text-white/60">{PRISM_PROGRAM_ID || '— set after deploy'}</dd>
          </div>
        </dl>
      </section>

      <p className="text-[10px] leading-relaxed text-white/30">
        Rust path: <code className="text-white/45">program/</code>, <code className="text-white/45">client/</code> — wire{' '}
        <code className="text-white/45">ika-grpc</code> per the book; TS SDK <code className="text-white/45">@ika.xyz/sdk</code>{' '}
        targets Sui-side Ika flows (see package README). Message hashes: keccak256 per Ika message-approval docs.
      </p>

      <DWalletTools connection={connection} />
    </div>
  );
};
