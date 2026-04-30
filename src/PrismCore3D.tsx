import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshTransmissionMaterial } from '@react-three/drei';
import { Suspense, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * PrismCore3D — the wallet, rendered as a refractive prism that holds the
 * user's assets as constant reflections of light.
 *
 * Metaphor (from product):
 *   - The prism IS the wallet. There is no "wallet card with a prism on top."
 *   - Each chain is a colored light point caught inside the prism, orbiting.
 *   - Every action is a vote in the Ika 2PC-MPC quorum: outer particles
 *     spiral inward through the prism whenever a signature is in flight.
 *
 * Interactions:
 *   - Tap a chain spirit → focuses that chain (`onSelect(id)`).
 *   - Tap empty space  → `onPrismTap()` (opens command overview by default).
 *   - When `signingId` is set, the prism accelerates, the active spirit pulses,
 *     and quorum particles converge inward in the chain's color.
 */

export interface PrismChainSpirit {
  id: string;
  symbol: string;
  emoji: string;
  color: string;
  /** Used as a soft weight for orbit radius / size; not displayed here. */
  balance?: number;
}

export interface PrismCoreProps {
  chains: PrismChainSpirit[];
  /** Chain id whose vote is currently in flight (drives the quorum animation). */
  signingId?: string | null;
  /** Chain id whose drawer is expanded outside the canvas. */
  selectedId?: string | null;
  /** Called when a spirit is tapped (`null` toggles the current selection off). */
  onSelect?: (id: string | null) => void;
  /** Called when the user taps empty space in the canvas. */
  onPrismTap?: () => void;
  className?: string;
  ariaLabel?: string;
}

/** The transparent triangular bipyramid that gives PRISM its silhouette. */
function PrismShape({ accelerated }: { accelerated: boolean }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const speed = accelerated ? 0.95 : 0.22;
    ref.current.rotation.y += delta * speed;
    ref.current.rotation.x = Math.sin(ref.current.rotation.y * 0.4) * 0.08;
  });

  // Octahedron, stretched on Y so it reads as a "tall prism" rather than a
  // diamond. Two opposing apices (top + bottom) like a bipyramid prism.
  const geometry = useMemo(() => {
    const g = new THREE.OctahedronGeometry(1.3, 0);
    g.scale(0.82, 1.18, 0.82);
    return g;
  }, []);

  return (
    <mesh ref={ref} geometry={geometry}>
      <MeshTransmissionMaterial
        backside
        thickness={0.45}
        roughness={0.04}
        transmission={1}
        ior={1.55}
        chromaticAberration={0.08}
        anisotropy={0.25}
        clearcoat={1}
        attenuationDistance={2.2}
        attenuationColor="#ffffff"
        color="#ffffff"
        distortion={0.06}
        distortionScale={0.3}
      />
    </mesh>
  );
}

/** A chain rendered as light caught inside the prism: a small emissive
 *  sphere with a soft color halo, orbiting until selected. */
function ChainSpirit({
  chain,
  index,
  total,
  isSelected,
  isSigning,
  onSelect,
}: {
  chain: PrismChainSpirit;
  index: number;
  total: number;
  isSelected: boolean;
  isSigning: boolean;
  onSelect: () => void;
}) {
  const orbRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    if (!orbRef.current) return;
    const t = state.clock.getElapsedTime();
    const baseAngle = (index / Math.max(total, 1)) * Math.PI * 2;
    // Selected spirit glides to the prism's center; everyone else keeps orbiting.
    const orbiting = !isSelected;
    const angle = baseAngle + (orbiting ? t * 0.45 : 0);
    const radius = isSelected ? 0.0 : 0.55;
    const yWobble = isSelected ? 0 : Math.sin(angle * 1.3 + t * 0.6) * 0.22;

    const targetX = Math.cos(angle) * radius;
    const targetZ = Math.sin(angle) * radius;
    const lerp = 0.14;
    orbRef.current.position.x += (targetX - orbRef.current.position.x) * lerp;
    orbRef.current.position.z += (targetZ - orbRef.current.position.z) * lerp;
    orbRef.current.position.y += (yWobble - orbRef.current.position.y) * lerp;

    const targetScale = isSigning ? 1.6 : isSelected ? 1.3 : hovered ? 1.15 : 1.0;
    const cur = orbRef.current.scale.x;
    orbRef.current.scale.setScalar(cur + (targetScale - cur) * 0.12);

    if (haloRef.current) {
      haloRef.current.position.copy(orbRef.current.position);
      const targetHalo = isSigning
        ? 2.4 + Math.sin(t * 6) * 0.4
        : isSelected
          ? 1.9
          : hovered
            ? 1.55
            : 1.35;
      const curH = haloRef.current.scale.x;
      haloRef.current.scale.setScalar(curH + (targetHalo - curH) * 0.12);
    }
  });

  return (
    <>
      {/* Soft chromatic halo — wider, low-alpha, no depth write. */}
      <mesh ref={haloRef} renderOrder={-1}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshBasicMaterial
          color={chain.color}
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>
      {/* The orb itself — tappable. */}
      <mesh
        ref={orbRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          if (typeof document !== 'undefined') document.body.style.cursor = '';
        }}
      >
        <sphereGeometry args={[0.07, 28, 28]} />
        <meshStandardMaterial
          color={chain.color}
          emissive={chain.color}
          emissiveIntensity={isSigning ? 4.5 : isSelected ? 3 : 2}
          transparent
          opacity={0.95}
        />
      </mesh>
    </>
  );
}

