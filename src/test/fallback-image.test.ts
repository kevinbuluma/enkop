import { describe, expect, it } from 'vitest';
import { fallbackInput } from '@/lib/fallback-image';

describe('Homepage fallback image input', () => {
  const input = { slideId: '12345678-1234-4234-8234-123456789012', videoPath: 'homepage/tour.mp4', notes: '' };
  it('accepts a homepage tour with optional style notes omitted as empty', () => {
    expect(fallbackInput.parse(input).notes).toBe('');
  });
  it('rejects a missing homepage video', () => {
    expect(fallbackInput.safeParse({ ...input, videoPath: '' }).success).toBe(false);
  });
});