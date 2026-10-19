import { describe, expect, it } from 'vitest';
import { builtInHeroSlides, optimizedHeroMedia, enhancedHeroMedia, prefersLiteHeroMedia } from '@/lib/hero-media';

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
    expect(builtInHeroSlides).toHaveLength(3);
    for (const s of builtInHeroSlides) expect(s.image_url).toMatch(/^\/videos\/scenes\/.+\.jpg$/);
  });
  it('does not substitute old footage for an admin replacement', () => {
    expect(optimizedHeroMedia('homepage/replacement.mp4')).toBeNull();
    expect(optimizedHeroMedia(null)).toBeNull();
  });
  it('provides streaming variants for each built-in scene only', () => {
    for (const n of [0, 1, 2]) {
      expect(enhancedHeroMedia(`/videos/scenes/enkop-scene-${n}.mp4`)).toEqual({
        desktop: `/videos/scenes/enkop-scene-${n}-1080.mp4`,
        mobile: `/videos/scenes/enkop-scene-${n}-720.mp4`,
      });
    }
    expect(enhancedHeroMedia('https://example.com/new-upload.mp4')).toBeNull();
    expect(enhancedHeroMedia(null)).toBeNull();
  });
  it('drops to the lighter stream for data saver or slow connections only', () => {
    expect(prefersLiteHeroMedia(undefined)).toBe(false);
    expect(prefersLiteHeroMedia({ downlink: 10 })).toBe(false);
    expect(prefersLiteHeroMedia({ downlink: 1.2 })).toBe(true);
    expect(prefersLiteHeroMedia({ saveData: true, downlink: 10 })).toBe(true);
  });
});