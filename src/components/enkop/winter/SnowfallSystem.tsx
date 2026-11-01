import { useEffect, useRef } from 'react';
import { Snowfall, type Pointer } from '@/lib/winter/snowfall';
import { crystalSprite, flakeSprite } from '@/lib/winter/textures';
import type { SceneZones } from '@/lib/storm/scene-zones';
import type { WinterProfile } from '@/lib/winter/settings';

const WHITE = '255,255,255';
// Snow seen against a bright surface reads as a cool grey, as it does against a bright sky.
const GREY = '120,138,172';
type Streak = { x: number; y: number; len: number; speed: number; alpha: number };

/**
 * Environmental snowfall in four depths. Wind wanders and gusts, flakes part around the cursor, density
 * swings between calmer and heavier spells, and gusts send powder streaks across. Over text and controls
 * the snow thins to a whisper; over photography it is white, with a faint cold haze over the sky.
 */
export function SnowfallSystem({ zones, profile, visible }: { zones: SceneZones; profile: WinterProfile; visible: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(devicePixelRatio || 1, profile.device === 'mobile' ? 1.25 : 1.5);
    let w = 0, h = 0;
    const size = () => { w = innerWidth; h = innerHeight; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size();
    const tone = (rgb: string) => [flakeSprite(2, rgb, 0.45), flakeSprite(3, rgb, 0.55), flakeSprite(5, rgb, 0.7), flakeSprite(26, rgb, 0.96)];
    const sprites = [tone(GREY), tone(WHITE)];
    const crystals = [crystalSprite(9, GREY, 4), crystalSprite(9, WHITE, 4)];
    const core = flakeSprite(2, WHITE, 0.2);
    const streakSprite = flakeSprite(6, WHITE, 0.95);
    const count = profile.calm ? Math.round(profile.flakes * 0.45) : profile.flakes;
    const snow = new Snowfall({ width: w, height: h, count, foreground: profile.calm ? 0 : profile.foreground, wind: profile.calm ? 0 : profile.wind });
    const streaks: Streak[] = Array.from({ length: profile.device === 'mobile' ? 14 : 36 }, () => ({ x: Math.random() * w, y: Math.random() * h, len: 60 + Math.random() * 160, speed: 700 + Math.random() * 700, alpha: 0.4 + Math.random() * 0.6 }));
    let pointer: Pointer = null, raf = 0, last = performance.now(), frame = 0, t = 0;
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const onMove = (e: PointerEvent) => {
      const vx = pointer ? (e.clientX - pointer.x) * 16 : 0, vy = pointer ? (e.clientY - pointer.y) * 16 : 0;
      pointer = { x: e.clientX, y: e.clientY, vx, vy };
    };
    const onLeave = () => { pointer = null; };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      // Restrained winter light: a faint cold haze over the upper part of large photographs.
      for (const r of zones.rects) {
        if (r.kind !== 'media' || r.h < 240) continue;
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h * 0.45);
        g.addColorStop(0, 'rgba(214,226,244,0.1)'); g.addColorStop(1, 'rgba(214,226,244,0)');
        ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h * 0.45);
      }
      const refreshTone = frame % 3 === 0;
      for (const f of snow.flakes) {
        if (!f.active || f.y < -40 || f.y > h + 40) continue;
        if (refreshTone || f.tone === 0) {
          const kind = zones.kindAt(f.x, f.y);
          f.tone = kind === 'quiet' ? 3 : kind === 'media' || kind === 'dark' ? 2 : 1;
        }
        const white = f.tone === 2 || f.layer === 3;
        let a = f.alpha * (f.tone === 3 ? (f.layer === 3 ? 0.35 : 0.28) : 1);
        if (!white && f.layer === 0) a *= 0.7;
        ctx.globalAlpha = a;
        const s = f.size;
        if (f.crystal) {
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.turn);
          ctx.drawImage(crystals[white ? 1 : 0]!, -s * 1.3, -s * 1.3, s * 2.6, s * 2.6); ctx.restore();
        } else ctx.drawImage(sprites[white ? 1 : 0]![f.layer]!, f.x - s, f.y - s, s * 2, s * 2);
        // Ice crystals catching the light now and then.
        if (white && f.layer === 2 && f.tone === 2) {
          const twinkle = Math.pow(Math.max(0, Math.sin(t * 2.2 + f.phase * 7)), 40);
          if (twinkle > 0.05) { ctx.globalAlpha = twinkle; ctx.drawImage(core, f.x - s * 0.8, f.y - s * 0.8, s * 1.6, s * 1.6); }
        }
      }
      // Powder streaks blown across during gusts.
      const gust = snow.wind.gust;
      if (gust > 0.15) {
        const dir = Math.sign(snow.wind.x) || 1;
        for (const s of streaks) {
          const kind = zones.kindAt(s.x, s.y);
          ctx.globalAlpha = s.alpha * (gust - 0.15) * (kind === 'quiet' ? 0.08 : kind === 'light' ? 0.18 : 0.32);
          ctx.drawImage(streakSprite, dir > 0 ? s.x - s.len : s.x, s.y - 3, s.len, 6);
        }
      }
      ctx.globalAlpha = 1;
    };
    const step = (now: number) => {
      const dt = now - last; last = now; frame++; t += dt / 1000;
      snow.step(dt, fine ? pointer : null);
      const dir = Math.sign(snow.wind.x) || 1;
      for (const s of streaks) {
        s.x += dir * s.speed * (dt / 1000); s.y += 30 * (dt / 1000);
        if (s.x > w + s.len) { s.x = -s.len; s.y = Math.random() * h; } else if (s.x < -s.len) { s.x = w + s.len; s.y = Math.random() * h; }
      }
      draw();
      raf = document.hidden ? 0 : requestAnimationFrame(step);
    };
    const wake = () => { if (!raf && !document.hidden && !profile.calm) { last = performance.now(); raf = requestAnimationFrame(step); } };
    const onResize = () => { size(); snow.resize(w, h); if (profile.calm) draw(); };
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', wake);
    if (fine && !profile.calm) { addEventListener('pointermove', onMove, { passive: true }); document.addEventListener('pointerleave', onLeave); }
    // Calm: one still frame of snow, redrawn only when the layout changes.
    if (profile.calm) { zones.refresh(); draw(); } else wake();
    return () => {
      cancelAnimationFrame(raf); raf = 0;
      removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', wake);
      removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave);
    };
  }, [zones, profile]);
  return <canvas ref={ref} className={`winter-snowfall ${visible ? 'is-on' : ''}`} aria-hidden="true" />;
}
