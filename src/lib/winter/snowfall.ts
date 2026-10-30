import { clamp } from './rng';

/**
 * Organic winter wind: a slowly wandering base breeze, occasional gusts and storm/calm swings in snowfall
 * density. Time is in seconds; `x` is horizontal drift in px/s; `gust` is the 0..1 gust envelope.
 */
export class WinterWind {
  x = 0;
  gust = 0;
  /** Snowfall density multiplier (calmer and heavier periods). */
  density = 1;
  private t = 0;
  private nextGust: number;
  private gustStart = -1;
  private gustLength = 0;
  private gustSign = 1;

  constructor(private strength: number, private random: () => number = Math.random) {
    this.nextGust = 3 + random() * 6;
  }

  setStrength(strength: number) { this.strength = clamp(strength); }

  step(dt: number) {
    const t = (this.t += dt);
    const s = this.strength;
    // Mostly blowing one way, occasionally turning: the sign changes on a ~2 minute cycle.
    const base = s * 70 * (Math.sin(t * 0.052) * 0.75 + 0.4 + Math.sin(t * 0.31 + 1.3) * 0.18);
    if (this.gustStart < 0 && t >= this.nextGust && s > 0.05) {
      this.gustStart = t;
      this.gustLength = 2.2 + this.random() * 2.4;
      this.gustSign = this.random() < 0.82 ? 1 : -1;
    }
    let envelope = 0;
    if (this.gustStart >= 0) {
      const p = (t - this.gustStart) / this.gustLength;
      if (p >= 1) { this.gustStart = -1; this.nextGust = t + (6 + this.random() * 12) / (0.45 + s); }
      else envelope = Math.pow(Math.sin(Math.PI * p), 2);
    }
    this.gust = envelope;
    const direction = Math.sign(base) || 1;
    this.x = base + direction * this.gustSign * s * 280 * envelope;
    this.density = clamp(0.64 + 0.2 * Math.sin(t * 0.083) + 0.12 * Math.sin(t * 0.029 + 2) + 0.28 * envelope, 0.4, 1.15);
  }
}

export type FlakeLayer = 0 | 1 | 2 | 3;
export type Flake = {
  x: number; y: number; layer: FlakeLayer; size: number; vy: number; sway: number; swayRate: number; phase: number;
  spin: number; turn: number; push: number; alpha: number; crystal: boolean; active: boolean; tone: number;
};

// far, mid, near, foreground (large out-of-focus flakes passing close to the viewer)
const LAYERS: Record<FlakeLayer, { size: [number, number]; speed: [number, number]; wind: number; alpha: [number, number] }> = {
  0: { size: [0.7, 1.4], speed: [16, 30], wind: 0.35, alpha: [0.35, 0.6] },
  1: { size: [1.4, 2.6], speed: [34, 58], wind: 0.6, alpha: [0.55, 0.85] },
  2: { size: [2.6, 4.8], speed: [62, 105], wind: 0.85, alpha: [0.7, 0.95] },
  3: { size: [16, 36], speed: [150, 250], wind: 1.25, alpha: [0.28, 0.5] },
};
export const layerWind = (layer: FlakeLayer) => LAYERS[layer].wind;

export type Pointer = { x: number; y: number; vx: number; vy: number } | null;

/** Snow in depth layers driven by WinterWind; flakes beyond the current density rest until it rises again. */
export class Snowfall {
  flakes: Flake[] = [];
  readonly wind: WinterWind;
  private t = 0;

  constructor(private opts: { width: number; height: number; count: number; foreground: number; wind: number; random?: () => number }) {
    this.wind = new WinterWind(opts.wind, opts.random);
    this.populate();
  }

  private get random() { return this.opts.random ?? Math.random; }

  private layerFor(i: number, count: number): FlakeLayer {
    const f = i / Math.max(1, count);
    return f < 0.55 ? 0 : f < 0.87 ? 1 : 2;
  }

  private spawn(layer: FlakeLayer, anywhere: boolean): Flake {
    const r = this.random, L = LAYERS[layer], { width: w, height: h } = this.opts;
    const lerp = (range: [number, number]) => range[0] + r() * (range[1] - range[0]);
    // Spawn upwind so a strong breeze does not leave an empty band on one side.
    const upwind = this.wind.x * L.wind * (h / Math.max(1, L.speed[0]));
    const x = anywhere ? r() * w : -Math.min(w, Math.max(0, upwind)) + r() * (w + Math.abs(upwind));
    return {
      x, y: anywhere ? r() * h : -20 - r() * 60, layer, size: lerp(L.size), vy: lerp(L.speed), sway: 6 + r() * (layer === 3 ? 30 : 16),
      swayRate: 0.4 + r() * 0.9, phase: r() * Math.PI * 2, spin: (r() - 0.5) * 1.2, turn: r() * Math.PI, push: 0,
      alpha: lerp(L.alpha), crystal: layer === 2 && r() < 0.35, active: true, tone: 0,
    };
  }

  private populate() {
    const { count, foreground } = this.opts;
    this.flakes = Array.from({ length: count }, (_, i) => this.spawn(this.layerFor(i, count), true));
    for (let i = 0; i < foreground; i++) { const f = this.spawn(3, true); f.y = -40 - this.random() * this.opts.height * 2; this.flakes.push(f); }
  }

  resize(width: number, height: number, count = this.opts.count, foreground = this.opts.foreground) {
    const changed = count !== this.opts.count || foreground !== this.opts.foreground;
    const sx = width / Math.max(1, this.opts.width), sy = height / Math.max(1, this.opts.height);
    this.opts = { ...this.opts, width, height, count, foreground };
    if (changed) { this.populate(); return; }
    for (const f of this.flakes) { f.x *= sx; f.y *= sy; }
  }

  /** dt in milliseconds. */
  step(dtMs: number, pointer: Pointer = null) {
    const dt = Math.min(0.05, dtMs / 1000);
    this.t += dt;
    this.wind.step(dt);
    const { width: w, height: h, count } = this.opts;
    const live = Math.round(count * this.wind.density);
    const gustFall = 1 + this.wind.gust * 0.55;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i]!;
      const L = LAYERS[f.layer];
      if (pointer && f.layer > 0 && f.layer < 3) {
        const dx = f.x - pointer.x, dy = f.y - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < 130 * 130) {
          const d = Math.sqrt(d2) || 1, k = 1 - d / 130;
          // Pushed gently away from the cursor and carried a little by its movement.
          f.push += ((dx / d) * 160 * k + pointer.vx * 0.06 * k) * dt * 6;
          f.y += (dy / d) * 40 * k * dt;
        }
      }
      f.push *= Math.exp(-dt * 2.4);
      f.y += f.vy * gustFall * dt;
      f.x += (this.wind.x * L.wind + Math.sin(this.t * f.swayRate + f.phase) * f.sway + f.push) * dt;
      f.turn += f.spin * dt;
      const out = f.y > h + 30 || f.x < -80 || f.x > w + 80;
      if (out) {
        const index = f.layer === 3 ? -1 : i;
        const reborn = this.spawn(f.layer, false);
        if (f.layer !== 3 && f.y <= h + 30) { reborn.y = this.random() * h; reborn.x = this.wind.x >= 0 ? -20 : w + 20; }
        if (f.layer === 3) reborn.y = -40 - this.random() * h * 1.5;
        reborn.active = index < 0 || index < live;
        this.flakes[i] = reborn;
      } else if (!f.active && i < live && f.y < 0) {
        f.active = true;
      }
    }
  }
}
