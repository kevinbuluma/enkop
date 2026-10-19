import { useEffect, useRef, useState } from 'react';
import type { PublicSlide } from '@/lib/slides.functions';
import { enhancedHeroMedia, prefersLiteHeroMedia } from '@/lib/hero-media';

const IMAGE_HOLD_MS = 7000;
const MAX_VIDEO_MS = 20000;
// Matches the .hero-layer opacity transition in styles.css.
const FADE_MS = 1400;

/** Plays homepage scenes in order, cross-fading between them. Images stand in while videos load and for reduced-motion visitors. */
export function HeroReel({ slides, poster }: { slides: PublicSlide[]; poster: string }) {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [lite, setLite] = useState(false);
  const [started, setStarted] = useState<ReadonlySet<string>>(() => new Set());
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const count = slides.length;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    setLite(prefersLiteHeroMedia((navigator as Navigator & { connection?: { saveData?: boolean; downlink?: number } }).connection));
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => () => videos.current.forEach(v => v?.pause()), []);

  useEffect(() => {
    if (count < 2 && !slides[0]?.video_url) return;
    const slide = slides[index];
    const video = videos.current[index];
    let disposed = false;
    let advanced = false;
    let timer = 0;
    let stallTimer = 0;
    const next = () => { if (disposed || advanced) return; advanced = true; setIndex(i => (i + 1) % count); };
    const markStarted = (on: boolean) => setStarted(prev => {
      if (prev.has(slide.id) === on) return prev;
      const s = new Set(prev);
      if (on) s.add(slide.id); else s.delete(slide.id);
      return s;
    });
    const fallback = () => {
      window.clearTimeout(timer); window.clearTimeout(stallTimer);
      markStarted(false); video?.pause();
      if (count > 1) timer = window.setTimeout(next, IMAGE_HOLD_MS);
    };
    // The outgoing scene keeps playing underneath the cross-fade, then rests.
    const settle = window.setTimeout(() => videos.current.forEach((v, i) => { if (v && i !== index) v.pause(); }), FADE_MS);
    if (slide?.video_url && video && !reduced) {
      video.currentTime = 0;
      video.loop = count < 2;
      const onPlaying = () => {
        window.clearTimeout(stallTimer);
        if (disposed) return;
        markStarted(true);
        window.clearTimeout(timer);
        if (count > 1) timer = window.setTimeout(next, MAX_VIDEO_MS);
      };
      const onWaiting = () => { window.clearTimeout(stallTimer); stallTimer = window.setTimeout(fallback, 4000); };
      // Begin the cross-fade before the clip ends so the last frame never freezes on screen.
      const onTime = () => { if (count > 1 && video.duration - video.currentTime <= FADE_MS / 1000) next(); };
      video.addEventListener('playing', onPlaying);
      video.addEventListener('waiting', onWaiting);
      video.addEventListener('timeupdate', onTime);
      video.addEventListener('error', fallback);
      video.addEventListener('ended', next);
      timer = window.setTimeout(fallback, 8000);
      video.play().catch(() => { if (!disposed) fallback(); });
      return () => {
        disposed = true; window.clearTimeout(timer); window.clearTimeout(stallTimer); window.clearTimeout(settle);
        video.removeEventListener('playing', onPlaying); video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('timeupdate', onTime);
        video.removeEventListener('error', fallback); video.removeEventListener('ended', next);
      };
    }
    if (count < 2) return () => window.clearTimeout(settle);
    const t = window.setTimeout(next, IMAGE_HOLD_MS);
    return () => { window.clearTimeout(t); window.clearTimeout(settle); };
  }, [index, count, reduced, lite, slides]);

  return <div className="hero-media" aria-hidden="true">
    <img src={slides[0]?.image_url ?? poster} alt="" width="1920" height="1080" fetchPriority="high" />
    {slides.map((s, i) => {
      const media = enhancedHeroMedia(s.video_url);
      return <div key={s.id} className={`hero-layer ${i === index ? 'hero-layer--on' : ''}`}>
      <img src={s.image_url ?? poster} alt="" width="1920" height="1080" loading={i === 0 ? 'eager' : 'lazy'} />
      {s.video_url && !reduced && <video key={lite ? 'lite' : 'full'} className={started.has(s.id) ? 'hero-video--playing' : undefined} ref={el => { videos.current[i] = el; }} poster={s.image_url ?? poster} muted playsInline loop={count < 2} preload={i === index || i === (index + 1) % count ? 'auto' : 'none'}>
        {media && !lite && <source src={media.desktop} type="video/mp4" media="(min-width: 768px)" />}
        {media && <source src={media.mobile} type="video/mp4" />}
        {s.webm_url && <source src={s.webm_url} type="video/webm" />}
        <source src={s.video_url} type={s.video_url.split('?')[0]?.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
      </video>}
    </div>; })}
  </div>;
}
