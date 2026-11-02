import { describe, expect, it } from 'vitest';
import { seeded } from '@/lib/winter/rng';
import { defaultWinterSettings, pickWinterTransition, resolveWinterSettings, surfaceLevel, winterProfile } from '@/lib/winter/settings';
import { Snowfall, WinterWind } from '@/lib/winter/snowfall';
import { centreReach, cornerReach, frostDendrites } from '@/lib/winter/frost';
import { crackPattern, polygonArea, shardPose } from '@/lib/winter/ice-shatter';
import { APPROACH, clumpPose, driftLayout, packedSnow } from '@/lib/winter/snow-drift';
import { chooseSnowmen, spreadSnowmen, type SnowmanCandidate } from '@/lib/winter/snowman-placement';
import { seasonSettingsSchema } from '@/lib/season';

const W = 1280, H = 800;

describe('winter settings', () => {
  it('older seasonal settings without winter controls stay valid and use the defaults', () => {
    const old = { enabled: true, seasonalProfile: 'tropical', hemisphere: 'south', timeZone: 'Africa/Nairobi', location: 'Nairobi', intensity: 1, customRanges: [] };
    expect(seasonSettingsSchema.safeParse(old).success).toBe(true);
    expect(resolveWinterSettings(undefined)).toEqual(defaultWinterSettings);
  });
  it('keeps valid saved values and replaces invalid ones field by field', () => {
    const s = resolveWinterSettings({ snowfall: 0.3, wind: 7, transition: 'ice', snowmen: 'yes' });
    expect(s.snowfall).toBe(0.3);
    expect(s.wind).toBe(defaultWinterSettings.wind);
    expect(s.transition).toBe('ice');
    expect(s.snowmen).toBe(true);
  });
  it('maps surface intensity to four levels', () => {
    expect([0, 0.2, 0.5, 0.9].map(surfaceLevel)).toEqual([0, 1, 2, 3]);
  });
});

describe('winter device adaptation', () => {
  const profile = (width: number, extra: Partial<Parameters<typeof winterProfile>[0]> = {}) =>
    winterProfile({ settings: defaultWinterSettings, intensity: 1, gentle: false, reducedMotion: false, width, ...extra });
  it('uses fewer flakes and shards and shorter transitions on phones', () => {
    const desktop = profile(1440), tablet = profile(900), phone = profile(390);
    expect(phone.flakes).toBeLessThan(tablet.flakes);
    expect(tablet.flakes).toBeLessThan(desktop.flakes);
    expect(phone.ice.rays * phone.ice.rings).toBeLessThan(desktop.ice.rays * desktop.ice.rings);
    const total = (p: typeof desktop) => p.ice.freezeMs + p.ice.crackMs + p.ice.shatterMs;
    expect(total(phone)).toBeLessThan(total(desktop));
  });
  it('keeps both winter transitions within 1.5 to 2.5 seconds on desktop', () => {
    const p = profile(1440);
    expect(p.ice.freezeMs + p.ice.crackMs + p.ice.shatterMs).toBeGreaterThanOrEqual(1500);
    expect(p.ice.freezeMs + p.ice.crackMs + p.ice.shatterMs).toBeLessThanOrEqual(2500);
    expect(p.snowstorm.coverMs + p.snowstorm.revealMs).toBeGreaterThanOrEqual(1500);
    expect(p.snowstorm.coverMs + p.snowstorm.revealMs).toBeLessThanOrEqual(2500);
  });
  it('reduced motion and the admin calm mode both give the calm environment', () => {
    expect(profile(1440, { reducedMotion: true }).calm).toBe(true);
    expect(winterProfile({ settings: { ...defaultWinterSettings, calm: true }, intensity: 1, gentle: false, reducedMotion: false, width: 1440 }).calm).toBe(true);
  });
  it('hides snowmen when the admin turns them off', () => {
    expect(winterProfile({ settings: { ...defaultWinterSettings, snowmen: false }, intensity: 1, gentle: false, reducedMotion: false, width: 1440 }).maxSnowmen).toBe(0);
  });
});

