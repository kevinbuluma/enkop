import { useEffect, useRef, useState } from 'react';
import type { PublicSlide } from '@/lib/slides.functions';
import { enhancedHeroMedia, PORTRAIT_SCREEN } from '@/lib/hero-media';
import { Parallax } from '@/components/enkop/Parallax';

const IMAGE_HOLD_MS = 7000;
const MAX_VIDEO_MS = 20000;
/** Where each scene's camera pushes toward, so consecutive rooms feel like a walked path. */
const PUSH_ORIGINS = ['50% 62%', '40% 50%', '60% 46%', '52% 40%'];

/**
 * Homepage property tour: scenes play in order with a slow camera push-in,
 * walk-through transitions and pointer look-around. There are no on-screen controls,
 * so reduced-motion visitors get the first scene as a still image rather than an
 * auto-advancing tour they cannot pause.
 */
export function HeroReel({ slides, poster }: { slides: PublicSlide[]; poster: string }) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const started = useRef<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const look = useRef<HTMLDivElement>(null);
  const count = slides.length;
  const firstPortrait = enhancedHeroMedia(slides[0]?.video_url ?? null)?.portraitPoster;

  const goTo = (target: number) => {
    if (!count) return;
    const next = ((target % count) + count) % count;
    setIndex(current => {
      if (current === next) return current;
      setLeaving(current);
      return next;
    });
  };

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // A video picks its <source> only when it loads, so rotating the device reloads footage that has a
  // vertical cut. Page transitions snapshot each video as its poster, so the poster follows too.
  useEffect(() => {
    const mq = window.matchMedia(PORTRAIT_SCREEN);
    setPortrait(mq.matches);
    const on = () => {
      setPortrait(mq.matches);
      videos.current.forEach((v) => {
        if (!v?.querySelector(`source[media="${PORTRAIT_SCREEN}"]`)) return;
        const wasPlaying = !v.paused;
        v.load();
        if (wasPlaying) v.play().catch(() => {});
      });
    };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Clear the walk-through layer once its zoom has finished.
  useEffect(() => {
    if (leaving === null) return;
    const t = window.setTimeout(() => setLeaving(null), 1500);
    return () => window.clearTimeout(t);
  }, [leaving]);

  // Pointer look-around: the camera eases toward where the visitor points (fine pointers only).
  useEffect(() => {
    const layer = look.current;
    const area = root.current?.closest('.home-hero') as HTMLElement | null;
    if (!layer || !area || reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let tx = 0, ty = 0, x = 0, y = 0, frame = 0;
    const tick = () => {
      x += (tx - x) * 0.06; y += (ty - y) * 0.06;
      layer.style.transform = `translate3d(${(-x * 22).toFixed(2)}px, ${(-y * 14).toFixed(2)}px, 0) rotateY(${(x * 1.6).toFixed(3)}deg) rotateX(${(-y * 1.1).toFixed(3)}deg) scale(1.07)`;
      frame = Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => { if (!frame) frame = requestAnimationFrame(tick); };
    const move = (e: PointerEvent) => {
      const r = area.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      wake();
    };
    const leave = () => { tx = 0; ty = 0; wake(); };
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerleave', leave);
    return () => {
      area.removeEventListener('pointermove', move); area.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(frame); layer.style.transform = '';
    };
  }, [reduced]);

  useEffect(() => {
    if (count < 2 && !slides[0]?.video_url) return;
    const activeIndex = index % Math.max(1, count);
    const slide = slides[activeIndex];
    const video = videos.current[activeIndex];
    const fresh = started.current !== activeIndex;
    started.current = activeIndex;
    let disposed = false;
    let timer = 0;
    let stallTimer = 0;
    const next = () => { if (!disposed) { setPlaying(null); goTo(activeIndex + 1); } };
    // With several scenes a slow video gives way to its image and the tour moves on. A lone scene
    // keeps buffering instead: the poster shows meanwhile and the video returns once it plays.
    const fallback = () => {
      window.clearTimeout(timer); window.clearTimeout(stallTimer);
      setPlaying(null);
      if (count > 1) { video?.pause(); timer = window.setTimeout(next, IMAGE_HOLD_MS); }
    };
    if (fresh) setPlaying(null);
    videos.current.forEach((v, i) => { if (v && i !== activeIndex) v.pause(); });
    if (slide?.video_url && video && !reduced) {
      if (fresh) video.currentTime = 0;
      video.loop = count < 2;
      const onPlaying = () => {
        window.clearTimeout(stallTimer);
        if (disposed) return;
        setPlaying(slide.id);
        window.clearTimeout(timer);
        if (count > 1) timer = window.setTimeout(next, MAX_VIDEO_MS);
      };
      // A short stall on a lone scene keeps its last frame on screen rather than swapping to the poster.
      const onWaiting = () => { if (count < 2) return; window.clearTimeout(stallTimer); stallTimer = window.setTimeout(fallback, 4000); };
      video.addEventListener('playing', onPlaying);
      video.addEventListener('waiting', onWaiting);
      video.addEventListener('error', fallback);
      video.addEventListener('ended', next);
      timer = window.setTimeout(fallback, 8000);
      video.play().catch(() => { if (!disposed) fallback(); });
      return () => {
        disposed = true; window.clearTimeout(timer); window.clearTimeout(stallTimer);
        video.removeEventListener('playing', onPlaying); video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('error', fallback); video.removeEventListener('ended', next); video.pause();
      };
    }
    if (count < 2 || reduced) return;
    const t = window.setTimeout(next, IMAGE_HOLD_MS);
    return () => { disposed = true; window.clearTimeout(t); };
  }, [index, count, reduced, slides]);

  return <div ref={root} className="hero-reel">
    <Parallax className="hero-parallax" strength={0.14}>
      <div className="hero-media" aria-hidden="true">
        <div ref={look} className="hero-look">
          <picture>
            {firstPortrait && <source srcSet={firstPortrait} media={PORTRAIT_SCREEN} />}
            <img className="hero-base" src={slides[0]?.image_url ?? poster} alt="" width="1920" height="1080" fetchPriority="high" />
          </picture>
          {slides.map((s, i) => {
            const enhanced = enhancedHeroMedia(s.video_url);
            const state = i === index ? ' hero-layer--on' : i === leaving ? ' hero-layer--leaving' : '';
            return <div key={s.id} className={`hero-layer${state}`}>
              <div className="hero-camera" style={{ transformOrigin: PUSH_ORIGINS[i % PUSH_ORIGINS.length] }}>
                <picture>
                  {enhanced?.portraitPoster && <source srcSet={enhanced.portraitPoster} media={PORTRAIT_SCREEN} />}
                  <img src={s.image_url ?? poster} alt="" width="1920" height="1080" loading={i === 0 ? 'eager' : 'lazy'} />
                </picture>
                {s.video_url && !reduced && <video className={playing === s.id ? 'hero-video--playing' : undefined} ref={el => { videos.current[i] = el; }} poster={(portrait && enhanced?.portraitPoster) || (s.image_url ?? poster)} muted playsInline loop={count < 2} preload={i === index || i === (index + 1) % count ? 'auto' : 'none'}>
                  {enhanced?.portrait && <source src={enhanced.portrait} type="video/mp4" media={PORTRAIT_SCREEN} />}
                  {enhanced && <source src={enhanced.ultra} type="video/mp4" media="(min-width: 1024px)" />}
                  {enhanced?.ultraWebm && <source src={enhanced.ultraWebm} type="video/webm" media="(min-width: 1024px)" />}
                  {enhanced && <source src={enhanced.hd} type="video/mp4" />}
                  {enhanced?.hdWebm && <source src={enhanced.hdWebm} type="video/webm" />}
                  {s.webm_url && <source src={s.webm_url} type="video/webm" />}
                  <source src={s.video_url} type={s.video_url.split('?')[0]?.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
                </video>}
              </div>
            </div>;
          })}
        </div>
      </div>
    </Parallax>
  </div>;
}
