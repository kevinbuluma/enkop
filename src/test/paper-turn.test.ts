import { describe, expect, it } from 'vitest';
import { PAPER_STRIPS, paperStripPose } from '@/lib/paper-turn';

describe('flexible page geometry', () => {
  it('starts flat and aligned with the outgoing viewport', () => {
    expect(paperStripPose(0, 0, 1000)).toEqual({ x: 0, z: 0, angle: 0, shade: 0 });
    expect(paperStripPose(0, PAPER_STRIPS - 1, 1000).x).toBe(950);
  });
  it('bends the free edge farther than the spine midway through the turn', () => {
    expect(paperStripPose(.5, 19, 1000).angle).toBeGreaterThan(paperStripPose(.5, 0, 1000).angle);
    expect(paperStripPose(.5, 10, 1000).z).toBeGreaterThan(0);
  });
  it('clears every strip beyond the left viewport edge at completion', () => {
    for (let i = 0; i < PAPER_STRIPS; i++) expect(paperStripPose(1, i, 1000).x).toBeLessThan(-50);
  });
});