import { z } from 'zod';
/** Central, deterministic seasonal atmosphere configuration. Visual mood only — never a weather claim. */
export type SeasonProfile = 'tropical' | 'temperate-four-season' | 'custom';
export type SeasonConfig = {
  seasonMode: 'tropical';
  location: string;
  timeZone: string;
  hemisphere: 'north' | 'south';
  seasonalProfile: SeasonProfile;
  /** For custom profile: month ranges (1-12, inclusive) mapped to a mood key. */
  customRanges?: { from: number; to: number; season: string }[];
};

export const seasonConfig: SeasonConfig = {
  seasonMode: 'tropical',
  location: 'Nairobi, Kenya',
  timeZone: 'Africa/Nairobi',
  hemisphere: 'south',
  seasonalProfile: 'tropical',
};

export const seasonLabels: Record<string, string> = {
  'dry-warm': 'Warm dry season', 'long-rains': 'Long rains', 'cool-dry': 'Cool dry season', 'short-rains': 'Short rains',
  winter: 'Winter', spring: 'Spring', summer: 'Summer', autumn: 'Autumn',
};

/** Month (1-12) in the configured time zone, not the visitor's device zone. */
export function monthIn(date: Date, timeZone: string) {
  return Number(new Intl.DateTimeFormat('en-GB', { month: 'numeric', timeZone }).format(date));
}

export function computeSeason(date: Date, config: SeasonConfig = seasonConfig): string {
  const m = monthIn(date, config.timeZone);
  if (config.seasonalProfile === 'custom' && config.customRanges) {
    const hit = config.customRanges.find(r => r.from <= r.to ? m >= r.from && m <= r.to : m >= r.from || m <= r.to);
    if (hit) return hit.season;
  }
  if (config.seasonalProfile === 'temperate-four-season') {
    const north = m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
    const flip: Record<string, string> = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };
    return config.hemisphere === 'north' ? north : (flip[north] ?? north);
  }
  if (m <= 2) return 'dry-warm';
  if (m <= 5) return 'long-rains';
  if (m <= 9) return 'cool-dry';
  return 'short-rains';
}

/** Admin-editable seasonal settings stored in the database. */
export const seasonSettingsSchema = z.object({
  enabled: z.boolean(),
  seasonalProfile: z.enum(['tropical', 'temperate-four-season', 'custom']),
  hemisphere: z.enum(['north', 'south']),
  timeZone: z.string().min(3).max(60),
  location: z.string().max(80),
  intensity: z.number().min(0).max(1),
  customRanges: z.array(z.object({ from: z.number().int().min(1).max(12), to: z.number().int().min(1).max(12), season: z.enum(['dry-warm', 'long-rains', 'cool-dry', 'short-rains', 'winter', 'spring', 'summer', 'autumn']) })).max(12),
});
export type SeasonSettings = z.infer<typeof seasonSettingsSchema>;

export function toConfig(s: SeasonSettings): SeasonConfig {
  return { seasonMode: 'tropical', location: s.location, timeZone: s.timeZone, hemisphere: s.hemisphere, seasonalProfile: s.seasonalProfile, customRanges: s.customRanges };
}
