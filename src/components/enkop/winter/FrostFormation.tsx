import { useEffect, useRef } from 'react';
import { cornerReach, frostDendrites } from '@/lib/winter/frost';
import { seeded } from '@/lib/winter/rng';
import { strokeFrost } from '@/lib/winter/textures';
import type { WinterProfile } from '@/lib/winter/settings';

const GROW_MS = 16000;

/**
 * Frost forming on the "glass" of the screen: crystals creep in from the corners and edges over the first
 * seconds of a visit, heaviest in the corners and light along the edges, then stay. Frost sits below the
 * header and never reaches the middle of the screen, so text and controls stay readable.
 */
export function FrostFormation({ profile, visible }: { profile: WinterProfile; visible: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || profile.frost <= 0.05) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let raf = 0, start = performance.now(), drawn = 0;
    let segments: ReturnType<typeof frostDendrites> = [];
    const strength = 0.5 + profile.frost * 0.55;
    const build = (grown: boolean) => {
      const w = innerWidth, h = innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const max = Math.min(w, h) * (profile.device === 'mobile' ? 0.13 : 0.18) * (0.45 + profile.frost * 0.75);
      segments = frostDendrites({ width: w, height: h, spacing: profile.device === 'mobile' ? 44 : 32, reach: cornerReach(w, h, max), random: seeded(5), maxSegments: profile.device === 'mobile' ? 2600 : 5200, depth: 2 });
      drawn = 0;
      if (grown) { strokeFrost(ctx, segments, strength); drawn = segments.length; }
    };
    const grow = (now: number) => {
      const front = Math.min(1, (now - start) / GROW_MS);
      // Front eases out: fast first crystals, slower creeping edges.
      const eased = 1 - Math.pow(1 - front, 2.2);
      let to = drawn;
      while (to < segments.length && segments[to]!.birth <= eased) to++;
      if (to > drawn) { strokeFrost(ctx, segments, strength, drawn, to); drawn = to; }
      raf = front < 1 && !document.hidden ? requestAnimationFrame(grow) : 0;
    };
    const wake = () => { if (!raf && !document.hidden && drawn < segments.length) raf = requestAnimationFrame(grow); };
    build(profile.calm);
    if (!profile.calm) { start = performance.now(); wake(); }
    let resizeTimer = 0;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(() => { cancelAnimationFrame(raf); raf = 0; build(true); }, 200); };
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', wake);
    return () => { cancelAnimationFrame(raf); clearTimeout(resizeTimer); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', wake); };
  }, [profile]);
  return <>
    <div className={`winter-frost-haze ${visible ? 'is-on' : ''}`} aria-hidden="true" />
    <canvas ref={ref} className={`winter-frost-edge ${visible ? 'is-on' : ''}`} aria-hidden="true" />
  </>;
}
