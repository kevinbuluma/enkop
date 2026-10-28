import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import { alternatingTransitionMood, transitionMood, type TransitionMood } from '@/lib/page-transition';
import leafAtlasUrl from '@/assets/autumn-leaf-cinematic.webp';
import { LEAF_ENTRY_MS, LEAF_EXIT_MS, leafArrival, leafExitPosition } from '@/lib/leaf-motion';
import { PAPER_TURN_MS, paperStripPose, paperStripsFor } from '@/lib/paper-turn';
import { easeInOut, isRainSeason, parsePreference, stormProfile, type StormProfile } from '@/lib/storm/atmosphere';
import { flashAt, planStrikes, stormLight, type Strike } from '@/lib/storm/lightning';
import { StormClouds } from '@/lib/storm/storm-clouds';
import { thunder } from '@/lib/storm/rain-audio';

const MAX_HOLD_MS = 1200;

/** The storm profile for the current season, preferences and device. */
function currentStormProfile(reducedMotion: boolean): StormProfile {
  const root = document.documentElement;
  return stormProfile({
    intensity: Math.min(1, Math.max(0.2, Number(root.getAttribute('data-season-intensity') ?? 1) || 1)),
    preference: parsePreference(root.getAttribute('data-atmosphere')),
    reducedMotion, mobile: innerWidth < 760,
  });
}

