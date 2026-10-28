import { describe, it, expect } from 'vitest';
import { isRainSeason, nextPreference, parsePreference, stormProfile } from '@/lib/storm/atmosphere';
import { flashAt, MIN_GAP_MS, planStrikes } from '@/lib/storm/lightning';
import { SLIDE_RADIUS, WaterDropletSystem } from '@/lib/storm/water-droplets';
import { Rainfall } from '@/lib/storm/rainfall';

describe('storm activation', () => {
  it('runs only in rain seasons', () => {
    expect(isRainSeason('long-rains')).toBe(true);
    expect(isRainSeason('short-rains')).toBe(true);
    for (const s of ['autumn', 'winter', 'dry-warm', 'cool-dry', null, undefined, '']) expect(isRainSeason(s)).toBe(false);
  });
  it('cycles the visitor preference on, gentle, off and reads unknown values as on', () => {
    expect(nextPreference('on')).toBe('gentle');
    expect(nextPreference('gentle')).toBe('off');
    expect(nextPreference('off')).toBe('on');
    expect(parsePreference(null)).toBe('on');
    expect(parsePreference('gentle')).toBe('gentle');
    expect(parsePreference('anything')).toBe('on');
  });
});

describe('storm profiles', () => {
  const base = { intensity: 1, preference: 'on' as const, reducedMotion: false, mobile: false };
  it('keeps navigation transitions within about two seconds and never past the hold', () => {
    for (const mobile of [false, true]) for (const preference of ['on', 'gentle'] as const) {
      const p = stormProfile({ ...base, mobile, preference });
      expect(p.coverMs + p.revealMs).toBeLessThanOrEqual(1600);
    }
  });
  it('is shorter on phones and gentler with the gentle preference', () => {
    const desktop = stormProfile(base), phone = stormProfile({ ...base, mobile: true }), gentle = stormProfile({ ...base, preference: 'gentle' });
    expect(phone.coverMs + phone.revealMs).toBeLessThan(desktop.coverMs + desktop.revealMs);
    expect(phone.level).toBeLessThan(desktop.level);
    expect(gentle.level).toBeLessThan(desktop.level);
    expect(gentle.lightning).toBe(false);
  });
  it('is calm under reduced motion: no lightning, no entrance and very little rain', () => {
    const p = stormProfile({ ...base, reducedMotion: true });
    expect(p.calm).toBe(true);
    expect(p.lightning).toBe(false);
    expect(p.entrance.strikes).toBe(0);
    expect(p.level).toBeLessThanOrEqual(0.3);
  });
  it('follows the admin intensity', () => {
    expect(stormProfile({ ...base, intensity: 0.5 }).level).toBeCloseTo(0.5);
  });
});

describe('lightning', () => {
  it('never strobes: strikes are spaced and each is a single soft pulse', () => {
    for (let seed = 0; seed < 20; seed++) {
      const strikes = planStrikes(4, 0, 4000, seed / 20);
      for (let i = 1; i < strikes.length; i++) expect(strikes[i]!.at - strikes[i - 1]!.at).toBeGreaterThanOrEqual(MIN_GAP_MS);
      for (const s of strikes) { expect(s.strength).toBeLessThanOrEqual(1); expect(s.at).toBeGreaterThanOrEqual(0); }
    }
    const [strike] = planStrikes(1, 0, 1000, 0.3);
    let peaks = 0, prev = 0, rising = true;
    for (let t = 0; t < 3000; t += 5) {
      const { level } = flashAt(t, [strike!]);
      if (rising && level < prev) { peaks++; rising = false; }
      if (level > prev) rising = true;
      prev = level;
    }
    expect(peaks).toBe(1);
  });
  it('is dark between strikes', () => {
    expect(flashAt(5000, planStrikes(1, 0, 1000, 0.1)).level).toBeLessThan(0.01);
  });
});

describe('water on glass', () => {
  it('conserves water when drops merge', () => {
    const system = new WaterDropletSystem({ width: 400, height: 400, density: 0, seed: 0.4 });
    system.drops = [
      { x: 100, y: 100, r: 3, vx: 0, vy: 0, moving: false, stuck: 0, alpha: 1, fading: false, trailIn: 10, shape: 0.5, phase: 0, lastX: 100, lastY: 100 },
      { x: 103, y: 101, r: 2, vx: 0, vy: 0, moving: false, stuck: 0, alpha: 1, fading: false, trailIn: 10, shape: 0.5, phase: 0, lastX: 103, lastY: 101 },
    ];
    const before = system.water();
    system.step(1);
    expect(system.drops).toHaveLength(1);
    expect(system.water()).toBeCloseTo(before, 0);
  });
  it('lets heavy drops slide down and leave a trail', () => {
    const system = new WaterDropletSystem({ width: 400, height: 2000, density: 0, seed: 0.7 });
    system.drops = [{ x: 200, y: 50, r: SLIDE_RADIUS + 3, vx: 0, vy: 0, moving: true, stuck: 0, alpha: 1, fading: false, trailIn: 10, shape: 0.5, phase: 0, lastX: 200, lastY: 50 }];
    for (let i = 0; i < 120; i++) system.step(16);
    expect(system.drops[0]!.y).toBeGreaterThan(80);
    expect(system.trail.length).toBeGreaterThan(0);
  });
  it('keeps text, prices and forms clear of water', () => {
    const system = new WaterDropletSystem({ width: 400, height: 400, density: 1, seed: 0.2, zoneAt: (x) => (x < 200 ? 'quiet' : 'media') });
    for (let i = 0; i < 300; i++) system.step(16);
    expect(system.drops.length).toBeGreaterThan(0);
    const stillOnText = system.drops.filter((d) => d.x < 190 && !d.moving && d.alpha > 0.3);
    expect(stillOnText).toHaveLength(0);
  });
  it('lays still water for reduced motion without moving it', () => {
    const system = new WaterDropletSystem({ width: 400, height: 400, density: 0.3, seed: 0.9 });
    system.seedStill(30);
    // Plain light surfaces collect less water, so some placements are skipped.
    expect(system.drops.length).toBeGreaterThan(15);
    expect(system.drops.length).toBeLessThanOrEqual(30);
    expect(system.drops.every((d) => !d.moving && d.r < SLIDE_RADIUS)).toBe(true);
  });
});

describe('rainfall', () => {
  it('scales the number of streaks with screen area and storm level', () => {
    const full = new Rainfall({ width: 1440, height: 900, level: 1, seed: 0.1 });
    const phone = new Rainfall({ width: 390, height: 844, level: 0.7, seed: 0.1 });
    expect(phone.streaks.length).toBeLessThan(full.streaks.length / 3);
    full.resize(1440, 900, 0.45);
    expect(full.streaks.length).toBe(full.target());
  });
  it('keeps falling and recycles streaks', () => {
    const rain = new Rainfall({ width: 800, height: 600, level: 1, seed: 0.3 });
    const count = rain.streaks.length;
    for (let i = 0; i < 400; i++) rain.step(16);
    expect(rain.streaks.length).toBe(count);
    expect(rain.streaks.every((s) => s.y < 600 + s.len + 200)).toBe(true);
  });
});
