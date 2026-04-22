import { useEffect } from 'react';

const TZ = 'America/Los_Angeles';

function seattleTimeFraction(): { hour: number; minute: number; hourFloat: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return { hour: h, minute: m, hourFloat: h + m / 60 };
}

/**
 * Circadian “refractive index” for PRISM: **Seattle (Pacific)** clock drives
 * `--prism-angle` (0–360° over the day) and `--refraction-opacity` (brighter
 * at solar peaks per the Colosseum / Frontier demo intent).
 */
export function usePrismDaylight(): void {
  useEffect(() => {
    const apply = () => {
      const { hourFloat } = seattleTimeFraction();
      // Full rotation over 24h — conic `from` tracks like a floor prism to the “sun”
      const angle = (hourFloat / 24) * 360;
      // Spec: dimmer at night, more brilliant at noon (cosine around hour 12, clamped)
      const refractionOpacity = Math.max(0.05, Math.abs(Math.cos(((hourFloat - 12) * Math.PI) / 12)) * 0.2);

      const root = document.documentElement;
      root.style.setProperty('--prism-angle', `${angle}deg`);
      root.style.setProperty('--refraction-opacity', String(refractionOpacity));
      // Back-compat for any rule still using the older name
      root.style.setProperty('--prism-light-angle', `${angle}deg`);
    };

    apply();
    const id = window.setInterval(apply, 60_000);
    return () => window.clearInterval(id);
  }, []);
}
