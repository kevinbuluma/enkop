import { useEffect, useState } from 'react';
import { computeSeason, seasonConfig, seasonLabels, toConfig, type SeasonSettings } from '@/lib/season';
import { getSeasonSettings } from '@/lib/content.functions';

let cached: Promise<SeasonSettings | null> | null = null;
const loadSettings = () => (cached ??= getSeasonSettings().catch(() => null));

/** Applies the calendar season (admin-configured) as a quiet colour mood. Visitors can switch it off. */
export function SeasonalToggle() {
  const [on, setOn] = useState(true);
  const [settings, setSettings] = useState<SeasonSettings | null | undefined>(undefined);
  useEffect(() => { setOn(localStorage.getItem('enkop:season') !== 'off'); loadSettings().then(setSettings); }, []);
  const enabled = settings ? settings.enabled : true;
  const season = computeSeason(new Date(), settings ? toConfig(settings) : seasonConfig);
  useEffect(() => {
    if (settings === undefined) return;
    const root = document.documentElement;
    if (on && enabled) { root.setAttribute('data-season', season); root.setAttribute('data-season-intensity', String(settings?.intensity ?? 1)); }
    else root.removeAttribute('data-season');
  }, [on, enabled, season, settings]);
  if (settings !== undefined && !enabled) return null;
  return <button type="button" className="season-toggle" aria-pressed={on} onClick={() => { const next = !on; setOn(next); localStorage.setItem('enkop:season', next ? 'on' : 'off'); }}>
    Seasonal atmosphere: {on ? `${seasonLabels[season] ?? season} · On` : 'Off'}
  </button>;
}
