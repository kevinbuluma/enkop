// Freeze-and-shatter page transition: frost grows from the screen edges to the centre, the page sits under
// thickening ice, cracks spread from an impact point, then the ice breaks into 3D shards carrying pieces of
// the frozen page and falls away to reveal the new page underneath.
import { centreReach, frostDendrites, type FrostSegment } from './frost';
import { crackPattern, shardPose, type CrackPattern, type Pt } from './ice-shatter';
import { flakeSprite, strokeFrost } from './textures';
import { clamp, seeded, smoothstep } from './rng';
import type { WinterStep } from './snowstorm-transition';

type Timing = { freezeMs: number; crackMs: number; shatterMs: number; rays: number; rings: number; split: number; dust: number };
type ShardView = { el: HTMLDivElement; glint: HTMLDivElement };
type Dust = { x: number; y: number; vx: number; vy: number; size: number; life: number };

let iceBase: { key: string; canvas: HTMLCanvasElement } | null = null;
let dustSprite: HTMLCanvasElement | null = null;

const layer = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

/** Thick translucent ice: uneven thickness, frozen imperfections and faint reflective streaks. */
function paintIce(w: number, h: number) {
  const c = layer(w, h), ctx = c.getContext('2d')!;
  const random = seeded(97);
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, 'rgba(232,242,252,0.62)'); g.addColorStop(0.5, 'rgba(214,230,247,0.52)'); g.addColorStop(1, 'rgba(198,216,240,0.6)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = random() * w, y = random() * h, r = 40 + random() * 180;
    const s = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = random() < 0.55;
    s.addColorStop(0, light ? 'rgba(248,252,255,0.32)' : 'rgba(150,178,215,0.16)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = s; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = random() * w, y = random() * h, len = 80 + random() * 260, a = -0.7 + (random() - 0.5) * 0.3;
    ctx.strokeStyle = `rgba(255,255,255,${(0.08 + random() * 0.14).toFixed(3)})`; ctx.lineWidth = 1 + random() * 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  for (let i = 0; i < w * h / 90; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(120,150,190,0.12)';
    ctx.fillRect(random() * w, random() * h, 1, 1);
  }
  return c;
}

const polygon = (points: Pt[]) => `polygon(${points.map(p => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(',')})`;

function traceTo(ctx: CanvasRenderingContext2D, points: Pt[], fraction: number) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  let left = total * fraction;
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length && left > 0; i++) {
    const a = points[i - 1]!, b = points[i]!, d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= left) { ctx.lineTo(b.x, b.y); left -= d; } else { const k = left / d; ctx.lineTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k); left = 0; }
  }
}

export class IceTransition {
  private start = performance.now();
  private last = this.start;
  private frozenAt = 0;
  private crackAt = 0;
  private shatterAt = 0;
  private drawn = 0;
  private segments: FrostSegment[];
  private acc: HTMLCanvasElement;
  private scratch: HTMLCanvasElement;
  private pattern: CrackPattern;
  private shards: ShardView[] = [];
  private dust: Dust[] = [];

  constructor(
    private ctx: CanvasRenderingContext2D, private canvas: HTMLCanvasElement, private host: HTMLDivElement, private outgoing: HTMLDivElement,
    private w: number, private h: number, private dpr: number, private timing: Timing, private maxHoldMs: number,
  ) {
    const random = seeded(Math.floor(Math.random() * 1e9));
    const mobile = w < 760;
    this.segments = frostDendrites({ width: w, height: h, spacing: mobile ? 58 : 44, reach: centreReach(w, h), random, maxSegments: mobile ? 3800 : 8500, depth: 2 });
    this.acc = layer(w * dpr, h * dpr);
    this.acc.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scratch = layer(w * dpr, h * dpr);
    this.pattern = crackPattern({ width: w, height: h, rays: timing.rays, rings: timing.rings, split: timing.split, random });
    const key = `${w}x${h}`;
    if (iceBase?.key !== key) iceBase = { key, canvas: paintIce(w, h) };
    dustSprite ??= flakeSprite(5, '245,250,255', 0.6);
  }

