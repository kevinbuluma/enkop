import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import { alternatingTransitionMood, transitionMood } from '@/lib/page-transition';
import leafAtlasUrl from '@/assets/autumn-leaf-cinematic.png';
import { LEAF_ENTRY_MS, LEAF_EXIT_MS, leafArrival, leafExitPosition } from '@/lib/leaf-motion';

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
    const atlas = new Image();
    atlas.decoding = 'async';
    const sprites: HTMLCanvasElement[] = [];
    const softSprites: HTMLCanvasElement[] = [];
    atlas.onload = () => {
      for (let i = 0; i < 4; i++) {
        const sprite = document.createElement('canvas');
        sprite.width = 512; sprite.height = 512;
        const spriteCtx = sprite.getContext('2d');
        if (!spriteCtx) continue;
        spriteCtx.shadowColor = getComputedStyle(el).getPropertyValue('--leaf-shadow').trim();
        spriteCtx.shadowBlur = 9; spriteCtx.shadowOffsetY = 5;
        spriteCtx.drawImage(atlas, (i % 2) * atlas.naturalWidth / 2, Math.floor(i / 2) * atlas.naturalHeight / 2, atlas.naturalWidth / 2, atlas.naturalHeight / 2, 12, 12, 488, 488);
        sprites.push(sprite);
        const soft = document.createElement('canvas');
        soft.width = 512; soft.height = 512;
        const softCtx = soft.getContext('2d');
        if (softCtx) { softCtx.filter = 'blur(4px)'; softCtx.drawImage(sprite, 0, 0); }
        softSprites.push(soft);
      }
    };
    atlas.src = leafAtlasUrl;
    let raf = 0, start = 0, release = 0, ready = false, timeout = 0;
    let navigationIndex = 0;
    let width = 0, height = 0;
    let palette: string[] = [];
    let mood = transitionMood(null);
    let leaves: { x: number; y: number; size: number; angle: number; depth: number }[] = [];
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
      const textured = mood === 'leaves' && sprites.length === 4;
      const entry = Math.min(1, (now - start) / (textured ? LEAF_ENTRY_MS : 420));
      if (ready && !release && entry === 1 && (!textured || now - start >= LEAF_ENTRY_MS + 140)) { release = now; el.dataset['phase'] = 'revealing'; }
      const exit = release ? Math.min(1, (now - release) / (textured ? LEAF_EXIT_MS : mood === 'flip' ? 1100 : 760)) : 0;
      el.style.setProperty('--curtain-opacity', String(textured ? Math.pow(entry, 3) * .78 * Math.pow(1 - exit, 2) : mood === 'flip' ? Math.sin(entry * Math.PI / 2) : Math.sin(entry * Math.PI / 2) * (1 - exit)));
      ctx.clearRect(0, 0, width, height);
      if (textured) {
        for (const [i, p] of leaves.entries()) {
          const arrival = leafArrival(entry, i, leaves.length);
          if (arrival === 0) continue;
          const eased = arrival * arrival * (3 - 2 * arrival);
          const wind = Math.sin(arrival * Math.PI) * Math.sin(arrival * 6 + p.angle);
          let x = p.x - (1 - eased) * (width + p.size * 2);
          let y = p.y + wind * height * .16;
          let turn = p.angle + (1 - arrival) * (2.2 + p.depth * .65) + Math.sin(now / 420 + i) * .07;
          let scale = 1;
          if (release) {
            const position = leafExitPosition(p.x, p.y, exit, i, width, height);
            x = position.x; y = position.y; turn += position.turn; scale = position.scale;
          }
          const moving = release ? Math.sin(exit * Math.PI) : Math.sin(arrival * Math.PI);
          const roll = Math.sin((now - start) / (240 + p.depth * 60) + p.angle) * moving;
          const flutter = 1 - Math.abs(roll) * .74;
          const sprite = p.depth === 3 ? softSprites[i % 4] : sprites[i % 4];
          if (!sprite) continue;
          ctx.save(); ctx.translate(x, y); ctx.rotate(turn);
          ctx.transform(scale, roll * .13, roll * .21, scale * flutter, 0, 0);
          ctx.globalAlpha = Math.min(1, arrival * 5);
          ctx.drawImage(sprite, -p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
      } else if (mood !== 'flip' && mood !== 'leaves') {
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
          }
          ctx.restore();
        }
      }
      if (exit === 1) { stop(); return; }
      raf = requestAnimationFrame(draw);
    };
    const before = router.subscribe('onBeforeNavigate', event => {
      if (reduce.matches || event.fromLocation?.pathname === event.toLocation.pathname || event.toLocation.pathname.startsWith('/admin') || event.fromLocation?.pathname.startsWith('/admin')) return;
      stop();
      mood = alternatingTransitionMood(document.documentElement.getAttribute('data-season'), navigationIndex);
      navigationIndex += 1;
      // Never substitute illustrated leaves while the photographic atlas loads.
      // Navigation remains immediate on slow connections or an asset failure.
      if (mood === 'leaves' && sprites.length !== 4) return;
      el.dataset['mood'] = mood; el.dataset['phase'] = 'covering';
      document.documentElement.setAttribute('data-page-transition', mood);
      const styles = getComputedStyle(el);
      palette = [1, 2, 3, 4].map(n => styles.getPropertyValue(`--wind-color-${n}`).trim());
      width = innerWidth; height = innerHeight;
      const spacing = Math.max(72, Math.min(125, width / 10));
      const cols = Math.ceil(width / spacing) + 2, rows = Math.ceil(height / spacing) + 2;
      leaves = Array.from({ length: cols * rows }, (_, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const depth = i % 4;
        return { x: (col - .5) * spacing + Math.sin(i * 17.3) * spacing * .36, y: (row - .5) * spacing + Math.cos(i * 9.1) * spacing * .36, size: spacing * (1.65 + depth * .38 + (i % 7) * .06), angle: i * 2.399, depth };
      });
      // Interleave rows so successive gusts accumulate across the whole screen.
      leaves.sort((a, b) => (a.x / width + a.y / height * .28) - (b.x / width + b.y / height * .28));
      const dpr = Math.min(devicePixelRatio || 1, 2, 3840 / width);
      canvas.width = width * dpr; canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      start = performance.now(); release = 0; ready = false;
      raf = requestAnimationFrame(draw);
      timeout = window.setTimeout(stop, 6500);
    });
    const resolved = router.subscribe('onResolved', () => { ready = true; });
    reduce.addEventListener('change', stop);
    return () => { before(); resolved(); stop(); atlas.onload = null; reduce.removeEventListener('change', stop); };
  }, [router]);

  return <div ref={ref} className="seasonal-page-transition" data-phase="idle" aria-hidden="true">
    <div className="seasonal-page-curtain" /><canvas ref={canvasRef} />
  </div>;
}