import { useEffect, useMemo, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { Volume2, VolumeX } from 'lucide-react';
import { isRainSeason, parsePreference, stormProfile, type AtmospherePreference } from '@/lib/storm/atmosphere';
import { SceneZones } from '@/lib/storm/scene-zones';
import { readStored, writeStored } from '@/lib/safe-storage';
import { onRainSoundChange, rainSoundPlaying, resumeOnInteraction, setRainSound, stopRainSoundQuietly } from '@/lib/storm/rain-audio';
import { RainfallBackground } from './RainfallBackground';
import { RainGlassOverlay } from './RainGlassOverlay';

const ENTERED_KEY = 'enkop:storm-entered';
const ZONE_REFRESH_MS = 450;

type Env = { season: string | null; preference: AtmospherePreference; intensity: number; reduced: boolean; mobile: boolean };

function readEnv(): Env {
  const root = document.documentElement;
  return {
    season: root.getAttribute('data-season'),
    preference: parsePreference(root.getAttribute('data-atmosphere')),
    intensity: Math.min(1, Math.max(0.2, Number(root.getAttribute('data-season-intensity') ?? 1) || 1)),
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    mobile: innerWidth < 760,
  };
}

/**
 * Root-level storm atmosphere. Active only when the seasonal profile calls for rain (and never in admin):
 * it plays the cinematic entrance once per visit, then keeps rainfall and rain-on-glass running across
 * routes. Off, Gentle and reduced-motion preferences are honoured; layers fade in and out with the season.
 */
export function SeasonalAtmosphereController() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [env, setEnv] = useState<Env | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const zones = useMemo(() => new SceneZones(), []);

  useEffect(() => {
    const update = () => setEnv((prev) => {
      const next = readEnv();
      return prev && prev.season === next.season && prev.preference === next.preference && prev.intensity === next.intensity && prev.reduced === next.reduced && prev.mobile === next.mobile ? prev : next;
    });
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-season', 'data-atmosphere', 'data-season-intensity'] });
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    reduce.addEventListener('change', update);
    addEventListener('resize', update);
    return () => { observer.disconnect(); reduce.removeEventListener('change', update); removeEventListener('resize', update); };
  }, []);

  const active = !!env && isRainSeason(env.season) && env.preference !== 'off' && !pathname.startsWith('/admin');
  const profile = useMemo(() => env && stormProfile({ intensity: env.intensity, preference: env.preference, reducedMotion: env.reduced, mobile: env.mobile }), [env]);

  // Layout zones: refreshed on scroll, resize and a slow interval while the storm runs.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const refresh = () => { raf = 0; zones.refresh(); };
    const soon = () => { if (!raf) raf = requestAnimationFrame(refresh); };
    refresh();
    const timer = window.setInterval(() => { if (!document.hidden) soon(); }, ZONE_REFRESH_MS);
    addEventListener('scroll', soon, { passive: true });
    addEventListener('resize', soon);
    return () => { cancelAnimationFrame(raf); clearInterval(timer); removeEventListener('scroll', soon); removeEventListener('resize', soon); };
  }, [active, zones, pathname]);

  // Entrance once per visit; afterwards (and in reduced motion) the rain simply fades in.
  useEffect(() => {
    if (!active || !profile) {
      // Fade the layers out before removing them.
      setRevealed(false); stopRainSoundQuietly();
      const t = window.setTimeout(() => setMounted(false), 1600);
      return () => clearTimeout(t);
    }
    setMounted(true);
    if (profile.calm || readStored(ENTERED_KEY, 'session')) { const t = window.setTimeout(() => setRevealed(true), 60); return () => clearTimeout(t); }
    let fallback = 0, poll = 0;
    const onReveal = () => { clearTimeout(fallback); setRevealed(true); };
    addEventListener('enkop:storm-reveal', onReveal);
    // Wait for the brand intro to finish before the storm rolls in.
    const begin = () => {
      if (document.querySelector('.entrance') || document.hidden) { poll = window.setTimeout(begin, 250); return; }
      writeStored(ENTERED_KEY, '1', 'session');
      dispatchEvent(new CustomEvent('enkop:storm-entrance'));
      fallback = window.setTimeout(onReveal, 6000);
    };
    poll = window.setTimeout(begin, 300);
    return () => { clearTimeout(poll); clearTimeout(fallback); removeEventListener('enkop:storm-reveal', onReveal); };
  }, [active, profile]);

  if (!mounted || !profile) return null;
  return <>
    <RainfallBackground zones={zones} profile={profile} visible={revealed} />
    <RainGlassOverlay zones={zones} profile={profile} visible={revealed} />
    <RainSoundToggle />
  </>;
}

/** Optional storm sound: off by default, never autoplays, always one tap from mute. */
function RainSoundToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(rainSoundPlaying());
    const off = onRainSoundChange(setOn);
    const cancelResume = resumeOnInteraction();
    return () => { off(); cancelResume(); };
  }, []);
  return <button type="button" className="rain-sound-toggle" aria-pressed={on} aria-label={on ? 'Mute rain sound' : 'Play rain sound'} onClick={() => setRainSound(!on)}>
    {on ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
    <span>{on ? 'Rain sound on' : 'Rain sound off'}</span>
  </button>;
}
