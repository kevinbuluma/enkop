import { useEffect, useState } from 'react';
import { computeSeason, seasonConfig, seasonLabels } from '@/lib/season';

/** Applies the calendar season as a quiet colour mood on page backgrounds. Remembered on/off toggle. */
export function SeasonalToggle() {
  const [on, setOn] = useState(true);
  const season = computeSeason(new Date(), seasonConfig);
  useEffect(() => { setOn(localStorage.getItem('enkop:season') !== 'off'); }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (on) root.setAttribute('data-season', season); else root.removeAttribute('data-season');
  }, [on, season]);
  return <button type="button" className="season-toggle" aria-pressed={on} onClick={() => { const next = !on; setOn(next); localStorage.setItem('enkop:season', next ? 'on' : 'off'); }}>
    Seasonal atmosphere: {on ? `${seasonLabels[season]} · On` : 'Off'}
  </button>;
}
