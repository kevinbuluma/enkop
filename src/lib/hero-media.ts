// Served from public/ so the scenes load on every host, not only Lovable's.
const scene = (n: number) => ({
  mp4: `/videos/scenes/enkop-scene-${n}.mp4`,
  webm: `/videos/scenes/enkop-scene-${n}.webm`,
  poster: `/videos/scenes/enkop-scene-${n}.jpg`,
});

/** The ENKOP landing walkthrough: a seamless loop at 1080p for wide screens and 720p for phones. */
const landing = {
  mp4: '/videos/scenes/enkop-landing.mp4',
  mobile: '/videos/scenes/enkop-landing-720.mp4',
  poster: '/videos/scenes/enkop-landing.jpg',
};

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

type Enhanced = { hd: string; ultra: string; hdWebm: string | null; ultraWebm: string | null };

/** Screen-size variants of built-in footage. The earlier scenes' "4K" files are upscaled, not native captures. */
export function enhancedHeroMedia(url: string | null): Enhanced | null {
  if (url === landing.mp4) return { hd: landing.mobile, ultra: landing.mp4, hdWebm: null, ultraWebm: null };
  const match = url?.match(/^\/videos\/scenes\/enkop-scene-([0-2])\.mp4$/);
  if (!match) return null;
  return {
    hd: `/videos/scenes/enkop-scene-${match[1]}-hd.mp4`,
    ultra: `/videos/scenes/enkop-scene-${match[1]}-4k.mp4`,
    hdWebm: `/videos/scenes/enkop-scene-${match[1]}-hd.webm`,
    ultraWebm: `/videos/scenes/enkop-scene-${match[1]}-4k.webm`,
  };
}

/** The built-in scene, used when the managed homepage slides can't be loaded. */
export const builtInHeroSlides = [{ id: 'built-in-landing', label: 'Inside an ENKOP residence', video_url: landing.mp4, webm_url: null, image_url: landing.poster }];
