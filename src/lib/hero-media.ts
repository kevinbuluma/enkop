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

/**
 * Streaming encodes of the sharpened 1080p master: ~3.7 Mbps 1080p for wide screens and ~1.9 Mbps 720p
 * for phones and slow connections. The source footage is 720p, so larger exports add weight, not detail.
 */
export function enhancedHeroMedia(url: string | null) {
  const match = url?.match(/^\/videos\/scenes\/enkop-scene-([0-2])\.mp4$/);
  if (!match) return null;
  return {
    desktop: `/videos/scenes/enkop-scene-${match[1]}-1080.mp4`,
    mobile: `/videos/scenes/enkop-scene-${match[1]}-720.mp4`,
  };
}

/** True when the connection is unlikely to sustain the 1080p stream (Chromium's estimate; unknown elsewhere). */
export function prefersLiteHeroMedia(conn: { saveData?: boolean; downlink?: number } | undefined) {
  if (!conn) return false;
  return !!conn.saveData || (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 5);
}

/** The built-in scenes, used when the managed homepage slides can't be loaded. */
export const builtInHeroSlides = [0, 1, 2].map(n => {
  const s = scene(n);
  return { id: `built-in-scene-${n}`, label: '', video_url: s.mp4, webm_url: s.webm, image_url: s.poster };
});
