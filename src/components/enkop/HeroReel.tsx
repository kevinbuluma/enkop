import { useEffect, useRef, useState } from 'react';
import type { PublicSlide } from '@/lib/slides.functions';

const IMAGE_HOLD_MS = 7000;
const MAX_VIDEO_MS = 20000;

/** Plays homepage scenes in order, cross-fading between them. Images stand in while videos load and for reduced-motion visitors. */
export function HeroReel({ slides, poster }: { slides: PublicSlide[]; poster: string }) {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const count = slides.length;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    if (count < 2 && !slides[0]?.video_url) return;
    const slide = slides[index];
    const video = videos.current[index];
    const next = () => setIndex(i => (i + 1) % count);
    videos.current.forEach((v, i) => { if (v && i !== index) v.pause(); });
    if (slide?.video_url && video && !reduced) {
      video.currentTime = 0;
      video.play().catch(() => {});
      if (count < 2) { video.loop = true; return; }
      video.loop = false;
      video.addEventListener('ended', next);
      const cap = window.setTimeout(next, MAX_VIDEO_MS);
      return () => { video.removeEventListener('ended', next); window.clearTimeout(cap); };
    }
    if (count < 2) return;
    const t = window.setTimeout(next, IMAGE_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [index, count, reduced, slides]);

  return <div className="hero-media" aria-hidden="true">
    <img src={slides[0]?.image_url ?? poster} alt="" width="1920" height="1080" fetchPriority="high" />
    {slides.map((s, i) => <div key={s.id} className={`hero-layer ${i === index ? 'hero-layer--on' : ''}`}>
      <img src={s.image_url ?? poster} alt="" width="1920" height="1080" loading={i === 0 ? 'eager' : 'lazy'} />
      {s.video_url && !reduced && <video ref={el => { videos.current[i] = el; }} src={s.video_url} poster={s.image_url ?? poster} muted playsInline preload={i === index || i === (index + 1) % count ? 'auto' : 'none'} />}
    </div>)}
  </div>;
}
