// Procedural winter textures, painted once in the browser: frost tiles, settled snow caps, icicles, snow
// clumps and flake sprites. Nothing here runs during SSR; callers only use it from effects.
import { frostDendrites } from './frost';
import { seeded } from './rng';

const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

/** Fine grain inside whatever is already painted (source-atop), for snow and ice surfaces. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, random: () => number, count: number, dark: string, light: string) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = random() < 0.55 ? dark : light;
    const s = random() < 0.9 ? 0.8 : 1.6;
    ctx.fillRect(random() * w, random() * h, s, s);
  }
  ctx.restore();
}

function sparkles(ctx: CanvasRenderingContext2D, w: number, h: number, random: () => number, count: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < count; i++) {
    const x = random() * w, y = random() * h, r = 0.6 + random() * 1.1;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
  ctx.restore();
}

/** Strokes frost segments with a faint dark relief line under a bright crystalline line. */
export function strokeFrost(ctx: CanvasRenderingContext2D, segments: { x1: number; y1: number; x2: number; y2: number; width: number; alpha: number }[], strength = 1, from = 0, to = segments.length) {
  ctx.lineCap = 'round';
  for (let i = from; i < to; i++) {
    const s = segments[i]!;
    ctx.globalAlpha = Math.min(1, s.alpha * strength * 0.55);
    ctx.strokeStyle = 'rgb(70,96,140)';
    ctx.lineWidth = s.width + 0.6;
    ctx.beginPath(); ctx.moveTo(s.x1 + 0.7, s.y1 + 0.9); ctx.lineTo(s.x2 + 0.7, s.y2 + 0.9); ctx.stroke();
    ctx.globalAlpha = Math.min(1, s.alpha * strength * 1.6);
    ctx.strokeStyle = 'rgb(240,246,255)';
    ctx.lineWidth = s.width;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A tileable frost texture: dendrites, small hexagonal crystals and frozen haze. */
export function frostTile(size = 384, seed = 7) {
  const c = canvas(size, size), ctx = c.getContext('2d')!;
  const random = seeded(seed);
  // Frozen haze blotches of varying thickness.
  for (let i = 0; i < 26; i++) {
    const x = random() * size, y = random() * size, r = 20 + random() * 70;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      const g = ctx.createRadialGradient(x + ox!, y + oy!, 0, x + ox!, y + oy!, r);
      g.addColorStop(0, `rgba(236,243,252,${(0.12 + random() * 0.16).toFixed(3)})`); g.addColorStop(1, 'rgba(236,243,252,0)');
      ctx.fillStyle = g; ctx.fillRect(x + ox! - r, y + oy! - r, r * 2, r * 2);
    }
  }
  // Branching crystals, drawn wrapped so the tile repeats seamlessly.
  const segments = frostDendrites({ width: size, height: size, spacing: 64, reach: () => size * (0.28 + random() * 0.3), random, maxSegments: 2400, depth: 2 });
  for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
    ctx.save(); ctx.translate(ox! * 0.5, oy! * 0.5);
    strokeFrost(ctx, segments, 0.85);
    ctx.restore();
  }
  // Tiny six-armed crystals.
  ctx.strokeStyle = 'rgba(245,250,255,0.75)'; ctx.lineWidth = 0.6;
  for (let i = 0; i < 70; i++) {
    const x = random() * size, y = random() * size, r = 1.5 + random() * 3.5;
    ctx.beginPath();
    for (let a = 0; a < 6; a++) { const t = (a * Math.PI) / 3 + random() * 0.1; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r); }
    ctx.stroke();
  }
  return c;
}

