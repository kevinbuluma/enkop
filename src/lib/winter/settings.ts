import { z } from 'zod';
import { clamp } from './rng';

// Admin-editable winter environment, stored inside the seasonal settings record (site_settings 'season').

export const winterTransitionModes = ['random', 'alternate', 'snowstorm', 'ice'] as const;
export type WinterTransitionMode = (typeof winterTransitionModes)[number];
export const winterTransitionLabels: Record<WinterTransitionMode, string> = {
  random: 'Random (snowstorm or freeze & shatter)',
  alternate: 'Alternate snowstorm and freeze & shatter',
  snowstorm: 'Snowstorm only',
  ice: 'Freeze & shatter only',
};

export const winterSettingsSchema = z.object({
  enabled: z.boolean(),
  snowfall: z.number().min(0).max(1),
  wind: z.number().min(0).max(1),
  frost: z.number().min(0).max(1),
  accumulation: z.number().min(0).max(1),
  snowmen: z.boolean(),
  transition: z.enum(winterTransitionModes),
  transitionIntensity: z.number().min(0.3).max(1),
  /** Calm mode for every visitor: still snow, grown frost, no winter page transitions. */
  calm: z.boolean(),
});
export type WinterSettings = z.infer<typeof winterSettingsSchema>;

export const defaultWinterSettings: WinterSettings = {
  enabled: true, snowfall: 0.8, wind: 0.6, frost: 0.7, accumulation: 0.7, snowmen: true,
  transition: 'random', transitionIntensity: 1, calm: false,
};

/** Saved values over defaults; anything invalid falls back field by field. */
export function resolveWinterSettings(raw: unknown): WinterSettings {
  const out: WinterSettings = { ...defaultWinterSettings };
  if (!raw || typeof raw !== 'object') return out;
  const shape = winterSettingsSchema.shape;
  for (const key of Object.keys(shape) as (keyof WinterSettings)[]) {
    const parsed = shape[key].safeParse((raw as Record<string, unknown>)[key]);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }
  return out;
}

/** 0 (none) to 3 (heavy): the CSS level used for frost and snow accumulation on surfaces. */
export const surfaceLevel = (value: number) => (value <= 0.05 ? 0 : value < 0.4 ? 1 : value < 0.75 ? 2 : 3);

export type WinterDevice = 'mobile' | 'tablet' | 'desktop';
export const winterDevice = (width: number): WinterDevice => (width < 760 ? 'mobile' : width < 1100 ? 'tablet' : 'desktop');

export type WinterProfile = {
  device: WinterDevice;
  /** Still snow and frost, no moving layers, no winter transitions. */
  calm: boolean;
  flakes: number;
  foreground: number;
  wind: number;
  frost: number;
  maxSnowmen: number;
  snowstorm: { coverMs: number; revealMs: number; powder: number };
  ice: { freezeMs: number; crackMs: number; shatterMs: number; rays: number; rings: number; split: number; dust: number };
};

const deviceScale: Record<WinterDevice, number> = { mobile: 0.38, tablet: 0.62, desktop: 1 };

export function winterProfile(opts: { settings: WinterSettings; intensity: number; gentle: boolean; reducedMotion: boolean; width: number }): WinterProfile {
  const { settings: s } = opts;
  const device = winterDevice(opts.width);
  const level = clamp(opts.intensity) * (opts.gentle ? 0.5 : 1);
  const scale = deviceScale[device];
  const ti = clamp(s.transitionIntensity, 0.3, 1);
  // Lighter transitions are also a little shorter.
  const time = 0.78 + 0.22 * ti;
  const ice = device === 'mobile'
    ? { freezeMs: 700, crackMs: 300, shatterMs: 650, rays: 6, rings: 2, split: 0.1, dust: 60 }
    : device === 'tablet'
      ? { freezeMs: 900, crackMs: 360, shatterMs: 820, rays: 7, rings: 2, split: 0.3, dust: 110 }
      : { freezeMs: 1000, crackMs: 400, shatterMs: 900, rays: 8, rings: 3, split: 0.22, dust: 170 };
  const storm = device === 'mobile' ? { coverMs: 760, revealMs: 700, powder: 110 } : device === 'tablet' ? { coverMs: 950, revealMs: 850, powder: 180 } : { coverMs: 1050, revealMs: 950, powder: 260 };
  return {
    device,
    calm: opts.reducedMotion || s.calm,
    flakes: Math.round(560 * s.snowfall * level * scale),
    foreground: device === 'mobile' ? Math.round(2 * s.snowfall * level) : Math.round(6 * s.snowfall * level),
    wind: clamp(s.wind * (opts.gentle ? 0.55 : 1)),
    frost: clamp(s.frost * (opts.gentle ? 0.7 : 1)),
    maxSnowmen: s.snowmen ? (device === 'mobile' ? 2 : device === 'tablet' ? 3 : 4) : 0,
    snowstorm: { coverMs: Math.round(storm.coverMs * time), revealMs: Math.round(storm.revealMs * time), powder: Math.round(storm.powder * ti) },
    ice: { ...ice, freezeMs: Math.round(ice.freezeMs * time), crackMs: Math.round(ice.crackMs * time), shatterMs: Math.round(ice.shatterMs * time), dust: Math.round(ice.dust * ti) },
  };
}

export type WinterTransition = 'snowstorm' | 'ice';

/** Which winter transition a navigation uses. Only eligible public navigations advance `index`. */
export function pickWinterTransition(mode: WinterTransitionMode, index: number, random: () => number = Math.random): WinterTransition {
  switch (mode) {
    case 'snowstorm': return 'snowstorm';
    case 'ice': return 'ice';
    case 'alternate': return index % 2 === 0 ? 'snowstorm' : 'ice';
    default: return random() < 0.5 ? 'snowstorm' : 'ice';
  }
}
