// RainfallBackground model: rain streaks in three depths. Far rain is fine, faint and near-vertical;
// midground rain is brighter and faster; rare near-camera drops are large and soft. A slowly varying wind
// tilts the fall, and drifting bands make the intensity rise and ease naturally.
import { seeded } from './lightning';

export type Streak = { x: number; y: number; len: number; speed: number; width: number; alpha: number; layer: 0 | 1 | 2 };

export class Rainfall {
  streaks: Streak[] = [];
  width: number; height: number; level: number;
  /** Current fall angle (radians from vertical, positive = falling to the right). */
  wind = 0.16;
  private t = 0;
  private rand: () => number;

  constructor(o: { width: number; height: number; level: number; seed?: number }) {
    this.width = o.width; this.height = o.height; this.level = o.level;
    this.rand = seeded(o.seed ?? Math.random());
    this.fill();
  }

  /** Streak budget for the area and storm level (desktop ~260 at full strength, phones ~90). */
  target() { return Math.round((this.width * this.height) / 1e6 * 200 * this.level); }

  resize(width: number, height: number, level = this.level) {
    this.width = width; this.height = height; this.level = level;
    this.fill();
  }

  private make(anywhere: boolean): Streak {
    const r = this.rand();
    const layer: 0 | 1 | 2 = r < 0.62 ? 0 : r < 0.985 ? 1 : 2;
    const speed = layer === 0 ? 0.55 + this.rand() * 0.35 : layer === 1 ? 1.05 + this.rand() * 0.6 : 1.9 + this.rand() * 0.6;
    const len = layer === 0 ? 10 + this.rand() * 14 : layer === 1 ? 22 + this.rand() * 26 : 70 + this.rand() * 50;
    return {
      x: this.rand() * (this.width + 200) - 100,
      y: anywhere ? this.rand() * this.height : -len - this.rand() * 120,
      len, speed,
      width: layer === 0 ? 0.6 : layer === 1 ? 0.95 + this.rand() * 0.35 : 3 + this.rand() * 3,
      alpha: layer === 0 ? 0.16 + this.rand() * 0.12 : layer === 1 ? 0.22 + this.rand() * 0.16 : 0.06 + this.rand() * 0.05,
      layer,
    };
  }

  private fill() {
    const n = this.target();
    if (this.streaks.length > n) this.streaks.length = n;
    while (this.streaks.length < n) this.streaks.push(this.make(true));
  }

  /** Intensity 0.45..1 across x at the current time: heavier bands drift through the scene. */
  band(x: number) {
    const a = Math.sin(x * 0.0042 + this.t * 0.00031), b = Math.sin(x * 0.0013 - this.t * 0.00017 + 1.3);
    return 0.72 + 0.28 * a * b;
  }

  step(dt: number) {
    dt = Math.min(dt, 50);
    this.t += dt;
    this.wind = 0.15 + Math.sin(this.t * 0.00011) * 0.07 + Math.sin(this.t * 0.00037) * 0.025;
    const drift = Math.tan(this.wind);
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i]!;
      const depth = s.layer === 0 ? 0.6 : 1;
      s.y += s.speed * dt;
      s.x += s.speed * dt * drift * depth;
      if (s.y - s.len > this.height || s.x > this.width + 120) this.streaks[i] = this.make(false);
    }
  }
}
