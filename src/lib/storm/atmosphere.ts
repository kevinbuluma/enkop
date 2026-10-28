// Resolves when and how strongly the rainy-season storm runs. Pure, so it is unit-tested.

export const RAIN_SEASONS = ['long-rains', 'short-rains'] as const;
export const isRainSeason = (season: string | null | undefined) => (RAIN_SEASONS as readonly string[]).includes(season ?? '');

/** Visitor preference from the footer toggle: full storm, gentle (less movement) or off. */
export type AtmospherePreference = 'on' | 'gentle' | 'off';
export const parsePreference = (stored: string | null): AtmospherePreference => (stored === 'off' || stored === 'gentle' ? stored : 'on');
export const nextPreference = (p: AtmospherePreference): AtmospherePreference => (p === 'on' ? 'gentle' : p === 'gentle' ? 'off' : 'on');

export type StormProfile = {
  /** 0..1 multiplier for rain and droplet density. */
  level: number;
  lightning: boolean;
  /** Navigation transition: cloud cover in, then clouds part. */
  coverMs: number;
  revealMs: number;
  /** First-entrance timeline (clouds arrive, lightning, clouds part). */
  entrance: { arriveMs: number; holdMs: number; revealMs: number; strikes: number };
  /** Reduced motion: no moving rain or clouds; a soft veil and a few still droplets. */
  calm: boolean;
};

export function stormProfile(opts: { intensity: number; preference: AtmospherePreference; reducedMotion: boolean; mobile: boolean }): StormProfile {
  const intensity = Math.min(1, Math.max(0, opts.intensity));
  const gentle = opts.preference === 'gentle';
  const level = intensity * (gentle ? 0.45 : 1) * (opts.mobile ? 0.7 : 1);
  if (opts.reducedMotion) {
    return { level: Math.min(level, 0.3), lightning: false, coverMs: 220, revealMs: 320, entrance: { arriveMs: 0, holdMs: 0, revealMs: 0, strikes: 0 }, calm: true };
  }
  if (gentle) {
    return { level, lightning: false, coverMs: 500, revealMs: 650, entrance: { arriveMs: 1300, holdMs: 300, revealMs: 1200, strikes: 0 }, calm: false };
  }
  if (opts.mobile) {
    return { level, lightning: true, coverMs: 450, revealMs: 620, entrance: { arriveMs: 1700, holdMs: 900, revealMs: 1300, strikes: 1 }, calm: false };
  }
  return { level, lightning: true, coverMs: 650, revealMs: 850, entrance: { arriveMs: 2300, holdMs: 1200, revealMs: 1600, strikes: 2 }, calm: false };
}

/** Smooth 0..1 easing used by the cloud masks. */
export const easeInOut = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
