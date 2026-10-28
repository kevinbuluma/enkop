// WaterDropletSystem: physically inspired water on a window pane (CSS pixels, milliseconds).
// Drops land at irregular intervals, condense and grow, and once heavy enough slide under gravity with
// stick-slip friction, shedding small droplets and a wet trail. Touching drops merge (water is conserved),
// fast heavy drops occasionally split, and drops leaving the bottom edge may splash. Drops never settle on
// "quiet" zones (text, prices, forms, controls): they fade there instead.
import { seeded } from './lightning';
import type { ZoneKind } from './scene-zones';

export type Drop = {
  x: number; y: number; r: number; vx: number; vy: number;
  moving: boolean; stuck: number; alpha: number; fading: boolean;
  trailIn: number; shape: number; phase: number; lastX: number; lastY: number;
};
export type Splash = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number };
export type TrailSegment = { x1: number; y1: number; x2: number; y2: number; w: number };
export type DropletOptions = {
  width: number; height: number;
  /** 0..1 storm level (density and spawn rate). */
  density: number;
  seed?: number;
  zoneAt?: (x: number, y: number) => ZoneKind;
  maxDrops?: number;
};

export const SLIDE_RADIUS = 6.2;
const GRAVITY = 0.0009;
const CELL = 22;

export class WaterDropletSystem {
  drops: Drop[] = [];
  splashes: Splash[] = [];
  /** New wet-trail segments since the last drain (the renderer paints and fades them). */
  trail: TrailSegment[] = [];
  width: number; height: number; density: number; maxDrops: number;
  zoneAt: (x: number, y: number) => ZoneKind;
  private rand: () => number;
  private spawnDebt = 0;
  private burstMs = 0;

  constructor(o: DropletOptions) {
    this.width = o.width; this.height = o.height; this.density = o.density;
    this.maxDrops = o.maxDrops ?? Math.round(160 + (o.width * o.height) / 4200);
    this.rand = seeded(o.seed ?? Math.random());
    this.zoneAt = o.zoneAt ?? (() => 'light');
  }

  resize(width: number, height: number) {
    this.width = width; this.height = height;
    this.drops = this.drops.filter((d) => d.x > -20 && d.x < width + 20 && d.y < height + 20);
  }

  /** Extra droplets for a moment, e.g. as clouds part over a newly revealed page. */
  burst(ms: number) { this.burstMs = Math.max(this.burstMs, ms); }

  /** Lays down a still scene (used for reduced motion: no movement, just water on the glass). */
  seedStill(count: number) {
    for (let i = 0; i < count; i++) this.spawn(true);
  }

  private makeDrop(x: number, y: number, r: number): Drop {
    return { x, y, r, vx: 0, vy: 0, moving: false, stuck: 0, alpha: 1, fading: false, trailIn: 6 + this.rand() * 10, shape: this.rand(), phase: this.rand() * Math.PI * 2, lastX: x, lastY: y };
  }

