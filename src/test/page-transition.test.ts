import { describe, it, expect } from 'vitest';
import { alternatingTransitionMood, transitionMood } from '@/lib/page-transition';

describe('seasonal navigation moods', () => {
  it('alternates autumn leaves and page flips on successive public navigations', () => {
    expect([0, 1, 2, 3].map(index => alternatingTransitionMood('autumn', index))).toEqual(['leaves', 'flip', 'leaves', 'flip']);
  });
  it('preserves the current season between page flips', () => {
    expect([0, 1, 2].map(index => alternatingTransitionMood('winter', index))).toEqual(['snow', 'flip', 'snow']);
    expect([0, 1, 2].map(index => alternatingTransitionMood('spring', index))).toEqual(['petals', 'flip', 'petals']);
  });
  it('sweeps autumn leaves', () => expect(transitionMood('autumn')).toBe('leaves'));
  it('uses winter snow', () => expect(transitionMood('winter')).toBe('snow'));
  it('uses spring petals', () => expect(transitionMood('spring')).toBe('petals'));
  it('uses a sunlit summer page flip', () => expect(transitionMood('summer')).toBe('flip'));
  it('uses rain for rainy profiles', () => {
    expect(transitionMood('long-rains')).toBe('rain');
    expect(transitionMood('short-rains')).toBe('rain');
  });
  it('keeps disabled seasonal atmosphere neutral', () => expect(transitionMood(null)).toBe('flip'));
});