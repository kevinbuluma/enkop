// Blizzard page transition: a gust drives powder and heavy snow across the screen, snow piles up from the
// edges until the old page is buried, then the wind turns and blows it away to reveal the new page.
import { clumpPose, driftLayout, packedSnow, type Clump } from './snow-drift';
import { flakeSprite, snowClumps, snowField } from './textures';
import { clamp, seeded } from './rng';

export type WinterStep = { dropOutgoing: boolean; done: boolean };
type Powder = { x: number; y: number; speed: number; len: number; size: number; alpha: number; grey: boolean; phase: number };

let clumpSprites: HTMLCanvasElement[] | null = null;
let powderWhite: HTMLCanvasElement | null = null;
let powderGrey: HTMLCanvasElement | null = null;
let field: { key: string; canvas: HTMLCanvasElement } | null = null;

/** Paints the reusable sprites ahead of the first winter navigation. */
export function prepareSnowstorm() {
  clumpSprites ??= snowClumps(5, 256);
  powderWhite ??= flakeSprite(8, '255,255,255', 0.9);
  powderGrey ??= flakeSprite(8, '150,166,194', 0.9);
}

export class SnowstormTransition {
  private clumps: Clump[];
  private powder: Powder[];
  private start = performance.now();
  private last = this.start;
  private release = 0;
  private dropped = false;
  private wind = 1;

  constructor(private ctx: CanvasRenderingContext2D, private w: number, private h: number, private timing: { coverMs: number; revealMs: number; powder: number }, private maxHoldMs: number) {
    prepareSnowstorm();
    const random = seeded(Math.floor(Math.random() * 1e9));
    this.clumps = driftLayout({ width: w, height: h, random, variants: clumpSprites!.length });
    const key = `${w}x${h}`;
    if (field?.key !== key) field = { key, canvas: snowField(w, h) };
    this.powder = Array.from({ length: timing.powder }, () => ({
      x: random() * w, y: random() * h, speed: 900 + random() * 1300, len: 18 + random() * 70, size: 1.5 + random() * 4,
      alpha: 0.35 + random() * 0.55, grey: random() < 0.45, phase: random() * Math.PI * 2,
    }));
  }

  frame(now: number, ready: boolean): WinterStep {
    const { ctx, w, h, timing } = this;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const t = now - this.start;
    const cover = clamp(t / timing.coverMs);
    if (!this.release && cover === 1 && (ready || t - timing.coverMs > this.maxHoldMs)) this.release = now;
    const reveal = this.release ? clamp((now - this.release) / timing.revealMs) : 0;
    let dropOutgoing = false;
    if (this.release && !this.dropped) { this.dropped = true; dropOutgoing = true; }
    // The wind turns gradually at the start of the reveal.
    const targetWind = this.release ? -1 : 1;
    this.wind += (targetWind - this.wind) * Math.min(1, dt * (this.release ? 5 : 8));

    ctx.clearRect(0, 0, w, h);
    const packed = packedSnow(cover, reveal);
    if (packed > 0 && field) { ctx.globalAlpha = packed; ctx.drawImage(field.canvas, 0, 0, w, h); }
    const sprites = clumpSprites!;
    for (const c of this.clumps) {
      const pose = clumpPose(c, cover, reveal, w, h);
      if (pose.alpha <= 0.01 || pose.scale <= 0) continue;
      const s = c.size * pose.scale;
      ctx.globalAlpha = pose.alpha;
      if (pose.turn) {
        ctx.save(); ctx.translate(pose.x, pose.y); ctx.rotate(pose.turn);
        ctx.drawImage(sprites[c.variant]!, -s / 2, -s / 2, s, s); ctx.restore();
      } else ctx.drawImage(sprites[c.variant]!, pose.x - s / 2, pose.y - s / 2, s, s);
    }
    // Wind-driven powder: thickening through the gust, a burst as the snow is blown away, then thinning.
    const density = this.release ? Math.max(0, 1 - reveal * 1.15) : 0.25 + 0.75 * Math.min(1, cover * 1.6);
    const live = Math.round(this.powder.length * density);
    for (let i = 0; i < live; i++) {
      const p = this.powder[i]!;
      p.x += this.wind * p.speed * dt;
      p.y += Math.sin(t / 260 + p.phase) * 40 * dt + 30 * dt;
      if (p.x > w + p.len) { p.x = -p.len; p.y = Math.random() * h; }
      if (p.x < -p.len * 2) { p.x = w + p.len; p.y = Math.random() * h; }
      if (p.y > h + 10) p.y = -10;
      const stretch = p.len * Math.abs(this.wind);
      ctx.globalAlpha = p.alpha * (0.6 + 0.4 * density);
      ctx.drawImage(p.grey && !this.release ? powderGrey! : powderWhite!, p.x - (this.wind > 0 ? stretch : 0), p.y - p.size / 2, stretch + p.size, p.size);
    }
    ctx.globalAlpha = 1;
    return { dropOutgoing, done: reveal >= 1 };
  }
}