  private spawn(still = false) {
    if (this.drops.length >= this.maxDrops) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      const x = this.rand() * this.width, y = this.rand() * this.height * (still ? 1 : 0.96);
      const zone = this.zoneAt(x, y);
      if (zone === 'quiet') continue;
      // Imagery and dark surfaces collect a little more water than plain light surfaces.
      if (zone === 'light' && this.rand() < 0.45) continue;
      const roll = this.rand();
      const r = roll < 0.7 ? 0.8 + this.rand() * 1.4 : roll < 0.95 ? 2.5 + this.rand() * 3 : 6 + this.rand() * 3.5;
      this.drops.push(this.makeDrop(x, y, still ? Math.min(r, SLIDE_RADIUS - 0.5) : r));
      return;
    }
  }

  step(dt: number) {
    dt = Math.min(dt, 50);
    const rand = this.rand;
    // Rain landing on the glass: irregular, scaled to the pane's area and the storm level.
    const rate = this.density * (this.width * this.height) / 1e6 * 22 * (this.burstMs > 0 ? 2.6 : 1);
    this.burstMs = Math.max(0, this.burstMs - dt);
    this.spawnDebt += rate * dt / 1000 * (0.5 + rand());
    while (this.spawnDebt >= 1) { this.spawn(); this.spawnDebt -= 1; }

    const born: Drop[] = [];
    for (const d of this.drops) {
      d.lastX = d.x; d.lastY = d.y;
      const zone = this.zoneAt(d.x, d.y);
      if (!d.moving) {
        if (zone === 'quiet') d.fading = true;
        // Condensation: still drops slowly gather water until gravity wins.
        if (d.r < SLIDE_RADIUS + 1) d.r += dt * 0.00011 * (0.5 + d.shape);
        if (d.r > SLIDE_RADIUS) { d.moving = true; d.vy = 0.01; }
      } else {
        if (d.stuck > 0) {
          d.stuck -= dt; d.vy *= 0.85;
        } else {
          const drive = GRAVITY * Math.max(0, d.r - SLIDE_RADIUS * 0.8) / d.r;
          d.vy = Math.min(d.vy + drive * dt, 0.05 + d.r * 0.03);
          // Stick-slip on the glass: brief holds, then a fresh run.
          if (rand() < dt * 0.0007) d.stuck = 60 + rand() * 340;
        }
        d.phase += dt * 0.004;
        d.vx = Math.sin(d.phase + d.y * 0.02) * 0.018 * d.vy + (rand() - 0.5) * 0.004;
        d.x += d.vx * dt; d.y += d.vy * dt;
        // Shed droplets and a wet trail while moving.
        d.trailIn -= Math.hypot(d.x - d.lastX, d.y - d.lastY);
        if (d.trailIn <= 0 && d.r > 3) {
          const child = (0.6 + rand() * 1.3) * Math.min(1, d.r / 9);
          d.r = Math.sqrt(Math.max(0, d.r * d.r - child * child * 0.35));
          d.trailIn = 7 + rand() * 12;
          const cx = d.x + (rand() - 0.5) * d.r * 0.5, cy = d.y - d.r * 0.9;
          if (this.zoneAt(cx, cy) !== 'quiet') born.push(this.makeDrop(cx, cy, child));
        }
        this.trail.push({ x1: d.lastX, y1: d.lastY, x2: d.x, y2: d.y, w: Math.max(0.6, d.r * 0.32) });
        // Large fast drops sometimes split into two runs.
        if (d.r > 10 && d.vy > 0.22 && rand() < dt * 0.0004) {
          const half = d.r / Math.SQRT2;
          d.r = half;
          const twin = this.makeDrop(d.x + half * 1.6, d.y - half * 0.4, half);
          twin.moving = true; twin.vy = d.vy * 0.7; twin.phase = d.phase + 1.7;
          born.push(twin);
        }
        if (d.r < SLIDE_RADIUS * 0.7) { d.moving = false; d.vy = 0; }
      }
      // Moving water may pass over text, but faintly; still water fades away there.
      const target = d.fading ? 0 : d.moving && zone === 'quiet' ? 0.35 : 1;
      d.alpha += (target - d.alpha) * Math.min(1, dt / (d.fading ? 600 : 220));
    }
    if (born.length) this.drops.push(...born);
    this.merge();

    // Leave the pane: off the bottom (sometimes with a small splash) or fully faded.
    const keep: Drop[] = [];
    for (const d of this.drops) {
      if (d.y - d.r > this.height) { if (d.r > 4 && rand() < 0.5) this.splash(d.x, this.height - 2, 3 + Math.floor(rand() * 3), d.r * 0.18); continue; }
      if (d.fading && d.alpha < 0.03) continue;
      if (d.x < -30 || d.x > this.width + 30) continue;
      keep.push(d);
    }
    this.drops = keep.length > this.maxDrops * 1.25 ? keep.slice(keep.length - Math.round(this.maxDrops * 1.25)) : keep;

    for (const s of this.splashes) { s.life += dt; s.vy += 0.0006 * dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    this.splashes = this.splashes.filter((s) => s.life < s.max);
  }

  private splash(x: number, y: number, n: number, size: number) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (this.rand() - 0.5) * 2.2;
      const v = 0.05 + this.rand() * 0.09;
      this.splashes.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 180 + this.rand() * 220, r: Math.max(0.5, size * (0.5 + this.rand())) });
    }
  }

  /** Touching drops coalesce into one (area, i.e. water, is conserved), pulled toward the larger. */
  private merge() {
    const grid = new Map<number, Drop[]>();
    const key = (cx: number, cy: number) => cx * 100003 + cy;
    for (const d of this.drops) {
      const k = key(Math.floor(d.x / CELL), Math.floor(d.y / CELL));
      const cell = grid.get(k); if (cell) cell.push(d); else grid.set(k, [d]);
    }
    const gone = new Set<Drop>();
    for (const a of this.drops) {
      if (gone.has(a)) continue;
      const cx = Math.floor(a.x / CELL), cy = Math.floor(a.y / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        for (const b of grid.get(key(cx + ox, cy + oy)) ?? []) {
          if (b === a || gone.has(b) || gone.has(a)) continue;
          const reach = (a.r + b.r) * 0.8;
          const dx = a.x - b.x, dy = a.y - b.y;
          if (dx * dx + dy * dy > reach * reach) continue;
          const [big, small] = a.r >= b.r ? [a, b] : [b, a];
          const area = big.r * big.r + small.r * small.r;
          const share = (small.r * small.r) / area;
          big.x += (small.x - big.x) * share; big.y += (small.y - big.y) * share;
          if (Math.abs(big.vy - small.vy) > 0.12) this.splash(big.x, big.y, 2, 0.35);
          big.r = Math.sqrt(area);
          big.vy = Math.max(big.vy, small.vy) * 0.9 + 0.01;
          if (big.r > SLIDE_RADIUS) big.moving = true;
          big.fading = big.fading && small.fading;
          gone.add(small);
        }
      }
    }
    if (gone.size) this.drops = this.drops.filter((d) => !gone.has(d));
  }

  /** Total water on the pane (sum of drop areas, in r² units); merging leaves it unchanged. */
  water() { return this.drops.reduce((s, d) => s + d.r * d.r, 0); }
}
