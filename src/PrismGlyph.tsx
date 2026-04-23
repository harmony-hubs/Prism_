import { motion } from 'framer-motion';

interface Props {
  size?: number;
  isSigning?: boolean;
  className?: string;
}

/**
 * The PRISM glyph — refracting triangle that takes a white "intent" beam
 * on the left and refracts it into a native-chain spectrum on the right.
 * Ringed by a slow orbital halo to evoke the MPC quorum.
 */
export function PrismGlyph({ size = 240, isSigning = false, className = '' }: Props) {
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

        {/* Incoming "Intent" beam — only during signing */}
        {isSigning && (
          <motion.line
            x1="0"
            y1="120"
            x2="80"
            y2="120"
            stroke="oklch(0.98 0.01 280)"
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          />
        )}

        {/* Refracted spectrum out the right */}
        <g style={{ opacity: isSigning ? 1 : 0.45, transition: 'opacity 600ms' }}>
          {[
            { c: 'oklch(0.7 0.24 25)', y: 70 },
            { c: 'oklch(0.85 0.16 88)', y: 90 },
            { c: 'oklch(0.7 0.2 150)', y: 110 },
            { c: 'oklch(0.65 0.22 245)', y: 130 },
            { c: 'oklch(0.55 0.25 295)', y: 150 },
          ].map((b, i) => (
            <line
              key={i}
              x1="120"
              y1="120"
              x2="200"
              y2={b.y}
              stroke={b.c}
              strokeWidth="1.4"
              opacity="0.9"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
