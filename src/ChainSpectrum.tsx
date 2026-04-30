import type { CSSProperties } from 'react';

export interface SpectrumChain {
  id: string;
  symbol: string;
  color: string;
}

interface Props {
  chains: SpectrumChain[];
  /** Chain id currently signing (band saturates + pulses). */
  signingId?: string | null;
  /** Chain id flashed by external trigger (band-tap echo, e2e cue). */
  flashId?: string | null;
  onTap?: (id: string) => void;
}

/**
 * Honest decomposition of one identity into its native-chain wavelengths.
 *
 * Sits between the prism glyph and the chain rows so the eye reads
 * "intent → prism → spectrum → chains" without copy. Tapping a band
 * scrolls to the matching chain row and flashes it in that band's color.
 *
 * No logic of its own: receives the same `chains` array the wallet renders,
 * the active `signingId`, and an external `flashId` (so a parent can echo
 * the same flash on the chain row).
 */
export function ChainSpectrum({ chains, signingId = null, flashId = null, onTap }: Props) {
  if (chains.length === 0) return null;

  return (
    <div data-testid="chain-spectrum" className="chain-spectrum mt-4 w-full">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Your spectrum
        </p>
        <p className="text-[10px] text-white/30">One intent, native colors</p>
      </div>
      <div
        role="group"
        aria-label="Chain spectrum — tap a band to jump to that wallet row"
        className="chain-spectrum-bar relative flex h-9 w-full overflow-hidden rounded-full ring-1 ring-white/[0.08]"
      >
        {chains.map((c) => {
          const isActive = signingId === c.id;
          const isFlash = flashId === c.id;
          const style: CSSProperties = {
            // Custom property consumed by .chain-spectrum-band CSS.
            ['--band-color' as string]: c.color,
          };
          return (
            <button
              key={c.id}
              type="button"
              data-testid={`spectrum-band-${c.id}`}
              onClick={() => onTap?.(c.id)}
              aria-label={`${c.symbol} — jump to that wallet row`}
              className={`chain-spectrum-band group relative flex flex-1 items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-0 ${
                isActive ? 'chain-spectrum-band--active' : ''
              } ${isFlash ? 'chain-spectrum-band--flash' : ''}`}
              style={style}
            >
              <span className="chain-spectrum-band__fill" aria-hidden />
              <span className="relative z-[1] text-[10px] font-semibold uppercase tracking-[0.16em] text-white/[0.78] transition group-hover:text-white">
                {c.symbol}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
