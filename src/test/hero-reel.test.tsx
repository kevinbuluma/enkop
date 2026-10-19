import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroReel } from '@/components/enkop/HeroReel';

const slides = [
  { id: 'a', label: '', video_url: '/a.webm', image_url: '/a.jpg' },
  { id: 'b', label: '', video_url: '/b.webm', image_url: '/b.jpg' },
];
describe('homepage video sequencing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('moves to the next scene when the playing video ends', () => {
    const { container } = render(<HeroReel slides={slides} poster="/poster.jpg" />);
    const first = container.querySelector('video');
    if (!first) throw new Error('Missing video');
    act(() => { first.dispatchEvent(new Event('playing')); first.dispatchEvent(new Event('ended')); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(1400));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
  it('starts the cross-fade before the clip ends and keeps the outgoing scene playing under it', () => {
    const { container } = render(<HeroReel slides={slides} poster="/poster.jpg" />);
    const first = container.querySelector('video');
    if (!first) throw new Error('Missing video');
    Object.defineProperty(first, 'duration', { configurable: true, value: 8 });
    Object.defineProperty(first, 'currentTime', { configurable: true, get: () => 6.8, set: () => {} });
    act(() => { first.dispatchEvent(new Event('playing')); first.dispatchEvent(new Event('timeupdate')); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(first.className).toContain('hero-video--playing');
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1400));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
  it('uses a seven-second image hold after a media error, then advances', () => {
    const { container } = render(<HeroReel slides={slides} poster="/poster.jpg" />);
    const first = container.querySelector('video');
    if (!first) throw new Error('Missing video');
    act(() => first.dispatchEvent(new Event('error')));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(6999));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });
});