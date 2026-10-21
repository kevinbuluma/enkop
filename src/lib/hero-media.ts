// Served from public/ so the scenes load on every host, not only Lovable's.
const scene = (n: number) => ({
  mp4: `/videos/scenes/enkop-scene-${n}.mp4`,
  webm: `/videos/scenes/enkop-scene-${n}.webm`,
  poster: `/videos/scenes/enkop-scene-${n}.jpg`,
});

/**
 * The ENKOP landing walkthrough as a seamless loop: a sharpened 4K upscale (kept under Cloudflare's
 * 25 MiB static-file limit) for wide screens and sharpened 1080p for landscape phones. Phones and
 * tablets held upright get the separately shot vertical walkthrough.
 */
const landing = {
  mp4: '/videos/scenes/enkop-landing.mp4',
  ultra: '/videos/scenes/enkop-landing-4k.mp4',
  poster: '/videos/scenes/enkop-landing.jpg',
  portrait: '/videos/scenes/enkop-landing-vertical.mp4',
  portraitPoster: '/videos/scenes/enkop-landing-vertical.jpg',
};

/** Upright phone and tablet screens; laptops and desktops are landscape and keep the wide footage. */
export const PORTRAIT_SCREEN = '(orientation: portrait) and (max-width: 1366px)';

// Match the media path, not the slide id: replacing a scene must use the new upload.
const optimized: Record<string, { mp4: string; webm: string | null }> = {
  'homepage/scene-1.mp4': scene(0),
  'homepage/scene-2.mp4': scene(1),
  'homepage/scene-3.mp4': scene(2),
  'homepage/enkop-landing.mp4': { mp4: landing.mp4, webm: null },
};
export function optimizedHeroMedia(path: string | null) {
  return path ? optimized[path] ?? null : null;
}

type Enhanced = { hd: string; ultra: string; hdWebm: string | null; ultraWebm: string | null; portrait: string | null; portraitPoster: string | null };

/** Screen-size variants of built-in footage. The earlier scenes' "4K" files are upscaled, not native captures. */
export function enhancedHeroMedia(url: string | null): Enhanced | null {
  if (url === landing.mp4) return { hd: landing.mp4, ultra: landing.ultra, hdWebm: null, ultraWebm: null, portrait: landing.portrait, portraitPoster: landing.portraitPoster };
  const match = url?.match(/^\/videos\/scenes\/enkop-scene-([0-2])\.mp4$/);
  if (!match) return null;
  return {
    hd: `/videos/scenes/enkop-scene-${match[1]}-hd.mp4`,
    ultra: `/videos/scenes/enkop-scene-${match[1]}-4k.mp4`,
    hdWebm: `/videos/scenes/enkop-scene-${match[1]}-hd.webm`,
    ultraWebm: `/videos/scenes/enkop-scene-${match[1]}-4k.webm`,
    portrait: null,
    portraitPoster: null,
  };
}

/** The built-in scene, used when the managed homepage slides can't be loaded. */
export const builtInHeroSlides = [{ id: 'built-in-landing', label: 'Inside an ENKOP residence', video_url: landing.mp4, webm_url: null, image_url: landing.poster }];
