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
  const imageSlides = [{ ...slides[0]!, video_url: null }, { ...slides[1]!, video_url: null }];
  const activeScene = (container: HTMLElement) => [...container.querySelectorAll('.hero-layer')].findIndex((l) => l.classList.contains('hero-layer--on'));

  it('has no on-screen tour controls', () => {
    const { container } = render(<HeroReel slides={imageSlides} poster="/poster.jpg" />);
    expect(container.querySelector('button, nav')).toBeNull();
  });
  it('advances image scenes on its own and wraps around after the last', () => {
    const { container } = render(<HeroReel slides={imageSlides} poster="/poster.jpg" />);
    expect(activeScene(container)).toBe(0);
    act(() => vi.advanceTimersByTime(7000));
    expect(activeScene(container)).toBe(1);
    act(() => vi.advanceTimersByTime(7000));
    expect(activeScene(container)).toBe(0);
  });
  it('holds the first scene still for reduced-motion visitors', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = render(<HeroReel slides={slides} poster="/poster.jpg" />);
    expect(container.querySelector('video')).toBeNull();
    act(() => vi.advanceTimersByTime(30000));
    expect(activeScene(container)).toBe(0);
  });
});