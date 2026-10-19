import { useEffect, useRef, useState } from 'react';
import type { PublicSlide } from '@/lib/slides.functions';
import { enhancedHeroMedia } from '@/lib/hero-media';

const IMAGE_HOLD_MS = 7000;
const MAX_VIDEO_MS = 20000;

/** Plays homepage scenes in order, cross-fading between them. Images stand in while videos load and for reduced-motion visitors. */
export function HeroReel({ slides, poster }: { slides: PublicSlide[]; poster: string }) {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
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
    const activeIndex = index % Math.max(1, count);
    const slide = slides[activeIndex];
    const video = videos.current[activeIndex];
    let disposed = false;
    let timer = 0;
    let stallTimer = 0;
    const next = () => { if (!disposed) { setPlaying(null); setIndex(i => (i + 1) % count); } };
    const fallback = () => {
      window.clearTimeout(timer); window.clearTimeout(stallTimer);
      setPlaying(null); video?.pause();
      if (count > 1) timer = window.setTimeout(next, IMAGE_HOLD_MS);
    };
    setPlaying(null);
    videos.current.forEach((v, i) => { if (v && i !== index) v.pause(); });
    if (slide?.video_url && video && !reduced) {
      video.currentTime = 0;
      video.loop = count < 2;
      const onPlaying = () => {
        window.clearTimeout(stallTimer);
        if (disposed) return;
        setPlaying(slide.id);
        window.clearTimeout(timer);
        if (count > 1) timer = window.setTimeout(next, MAX_VIDEO_MS);
      };
      const onWaiting = () => { window.clearTimeout(stallTimer); stallTimer = window.setTimeout(fallback, 4000); };
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
    if (count < 2) return;
    const t = window.setTimeout(next, IMAGE_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [index, count, reduced, slides]);

  return <div className="hero-media" aria-hidden="true">
    <img src={slides[0]?.image_url ?? poster} alt="" width="1920" height="1080" fetchPriority="high" />
    {slides.map((s, i) => {
      const enhanced = enhancedHeroMedia(s.video_url);
      return <div key={s.id} className={`hero-layer ${i === index ? 'hero-layer--on' : ''}`}>
      <img src={s.image_url ?? poster} alt="" width="1920" height="1080" loading={i === 0 ? 'eager' : 'lazy'} />
      {s.video_url && !reduced && <video className={playing === s.id ? 'hero-video--playing' : undefined} ref={el => { videos.current[i] = el; }} poster={s.image_url ?? poster} muted playsInline loop={count < 2} preload={i === index || i === (index + 1) % count ? 'auto' : 'none'}>
        {enhanced && <source src={enhanced.ultra} type="video/mp4" media="(min-width: 1024px)" />}
        {enhanced && <source src={enhanced.ultraWebm} type="video/webm" media="(min-width: 1024px)" />}
        {enhanced && <source src={enhanced.hd} type="video/mp4" />}
        {enhanced && <source src={enhanced.hdWebm} type="video/webm" />}
        {s.webm_url && <source src={s.webm_url} type="video/webm" />}
        <source src={s.video_url} type={s.video_url.split('?')[0]?.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
      </video>}
    </div>; })}
  </div>;
}
