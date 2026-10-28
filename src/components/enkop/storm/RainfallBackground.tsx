import { useEffect, useRef } from 'react';
import { Rainfall } from '@/lib/storm/rainfall';
import { stormLight } from '@/lib/storm/lightning';
import type { SceneZones } from '@/lib/storm/scene-zones';
import type { StormProfile } from '@/lib/storm/atmosphere';

/**
 * Environmental rain in three depths over the scene. Streaks take their colour from what is behind them
 * (pale over photography and dark surfaces, slate over ivory), fade to a whisper over text and controls,
 * and brighten for a moment with lightning. A faint royal-blue haze settles over the sky of photographs.
 */
export function RainfallBackground({ zones, profile, visible }: { zones: SceneZones; profile: StormProfile; visible: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || profile.calm) return;
    const dpr = Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.25 : 1.5);
    let w = 0, h = 0;
    const size = () => { w = innerWidth; h = innerHeight; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size();
    const rain = new Rainfall({ width: w, height: h, level: profile.level });
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const dt = now - last; last = now;
      rain.step(dt);
      ctx.clearRect(0, 0, w, h);
      const flash = stormLight.flash;
      // Atmospheric haze over the upper part of photography (the "sky"), deepened briefly by lightning.
      for (const r of zones.rects) {
        if (r.kind !== 'media' || r.h < 220) continue;
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h * 0.6);
        g.addColorStop(0, `rgba(20,43,89,${(0.13 * profile.level + flash * 0.06).toFixed(3)})`);
        g.addColorStop(1, 'rgba(20,43,89,0)');
        ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h * 0.6);
      }
      const dx = Math.sin(rain.wind), dy = Math.cos(rain.wind);
      ctx.lineCap = 'round';
      for (const s of rain.streaks) {
        const mx = s.x + dx * s.len * 0.5, my = s.y - dy * s.len * 0.5;
        if (my < -s.len || my > h + s.len) continue;
        const zone = zones.kindAt(mx, my);
        const onDark = zone === 'media' || zone === 'dark';
        let a = s.alpha * rain.band(s.x) * (zone === 'quiet' ? 0.28 : onDark ? 1 : 0.62) * (1 + flash * 0.9);
        if (s.layer === 2) a *= onDark ? 1 : 0.5;
        if (a < 0.01) continue;
        const rgb = onDark ? (s.layer === 0 ? '200,212,236' : '226,234,250') : '44,60,96';
        const g = ctx.createLinearGradient(s.x, s.y, s.x - dx * s.len, s.y - dy * s.len);
        g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.strokeStyle = g; ctx.lineWidth = s.width;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - dx * s.len, s.y - dy * s.len); ctx.stroke();
      }
      raf = document.hidden ? 0 : requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    const onResize = () => { size(); rain.resize(w, h, profile.level); };
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', wake);
    wake();
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', wake); };
  }, [zones, profile]);
  if (profile.calm) return null;
  return <canvas ref={ref} className={`rainfall-layer ${visible ? 'is-on' : ''}`} aria-hidden="true" />;
}