/** Settled snow seen side-on: soft lumpy top, shaded underside where it rests on the surface. Tiles on x. */
export function snowCap(width = 640, height = 56, seed = 3, heaviness = 1) {
  const c = canvas(width, height), ctx = c.getContext('2d')!;
  const random = seeded(seed);
  const waves = Array.from({ length: 5 }, (_, i) => ({ k: [2, 3, 5, 9, 17][i]!, a: (0.3 + random() * 0.7) / (i + 1), p: random() * Math.PI * 2 }));
  const top = (x: number) => {
    let v = 0;
    for (const w of waves) v += Math.sin((x / width) * Math.PI * 2 * w.k + w.p) * w.a;
    return height * (0.36 - 0.18 * heaviness * 0.5) + v * height * 0.1 * heaviness;
  };
  ctx.beginPath(); ctx.moveTo(0, height);
  for (let x = 0; x <= width; x += 4) ctx.lineTo(x, top(x));
  ctx.lineTo(width, height); ctx.closePath();
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 3;
  const body = ctx.createLinearGradient(0, 0, 0, height);
  body.addColorStop(0, 'rgb(255,255,255)'); body.addColorStop(0.5, 'rgb(246,249,253)'); body.addColorStop(0.82, 'rgb(219,228,240)'); body.addColorStop(1, 'rgb(186,200,222)');
  ctx.fillStyle = body; ctx.fill();
  ctx.restore();
  // Soft blue shadow pockets between lumps.
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 18; i++) {
    const x = random() * width, y = top(x) + height * (0.2 + random() * 0.3), r = 8 + random() * 22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(150,170,205,0.28)'); g.addColorStop(1, 'rgba(150,170,205,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
  grain(ctx, width, height, random, width * 3, 'rgba(120,140,175,0.16)', 'rgba(255,255,255,0.7)');
  sparkles(ctx, width, height * 0.55, random, Math.round(width / 26));
  return c;
}

/** Icicles hanging from an edge; transparent between them. Tiles on x. */
export function icicles(width = 360, height = 46, seed = 11) {
  const c = canvas(width, height), ctx = c.getContext('2d')!;
  const random = seeded(seed);
  for (let x = 6; x < width - 6; x += 7 + random() * 22) {
    if (random() < 0.3) continue;
    const len = height * (0.25 + random() * 0.75), w = 2.4 + random() * 3.8;
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, 'rgba(190,210,235,0.55)'); g.addColorStop(0.35, 'rgba(250,253,255,0.95)'); g.addColorStop(0.6, 'rgba(206,224,244,0.7)'); g.addColorStop(1, 'rgba(150,175,210,0.45)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - w, 0);
    ctx.quadraticCurveTo(x - w * 0.4, len * 0.55, x + (random() - 0.5), len);
    ctx.quadraticCurveTo(x + w * 0.4, len * 0.55, x + w, 0); ctx.closePath(); ctx.fill();
    // Wet highlight down one side and a drip bead.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(x - w * 0.3, 1); ctx.lineTo(x - w * 0.05, len * 0.8); ctx.stroke();
  }
  // Frozen base the icicles hang from.
  const base = ctx.createLinearGradient(0, 0, 0, 5);
  base.addColorStop(0, 'rgba(255,255,255,0.95)'); base.addColorStop(1, 'rgba(220,232,246,0)');
  ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = base; ctx.fillRect(0, 0, width, 5);
  return c;
}

/** Irregular clumps of packed snow with soft powder edges, shading and a cast shadow (blizzard transition). */
export function snowClumps(count = 5, size = 256, seed = 21) {
  const random = seeded(seed);
  return Array.from({ length: count }, () => {
    const c = canvas(size, size), ctx = c.getContext('2d')!;
    const shape = canvas(size, size), s = shape.getContext('2d')!;
    const cx = size / 2, cy = size / 2;
    s.fillStyle = '#fff';
    for (let i = 0; i < 9 + Math.floor(random() * 6); i++) {
      const a = random() * Math.PI * 2, d = random() * size * 0.17, r = size * (0.12 + random() * 0.15);
      s.beginPath(); s.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r, 0, Math.PI * 2); s.fill();
    }
    // Shading lit from the upper left.
    s.globalCompositeOperation = 'source-atop';
    const light = s.createRadialGradient(cx - size * 0.12, cy - size * 0.16, size * 0.02, cx, cy, size * 0.38);
    light.addColorStop(0, 'rgb(255,255,255)'); light.addColorStop(0.55, 'rgb(242,246,252)'); light.addColorStop(0.85, 'rgb(205,216,234)'); light.addColorStop(1, 'rgb(170,186,212)');
    s.fillStyle = light; s.fillRect(0, 0, size, size);
    grain(s, size, size, random, 900, 'rgba(110,130,170,0.18)', 'rgba(255,255,255,0.8)');
    sparkles(s, size, size, random, 10);
    // Cast shadow then the clump, with a fine powder halo.
    ctx.shadowColor = 'rgba(38,58,98,0.34)'; ctx.shadowBlur = size * 0.07; ctx.shadowOffsetX = size * 0.02; ctx.shadowOffsetY = size * 0.05;
    ctx.drawImage(shape, 0, 0);
    ctx.shadowColor = 'rgba(255,255,255,0.65)'; ctx.shadowBlur = size * 0.03; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.drawImage(shape, 0, 0);
    return c;
  });
}

