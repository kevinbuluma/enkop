import { clamp } from './rng';

/**
 * Frost dendrites as line segments with a normalised birth time (0..1). Branches grow inward from the
 * screen edges with hexagonal (60°) side branches, so drawing segments whose birth has passed makes the
 * frost visibly spread from the edges towards the centre.
 */
export type FrostSegment = { x1: number; y1: number; x2: number; y2: number; width: number; alpha: number; birth: number; level: 0 | 1 | 2 };

type Seed = { x: number; y: number; angle: number; length: number };

export type FrostOptions = {
  width: number;
  height: number;
  /** Distance between seeds along the edges, px. */
  spacing: number;
  /** Branch length for a seed at (x, y) on the edge, px. */
  reach: (x: number, y: number) => number;
  random: () => number;
  maxSegments?: number;
  /** Side-branch depth (0 = main stems only). */
  depth?: number;
};

function edgeSeeds({ width: w, height: h, spacing, reach, random }: FrostOptions): Seed[] {
  const seeds: Seed[] = [];
  const add = (x: number, y: number, inward: number) => {
    const length = reach(x, y);
    if (length > 4) seeds.push({ x, y, angle: inward + (random() - 0.5) * 1.0, length });
  };
  for (let x = random() * spacing; x < w; x += spacing * (0.7 + random() * 0.6)) { add(x, 0, Math.PI / 2); add(x, h, -Math.PI / 2); }
  for (let y = random() * spacing; y < h; y += spacing * (0.7 + random() * 0.6)) { add(0, y, 0); add(w, y, Math.PI); }
  // Corners freeze first and thickest.
  for (const [x, y, a] of [[0, 0, Math.PI / 4], [w, 0, (3 * Math.PI) / 4], [0, h, -Math.PI / 4], [w, h, (-3 * Math.PI) / 4]] as const) {
    for (let k = 0; k < 3; k++) add(x, y, a + (k - 1) * 0.35);
  }
  return seeds;
}

export function frostDendrites(opts: FrostOptions): FrostSegment[] {
  const { random, maxSegments = 9000, depth = 2 } = opts;
  const seeds = edgeSeeds(opts);
  const longest = Math.max(1, ...seeds.map(s => s.length));
  // Every seed gets a share of the budget, so long stems never starve the rest of the edge.
  const total = seeds.reduce((a, s) => a + s.length, 0) || 1;
  const out: FrostSegment[] = [];
  let budget = 0;
  // Feathery fern frost: a gently bending stem with short barbs at about 60°, barbs with tiny spikes.
  // Birth is distance travelled from the edge over the longest stem: one front for the whole screen.
  const grow = (x: number, y: number, angle: number, length: number, level: 0 | 1 | 2, travelled: number, delay: number) => {
    let cx = x, cy = y, a = angle, along = 0, bend = (random() - 0.5) * 0.05;
    const stepLen = level === 0 ? 5 + random() * 3 : level === 1 ? 3 + random() * 2 : 2;
    // Stems always grow to full length; the per-seed budget only limits barbs and spikes.
    while (along < length && (level === 0 || budget > 0)) {
      bend += (random() - 0.5) * 0.03;
      a += bend + (random() - 0.5) * (level === 0 ? 0.14 : 0.08);
      const nx = cx + Math.cos(a) * stepLen, ny = cy + Math.sin(a) * stepLen;
      const fade = 1 - along / length;
      out.push({
        x1: cx, y1: cy, x2: nx, y2: ny, level,
        width: level === 0 ? 0.55 + 0.75 * fade : level === 1 ? 0.45 : 0.35,
        alpha: (level === 0 ? 0.5 : level === 1 ? 0.36 : 0.26) * (0.5 + 0.5 * fade),
        birth: clamp(delay + ((travelled + along) / longest) * (1 - delay)),
      });
      budget--;
      along += stepLen;
      if (level < depth) {
        for (const side of [1, -1]) {
          if (random() > (level === 0 ? 0.72 : 0.3)) continue;
          const barb = level === 0 ? (5 + random() * 13) * (0.35 + 0.65 * fade) : 2 + random() * 3;
          grow(nx, ny, a + side * (Math.PI / 3 + (random() - 0.5) * 0.24), barb, (level + 1) as 1 | 2, travelled + along, delay);
        }
        // Now and then a stem forks.
        if (level === 0 && random() < 0.035) grow(nx, ny, a + (random() < 0.5 ? 1 : -1) * (Math.PI / 6 + random() * 0.2), (length - along) * 0.7, 0, travelled + along, delay);
      }
      cx = nx; cy = ny;
    }
  };
  for (const s of seeds) {
    budget = Math.max(12, Math.floor((maxSegments * s.length) / total));
    grow(s.x, s.y, s.angle, s.length, 0, 0, random() * 0.06);
  }
  return out.sort((a, b) => a.birth - b.birth);
}

/** Reach that is strongest at the corners and light along the middle of each edge (screen-edge frost). */
export function cornerReach(width: number, height: number, max: number) {
  return (x: number, y: number) => {
    const fx = Math.min(x, width - x) / (width / 2), fy = Math.min(y, height - y) / (height / 2);
    const corner = 1 - Math.min(1, Math.max(fx, fy));
    const edge = Math.max(1 - fx, 1 - fy);
    return max * (0.05 + 0.95 * Math.pow(Math.max(corner, edge * 0.25), 1.6));
  };
}

/** Reach that brings every edge to the centre (the full-screen freeze). */
export function centreReach(width: number, height: number) {
  return (x: number, y: number) => Math.hypot(width / 2 - x, height / 2 - y) * 1.04;
}
