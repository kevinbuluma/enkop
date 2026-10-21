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

  it('keeps a lone slow video buffering and shows it once it plays', () => {
    const { container } = render(<HeroReel slides={[slides[0]!]} poster="/poster.jpg" />);
    const video = container.querySelector('video');
    if (!video) throw new Error('Missing video');
    act(() => { video.dispatchEvent(new Event('waiting')); vi.advanceTimersByTime(30000); });
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    act(() => video.dispatchEvent(new Event('playing')));
    expect(video.classList.contains('hero-video--playing')).toBe(true);
  });
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
  it('reloads the landing footage when the device rotates, so it switches between the vertical and wide cuts', () => {
    const listeners: (() => void)[] = [];
    const portrait = { matches: false };
    vi.stubGlobal('matchMedia', (q: string) => q.includes('orientation')
      ? { get matches() { return portrait.matches; }, addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: vi.fn() }
      : { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const landing = { id: 'landing', label: '', video_url: '/videos/scenes/enkop-landing.mp4', image_url: '/landing.jpg' };
    const { container } = render(<HeroReel slides={[landing]} poster="/poster.jpg" />);
    const video = container.querySelector('video')!;
    expect(video.querySelector('source')?.getAttribute('src')).toBe('/videos/scenes/enkop-landing-vertical.mp4');
    expect(load).not.toHaveBeenCalled();
    act(() => { portrait.matches = true; listeners.forEach((fn) => fn()); });
    expect(load).toHaveBeenCalledTimes(1);
    expect(video.getAttribute('poster')).toBe('/videos/scenes/enkop-landing-vertical.jpg');
  });
  it('holds the first scene still for reduced-motion visitors', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = render(<HeroReel slides={slides} poster="/poster.jpg" />);
    expect(container.querySelector('video')).toBeNull();
    act(() => vi.advanceTimersByTime(30000));
    expect(activeScene(container)).toBe(0);
  });
});