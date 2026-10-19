import { describe, expect, it } from 'vitest';
import { PAPER_STRIPS, paperStripPose } from '@/lib/paper-turn';

describe('flexible page geometry', () => {
  it('starts flat and aligned with the outgoing viewport', () => {
    expect(paperStripPose(0, 0, 1000)).toMatchObject({ x: 0, z: 0, y: 0, angle: 0, shade: 0 });
    expect(paperStripPose(0, PAPER_STRIPS - 1, 1000).x).toBe(950);
  });
  it('bends the free edge farther than the spine midway through the turn', () => {
    expect(paperStripPose(.5, 19, 1000).angle).toBeGreaterThan(paperStripPose(.5, 0, 1000).angle);
    expect(paperStripPose(.5, 10, 1000).z).toBeGreaterThan(0);
  });
  it('clears every strip beyond the left viewport edge at completion', () => {
    for (let i = 0; i < PAPER_STRIPS; i++) expect(paperStripPose(1, i, 1000).x).toBeLessThan(-50);
  });
  it('lifts the free corner more than the spine before the sweep', () => {
    expect(paperStripPose(.15, 19, 1000).y).toBeLessThan(paperStripPose(.15, 0, 1000).y);
    expect(paperStripPose(1, 19, 1000).y).toBeCloseTo(0);
  });
  it('moves faster through the middle than during the initial fingertip lift', () => {
    const early = paperStripPose(.15, 0, 1000).angle - paperStripPose(.05, 0, 1000).angle;
    const middle = paperStripPose(.55, 0, 1000).angle - paperStripPose(.45, 0, 1000).angle;
    expect(middle).toBeGreaterThan(early * 2);
  });
});