describe('winter transition selection', () => {
  it('alternates when asked', () => expect([0, 1, 2, 3].map(i => pickWinterTransition('alternate', i))).toEqual(['snowstorm', 'ice', 'snowstorm', 'ice']));
  it('honours a fixed choice', () => {
    expect(pickWinterTransition('snowstorm', 1)).toBe('snowstorm');
    expect(pickWinterTransition('ice', 0)).toBe('ice');
  });
  it('random mode uses both transitions', () => {
    const r = seeded(4);
    const picks = new Set(Array.from({ length: 20 }, (_, i) => pickWinterTransition('random', i, r)));
    expect(picks).toEqual(new Set(['snowstorm', 'ice']));
  });
});

describe('winter wind and snowfall', () => {
  it('gusts come and go and stay bounded', () => {
    const wind = new WinterWind(0.6, seeded(2));
    let gusts = 0, max = 0, prev = 0;
    for (let i = 0; i < 60 * 60; i++) {
      wind.step(1 / 60);
      if (wind.gust > 0.5 && prev <= 0.5) gusts++;
      prev = wind.gust; max = Math.max(max, Math.abs(wind.x));
      expect(wind.density).toBeGreaterThanOrEqual(0.4);
      expect(wind.density).toBeLessThanOrEqual(1.15);
    }
    expect(gusts).toBeGreaterThanOrEqual(2);
    expect(max).toBeLessThan(0.6 * 70 * 1.4 + 0.6 * 280 + 1);
  });
  it('no wind setting means no wind', () => {
    const wind = new WinterWind(0, seeded(2));
    for (let i = 0; i < 600; i++) { wind.step(1 / 60); expect(wind.x).toBe(0); }
  });
  it('flakes keep falling inside the screen and drift with the wind', () => {
    const snow = new Snowfall({ width: W, height: H, count: 300, foreground: 4, wind: 0.8, random: seeded(9) });
    for (let i = 0; i < 600; i++) snow.step(16);
    for (const f of snow.flakes) {
      expect(f.x).toBeGreaterThan(-90);
      expect(f.x).toBeLessThan(W + 90);
      if (f.layer !== 3) expect(f.y).toBeLessThan(H + 40);
    }
    expect(snow.flakes.filter(f => f.layer === 3)).toHaveLength(4);
  });
  it('flakes are pushed away from the cursor', () => {
    const snow = new Snowfall({ width: W, height: H, count: 1, foreground: 0, wind: 0, random: seeded(1) });
    const f = snow.flakes[0]!;
    Object.assign(f, { x: 600, y: 400, layer: 1, push: 0, sway: 0 });
    snow.step(16, { x: 560, y: 400, vx: 0, vy: 0 });
    expect(f.push).toBeGreaterThan(0);
  });
});

describe('frost formation', () => {
  it('the full-screen freeze starts at the edges and reaches the centre last', () => {
    const segs = frostDendrites({ width: W, height: H, spacing: 44, reach: centreReach(W, H), random: seeded(3) });
    const edgeDistance = (x: number, y: number) => Math.min(x, W - x, y, H - y);
    const early = segs.filter(s => s.birth < 0.15), late = segs.filter(s => s.birth > 0.85);
    const mean = (list: typeof segs) => list.reduce((a, s) => a + edgeDistance(s.x1, s.y1), 0) / list.length;
    expect(early.length).toBeGreaterThan(50);
    expect(late.length).toBeGreaterThan(0);
    expect(mean(early)).toBeLessThan(mean(late) / 3);
    // Sorted so the frost can be drawn incrementally.
    expect(segs.every((s, i) => i === 0 || s.birth >= segs[i - 1]!.birth)).toBe(true);
  });
  it('screen-edge frost is heaviest in the corners and never reaches the centre', () => {
    const reach = cornerReach(W, H, 140);
    expect(reach(0, 0)).toBeGreaterThan(reach(W / 2, 0) * 3);
    const segs = frostDendrites({ width: W, height: H, spacing: 32, reach, random: seeded(5) });
    for (const s of segs) expect(Math.hypot(s.x2 - W / 2, s.y2 - H / 2)).toBeGreaterThan(Math.min(W, H) * 0.25);
  });
});

