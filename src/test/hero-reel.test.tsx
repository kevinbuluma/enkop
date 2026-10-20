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
  it('jumps to a chosen scene from the tour controls', () => {
    const { getByRole } = render(<HeroReel slides={slides} poster="/poster.jpg" />);
    act(() => getByRole('button', { name: 'Scene 2: Scene 2' }).click());
    expect(getByRole('button', { name: 'Scene 2: Scene 2' }).getAttribute('aria-current')).toBe('step');
    expect(getByRole('button', { name: 'Scene 1: Scene 1' }).getAttribute('aria-current')).toBeNull();
  });
  it('steps into the next scene and wraps around after the last', () => {
    const { getByRole } = render(<HeroReel slides={slides} poster="/poster.jpg" />);
    const next = getByRole('button', { name: 'Step into the next scene' });
    act(() => next.click());
    expect(getByRole('button', { name: 'Scene 2: Scene 2' }).getAttribute('aria-current')).toBe('step');
    act(() => next.click());
    expect(getByRole('button', { name: 'Scene 1: Scene 1' }).getAttribute('aria-current')).toBe('step');
  });
  it('stops advancing while the tour is paused', () => {
    const { getByRole } = render(<HeroReel slides={[{ ...slides[0]!, video_url: null }, { ...slides[1]!, video_url: null }]} poster="/poster.jpg" />);
    act(() => getByRole('button', { name: 'Pause the tour' }).click());
    act(() => vi.advanceTimersByTime(20000));
    expect(getByRole('button', { name: 'Scene 1: Scene 1' }).getAttribute('aria-current')).toBe('step');
    act(() => getByRole('button', { name: 'Play the tour' }).click());
    act(() => vi.advanceTimersByTime(7000));
    expect(getByRole('button', { name: 'Scene 2: Scene 2' }).getAttribute('aria-current')).toBe('step');
  });
});