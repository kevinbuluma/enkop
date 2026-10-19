import { describe, expect, it } from 'vitest';
import { optimizedHeroMedia } from '@/lib/hero-media';

describe('optimized homepage scene media', () => {
  it('provides MP4 and WebM for all existing scenes', () => {
    for (const path of ['homepage/scene-1.mp4', 'homepage/scene-2.mp4', 'homepage/scene-3.mp4']) {
      const media = optimizedHeroMedia(path);
      expect(media?.mp4).toMatch(/\.mp4$/);
      expect(media?.webm).toMatch(/\.webm$/);
    }
  });
  it('does not substitute old footage for an admin replacement', () => {
    expect(optimizedHeroMedia('homepage/replacement.mp4')).toBeNull();
    expect(optimizedHeroMedia(null)).toBeNull();
  });
});