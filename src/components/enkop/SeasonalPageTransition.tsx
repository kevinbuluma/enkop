import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import { transitionMood } from '@/lib/page-transition';

/** Persistent navigation curtain; never delays data loading or intercepts links. */
export function SeasonalPageTransition() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current, canvas = canvasRef.current;
    if (!el || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0, start = 0, release = 0, ready = false, timeout = 0;
    let width = 0, height = 0;
    let palette: string[] = [];
    let mood = transitionMood(null);
    const particles = Array.from({ length: 100 }, (_, i) => ({
      x: ((i * 0.6180339) % 1), y: ((i * 0.4142135) % 1),
      size: 0.65 + (i % 7) / 9, angle: i * 2.4, depth: (i % 5) / 5,
    }));
    const stop = () => {
      cancelAnimationFrame(raf); clearTimeout(timeout);
      el.dataset['phase'] = 'idle';
      document.documentElement.removeAttribute('data-page-transition');
      ctx.clearRect(0, 0, width, height);
    };
    const draw = (now: number) => {
      const entry = Math.min(1, (now - start) / 420);
      if (ready && !release && entry === 1) { release = now; el.dataset['phase'] = 'revealing'; }
      const exit = release ? Math.min(1, (now - release) / 760) : 0;
      el.style.setProperty('--curtain-opacity', String(Math.sin(entry * Math.PI / 2) * (1 - exit)));
      ctx.clearRect(0, 0, width, height);
      if (mood !== 'flip') {
        const sweep = 1 - Math.pow(1 - entry, 3);
        for (const [i, p] of particles.entries()) {
          const size = (mood === 'snow' ? 16 : mood === 'rain' ? 35 : 90) * p.size * Math.min(1.4, width / 900 + .45);
          const x = p.x * (width + 240) - 120 - (1 - sweep) * (width + 300) + exit * exit * (width + 400);
          const y = p.y * (height + 140) - 70 + Math.sin(now / 500 + i) * 25 - exit * 110 * p.depth;
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.angle + (now - start) / 700 * (p.depth + .2));
          ctx.globalAlpha = Math.min(1, entry * 3) * (1 - exit * exit);
          ctx.fillStyle = palette[i % palette.length] ?? palette[0] ?? 'transparent';
          ctx.strokeStyle = palette[3] ?? 'transparent';
          ctx.lineWidth = 1;
          if (mood === 'snow') {
            ctx.beginPath();
            for (let a = 0; a < 6; a++) {
              ctx.moveTo(0, 0); ctx.lineTo(0, size);
              ctx.moveTo(0, size * .65); ctx.lineTo(size * .25, size * .4);
              ctx.moveTo(0, size * .65); ctx.lineTo(-size * .25, size * .4); ctx.rotate(Math.PI / 3);
            }
            ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
          } else if (mood === 'rain') {
            ctx.rotate(-.6); ctx.fillRect(0, 0, 1.5, size * 2);
          } else {
            ctx.scale(1, .65 + Math.abs(Math.sin(now / 600 + i)) * .35);
            ctx.beginPath(); ctx.moveTo(-size, 0);
            ctx.bezierCurveTo(-size * .4, -size * .85, size * .6, -size * .7, size, 0);
            ctx.bezierCurveTo(size * .4, size * .85, -size * .6, size * .7, -size, 0);
            ctx.fill();
            if (mood === 'leaves') {
              ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size * 1.15, 0);
              for (let v = -.5; v < .7; v += .3) { ctx.moveTo(size * v, 0); ctx.lineTo(size * (v + .2), -size * .4); }
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      }
      if (exit === 1) { stop(); return; }
      raf = requestAnimationFrame(draw);
    };
    const before = router.subscribe('onBeforeNavigate', event => {
      if (reduce.matches || event.fromLocation?.pathname === event.toLocation.pathname || event.toLocation.pathname.startsWith('/admin')) return;
      stop();
      mood = transitionMood(document.documentElement.getAttribute('data-season'));
      el.dataset['mood'] = mood; el.dataset['phase'] = 'covering';
      document.documentElement.setAttribute('data-page-transition', mood);
      const styles = getComputedStyle(el);
      palette = [1, 2, 3, 4].map(n => styles.getPropertyValue(`--wind-color-${n}`).trim());
      width = innerWidth; height = innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = width * dpr; canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      start = performance.now(); release = 0; ready = false;
      raf = requestAnimationFrame(draw);
      timeout = window.setTimeout(stop, 4500);
    });
    const resolved = router.subscribe('onResolved', () => { ready = true; });
    reduce.addEventListener('change', stop);
    return () => { before(); resolved(); stop(); reduce.removeEventListener('change', stop); };
  }, [router]);

  return <div ref={ref} className="seasonal-page-transition" data-phase="idle" aria-hidden="true">
    <div className="seasonal-page-curtain" /><canvas ref={canvasRef} />
  </div>;
}