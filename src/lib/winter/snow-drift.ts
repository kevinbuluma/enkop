import { clamp, easeIn, easeOut, smoothstep } from './rng';

/**
 * Snow clumps for the blizzard transition. Clumps nearest the screen edges land first, so the snow piles up
 * from the edges across the screen; the wind then reverses and clears them from the right-hand side.
 */
export type Clump = { x: number; y: number; size: number; variant: number; depth: 0 | 1 | 2; arrive: number; leave: number; spin: number };

export const APPROACH = 0.24;
export const DEPART = 0.38;

export function driftLayout(opts: { width: number; height: number; random: () => number; variants: number }): Clump[] {
  const { width: w, height: h, random } = opts;
  const spacing = clamp(w / 11, 64, 130);
  const half = Math.min(w, h) / 2;
  const clumps: Clump[] = [];
  const place = (x: number, y: number, size: number, depth: 0 | 1 | 2) => {
    // Distance to the nearest edge; the bottom edge collects drifts sooner.
    const edge = Math.min(x, w - x, y, (h - y) * 0.6) / half;
    const arrive = clamp(0.06 + clamp(edge) * 0.7 + random() * 0.12 + depth * 0.03, 0.04, 0.94);
    const leave = clamp((1 - x / w) * 0.5 + random() * 0.14 + (depth === 2 ? 0 : 0.06), 0, 1 - DEPART);
    clumps.push({ x, y, size, variant: Math.floor(random() * opts.variants), depth, arrive, leave, spin: (random() - 0.5) * 1.2 });
  };
  const cols = Math.ceil(w / spacing) + 1, rows = Math.ceil(h / spacing) + 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + (r % 2) * 0.5) * spacing + (random() - 0.5) * spacing * 0.5;
    const y = r * spacing + (random() - 0.5) * spacing * 0.5;
    place(x, y, spacing * (2 + random() * 0.7), 0);
    if (random() < 0.55) place(x + (random() - 0.5) * spacing, y + (random() - 0.5) * spacing, spacing * (1.1 + random() * 0.5), random() < 0.5 ? 1 : 2);
  }
  return clumps.sort((a, b) => a.depth - b.depth);
}

/** Position, scale and opacity of a clump at cover progress `cover` and reveal progress `reveal` (0..1). */
export function clumpPose(c: Clump, cover: number, reveal: number, width: number, height: number) {
  if (reveal > 0) {
    const l = clamp((reveal - c.leave) / DEPART);
    const e = easeIn(l);
    return { x: c.x - e * (width * 0.95 + c.size), y: c.y - l * l * height * 0.22 * (c.depth + 1) / 3, scale: 1 - 0.5 * l, alpha: 1 - Math.pow(l, 1.6), turn: c.spin * l };
  }
  const a = clamp((cover - (c.arrive - APPROACH)) / APPROACH);
  if (a <= 0) return { x: c.x, y: c.y, scale: 0, alpha: 0, turn: 0 };
  const e = easeOut(a);
  return { x: c.x - (1 - e) * (width * 0.6 + c.size), y: c.y - (1 - e) * height * 0.06, scale: 0.55 + 0.45 * e, alpha: Math.min(1, a * 3), turn: c.spin * (1 - e) };
}

/** Opacity of the packed-snow field that closes the last gaps between clumps. */
export const packedSnow = (cover: number, reveal: number) => (reveal > 0 ? 1 - smoothstep(0, 0.28, reveal) : smoothstep(0.55, 0.92, cover));
