// Served from public/ so the scenes load on every host, not only Lovable's.
const scene = (n: number) => ({
  mp4: `/videos/scenes/enkop-scene-${n}.mp4`,
  webm: `/videos/scenes/enkop-scene-${n}.webm`,
  poster: `/videos/scenes/enkop-scene-${n}.jpg`,
});

// Match the media path, not the slide id: replacing a scene must use the new upload.
const optimized: Record<string, { mp4: string; webm: string }> = {
  'homepage/scene-1.mp4': scene(0),
  'homepage/scene-2.mp4': scene(1),
  'homepage/scene-3.mp4': scene(2),
};
export function optimizedHeroMedia(path: string | null) {
  return path ? optimized[path] ?? null : null;
}

/** Enhanced exports are upscaled from existing footage, not native 4K captures. */
export function enhancedHeroMedia(url: string | null) {
  const match = url?.match(/^\/videos\/scenes\/enkop-scene-([0-2])\.mp4$/);
  if (!match) return null;
  return {
    hd: `/videos/scenes/enkop-scene-${match[1]}-hd.mp4`,
    ultra: `/videos/scenes/enkop-scene-${match[1]}-4k.mp4`,
    hdWebm: `/videos/scenes/enkop-scene-${match[1]}-hd.webm`,
    ultraWebm: `/videos/scenes/enkop-scene-${match[1]}-4k.webm`,
  };
}

/** The built-in scenes, used when the managed homepage slides can't be loaded. */
export const builtInHeroSlides = [0, 1, 2].map(n => {
  const s = scene(n);
  return { id: `built-in-scene-${n}`, label: '', video_url: s.mp4, webm_url: s.webm, image_url: s.poster };
});