/** A packed snowfield that fills the last gaps of the blizzard (drawn under the clumps). */
export function snowField(width: number, height: number, seed = 31) {
  const c = canvas(width, height), ctx = c.getContext('2d')!;
  const random = seeded(seed);
  const g = ctx.createLinearGradient(0, 0, width * 0.3, height);
  g.addColorStop(0, 'rgb(247,250,254)'); g.addColorStop(1, 'rgb(226,234,245)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 90; i++) {
    const x = random() * width, y = random() * height, r = 30 + random() * 120;
    const s = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = random() < 0.5;
    s.addColorStop(0, light ? 'rgba(255,255,255,0.7)' : 'rgba(170,188,215,0.22)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = s; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  grain(ctx, width, height, random, Math.round(width * height / 260), 'rgba(110,130,170,0.12)', 'rgba(255,255,255,0.75)');
  return c;
}

/** Soft round flake sprite (out-of-focus snow), white or a cool grey that reads on light surfaces. */
export function flakeSprite(radius: number, rgb: string, softness: number) {
  const size = Math.ceil(radius * 2 + 4), c = canvas(size, size), ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, radius);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(Math.max(0.05, 1 - softness), `rgba(${rgb},0.85)`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return c;
}

/** A six-armed snow crystal with side branches (near layer, a minority of flakes). */
export function crystalSprite(radius: number, rgb: string, seed: number) {
  const size = Math.ceil(radius * 2 + 4), c = canvas(size, size), ctx = c.getContext('2d')!;
  const random = seeded(seed);
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = `rgba(${rgb},0.95)`; ctx.lineCap = 'round';
  const branch = 0.35 + random() * 0.25;
  for (let a = 0; a < 6; a++) {
    ctx.lineWidth = radius / 7;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -radius); ctx.stroke();
    ctx.lineWidth = radius / 10;
    for (const t of [0.45, 0.72]) {
      ctx.beginPath(); ctx.moveTo(0, -radius * t); ctx.lineTo(radius * branch * (1 - t + 0.3), -radius * (t + 0.18));
      ctx.moveTo(0, -radius * t); ctx.lineTo(-radius * branch * (1 - t + 0.3), -radius * (t + 0.18)); ctx.stroke();
    }
    ctx.rotate(Math.PI / 3);
  }
  return c;
}

export const toObjectUrl = (c: HTMLCanvasElement) => new Promise<string | null>(resolve => {
  try { c.toBlob(b => resolve(b ? URL.createObjectURL(b) : null), 'image/png'); } catch { resolve(null); }
});

let installed: Promise<void> | null = null;
/** Paints the surface textures once and exposes them to CSS as custom properties on <html>. */
export function installWinterTextures() {
  return (installed ??= (async () => {
    const root = document.documentElement.style;
    const entries: [string, HTMLCanvasElement][] = [
      ['--winter-frost-tile', frostTile()],
      ['--winter-snow-cap-a', snowCap(640, 56, 3, 1)],
      ['--winter-snow-cap-b', snowCap(560, 56, 8, 0.75)],
      ['--winter-snow-cap-c', snowCap(720, 56, 15, 1.25)],
      ['--winter-icicles', icicles()],
    ];
    for (const [name, c] of entries) {
      const url = await toObjectUrl(c);
      if (url) root.setProperty(name, `url("${url}")`);
    }
  })());
}
