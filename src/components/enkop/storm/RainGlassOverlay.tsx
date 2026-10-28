import { useEffect, useRef } from 'react';
import { WaterDropletSystem, type Drop } from '@/lib/storm/water-droplets';
import { stormLight } from '@/lib/storm/lightning';
import type { SceneZones, ZoneRect } from '@/lib/storm/scene-zones';
import type { StormProfile } from '@/lib/storm/atmosphere';

type Source = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; iw: number; ih: number; posX: number; posY: number; drawn: number };
const SOURCE_WIDTH = 240;
const VIDEO_REFRESH_MS = 90;

/** Shading for one drop: a darker rim, a soft lens body, a specular highlight and faint brand reflections. */
function dropSprite(variant: number) {
  const s = 96, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const mid = s / 2, R = s / 2 - 1;
  const body = g.createRadialGradient(mid, mid - R * 0.18, R * 0.1, mid, mid, R);
  body.addColorStop(0, 'rgba(255,255,255,0.04)');
  body.addColorStop(0.62, 'rgba(255,255,255,0)');
  body.addColorStop(0.86, 'rgba(12,20,38,0.26)');
  body.addColorStop(1, 'rgba(8,14,28,0.5)');
  g.fillStyle = body; g.beginPath(); g.arc(mid, mid, R, 0, Math.PI * 2); g.fill();
  // Light gathers along the lower edge of a lens.
  const low = g.createRadialGradient(mid, mid + R * 0.55, 0, mid, mid + R * 0.55, R * 0.6);
  low.addColorStop(0, 'rgba(236,242,255,0.3)'); low.addColorStop(1, 'rgba(236,242,255,0)');
  g.fillStyle = low; g.beginPath(); g.arc(mid, mid, R * 0.9, 0, Math.PI * 2); g.fill();
  // Specular highlight, upper left.
  const hx = mid - R * (0.32 + variant * 0.06), hy = mid - R * (0.4 - variant * 0.05);
  const hi = g.createRadialGradient(hx, hy, 0, hx, hy, R * 0.3);
  hi.addColorStop(0, 'rgba(255,255,255,0.95)'); hi.addColorStop(0.35, 'rgba(255,255,255,0.4)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi; g.fillRect(0, 0, s, s);
  // Faint reflections of the brand palette in the rim (gold low right, royal upper right).
  g.lineWidth = R * 0.09;
  g.strokeStyle = 'rgba(214,186,118,0.3)';
  g.beginPath(); g.arc(mid, mid, R * 0.9, Math.PI * 0.08, Math.PI * 0.42); g.stroke();
  g.strokeStyle = 'rgba(40,74,140,0.28)';
  g.beginPath(); g.arc(mid, mid, R * 0.9, -Math.PI * 0.42, -Math.PI * 0.12); g.stroke();
  return c;
}

function objectPosition(el: Element) {
  const [x = '50%', y = '50%'] = getComputedStyle(el).objectPosition.split(' ');
  const pct = (v: string) => (v.endsWith('%') ? Number.parseFloat(v) / 100 : 0.5);
  return { posX: pct(x), posY: pct(y) };
}

/**
 * The glass between the visitor and the property. Drops condense, slide, merge and leave wet trails;
 * over photography and video each drop refracts the image behind it (an inverted, magnified view taken
 * from a small cached copy of the media). Pointer events pass straight through.
 */
export function RainGlassOverlay({ zones, profile, visible }: { zones: SceneZones; profile: StormProfile; visible: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const mobile = innerWidth < 760;
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    let w = 0, h = 0;
    const trails = document.createElement('canvas');
    const tctx = trails.getContext('2d')!;
    const size = () => {
      w = innerWidth; h = innerHeight;
      canvas.width = trails.width = Math.round(w * dpr); canvas.height = trails.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const sprites = [0, 1, 2].map(dropSprite);
    const sources = new WeakMap<Element, Source>();
    const system = new WaterDropletSystem({
      width: w, height: h, density: profile.level,
      zoneAt: (x, y) => zones.kindAt(x, y),
      maxDrops: Math.round((mobile ? 90 : 170) + (w * h) / (mobile ? 9000 : 5200)),
    });

    const sourceFor = (rect: ZoneRect, now: number): Source | null => {
      const el = rect.el;
      if (!el) return null;
      const isVideo = el instanceof HTMLVideoElement;
      const iw = isVideo ? el.videoWidth : el.naturalWidth, ih = isVideo ? el.videoHeight : el.naturalHeight;
      if (!iw || !ih || (isVideo && el.readyState < 2)) return null;
      let src = sources.get(el);
      if (!src || src.iw !== iw) {
        const c = document.createElement('canvas');
        c.width = SOURCE_WIDTH; c.height = Math.max(1, Math.round(SOURCE_WIDTH * ih / iw));
        src = { canvas: c, ctx: c.getContext('2d')!, iw, ih, ...objectPosition(el), drawn: -Infinity };
        sources.set(el, src);
      }
      if (src.drawn === -Infinity || (isVideo && now - src.drawn > VIDEO_REFRESH_MS)) {
        try { src.ctx.drawImage(el, 0, 0, src.canvas.width, src.canvas.height); src.drawn = now; } catch { return null; }
      }
      return src;
    };

    const drawDrop = (d: Drop, now: number, flash: number) => {
      if (d.alpha < 0.02 || d.r < 0.5) return;
      const stretch = d.moving ? Math.min(0.42, d.vy * 2.4) : 0;
      const rx = d.r * (0.9 + d.shape * 0.16) * (1 - stretch * 0.25), ry = d.r * (1 + stretch);
      const alpha = Math.min(1, d.alpha * (0.62 + 0.38 * Math.min(1, d.r / 6)));
      if (d.r >= 2.6) {
        const media = zones.mediaAt(d.x, d.y);
        const src = media && sourceFor(media, now);
        if (media && src) {
          // Map the viewport point through object-fit: cover into the cached copy of the media.
          const scale = Math.max(media.w / src.iw, media.h / src.ih);
          const ox = media.x + (media.w - src.iw * scale) * src.posX, oy = media.y + (media.h - src.ih * scale) * src.posY;
          const k = src.canvas.width / src.iw;
          const view = d.r * 2 * 2.6; // a drop shows a wide, minified field of view
          const sw = view / scale * k, sh = view * (ry / rx) / scale * k;
          const sx = ((d.x - ox) / scale) * k - sw / 2, sy = ((d.y - oy) / scale) * k - sh / 2;
          ctx.save();
          ctx.globalAlpha = alpha * 0.92;
          ctx.beginPath(); ctx.ellipse(d.x, d.y, rx * 0.94, ry * 0.94, 0, 0, Math.PI * 2); ctx.clip();
          ctx.translate(d.x, d.y); ctx.scale(-1, -1);
          ctx.drawImage(src.canvas, sx, sy, sw, sh, -rx, -ry, rx * 2, ry * 2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = Math.min(1, alpha * (1 + flash * 0.6));
      const sprite = sprites[Math.floor(d.shape * 3)] ?? sprites[0]!;
      ctx.drawImage(sprite, d.x - rx, d.y - ry, rx * 2, ry * 2);
    };

    let raf = 0, last = performance.now();
    const render = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.drawImage(trails, 0, 0, w, h);
      const flash = stormLight.flash;
      for (const d of system.drops) drawDrop(d, now, flash);
      ctx.fillStyle = 'rgba(232,240,255,1)';
      for (const s of system.splashes) {
        ctx.globalAlpha = (1 - s.life / s.max) * 0.55;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const paintTrails = (dt: number) => {
      // Wet trails evaporate over a few seconds.
      tctx.globalCompositeOperation = 'destination-out';
      tctx.fillStyle = `rgba(0,0,0,${(1 - Math.pow(0.986, dt / 16)).toFixed(4)})`;
      tctx.fillRect(0, 0, w, h);
      tctx.globalCompositeOperation = 'source-over';
      tctx.lineCap = 'round';
      for (const t of system.trail) {
        if (zones.kindAt((t.x1 + t.x2) / 2, (t.y1 + t.y2) / 2) === 'quiet') continue;
        tctx.strokeStyle = 'rgba(10,18,36,0.07)'; tctx.lineWidth = t.w + 0.8;
        tctx.beginPath(); tctx.moveTo(t.x1 + 0.5, t.y1); tctx.lineTo(t.x2 + 0.5, t.y2); tctx.stroke();
        tctx.strokeStyle = 'rgba(236,242,255,0.11)'; tctx.lineWidth = t.w;
        tctx.beginPath(); tctx.moveTo(t.x1, t.y1); tctx.lineTo(t.x2, t.y2); tctx.stroke();
      }
      system.trail.length = 0;
    };

    const frame = (now: number) => {
      const dt = Math.min(50, now - last); last = now;
      system.step(dt);
      paintTrails(dt);
      render(now);
      raf = document.hidden ? 0 : requestAnimationFrame(frame);
    };

    let calmTimer = 0;
    const calmPaint = () => {
      // Reduced motion: still water only, cleared from anything that scrolls beneath it into text.
      system.drops = system.drops.filter((d) => zones.kindAt(d.x, d.y) !== 'quiet');
      render(performance.now());
    };
    const wake = () => { if (!profile.calm && !raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    const onReveal = () => system.burst(1600);
    const onResize = () => { size(); system.resize(w, h); if (profile.calm) calmPaint(); };

    if (profile.calm) {
      zones.refresh();
      system.seedStill(Math.round((w * h) / 9000 * profile.level));
      calmPaint();
      calmTimer = window.setInterval(calmPaint, 700);
    } else {
      wake();
      document.addEventListener('visibilitychange', wake);
      window.addEventListener('enkop:storm-reveal', onReveal);
    }
    addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf); clearInterval(calmTimer);
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('enkop:storm-reveal', onReveal);
    };
  }, [zones, profile]);
  return <canvas ref={ref} className={`rain-glass-layer ${visible ? 'is-on' : ''}`} aria-hidden="true" />;
}
