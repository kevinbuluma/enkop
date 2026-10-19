import scene0Mp4 from '@/assets/enkop-scene-0.mp4.asset.json';
import scene0Webm from '@/assets/enkop-scene-0.webm.asset.json';
import scene1Mp4 from '@/assets/enkop-scene-1.mp4.asset.json';
import scene1Webm from '@/assets/enkop-scene-1.webm.asset.json';
import scene2Mp4 from '@/assets/enkop-scene-2.mp4.asset.json';
import scene2Webm from '@/assets/enkop-scene-2.webm.asset.json';

// Match the media path, not the slide id: replacing a scene must use the new upload.
const optimized: Record<string, { mp4: string; webm: string }> = {
  'homepage/scene-1.mp4': { mp4: scene0Mp4.url, webm: scene0Webm.url },
  'homepage/scene-2.mp4': { mp4: scene1Mp4.url, webm: scene1Webm.url },
  'homepage/scene-3.mp4': { mp4: scene2Mp4.url, webm: scene2Webm.url },
};
export function optimizedHeroMedia(path: string | null) {
  return path ? optimized[path] ?? null : null;
}