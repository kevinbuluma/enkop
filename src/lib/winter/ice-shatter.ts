import { clamp } from './rng';

// Crack network and ice shards for the freeze-and-shatter transition. Pure geometry so it is unit-tested.

export type Pt = { x: number; y: number };
export type Crack = { points: Pt[]; start: number; end: number; width: number };
export type Shard = {
  points: Pt[]; cx: number; cy: number;
  /** 0 at the impact, 1 at the farthest shard. */
  distance: number;
  vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; delay: number;
};
export type CrackPattern = { impact: Pt; cracks: Crack[]; shards: Shard[] };

/** A jagged polyline from a to b (a and b are kept exactly, so neighbouring shards share edges). */
function jagged(a: Pt, b: Pt, random: () => number, pieces: number): Pt[] {
  const out = [a];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 1; i < pieces; i++) {
    const t = i / pieces + (random() - 0.5) * (0.5 / pieces);
    const off = (random() - 0.5) * Math.min(26, len * 0.07);
    out.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  out.push(b);
  return out;
}

export function polygonArea(points: Pt[]) {
  let s = 0;
  for (let i = 0; i < points.length; i++) { const p = points[i]!, q = points[(i + 1) % points.length]!; s += p.x * q.y - q.x * p.y; }
  return Math.abs(s) / 2;
}

const centroid = (points: Pt[]) => {
  const n = points.length;
  return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
};

export function crackPattern(opts: { width: number; height: number; rays: number; rings: number; split: number; random: () => number; impact?: Pt }): CrackPattern {
  const { width: w, height: h, random } = opts;
  const rays = Math.max(4, opts.rays), rings = Math.max(1, opts.rings);
  const impact = opts.impact ?? { x: w * (0.4 + random() * 0.2), y: h * (0.38 + random() * 0.2) };
  // Far enough that the outer ring lies beyond every screen corner.
  const R = Math.hypot(Math.max(impact.x, w - impact.x), Math.max(impact.y, h - impact.y)) * 1.12;
  const angles = Array.from({ length: rays }, (_, i) => (i / rays) * Math.PI * 2 + (random() - 0.5) * (Math.PI / rays) * 0.9 + 0.3);
  // vertex[k][i]: ring k (0 = impact) on ray i. Inner rings are closer together, like real impact cracks.
  const radius = (k: number) => (k === rings ? R : R * Math.pow(k / rings, 1.35) * 0.78);
  const vertex: Pt[][] = [];
  for (let k = 0; k <= rings; k++) {
    vertex.push(angles.map(a => {
      if (k === 0) return impact;
      const r = radius(k) * (k === rings ? 1 : 0.86 + random() * 0.28);
      return { x: impact.x + Math.cos(a) * r, y: impact.y + Math.sin(a) * r };
    }));
  }
  const pieces = (a: Pt, b: Pt) => Math.max(2, Math.min(7, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 70)));
  // Shared edges: radial[k][i] from ring k to k+1 on ray i; ring[k][i] from ray i to i+1 on ring k (k >= 1).
  const radial = vertex.slice(0, rings).map((row, k) => row.map((p, i) => jagged(p, vertex[k + 1]![i]!, random, pieces(p, vertex[k + 1]![i]!))));
  const ring = vertex.map((row, k) => k === 0 ? [] : row.map((p, i) => { const q = row[(i + 1) % rays]!; return k === rings ? [p, q] : jagged(p, q, random, pieces(p, q)); }));
  const cracks: Crack[] = [];
  for (let k = 0; k < rings; k++) for (let i = 0; i < rays; i++) {
    cracks.push({ points: radial[k]![i]!, start: (k / rings) * 0.55, end: ((k + 1) / rings) * 0.55 + 0.1, width: k === 0 ? 1.6 : 1.1 });
  }
  for (let k = 1; k < rings; k++) for (let i = 0; i < rays; i++) {
    const start = 0.25 + (k / rings) * 0.5 + random() * 0.08;
    cracks.push({ points: ring[k]![i]!, start, end: Math.min(1, start + 0.22), width: 0.9 });
  }
  const shards: Shard[] = [];
  const maxD = Math.hypot(w, h);
  const addShard = (points: Pt[]) => {
    const c = centroid(points);
    // Skip cells entirely off-screen.
    if (!points.some(p => p.x > -2 && p.x < w + 2 && p.y > -2 && p.y < h + 2) && !(c.x > 0 && c.x < w && c.y > 0 && c.y < h)) {
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      if (Math.max(...xs) < 0 || Math.min(...xs) > w || Math.max(...ys) < 0 || Math.min(...ys) > h) return;
    }
    const dx = c.x - impact.x, dy = c.y - impact.y, d = Math.hypot(dx, dy) || 1;
    const distance = clamp(d / maxD);
    const speed = 260 + random() * 360 + (1 - distance) * 220;
    const spin = () => (random() < 0.5 ? -1 : 1) * (1.4 + random() * 2.6);
    shards.push({
      points, cx: c.x, cy: c.y, distance,
      vx: (dx / d) * speed, vy: (dy / d) * speed - 140 - random() * 160, vz: 260 + random() * 520,
      rx: spin(), ry: spin(), rz: (random() - 0.5) * 3.2, delay: distance * 0.16 + random() * 0.05,
    });
  };
  const reverse = (p: Pt[]) => [...p].reverse();
  for (let k = 0; k < rings; k++) for (let i = 0; i < rays; i++) {
    const j = (i + 1) % rays;
    const left = radial[k]![i]!, right = radial[k]![j]!;
    const outer = ring[k + 1]![i]!;
    const inner = k === 0 ? [] : ring[k]![i]!;
    // Boundary: inner ring i→j, right radial outwards, outer ring j→i, left radial inwards.
    const cell = k === 0
      ? [...left, ...outer.slice(1), ...reverse(right).slice(1, -1)]
      : [...inner, ...right.slice(1), ...reverse(outer).slice(1), ...reverse(left).slice(1, -1)];
    if (k > 0 && random() < opts.split) {
      // Split along the diagonal from inner-left to outer-right.
      const a = inner.length - 1 + right.length - 1; // index of the outer-right vertex in `cell`
      addShard(cell.slice(0, a + 1));
      addShard([...cell.slice(a), cell[0]!]);
    } else addShard(cell);
  }
  return { impact, cracks, shards };
}

/** Shard transform `t` seconds after the shatter began; `life` is the shatter duration in seconds. */
export function shardPose(s: Shard, t: number, life: number) {
  const local = Math.max(0, t - s.delay * life);
  const gravity = 1500;
  const p = clamp(local / Math.max(0.1, life * (1 - s.delay)));
  return {
    x: s.vx * local, y: s.vy * local + 0.5 * gravity * local * local, z: Math.min(900, s.vz * local),
    rx: s.rx * local, ry: s.ry * local, rz: s.rz * local,
    opacity: 1 - Math.pow(Math.max(0, (p - 0.45) / 0.55), 1.4),
    glint: Math.pow(Math.abs(Math.sin(s.rx * local + s.ry * local * 0.6)), 6),
  };
}