describe('ice shatter', () => {
  const pattern = crackPattern({ width: W, height: H, rays: 8, rings: 3, split: 0.25, random: seeded(12) });
  it('shards cover the whole screen without gaps or overlaps', () => {
    // Clip each shard to the screen by sampling: every point belongs to exactly one shard.
    const inside = (pts: { x: number; y: number }[], x: number, y: number) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i]!, b = pts[j]!;
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    };
    for (let x = 13; x < W; x += 61) for (let y = 11; y < H; y += 53) {
      expect(pattern.shards.filter(s => inside(s.points, x, y)).length).toBe(1);
    }
    expect(pattern.shards.every(s => polygonArea(s.points) > 0)).toBe(true);
  });
  it('cracks start at the impact and run outwards in time', () => {
    const first = pattern.cracks.filter(c => c.start === 0);
    expect(first.length).toBe(8);
    for (const c of first) expect(c.points[0]).toEqual(pattern.impact);
  });
  it('shards nearest the impact break away first, then fall and fade', () => {
    const near = [...pattern.shards].sort((a, b) => a.distance - b.distance)[0]!;
    const far = [...pattern.shards].sort((a, b) => b.distance - a.distance)[0]!;
    expect(near.delay).toBeLessThan(far.delay);
    const start = shardPose(near, 0, 0.9), later = shardPose(near, 0.7, 0.9), end = shardPose(near, 0.9, 0.9);
    expect(start.x).toBeCloseTo(0);
    expect(later.y).toBeGreaterThan(shardPose(near, 0.3, 0.9).y);
    expect(end.opacity).toBeLessThan(0.05);
  });
});

describe('snowstorm drift', () => {
  const clumps = driftLayout({ width: W, height: H, random: seeded(6), variants: 5 });
  it('snow lands at the edges first and has fully covered the screen by the end of the cover', () => {
    const edge = (c: typeof clumps[number]) => Math.min(c.x, W - c.x, c.y, H - c.y);
    const byArrival = [...clumps].sort((a, b) => a.arrive - b.arrive);
    const firstQuarter = byArrival.slice(0, byArrival.length / 4), lastQuarter = byArrival.slice(-byArrival.length / 4);
    const mean = (l: typeof clumps) => l.reduce((s, c) => s + edge(c), 0) / l.length;
    expect(mean(firstQuarter)).toBeLessThan(mean(lastQuarter));
    expect(clumps.every(c => clumpPose(c, 1, 0, W, H).alpha === 1)).toBe(true);
    expect(packedSnow(1, 0)).toBe(1);
  });
  it('nothing shows before its approach, and every clump is blown away by the end', () => {
    for (const c of clumps) {
      expect(clumpPose(c, 0, 0, W, H).alpha).toBe(0);
      if (c.arrive > APPROACH + 0.01) expect(clumpPose(c, c.arrive - APPROACH - 0.01, 0, W, H).alpha).toBe(0);
      expect(clumpPose(c, 1, 1, W, H).alpha).toBeLessThan(0.01);
    }
    expect(packedSnow(1, 1)).toBe(0);
  });
});

describe('snowman placement', () => {
  const candidates: SnowmanCandidate[] = Array.from({ length: 12 }, (_, i) => ({ key: `0:${i}`, kind: 'card', chance: 0.5, perches: ['top-left', 'top-right'] }));
  it('is stable for a visit and page, and differs between pages', () => {
    expect(chooseSnowmen(candidates, 'abc', '/')).toEqual(chooseSnowmen(candidates, 'abc', '/'));
    expect(chooseSnowmen(candidates, 'abc', '/')).not.toEqual(chooseSnowmen(candidates, 'abc', '/properties'));
  });
  it('keeps at most the allowed number, spaced apart', () => {
    const placed = Array.from({ length: 10 }, (_, i) => ({ x: i * 100, y: 0 }));
    const kept = spreadSnowmen(placed, 3, 220);
    expect(kept).toHaveLength(3);
    expect(kept.map(k => k.x)).toEqual([0, 300, 600]);
  });
});
