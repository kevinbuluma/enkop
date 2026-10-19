import { useEffect, useRef } from 'react';

type Shape = 'drop' | 'mote' | 'snow' | 'petal' | 'leaf';
type Kind = { colors: string[]; count: number; speed: number; drift: number; size: [number, number]; shape: Shape; alpha: number };

const kinds: Record<string, Kind> = {
  'long-rains': { colors: ['150,170,160'], count: 60, speed: 6, drift: 0.4, size: [10, 18], shape: 'drop', alpha: 0.3 },
  'short-rains': { colors: ['160,175,150'], count: 45, speed: 5, drift: 0.5, size: [8, 14], shape: 'drop', alpha: 0.28 },
  'dry-warm': { colors: ['214,180,120', '236,206,150'], count: 34, speed: -0.15, drift: 0.25, size: [1.2, 3], shape: 'mote', alpha: 0.6 },
  'cool-dry': { colors: ['180,195,210'], count: 28, speed: 0.15, drift: 0.2, size: [1, 2.4], shape: 'mote', alpha: 0.5 },
  winter: { colors: ['255,255,255', '232,240,250'], count: 140, speed: 0.9, drift: 0.6, size: [1.2, 4.2], shape: 'snow', alpha: 0.9 },
  spring: { colors: ['244,196,206', '250,214,222', '236,176,190'], count: 38, speed: 0.8, drift: 0.9, size: [4, 7], shape: 'petal', alpha: 0.8 },
  summer: { colors: ['240,200,120', '255,226,160', '220,180,110'], count: 46, speed: -0.2, drift: 0.3, size: [1.2, 3.4], shape: 'mote', alpha: 0.7 },
  autumn: { colors: ['184,104,50', '204,140,60', '150,80,40', '214,166,80'], count: 34, speed: 1.1, drift: 1, size: [6, 11], shape: 'leaf', alpha: 0.85 },
};

type P = { x: number; y: number; z: number; s: number; v: number; d: number; r: number; spin: number; phase: number; c: string };

/** Seasonal particle field with depth layers and pointer "wind". Photos and videos are clipped out so they are never covered. */
export function SeasonParticles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const mobile = innerWidth < 760;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    let raf = 0, key = '', parts: P[] = [], holes: DOMRect[] = [], lastHoles = 0, wind = 0, windTarget = 0, t = 0;
    const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const spawn = (k: Kind, edge = false): P => {
      const z = 0.35 + Math.random() * 0.65;
      return { x: Math.random() * innerWidth, y: edge ? (k.speed < 0 ? innerHeight + 20 : -20) : Math.random() * innerHeight, z,
        s: (k.size[0] + Math.random() * (k.size[1] - k.size[0])) * z, v: k.speed * (0.5 + Math.random() * 0.7) * z, d: (Math.random() - 0.5) * k.drift,
        r: Math.random() * 6, spin: (Math.random() - 0.5) * 0.04, phase: Math.random() * 6, c: k.colors[Math.floor(Math.random() * k.colors.length)] ?? "255,255,255" };
    };
    const onMove = (e: PointerEvent) => { windTarget = ((e.clientX / innerWidth) - 0.5) * 1.6; };
    const refreshHoles = () => {
      holes = Array.from(document.querySelectorAll('img, video, iframe')).map(el => el.getBoundingClientRect())
        .filter(r => r.width > 60 && r.height > 60 && r.bottom > 0 && r.top < innerHeight);
    };
    const draw = (p: P, k: Kind) => {
      ctx.globalAlpha = k.alpha * (0.45 + p.z * 0.55);
      ctx.fillStyle = `rgb(${p.c})`;
      if (k.shape === 'drop') { ctx.fillRect(p.x, p.y, 1, p.s); return; }
      if (k.shape === 'mote') { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 3); g.addColorStop(0, `rgba(${p.c},1)`); g.addColorStop(1, `rgba(${p.c},0)`); ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(t * 0.03 + p.phase); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 3, 0, Math.PI * 2); ctx.fill(); return; }
      if (k.shape === 'snow') {
        if (p.s > 3.2) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.strokeStyle = `rgb(${p.c})`; ctx.lineWidth = 0.8; ctx.beginPath(); for (let i = 0; i < 6; i++) { ctx.moveTo(0, 0); ctx.lineTo(0, p.s * 1.6); ctx.rotate(Math.PI / 3); } ctx.stroke(); ctx.restore(); return; }
        ctx.shadowColor = 'rgba(255,255,255,.8)'; ctx.shadowBlur = 4; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; return;
      }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      // 3D flutter: squash one axis over time as if turning in space.
      ctx.scale(1, Math.abs(Math.cos(t * 0.04 + p.phase)) * 0.8 + 0.2);
      ctx.beginPath();
      if (k.shape === 'petal') { ctx.moveTo(0, -p.s); ctx.quadraticCurveTo(p.s, 0, 0, p.s); ctx.quadraticCurveTo(-p.s, 0, 0, -p.s); }
      else { ctx.moveTo(0, -p.s); ctx.quadraticCurveTo(p.s * 0.9, -p.s * 0.2, 0, p.s); ctx.quadraticCurveTo(-p.s * 0.9, -p.s * 0.2, 0, -p.s); ctx.fill(); ctx.strokeStyle = 'rgba(90,50,20,.35)'; ctx.lineWidth = 0.6; ctx.moveTo(0, -p.s); ctx.lineTo(0, p.s * 1.25); ctx.stroke(); }
      ctx.fill(); ctx.restore();
    };
    const tick = (now: number) => {
      t++;
      const root = document.documentElement;
      const s = root.getAttribute('data-season') ?? '';
      const k = kinds[s];
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (!k || document.hidden) { raf = requestAnimationFrame(tick); return; }
      const intensity = Math.min(1, Math.max(0, Number(root.getAttribute('data-season-intensity') ?? 1)));
      const nextKey = s + intensity;
      if (nextKey !== key) { key = nextKey; parts = Array.from({ length: Math.round(k.count * intensity * (mobile ? 0.45 : 1)) }, () => spawn(k)); }
      if (now - lastHoles > 300) { refreshHoles(); lastHoles = now; }
      wind += (windTarget - wind) * 0.02;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, innerWidth, innerHeight);
      for (const h of holes) ctx.rect(h.left, h.top, h.width, h.height);
      ctx.clip('evenodd');
      for (const p of parts) {
        p.y += p.v; p.x += p.d + Math.sin(t * 0.01 + p.phase) * 0.3 * p.z + wind * p.z; p.r += p.spin;
        if (p.y > innerHeight + 30 || p.y < -30 || p.x < -40 || p.x > innerWidth + 40) Object.assign(p, spawn(k, true));
        draw(p, k);
      }
      ctx.restore(); ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    const syncMotion = () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (!reduce.matches) raf = requestAnimationFrame(tick);
    };
    resize(); addEventListener('resize', resize); addEventListener('pointermove', onMove, { passive: true });
    reduce.addEventListener('change', syncMotion); syncMotion();
    return () => { cancelAnimationFrame(raf); reduce.removeEventListener('change', syncMotion); removeEventListener('resize', resize); removeEventListener('pointermove', onMove); };
  }, []);
  return <canvas ref={ref} className="season-particles" aria-hidden="true" />;
}