  /** Ice sheet masked to the freezing front (edges first), with the frost grown so far on top. */
  private drawIce(front: number) {
    const { ctx, w, h, dpr } = this;
    const sc = this.scratch.getContext('2d')!;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, this.scratch.width, this.scratch.height);
    sc.globalAlpha = 0.55 + 0.45 * front;
    sc.drawImage(iceBase!.canvas, 0, 0, this.scratch.width, this.scratch.height);
    sc.globalAlpha = 1;
    if (front < 1) {
      sc.globalCompositeOperation = 'destination-in';
      sc.setTransform(dpr * w / 2, 0, 0, dpr * h / 2, dpr * w / 2, dpr * h / 2);
      const inner = 1.45 * (1 - front) - 0.4;
      const g = sc.createRadialGradient(0, 0, 0, 0, 0, 1.45);
      g.addColorStop(clamp(inner / 1.45), 'rgba(0,0,0,0)');
      g.addColorStop(clamp((inner + 0.38) / 1.45), 'rgba(0,0,0,1)');
      sc.fillStyle = g; sc.fillRect(-1.5, -1.5, 3, 3);
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.scratch, 0, 0, w, h);
    ctx.drawImage(this.acc, 0, 0, w, h);
  }

  private growFrost(front: number) {
    let to = this.drawn;
    while (to < this.segments.length && this.segments[to]!.birth <= front) to++;
    if (to > this.drawn) { strokeFrost(this.acc.getContext('2d')!, this.segments, 1, this.drawn, to); this.drawn = to; }
  }

  private drawCracks(progress: number) {
    const { ctx } = this;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pass of [0, 1, 2]) {
      ctx.beginPath();
      for (const c of this.pattern.cracks) {
        const q = clamp((progress - c.start) / Math.max(0.01, c.end - c.start));
        if (q > 0) traceTo(ctx, c.points, q);
      }
      if (pass === 0) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 4; }
      else if (pass === 1) { ctx.strokeStyle = 'rgba(40,66,108,0.5)'; ctx.lineWidth = 1; ctx.translate(0.8, 0.9); }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.2; ctx.translate(-0.8, -0.9); }
      ctx.stroke();
    }
    // The ice briefly catches the light as the fractures run.
    const x = -0.4 * this.w + progress * 1.8 * this.w;
    const g = ctx.createLinearGradient(x - 160, 0, x + 160, this.h * 0.35);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h); ctx.restore();
  }

  /** Shards hold a copy of the frozen page; built hidden as the cracks start, so the break is immediate. */
  private buildShards() {
    const page = this.outgoing.firstElementChild;
    const fragment = document.createDocumentFragment();
    this.shards = this.pattern.shards.map(s => {
      const el = document.createElement('div');
      el.className = 'ice-shard';
      el.style.clipPath = polygon(s.points);
      el.style.transformOrigin = `${s.cx.toFixed(1)}px ${s.cy.toFixed(1)}px`;
      const holder = document.createElement('div');
      holder.className = 'ice-shard-page';
      if (page) holder.append(page.cloneNode(true));
      const glint = document.createElement('div');
      glint.className = 'ice-shard-glint';
      el.append(holder, glint);
      fragment.append(el);
      return { el, glint };
    });
    this.host.replaceChildren(fragment);
  }

  /** Copies each shard's piece of the ice (and its fresh edges) into the shard, then lets go of the page. */
  private shatter() {
    const { w, h, dpr } = this;
    this.pattern.shards.forEach((s, i) => {
      const view = this.shards[i];
      if (!view) return;
      const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
      const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
      const x1 = Math.min(w, Math.ceil(Math.max(...xs))), y1 = Math.min(h, Math.ceil(Math.max(...ys)));
      if (x1 <= x0 || y1 <= y0) return;
      const piece = layer((x1 - x0) * dpr, (y1 - y0) * dpr);
      piece.className = 'ice-shard-ice';
      Object.assign(piece.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
      const pc = piece.getContext('2d')!;
      pc.drawImage(this.canvas, x0 * dpr, y0 * dpr, (x1 - x0) * dpr, (y1 - y0) * dpr, 0, 0, piece.width, piece.height);
      pc.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
      pc.beginPath(); s.points.forEach((p, k) => (k ? pc.lineTo(p.x, p.y) : pc.moveTo(p.x, p.y))); pc.closePath();
      pc.strokeStyle = 'rgba(255,255,255,0.85)'; pc.lineWidth = 2.4; pc.stroke();
      pc.strokeStyle = 'rgba(48,74,118,0.35)'; pc.lineWidth = 1; pc.stroke();
      view.el.insertBefore(piece, view.glint);
    });
    this.host.dataset['phase'] = 'shatter';
    const random = Math.random;
    const { impact } = this.pattern;
    this.dust = Array.from({ length: this.timing.dust }, () => {
      const crack = this.pattern.cracks[Math.floor(random() * this.pattern.cracks.length)]!;
      const p = crack.points[Math.floor(random() * crack.points.length)]!;
      const dx = p.x - impact.x, dy = p.y - impact.y, d = Math.hypot(dx, dy) || 1, v = 120 + random() * 520;
      return { x: p.x, y: p.y, vx: (dx / d) * v + (random() - 0.5) * 120, vy: (dy / d) * v - 160 * random(), size: 1.5 + random() * 4, life: 0.5 + random() * 0.6 };
    });
    this.outgoing.classList.remove('is-frozen');
  }

  frame(now: number, ready: boolean): WinterStep {
    const t = now - this.start;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const { freezeMs, crackMs, shatterMs } = this.timing;
    if (!this.shatterAt) {
      if (!this.crackAt) {
        const front = clamp(t / freezeMs);
        this.growFrost(front);
        this.drawIce(smoothstep(0, 1, front));
        if (front > 0.4) this.outgoing.classList.add('is-frozen');
        if (front === 1) {
          this.frozenAt ||= now;
          if (ready || now - this.frozenAt > this.maxHoldMs) { this.crackAt = now; this.buildShards(); }
        }
        return { dropOutgoing: false, done: false };
      }
      const c = clamp((now - this.crackAt) / crackMs);
      this.drawIce(1);
      this.drawCracks(c);
      if (c < 1) return { dropOutgoing: false, done: false };
      this.shatter();
      this.shatterAt = now;
      this.ctx.clearRect(0, 0, this.w, this.h);
      return { dropOutgoing: true, done: false };
    }
    const life = shatterMs / 1000, st = (now - this.shatterAt) / 1000;
    this.pattern.shards.forEach((s, i) => {
      const view = this.shards[i];
      if (!view) return;
      const p = shardPose(s, st, life);
      view.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,${p.z.toFixed(1)}px) rotateX(${p.rx.toFixed(3)}rad) rotateY(${p.ry.toFixed(3)}rad) rotateZ(${p.rz.toFixed(3)}rad)`;
      view.el.style.opacity = p.opacity.toFixed(3);
      view.glint.style.opacity = (p.glint * 0.8).toFixed(3);
    });
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    for (const d of this.dust) {
      if (st > d.life) continue;
      d.vy += 1300 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      ctx.globalAlpha = 1 - st / d.life;
      ctx.drawImage(dustSprite!, d.x - d.size, d.y - d.size, d.size * 2, d.size * 2);
    }
    ctx.globalAlpha = 1;
    return { dropOutgoing: false, done: st >= life };
  }

  dispose() {
    this.host.replaceChildren();
    delete this.host.dataset['phase'];
    this.outgoing.classList.remove('is-frozen');
  }
}
