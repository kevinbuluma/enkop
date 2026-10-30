import { clamp } from './rng';

/**
 * Frost dendrites as line segments with a normalised birth time (0..1). Branches grow inward from the
 * screen edges with hexagonal (60°) side branches, so drawing segments whose birth has passed makes the
 * frost visibly spread from the edges towards the centre.
 */
export type FrostSegment = { x1: number; y1: number; x2: number; y2: number; width: number; alpha: number; birth: number };

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
  const out: FrostSegment[] = [];
  // Birth is distance travelled from the edge over the longest branch: one front for the whole screen.
  const grow = (x: number, y: number, angle: number, length: number, level: number, travelled: number, delay: number) => {
    let step = 0, cx = x, cy = y, a = angle;
    const stepLen = level === 0 ? 11 + random() * 6 : 6 + random() * 4;
    while (step * stepLen < length && out.length < maxSegments) {
      a += (random() - 0.5) * (level === 0 ? 0.22 : 0.12);
      const nx = cx + Math.cos(a) * stepLen, ny = cy + Math.sin(a) * stepLen;
      const along = travelled + step * stepLen;
      const fade = 1 - (step * stepLen) / length;
      out.push({
        x1: cx, y1: cy, x2: nx, y2: ny,
        width: (level === 0 ? 0.7 + 1.1 * fade : level === 1 ? 0.45 + 0.5 * fade : 0.4),
        alpha: (level === 0 ? 0.42 : level === 1 ? 0.32 : 0.24) * (0.55 + 0.45 * fade),
        birth: clamp(delay + (along / longest) * (1 - delay)),
      });
      if (level < depth && step > 0 && random() < (level === 0 ? 0.62 : 0.45)) {
        const side = random() < 0.5 ? 1 : -1;
        const branchLen = (length - step * stepLen) * (level === 0 ? 0.32 + random() * 0.22 : 0.4 + random() * 0.3);
        grow(nx, ny, a + side * (Math.PI / 3 + (random() - 0.5) * 0.2), branchLen, level + 1, along, delay);
        if (random() < 0.4) grow(nx, ny, a - side * (Math.PI / 3 + (random() - 0.5) * 0.2), branchLen * 0.7, level + 1, along, delay);
      }
      cx = nx; cy = ny; step++;
    }
  };
  for (const s of seeds) grow(s.x, s.y, s.angle, s.length, 0, 0, random() * 0.06);
  return out.sort((a, b) => a.birth - b.birth);
}

/** Reach that is strongest at the corners and light along the middle of each edge (screen-edge frost). */
export function cornerReach(width: number, height: number, max: number) {
  return (x: number, y: number) => {
    const fx = Math.min(x, width - x) / (width / 2), fy = Math.min(y, height - y) / (height / 2);
    const corner = 1 - Math.min(1, Math.max(fx, fy));
    const edge = Math.max(1 - fx, 1 - fy);
    return max * (0.12 + 0.88 * Math.pow(Math.max(corner, edge * 0.25), 1.6));
  };
}

/** Reach that brings every edge to the centre (the full-screen freeze). */
export function centreReach(width: number, height: number) {
  return (x: number, y: number) => Math.hypot(width / 2 - x, height / 2 - y) * 1.04;
}
