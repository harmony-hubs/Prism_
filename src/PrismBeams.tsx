import { useEffect, useState, type RefObject } from 'react';

export interface BeamTarget {
  id: string;
  color: string;
}

interface Props {
  /** Container relative to which all beam coordinates are measured. */
  containerRef: RefObject<HTMLElement | null>;
  /** Element whose center-bottom is treated as the prism's beam exit. */
  originRef: RefObject<HTMLElement | null>;
  /**
   * Pixels to lift the origin above `originRef`'s bottom edge — useful when
   * the visual base of the prism sits above the wrapping element's edge
   * (e.g. PRISM glyph: pass 24 for the SVG inset).
   */
  originYInset?: number;
  /** Resolves the live element to land each beam on, by chain id. */
  getTargetElement: (id: string) => HTMLElement | null;
  /** Beam list — order doesn't matter; `id` matches `getTargetElement`. */
  targets: BeamTarget[];
  /** Chain id currently signing — its beam intensifies + flows. */
  signingId?: string | null;
}

interface BeamPath {
  id: string;
  color: string;
  d: string;
  isActive: boolean;
}

/**
 * Draws colored SVG beams from a prism origin to each chain row's leading edge.
 *
 * The SVG layer absolutely fills its `containerRef` and is `pointer-events: none`,
 * so it never blocks row clicks. Beam paths are recomputed on container resize,
 * window scroll, and any tracked target's resize via a single `ResizeObserver`.
 *
 * Designed to sit at the bottom of a `relative` container that holds the prism
 * glyph at the top and chain rows below — the eye reads "white intent → prism →
 * native-color refraction → individual chain" without any copy.
 */
export function PrismBeams({
  containerRef,
  originRef,
  originYInset = 0,
  getTargetElement,
  targets,
  signingId = null,
}: Props) {
  const [paths, setPaths] = useState<BeamPath[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let raf = 0;
    const recalc = () => {
      const c = containerRef.current;
      const o = originRef.current;
      if (!c || !o) return;
      const cRect = c.getBoundingClientRect();
      const oRect = o.getBoundingClientRect();
      const ox = oRect.left + oRect.width / 2 - cRect.left;
      const oy = oRect.bottom - originYInset - cRect.top;

      const next: BeamPath[] = [];
      for (const t of targets) {
        const el = getTargetElement(t.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        // Land at the row's wavelength accent stripe (8px inside the left edge).
        const tx = r.left + 8 - cRect.left;
        const ty = r.top + r.height / 2 - cRect.top;
        const dx = tx - ox;
        const dy = ty - oy;
        // Bezier control points — a graceful refraction curve that pulls
        // outward from the prism before settling toward the row.
        const cx1 = ox + dx * 0.18;
        const cy1 = oy + Math.max(dy * 0.55, 14);
        const cx2 = tx - dx * 0.1;
        const cy2 = oy + dy * 0.88;
        next.push({
          id: t.id,
          color: t.color,
          d: `M ${ox.toFixed(1)} ${oy.toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}`,
          isActive: signingId === t.id,
        });
      }

      setSize({ w: cRect.width, h: cRect.height });
      setPaths(next);
    };

    const debounced = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recalc);
    };

    debounced();

    const ro = new ResizeObserver(debounced);
    ro.observe(container);
    if (originRef.current) ro.observe(originRef.current);
    targets.forEach((t) => {
      const el = getTargetElement(t.id);
      if (el) ro.observe(el);
    });

    window.addEventListener('resize', debounced);
    window.addEventListener('scroll', debounced, true);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', debounced);
      window.removeEventListener('scroll', debounced, true);
    };
  }, [targets, signingId, originYInset, containerRef, originRef, getTargetElement]);

  if (size.w === 0 || size.h === 0 || paths.length === 0) return null;

  return (
    <svg
      data-testid="prism-beams"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      className="prism-beams pointer-events-none absolute inset-0"
      aria-hidden
    >
      {paths.map((p) => (
        <g key={p.id}>
          {/* Soft glow halo — wider, blurred, low opacity. */}
          <path
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={p.isActive ? 9 : 4.5}
            opacity={p.isActive ? 0.5 : 0.18}
            strokeLinecap="round"
            className="prism-beam-glow"
          />
          {/* Core beam — crisp colored line. Active beam dashes & flows. */}
          <path
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={p.isActive ? 2 : 1.2}
            opacity={p.isActive ? 1 : 0.82}
            strokeLinecap="round"
            strokeDasharray={p.isActive ? '5 7' : undefined}
            className={p.isActive ? 'prism-beam-flow' : undefined}
          />
        </g>
      ))}
    </svg>
  );
}