/** Persistent navigation curtain; never delays data loading or intercepts links. */
export function SeasonalPageTransition() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const curtainRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const outgoingRef = useRef<HTMLDivElement>(null);
  const cloudsRef = useRef<HTMLCanvasElement>(null);

  // A page whose data is slow shows a looping gold bar (html.is-route-loading) until it arrives.
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const done = () => { clearTimeout(timer); root.classList.remove('is-route-loading'); };
    const loading = router.subscribe('onBeforeLoad', () => { done(); timer = window.setTimeout(() => root.classList.add('is-route-loading'), 250); });
    const resolved = router.subscribe('onResolved', done);
    return () => { loading(); resolved(); done(); };
  }, [router]);

  useEffect(() => {
    const el = ref.current, canvas = canvasRef.current, paper = paperRef.current, curtain = curtainRef.current, shadow = shadowRef.current, outgoing = outgoingRef.current, cloudCanvas = cloudsRef.current;
    if (!el || !canvas || !paper || !curtain || !shadow || !outgoing || !cloudCanvas) return;
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
    let mood: TransitionMood | 'calm' = transitionMood(null);
    // Storm clouds (rain seasons): created on first need, warmed up as soon as a rain season applies.
    let clouds: StormClouds | null = null;
    let storm: { profile: StormProfile; strikes: Strike[]; fired: number; entrance: boolean } | null = null;
    const ensureClouds = () => (clouds ??= new StormClouds(cloudCanvas));
    let warmed = false;
    const warmUp = () => {
      if (warmed || !isRainSeason(document.documentElement.getAttribute('data-season'))) return;
      warmed = true;
      const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 200));
      idle(() => { const c = ensureClouds(); c.resize(innerWidth, innerHeight, innerWidth < 760); c.clear(); });
    };
    const seasonWatch = new MutationObserver(warmUp);
    seasonWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-season'] });
    warmUp();
    let leaves: { x: number; y: number; size: number; angle: number; depth: number }[] = [];
    let strips: { strip: HTMLDivElement; shade: HTMLDivElement; light: HTMLDivElement; back: HTMLDivElement }[] = [];
    /** The current frame of a playing video as an image URL; null when unavailable or cross-origin. */
    const videoFrame = (video: HTMLVideoElement) => {
      if (video.readyState < 2 || !video.videoWidth) return null;
      try {
        const scale = Math.min(1, 1600 / video.videoWidth);
        const frame = document.createElement('canvas');
        frame.width = Math.round(video.videoWidth * scale); frame.height = Math.round(video.videoHeight * scale);
        frame.getContext('2d')?.drawImage(video, 0, 0, frame.width, frame.height);
        return frame.toDataURL('image/jpeg', .85);
      } catch { return null; }
    };
    /** An inert copy of the outgoing page as it looks right now, positioned for the fixed overlay. */
    const snapshotPage = () => {
      const source = document.querySelector('.site-shell');
      if (!source) return null;
      // Only on-screen sections are copied; the rest become spacers of equal height.
      const sections = [...source.querySelectorAll(':scope > main > *, :scope > footer')];
      const offscreen = sections.map(node => {
        const r = node.getBoundingClientRect();
        if (r.bottom >= 0 && r.top <= innerHeight) return null;
        const cs = getComputedStyle(node);
        return { height: r.height, margin: `${cs.marginTop} 0 ${cs.marginBottom}` };
      });
      const liveVideos = [...source.querySelectorAll('video')];
      const snapshot = source.cloneNode(true) as HTMLElement;
      // Videos become their current frame, so the copy matches what the visitor is looking at.
      snapshot.querySelectorAll('video').forEach((video, i) => {
        const live = liveVideos[i];
        const image = document.createElement('img');
        image.src = (live && !live.paused && videoFrame(live)) || video.poster;
        image.className = video.className;
        image.style.animation = 'none'; image.style.opacity = '1';
        video.replaceWith(image);
      });
      snapshot.querySelectorAll(':scope > main > *, :scope > footer').forEach((node, i) => {
        const box = offscreen[i];
        if (!box) return;
        const spacer = document.createElement('div');
        spacer.style.height = `${box.height}px`;
        spacer.style.margin = box.margin;
        node.replaceWith(spacer);
      });
      snapshot.querySelectorAll('script, canvas, iframe, .skip-link, .seasonal-toggle, .mobile-menu, .section-navigator').forEach(node => node.remove());
      snapshot.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      // Not a second .site-shell: page code looks up the live shell (and its footer) by that class.
      snapshot.classList.replace('site-shell', 'paper-page-snapshot');
      snapshot.style.top = `${-scrollY}px`;
      snapshot.style.width = `${innerWidth}px`;
      const header = snapshot.querySelector<HTMLElement>('.site-header');
      if (header) { header.style.position = 'absolute'; header.style.top = `${scrollY}px`; }
      return snapshot;
    };
    const capturePaper = () => {
      const snapshot = snapshotPage();
      if (!snapshot) return;
      const fragment = document.createDocumentFragment();
      const layer = (className: string) => { const d = document.createElement('div'); d.className = className; return d; };
      const count = paperStripsFor(innerWidth);
      strips = Array.from({ length: count }, (_, i) => {
        const strip = layer('paper-strip');
        strip.style.width = `${innerWidth / count + .7}px`;
        const face = layer('paper-strip-front');
        const copy = snapshot.cloneNode(true) as HTMLElement;
        copy.style.left = `${-i * innerWidth / count}px`;
        const shade = layer('paper-strip-shade'), light = layer('paper-strip-light'), back = layer('paper-strip-back');
        face.append(copy, shade, light); strip.append(face, back); fragment.append(strip);
        return { strip, shade, light, back };
      });
      paper.replaceChildren(fragment);
    };
    const particles = Array.from({ length: 100 }, (_, i) => ({
      x: ((i * 0.6180339) % 1), y: ((i * 0.4142135) % 1),
      size: 0.65 + (i % 7) / 9, angle: i * 2.4, depth: (i % 5) / 5,
    }));
    const stop = () => {
      cancelAnimationFrame(raf); clearTimeout(timeout);
      el.dataset['phase'] = 'idle';
      document.documentElement.removeAttribute('data-page-transition');
      ctx.clearRect(0, 0, width, height);
      paper.replaceChildren(); strips = []; outgoing.replaceChildren();
      curtain.style.opacity = '0'; shadow.style.opacity = '0';
      clouds?.clear(); storm = null; stormLight.flash = 0;
    };
    const beginReveal = (now: number) => {
      release = now; el.dataset['phase'] = 'revealing';
      outgoing.replaceChildren();
      dispatchEvent(new CustomEvent('enkop:storm-reveal'));
    };
    /** Clouds sweep in from the edges, hold while the next page loads behind them, then part from the centre. */
    const drawStorm = (now: number, s: NonNullable<typeof storm>) => {
      const p = s.profile, t = now - start;
      let cover: number, phase = 0, done = false;
      if (s.entrance) {
        const { arriveMs, holdMs, revealMs } = p.entrance;
        if (t >= arriveMs + holdMs && !release) beginReveal(now);
        if (release) { const e = (now - release) / revealMs; phase = 1; cover = 1 - easeInOut(e); done = e >= 1; }
        else cover = easeInOut(t / arriveMs);
      } else {
        const entry = Math.min(1, t / p.coverMs);
        if (!release && entry === 1 && (ready || t - p.coverMs > MAX_HOLD_MS)) beginReveal(now);
        if (release) { const e = (now - release) / p.revealMs; phase = 1; cover = 1 - easeInOut(e); done = e >= 1; }
        else cover = easeInOut(entry);
      }
      for (; s.fired < s.strikes.length && t >= s.strikes[s.fired]!.at; s.fired++) thunder(s.strikes[s.fired]!.strength, 700 + Math.random() * 1500);
      const f = flashAt(t, s.strikes);
      stormLight.flash = f.level * Math.min(1, cover * 1.4);
      ensureClouds().render(now, { cover, phase, flash: stormLight.flash, flashX: f.x, flashY: f.y, maxAlpha: s.entrance ? 0.96 : 1 });
      if (done) { stop(); return; }
      raf = requestAnimationFrame(draw);
    };
    const startStorm = (entrance: boolean) => {
      const profile = currentStormProfile(false);
      const c = ensureClouds();
      c.resize(innerWidth, innerHeight, innerWidth < 760);
      const e = profile.entrance;
      const strikes = !profile.lightning ? []
        : entrance ? planStrikes(e.strikes, e.arriveMs * 0.75, e.arriveMs + e.holdMs)
        : Math.random() < 0.3 ? planStrikes(1, profile.coverMs * 0.6, profile.coverMs + 300) : [];
      storm = { profile, strikes, fired: 0, entrance };
      mood = 'rain';
      el.dataset['mood'] = 'rain'; el.dataset['phase'] = 'covering';
      document.documentElement.setAttribute('data-page-transition', 'rain');
      // Visitors keep seeing the outgoing page until the clouds cover it.
      if (!entrance) { const snapshot = snapshotPage(); if (snapshot) outgoing.replaceChildren(snapshot); }
      start = performance.now(); release = 0; ready = entrance;
      raf = requestAnimationFrame(draw);
      timeout = window.setTimeout(stop, 6500);
    };
    const onEntrance = () => { if (el.dataset['phase'] === 'idle' && !reduce.matches) startStorm(true); };
    addEventListener('enkop:storm-entrance', onEntrance);
    const draw = (now: number) => {
      if (storm) { drawStorm(now, storm); return; }
      const textured = mood === 'leaves' && sprites.length === 4;
      const entryMs = textured ? LEAF_ENTRY_MS : mood === 'flip' ? 160 : mood === 'calm' ? 220 : 420;
      const entry = Math.min(1, (now - start) / entryMs);
      // Reveal once the next page has resolved, or after MAX_HOLD_MS fully covered: slow data then shows
      // the router's own pending state instead of a frozen curtain.
      const settled = ready || now - start - entryMs > MAX_HOLD_MS;
      if (settled && !release && entry === 1 && (!textured || now - start >= LEAF_ENTRY_MS + 140)) {
        release = now; el.dataset['phase'] = 'revealing';
        // The leaves are at full cover here: drop the frozen outgoing page so they blow away onto the new one.
        outgoing.replaceChildren();
      }
      const exit = release ? Math.min(1, (now - release) / (textured ? LEAF_EXIT_MS : mood === 'flip' ? PAPER_TURN_MS : mood === 'calm' ? 320 : 760)) : 0;
      // Per-frame values go on the childless layers that use them, never on ancestors of the page copies.
      curtain.style.opacity = String(textured ? Math.pow(entry, 3) * .78 * Math.pow(1 - exit, 2) : mood === 'flip' ? Math.sin(entry * Math.PI / 2) : mood === 'calm' ? entry * (1 - exit) * .55 : Math.sin(entry * Math.PI / 2) * (1 - exit));
      ctx.clearRect(0, 0, width, height);
      if (mood === 'flip') {
        const count = strips.length;
        for (const [i, { strip, shade, light, back }] of strips.entries()) {
          const pose = paperStripPose(exit, i, width, count);
          strip.style.transform = `translate3d(${pose.x}px,${pose.y}px,${pose.z}px) rotateY(${-pose.angle}rad) skewY(${Math.atan(pose.slope)}rad)`;
          shade.style.opacity = String(pose.shade);
          light.style.opacity = String(pose.highlight);
          back.style.setProperty('--paper-shade', String(pose.shade));
        }
        const edge = paperStripPose(exit, count - 1, width, count);
        const projectedEdge = (edge.x + width / count / 2) * 2600 / Math.max(1200, 2600 - edge.z);
        shadow.style.opacity = String(Math.sin(Math.PI * exit) * .38);
        shadow.style.left = `${Math.max(-width * .3, projectedEdge)}px`;
        shadow.style.width = `${35 + Math.abs(edge.z) * .14}px`;
        shadow.style.filter = `blur(${8 + Math.abs(edge.z) * .035}px)`;
      }
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
      } else if (mood === 'snow' || mood === 'petals') {
        const sweep = 1 - Math.pow(1 - entry, 3);
        for (const [i, p] of particles.entries()) {
          const size = (mood === 'snow' ? 16 : 90) * p.size * Math.min(1.4, width / 900 + .45);
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
      if (event.fromLocation?.pathname === event.toLocation.pathname || event.toLocation.pathname.startsWith('/admin') || event.fromLocation?.pathname.startsWith('/admin')) return;
      const season = document.documentElement.getAttribute('data-season');
      // Reduced motion: no transition, except a brief, still opacity veil in rain seasons.
      if (reduce.matches && !isRainSeason(season)) return;
      stop();
      if (reduce.matches) mood = 'calm';
      else {
        mood = alternatingTransitionMood(season, navigationIndex);
        navigationIndex += 1;
        if (mood === 'rain') { startStorm(false); return; }
      }
      // Never substitute illustrated leaves while the photographic atlas loads.
      // Navigation remains immediate on slow connections or an asset failure.
      if (mood === 'leaves' && sprites.length !== 4) return;
      el.dataset['mood'] = mood; el.dataset['phase'] = 'covering';
      document.documentElement.setAttribute('data-page-transition', mood);
      const styles = getComputedStyle(el);
      palette = [1, 2, 3, 4].map(n => styles.getPropertyValue(`--wind-color-${n}`).trim());
      width = innerWidth; height = innerHeight;
      if (mood === 'flip') capturePaper();
      // The router swaps pages at once; under the leaves the visitor keeps seeing the outgoing page
      // until the leaves cover the screen.
      if (mood === 'leaves') { const snapshot = snapshotPage(); if (snapshot) outgoing.replaceChildren(snapshot); }
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
    return () => { before(); resolved(); stop(); atlas.onload = null; reduce.removeEventListener('change', stop); seasonWatch.disconnect(); removeEventListener('enkop:storm-entrance', onEntrance); };
  }, [router]);

  return <div ref={ref} className="seasonal-page-transition" data-phase="idle" aria-hidden="true">
    <div ref={outgoingRef} className="outgoing-page" inert />
    <canvas ref={cloudsRef} className="storm-clouds" />
    <div ref={curtainRef} className="seasonal-page-curtain" /><canvas ref={canvasRef} />
    <div ref={shadowRef} className="paper-cast-shadow" /><div ref={paperRef} className="paper-turn-sheet" inert />
  </div>;
}