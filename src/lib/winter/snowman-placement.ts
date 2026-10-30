import { hashString, seeded } from './rng';

/**
 * Where miniature snowmen may stand. Each spot names the element they stand on and a perch; the browser
 * layer also rejects any spot that would overlap text, prices, controls or imagery.
 */
export type SnowmanPerch = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left';
export type SnowmanSpot = { selector: string; kind: string; chance: number; perches: SnowmanPerch[] };

export const SNOWMAN_SPOTS: SnowmanSpot[] = [
  { selector: '.property-card-wrap', kind: 'card', chance: 0.32, perches: ['top-right', 'top-left'] },
  { selector: '.footer', kind: 'footer', chance: 0.95, perches: ['top-right', 'top-left'] },
  { selector: '.interior-hero-bottom', kind: 'divider', chance: 0.6, perches: ['top-right', 'top-left'] },
  { selector: '.why-section', kind: 'divider', chance: 0.6, perches: ['top-left', 'top-right'] },
  { selector: '.why-grid > div, .team-card, .testimonial-card, .detail-facts', kind: 'panel', chance: 0.3, perches: ['top-right', 'top-left'] },
  { selector: '.detail-gallery', kind: 'gallery', chance: 0.7, perches: ['bottom-right', 'bottom-left'] },
  { selector: '.home-hero', kind: 'hero', chance: 0.55, perches: ['bottom-left'] },
];

export type SnowmanCandidate = { key: string; kind: string; perches: SnowmanPerch[]; chance: number };
export type SnowmanChoice = { key: string; perch: SnowmanPerch; variant: number; score: number };

/**
 * Deterministic for a session seed and page: the same snowmen stand in the same places for the whole
 * visit, while different visits and pages get different arrangements. Ordered by preference.
 */
export function chooseSnowmen(candidates: SnowmanCandidate[], seed: string, page: string, variants = 4): SnowmanChoice[] {
  const out: SnowmanChoice[] = [];
  for (const c of candidates) {
    const r = seeded(hashString(`${seed}|${page}|${c.key}`));
    const roll = r();
    if (roll >= c.chance) continue;
    out.push({ key: c.key, perch: c.perches[Math.floor(r() * c.perches.length)] ?? c.perches[0]!, variant: Math.floor(r() * variants), score: roll / c.chance });
  }
  return out.sort((a, b) => a.score - b.score);
}

/** Keeps the first `max` choices that do not collide and are not too close to one another. */
export function spreadSnowmen<T extends { x: number; y: number }>(placed: T[], max: number, minGap = 220): T[] {
  const kept: T[] = [];
  for (const p of placed) {
    if (kept.length >= max) break;
    if (kept.every(k => Math.hypot(k.x - p.x, k.y - p.y) >= minGap)) kept.push(p);
  }
  return kept;
}
