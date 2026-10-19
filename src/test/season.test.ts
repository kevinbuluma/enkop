import { describe, it, expect } from 'vitest';
import { computeSeason, seasonConfig } from '@/lib/season';
const d = (iso: string) => new Date(iso);
describe('seasonal atmosphere', () => {
  it('Nairobi tropical default', () => {
    expect(computeSeason(d('2026-01-15T12:00:00Z'))).toBe('dry-warm');
    expect(computeSeason(d('2026-04-15T12:00:00Z'))).toBe('long-rains');
    expect(computeSeason(d('2026-07-15T12:00:00Z'))).toBe('cool-dry');
    expect(computeSeason(d('2026-11-15T12:00:00Z'))).toBe('short-rains');
  });
  it('uses Nairobi time zone at month boundary', () => {
    expect(computeSeason(d('2026-02-28T22:30:00Z'))).toBe('long-rains'); // already 1 March in Nairobi
  });
  it('temperate hemispheres', () => {
    const n = { ...seasonConfig, seasonalProfile: 'temperate-four-season' as const, hemisphere: 'north' as const, timeZone: 'UTC' };
    expect(computeSeason(d('2026-01-10T12:00:00Z'), n)).toBe('winter');
    expect(computeSeason(d('2026-01-10T12:00:00Z'), { ...n, hemisphere: 'south' })).toBe('summer');
  });
  it('custom ranges', () => {
    const c = { ...seasonConfig, seasonalProfile: 'custom' as const, customRanges: [{ from: 11, to: 2, season: 'winter' }] };
    expect(computeSeason(d('2026-12-10T12:00:00Z'), c)).toBe('winter');
  });
});
