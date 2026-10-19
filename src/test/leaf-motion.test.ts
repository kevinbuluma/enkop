import { describe, expect, it } from 'vitest';
import { leafArrival, leafExitPosition } from '@/lib/leaf-motion';

describe('cinematic leaf wind', () => {
  it('brings leaves in individually before filling the screen', () => {
    expect(leafArrival(.2, 0, 100)).toBeGreaterThan(0);
    expect(leafArrival(.2, 99, 100)).toBe(0);
    expect(leafArrival(1, 99, 100)).toBe(1);
  });
  it('slides some leaves completely off opposite screen edges', () => {
    expect(leafExitPosition(640, 360, 1, 0, 1280, 720).x).toBeLessThan(0);
    expect(leafExitPosition(640, 360, 1, 6, 1280, 720).x).toBeGreaterThan(1280);
  });
  it('swirls remaining leaves away without a jump at release', () => {
    expect(leafExitPosition(300, 200, 0, 1, 1280, 720).x).toBeCloseTo(300);
    expect(leafExitPosition(300, 200, .6, 1, 1280, 720).turn).toBeGreaterThan(0);
    const end = leafExitPosition(300, 200, 1, 1, 1280, 720);
    expect(end.x < 0 || end.x > 1280 || end.y < 0 || end.y > 720).toBe(true);
  });
});