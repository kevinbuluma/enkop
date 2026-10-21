import { describe, expect, it } from 'vitest';
import { builtInHeroSlides, optimizedHeroMedia, enhancedHeroMedia } from '@/lib/hero-media';

describe('optimized homepage scene media', () => {
  it('provides MP4 and WebM for all existing scenes', () => {
    for (const path of ['homepage/scene-1.mp4', 'homepage/scene-2.mp4', 'homepage/scene-3.mp4']) {
      const media = optimizedHeroMedia(path);
      expect(media?.mp4).toMatch(/\.mp4$/);
      expect(media?.webm).toMatch(/\.webm$/);
    }
  });
  it('serves scene media from public/ so it loads on every host', () => {
    for (const path of ['homepage/scene-1.mp4', 'homepage/scene-2.mp4', 'homepage/scene-3.mp4']) {
      const media = optimizedHeroMedia(path)!;
      expect(media.mp4).toMatch(/^\/videos\/scenes\//);
      expect(media.webm).toMatch(/^\/videos\/scenes\//);
    }
  });
  it('uses the ENKOP landing walkthrough as the built-in scene', () => {
    expect(builtInHeroSlides).toHaveLength(1);
    expect(builtInHeroSlides[0]).toMatchObject({ video_url: '/videos/scenes/enkop-landing.mp4', image_url: '/videos/scenes/enkop-landing.jpg' });
    expect(optimizedHeroMedia('homepage/enkop-landing.mp4')).toEqual({ mp4: '/videos/scenes/enkop-landing.mp4', webm: null });
    expect(enhancedHeroMedia('/videos/scenes/enkop-landing.mp4')).toEqual({ hd: '/videos/scenes/enkop-landing.mp4', ultra: '/videos/scenes/enkop-landing-4k.mp4', hdWebm: null, ultraWebm: null, portrait: '/videos/scenes/enkop-landing-vertical.mp4', portraitPoster: '/videos/scenes/enkop-landing-vertical.jpg' });
  });
  it('does not substitute old footage for an admin replacement', () => {
    expect(optimizedHeroMedia('homepage/replacement.mp4')).toBeNull();
    expect(optimizedHeroMedia(null)).toBeNull();
  });
  it('provides enhanced variants for each built-in scene only', () => {
    for (const n of [0, 1, 2]) {
      expect(enhancedHeroMedia(`/videos/scenes/enkop-scene-${n}.mp4`)).toEqual({
        hd: `/videos/scenes/enkop-scene-${n}-hd.mp4`,
        ultra: `/videos/scenes/enkop-scene-${n}-4k.mp4`,
        hdWebm: `/videos/scenes/enkop-scene-${n}-hd.webm`,
        ultraWebm: `/videos/scenes/enkop-scene-${n}-4k.webm`,
        portrait: null,
        portraitPoster: null,
      });
    }
    expect(enhancedHeroMedia('https://example.com/new-upload.mp4')).toBeNull();
    expect(enhancedHeroMedia(null)).toBeNull();
  });
});