/**
 * Quorum orbit — small particles representing the Ika MPC quorum.
 *
 * - Idle: particles drift at a wide outer radius with low opacity.
 * - Active (signing): particles spiral inward through the prism in the active
 *   chain's color, fading as they reach the center, then loop. Reads as a
 *   constant vote in flight.
 */
function QuorumOrbit({ active, color }: { active: boolean; color: string }) {
  const COUNT = 32;
  const groupRef = useRef<THREE.Group>(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: COUNT }, () => ({
        angle: Math.random() * Math.PI * 2,
        tilt: (Math.random() - 0.5) * 1.4,
        speed: 0.4 + Math.random() * 0.5,
        phase: Math.random() * 4,
        ySway: 0.4 + Math.random() * 0.5,
      })),
    [],
  );

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    for (let i = 0; i < COUNT; i++) {
      const child = groupRef.current.children[i] as THREE.Mesh | undefined;
      if (!child) continue;
      const s = seeds[i];
      const angle = s.angle + t * s.speed;
      // phase loops 0..4. When active, particles spiral inward across the loop.
      const phase = (t * 0.6 + s.phase) % 4;
      const baseR = 1.7;
      const r = active ? baseR * Math.max(0.05, 1 - phase * 0.28) : baseR;
      const cosT = Math.cos(s.tilt);
      const sinT = Math.sin(s.tilt);
      child.position.x = Math.cos(angle) * cosT * r;
      child.position.y = Math.sin(angle) * s.ySway * r;
      child.position.z =
        Math.cos(angle) * sinT * r + Math.sin(angle * 1.3) * 0.25 * r;

      const mat = child.material as THREE.MeshBasicMaterial;
      mat.color.set(active ? color : '#cccccc');
      mat.opacity = active
        ? Math.max(0.05, 0.85 - phase * 0.18)
        : 0.22;
    }
  });

  return (
    <group ref={groupRef}>
      {seeds.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshBasicMaterial color="#cccccc" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export function PrismCore3D({
  chains,
  signingId = null,
  selectedId = null,
  onSelect,
  onPrismTap,
  className = '',
  ariaLabel = 'PRISM wallet — assets refract inside the prism. Tap a colored point to focus a chain; tap empty space to open command overview.',
}: PrismCoreProps) {
  const signingChain = chains.find((c) => c.id === signingId);
  const accent = signingChain?.color ?? '#a855f7';

  return (
    <div
      data-testid="prism-core-3d"
      className={`prism-core-3d relative aspect-square w-full select-none ${className}`}
      role="region"
      aria-label={ariaLabel}
    >
      <Canvas
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        camera={{ position: [0, 0, 4], fov: 45 }}
        onPointerMissed={() => onPrismTap?.()}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.28} />
          <pointLight position={[3, 3, 3]} intensity={1.2} color="#ffffff" />
          <pointLight position={[-3, -2, 3]} intensity={0.9} color="#a855f7" />
          <pointLight position={[2, -3, -2]} intensity={0.6} color="#f59e0b" />

          <Float speed={1.4} rotationIntensity={0.25} floatIntensity={0.25}>
            <PrismShape accelerated={signingId !== null} />
            {chains.map((c, i) => (
              <ChainSpirit
                key={c.id}
                chain={c}
                index={i}
                total={chains.length}
                isSelected={selectedId === c.id}
                isSigning={signingId === c.id}
                onSelect={() =>
                  onSelect?.(selectedId === c.id ? null : c.id)
                }
              />
            ))}
          </Float>

          <QuorumOrbit active={signingId !== null} color={accent} />
        </Suspense>
      </Canvas>
    </div>
  );
}
