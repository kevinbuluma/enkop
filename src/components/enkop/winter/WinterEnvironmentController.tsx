import { useEffect, useMemo, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { parsePreference, type AtmospherePreference } from '@/lib/storm/atmosphere';
import { SceneZones } from '@/lib/storm/scene-zones';
import { resolveWinterSettings, surfaceLevel, winterDevice, winterProfile, type WinterDevice, type WinterSettings } from '@/lib/winter/settings';
import { installWinterTextures } from '@/lib/winter/textures';
import { prepareSnowstorm } from '@/lib/winter/snowstorm-transition';
import { loadSeasonSettings } from '../Seasonal';
import { SnowfallSystem } from './SnowfallSystem';
import { FrostFormation } from './FrostFormation';
import { MiniSnowmen } from './MiniSnowmen';

const ZONE_REFRESH_MS = 450;
type Env = { season: string | null; preference: AtmospherePreference; intensity: number; reduced: boolean; device: WinterDevice };

function readEnv(): Env {
  const root = document.documentElement;
  return {
    season: root.getAttribute('data-season'),
    preference: parsePreference(root.getAttribute('data-atmosphere')),
    intensity: Math.min(1, Math.max(0.2, Number(root.getAttribute('data-season-intensity') ?? 1) || 1)),
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    device: winterDevice(innerWidth),
  };
}
const sameEnv = (a: Env, b: Env) => a.season === b.season && a.preference === b.preference && a.intensity === b.intensity && a.reduced === b.reduced && a.device === b.device;

const ROOT_ATTRIBUTES = ['data-winter', 'data-winter-frost', 'data-winter-snow', 'data-winter-transition', 'data-winter-transition-intensity'];

/**
 * Root-level winter environment, active in the winter season (never in admin, never when the visitor has
 * switched the atmosphere off). It owns the continuous layers (storm sky, snowfall, screen-edge frost,
 * snowmen) and publishes the admin's winter settings on <html> for the CSS surfaces (frost, settled snow,
 * icicles) and for the winter page transitions.
 */
export function WinterEnvironmentController() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const [env, setEnv] = useState<Env | null>(null);
  const [settings, setSettings] = useState<WinterSettings | null>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const zones = useMemo(() => new SceneZones(), []);

  useEffect(() => {
    loadSeasonSettings().then(s => setSettings(resolveWinterSettings(s?.winter)));
    const update = () => setEnv(prev => { const next = readEnv(); return prev && sameEnv(prev, next) ? prev : next; });
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-season', 'data-atmosphere', 'data-season-intensity'] });
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    reduce.addEventListener('change', update);
    addEventListener('resize', update);
    return () => { observer.disconnect(); reduce.removeEventListener('change', update); removeEventListener('resize', update); };
  }, []);

  const active = !!env && !!settings && settings.enabled && env.season === 'winter' && env.preference !== 'off' && !pathname.startsWith('/admin');
  const profile = useMemo(() => env && settings && winterProfile({ settings, intensity: env.intensity, gentle: env.preference === 'gentle', reducedMotion: env.reduced, width: innerWidth }), [env, settings]);

  // Settings for CSS surfaces and the page transitions.
  useEffect(() => {
    const root = document.documentElement;
    if (!active || !settings || !profile) { ROOT_ATTRIBUTES.forEach(a => root.removeAttribute(a)); return; }
    root.setAttribute('data-winter', profile.calm ? 'calm' : 'on');
    root.setAttribute('data-winter-frost', String(surfaceLevel(profile.frost)));
    root.setAttribute('data-winter-snow', String(surfaceLevel(settings.accumulation * (env?.preference === 'gentle' ? 0.7 : 1))));
    root.setAttribute('data-winter-transition', settings.transition);
    root.setAttribute('data-winter-transition-intensity', String(settings.transitionIntensity));
    void installWinterTextures();
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 300));
    if (!profile.calm) idle(() => prepareSnowstorm());
  }, [active, settings, profile, env?.preference]);
  useEffect(() => () => { ROOT_ATTRIBUTES.forEach(a => document.documentElement.removeAttribute(a)); }, []);

  // Layout zones: what lies under each point of the snowfall.
  useEffect(() => {
    if (!active || profile?.calm) return;
    let raf = 0;
    const refresh = () => { raf = 0; zones.refresh(); };
    const soon = () => { if (!raf) raf = requestAnimationFrame(refresh); };
    refresh();
    const timer = window.setInterval(() => { if (!document.hidden) soon(); }, ZONE_REFRESH_MS);
    addEventListener('scroll', soon, { passive: true });
    addEventListener('resize', soon);
    return () => { cancelAnimationFrame(raf); clearInterval(timer); removeEventListener('scroll', soon); removeEventListener('resize', soon); };
  }, [active, profile, zones, pathname]);

  // Layers fade in and out with the season.
  useEffect(() => {
    if (!active) { setVisible(false); const t = window.setTimeout(() => setMounted(false), 1600); return () => clearTimeout(t); }
    setMounted(true);
    const t = window.setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, [active]);

  if (!mounted || !profile) return null;
  return <>
    <div className={`winter-sky ${visible ? 'is-on' : ''}`} aria-hidden="true">
      <span className="winter-cloud winter-cloud--far" /><span className="winter-cloud winter-cloud--mid" /><span className="winter-cloud winter-cloud--near" /><span className="winter-light" />
    </div>
    <SnowfallSystem zones={zones} profile={profile} visible={visible} />
    <FrostFormation profile={profile} visible={visible} />
    {profile.maxSnowmen > 0 && visible && <MiniSnowmen max={profile.maxSnowmen} />}
  </>;
}
