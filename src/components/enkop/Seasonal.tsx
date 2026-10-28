import { useEffect, useState } from 'react';
import { computeSeason, seasonConfig, seasonLabels, toConfig, type SeasonSettings } from '@/lib/season';
import { getSeasonSettings } from '@/lib/content.functions';
import { readStored, writeStored } from '@/lib/safe-storage';
import { nextPreference, parsePreference, type AtmospherePreference } from '@/lib/storm/atmosphere';

let cached: Promise<SeasonSettings | null> | null = null;
const loadSettings = () => (cached ??= getSeasonSettings().catch(() => null));

const PREVIEW_KEY = 'enkop:season-preview';
const preferenceLabel: Record<AtmospherePreference, string> = { on: 'On', gentle: 'Gentle', off: 'Off' };

/**
 * Applies the calendar season (admin-configured) as the site's atmosphere. Visitors choose On, Gentle
 * (lower intensity) or Off. `?season=<season>` previews a season for the session (`?season=auto` ends it).
 */
export function SeasonalToggle() {
  const [preference, setPreference] = useState<AtmospherePreference>('on');
  const [settings, setSettings] = useState<SeasonSettings | null | undefined>(undefined);
  const [forced, setForced] = useState<string | null>(null);
  useEffect(() => { setPreference(parsePreference(readStored('enkop:season'))); loadSettings().then(setSettings); }, []);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('season');
    if (q === 'auto') writeStored(PREVIEW_KEY, null, 'session');
    else if (q && q in seasonLabels && q !== readStored(PREVIEW_KEY, 'session')) {
      writeStored(PREVIEW_KEY, q, 'session');
      // A new preview replays the season's entrance.
      writeStored('enkop:storm-entered', null, 'session');
    }
    setForced(readStored(PREVIEW_KEY, 'session'));
  }, []);
  const enabled = settings ? settings.enabled : true;
  const season = forced ?? computeSeason(new Date(), settings ? toConfig(settings) : seasonConfig);
  useEffect(() => {
    if (settings === undefined) return;
    const root = document.documentElement;
    root.setAttribute('data-atmosphere', preference);
    if (preference !== 'off' && (enabled || forced)) { root.setAttribute('data-season', season); root.setAttribute('data-season-intensity', String(settings?.intensity ?? 1)); }
    else root.removeAttribute('data-season');
  }, [preference, enabled, season, settings, forced]);
  const endPreview = () => { writeStored(PREVIEW_KEY, null, 'session'); setForced(null); };
  if (settings !== undefined && !enabled && !forced) return null;
  return <>
    <button type="button" className="season-toggle" aria-label={`Seasonal atmosphere: ${preferenceLabel[preference]}. Change to ${preferenceLabel[nextPreference(preference)]}`}
      onClick={() => { const next = nextPreference(preference); setPreference(next); writeStored('enkop:season', next); }}>
      Seasonal atmosphere: {preference === 'off' ? 'Off' : `${seasonLabels[season] ?? season} · ${preferenceLabel[preference]}`}
    </button>
    {forced && <div className="season-preview-chip" role="status">
      Previewing {seasonLabels[forced] ?? forced}
      <button type="button" onClick={endPreview}>End preview</button>
    </div>}
  </>;
}
