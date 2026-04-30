import { motion } from 'framer-motion';

interface Props {
  size?: number;
  isSigning?: boolean;
  className?: string;
  /**
   * Optional: native colors for the refracted spectrum (one per beam, in
   * left-to-right band order). When supplied, the glyph's output beams adopt
   * the live wallet's chain colors so it visually feeds into the chain
   * spectrum rail directly below it. Falls back to the canonical
   * red→amber→green→blue→violet rainbow when omitted (e.g. PrismDashboard).
   */
  spectrumColors?: string[];
}

const FALLBACK_SPECTRUM = [
  'oklch(0.7 0.24 25)',
  'oklch(0.85 0.16 88)',
  'oklch(0.7 0.2 150)',
  'oklch(0.65 0.22 245)',
  'oklch(0.55 0.25 295)',
];

/**
 * The PRISM glyph — refracting triangle that takes a white "intent" beam
 * from the apex and refracts it into a native-chain spectrum out of the base.
 *
 * The refracted output points DOWN so it visually drops into the chain
 * spectrum bar rendered directly below the glyph in the wallet hub.
 *
 * Ringed by a slow orbital halo to evoke the MPC quorum.
 */
export function PrismGlyph({
  size = 240,
  isSigning = false,
  className = '',
  spectrumColors,
}: Props) {
  const colors = spectrumColors && spectrumColors.length > 0 ? spectrumColors : FALLBACK_SPECTRUM;
  const baseY = 150;
  const exitY = 200;
  // Triangle base spans x = 40..160. Beams fan from base midpoint (100, 150)
  // out to a wider spread at the bottom of the SVG, in left-to-right band order.
  const fanLeft = 14;
  const fanRight = 200 - fanLeft;
  const beams = colors.map((c, i) => {
    const t = colors.length === 1 ? 0.5 : i / (colors.length - 1);
    return { c, x2: fanLeft + t * (fanRight - fanLeft) };
  });

  return (
    <div
      data-testid="prism-wallet-glyph"
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Halo glow */}
      <div
        className={`absolute inset-0 rounded-full blur-3xl transition-opacity duration-700 ${
          isSigning ? 'opacity-100' : 'opacity-60'
        }`}
        style={{
          background:
            'radial-gradient(circle, oklch(0.6 0.24 290 / 0.55), oklch(0.55 0.22 260 / 0.2) 45%, transparent 70%)',
        }}
      />

      {/* Outer rotating quorum ring */}
      <motion.svg
        viewBox="0 0 240 240"
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
      >
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.85 0.16 88)" stopOpacity="0.9" />
            <stop offset="50%" stopColor="oklch(0.62 0.24 290)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="oklch(0.55 0.22 260)" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r="112" fill="none" stroke="url(#ringGrad)" strokeWidth="1" strokeDasharray="2 6" />
        <circle cx="120" cy="120" r="100" fill="none" stroke="oklch(0.6 0.24 290 / 0.2)" strokeWidth="0.5" />
      </motion.svg>

      {/* Core prism */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-6"
        style={{ filter: 'drop-shadow(0 0 18px oklch(0.6 0.24 290 / 0.55))' }}
      >
        <defs>
          <linearGradient id="prism-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.7 0.24 290)" />
            <stop offset="100%" stopColor="oklch(0.85 0.16 88)" />
          </linearGradient>
          <linearGradient id="prism-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.5 0.25 295 / 0.35)" />
            <stop offset="100%" stopColor="oklch(0.25 0.12 285 / 0.1)" />
          </linearGradient>
        </defs>

        {/* Refracting triangle — fill + animated stroke */}
        <motion.path
          d="M100 40 L160 150 L40 150 Z"
          fill="url(#prism-fill)"
          stroke="url(#prism-grad)"
          strokeWidth={2}
          strokeLinejoin="round"
          animate={
            isSigning
              ? { strokeWidth: [2, 5, 2], opacity: [0.85, 1, 0.85] }
              : { strokeWidth: 2, opacity: 0.9 }
          }
          transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
        />

        {/* Apex highlight */}
        <circle cx="100" cy="40" r="2.4" fill="oklch(0.98 0.05 88)" />

        {/* Incoming "intent" beam — descends from above the apex into the
            prism. Visible only during signing. */}
        {isSigning && (
          <motion.line
            x1="100"
            y1="0"
            x2="100"
            y2="40"
            stroke="oklch(0.98 0.01 280)"
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          />
        )}

        {/* Refracted spectrum — exits the base of the prism, fans downward.
            One beam per chain, left-to-right in band order, so it visually
            pours into the ChainSpectrum rail below. */}
        <g style={{ opacity: isSigning ? 1 : 0.55, transition: 'opacity 600ms' }}>
          {beams.map((b, i) => (
            <line
              key={i}
              x1="100"
              y1={baseY}
              x2={b.x2}
              y2={exitY}
              stroke={b.c}
              strokeWidth={isSigning ? 1.8 : 1.4}
              strokeLinecap="round"
              opacity={0.92}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
