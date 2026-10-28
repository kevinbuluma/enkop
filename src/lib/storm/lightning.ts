// LightningIllumination: brief, infrequent flashes that light the clouds from within.
// Accessibility: one soft pulse per strike (no strobing), strikes at least MIN_GAP_MS apart (well under
// three flashes a second), and the shader caps the brightness lift so the screen never turns white.

export const MIN_GAP_MS = 900;
const RISE_MS = 55;
const DECAY_MS = 240;

export type Strike = { at: number; x: number; y: number; strength: number };

/** Deterministic pseudo-random sequence (so plans are testable). */
export function seeded(seed: number) {
  let s = (Math.floor(seed * 1e6) ^ 0x9e3779b9) >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Plans up to `count` strikes inside [from, to] ms, spaced at least MIN_GAP_MS apart. */
export function planStrikes(count: number, from: number, to: number, seed = Math.random()): Strike[] {
  const rand = seeded(seed);
  const strikes: Strike[] = [];
  const span = to - from;
  if (count <= 0 || span < 200) return strikes;
  const slot = span / count;
  for (let i = 0; i < count; i++) {
    const at = from + slot * i + rand() * slot * 0.6;
    const prev = strikes[strikes.length - 1];
    if (prev && at - prev.at < MIN_GAP_MS) continue;
    strikes.push({ at, x: 0.2 + rand() * 0.6, y: 0.55 + rand() * 0.35, strength: 0.65 + rand() * 0.35 });
  }
  return strikes;
}

/** Flash level 0..1 at time t: a quick rise and a soft decay, nothing like a strobe. */
export function flashAt(t: number, strikes: Strike[]): { level: number; x: number; y: number } {
  let best = { level: 0, x: 0.5, y: 0.7 };
  for (const s of strikes) {
    const dt = t - s.at;
    if (dt < 0 || dt > RISE_MS + DECAY_MS * 4) continue;
    const level = s.strength * (dt < RISE_MS ? dt / RISE_MS : Math.exp(-(dt - RISE_MS) / DECAY_MS));
    if (level > best.level) best = { level, x: s.x, y: s.y };
  }
  return best;
}

/** Shared between the clouds, the rain layers and the thunder: the current flash level. */
export const stormLight = { flash: 0 };
