import { useEffect, useRef } from 'react';

const kinds: Record<string, { color: string; count: number; speed: number; drift: number; size: [number, number]; shape: 'drop' | 'dot' | 'leaf' }> = {
  'long-rains': { color: '150,170,160', count: 40, speed: 3.2, drift: 0.2, size: [8, 14], shape: 'drop' },
  'short-rains': { color: '160,175,150', count: 28, speed: 2.6, drift: 0.3, size: [6, 11], shape: 'drop' },
  'dry-warm': { color: '214,180,120', count: 18, speed: 0.25, drift: 0.25, size: [1, 2.5], shape: 'dot' },
  'cool-dry': { color: '180,195,210', count: 16, speed: 0.2, drift: 0.2, size: [1, 2], shape: 'dot' },
  winter: { color: '240,244,250', count: 50, speed: 0.7, drift: 0.5, size: [1.5, 3.5], shape: 'dot' },
  spring: { color: '235,190,200', count: 18, speed: 0.6, drift: 0.6, size: [3, 5], shape: 'leaf' },
  summer: { color: '220,180,110', count: 16, speed: 0.2, drift: 0.2, size: [1, 2.5], shape: 'dot' },
  autumn: { color: '180,110,60', count: 16, speed: 0.8, drift: 0.8, size: [4, 7], shape: 'leaf' },
};

/** Decorative, capped particle layer confined to the outer page margins so it never covers photos. */
export function SeasonParticles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; hardwareConcurrency?: number };
    if (reduce.matches || nav.connection?.saveData || (nav.hardwareConcurrency ?? 8) < 4 || window.innerWidth < 900) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let raf = 0, season = '', parts: { x: number; y: number; s: number; v: number; d: number; r: number }[] = [];
    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    const margin = () => Math.max(40, innerWidth * 0.055);
    const spawn = (k: typeof kinds[string], top = false) => { const m = margin(); const left = Math.random() < 0.5; return { x: left ? Math.random() * m : innerWidth - Math.random() * m, y: top ? -20 : Math.random() * innerHeight, s: k.size[0] + Math.random() * (k.size[1] - k.size[0]), v: k.speed * (0.6 + Math.random() * 0.8), d: (Math.random() - 0.5) * k.drift, r: Math.random() * 6 }; };
    const tick = () => {
      const s = document.documentElement.getAttribute('data-season') ?? '';
      const k = kinds[s];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!k || document.hidden) { raf = requestAnimationFrame(tick); return; }
      const key = s + (document.documentElement.getAttribute('data-season-intensity') ?? '1');
      if (key !== season) { season = key; const n = Math.round(k.count * Math.min(1, Math.max(0, Number(document.documentElement.getAttribute('data-season-intensity') ?? 1)))); parts = Array.from({ length: n }, () => spawn(k)); }
      for (const p of parts) {
        p.y += p.v; p.x += p.d; p.r += 0.02;
        if (p.y > innerHeight + 20) Object.assign(p, spawn(k, true));
        ctx.fillStyle = `rgba(${k.color},${k.shape === 'drop' ? 0.35 : 0.55})`;
        if (k.shape === 'drop') ctx.fillRect(p.x, p.y, 1, p.s);
        else if (k.shape === 'leaf') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s / 2.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); }
      }
      raf = requestAnimationFrame(tick);
    };
    resize(); addEventListener('resize', resize); raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="season-particles" aria-hidden="true" />;
}
