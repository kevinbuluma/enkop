export type TransitionMood = 'leaves' | 'snow' | 'petals' | 'rain' | 'flip';

/** Only eligible public navigations advance this sequence. Rain seasons keep the storm on every navigation. */
export function alternatingTransitionMood(season: string | null, navigationIndex: number): TransitionMood {
  const mood = transitionMood(season);
  return mood === 'rain' || navigationIndex % 2 === 0 ? mood : 'flip';
}

/** Calendar moods, not live weather. A disabled atmosphere stays neutral. */
export function transitionMood(season: string | null): TransitionMood {
  switch (season) {
    case 'autumn': return 'leaves';
    case 'winter': case 'cool-dry': return 'snow';
    case 'spring': return 'petals';
    case 'long-rains': case 'short-rains': return 'rain';
    default: return 'flip';
  }
}