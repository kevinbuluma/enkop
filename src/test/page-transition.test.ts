import { describe, it, expect } from 'vitest';
import { transitionMood } from '@/lib/page-transition';

describe('seasonal navigation moods', () => {
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