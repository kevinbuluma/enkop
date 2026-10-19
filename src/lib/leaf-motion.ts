export const LEAF_ENTRY_MS = 1650;
export const LEAF_EXIT_MS = 1850;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function leafArrival(progress: number, index: number, count: number) {
  return clamp((progress - (index / count) * .54) / .46);
}
export function leafExitPosition(x: number, y: number, progress: number, index: number, width: number, height: number) {
  const t = clamp((progress - (index % 9) * .014) / .88);
  if (index % 6 === 0) {
    return { x: x + (index % 12 === 0 ? -1 : 1) * (width + 400) * t * t, y: y + height * .32 * t, turn: t * 1.8, scale: 1 };
  }
  const cx = width * .57, cy = height * .44;
  const dx = x - cx, dy = y - cy;
  const angle = Math.atan2(dy, dx) + t * t * (Math.PI * 3.2);
  const radius = Math.hypot(dx, dy) * (1 - Math.sin(t * Math.PI) * .66) + Math.pow(t, 4) * Math.hypot(width, height) * 1.7;
  return { x: cx + Math.cos(angle) * radius + t ** 3 * width * .55, y: cy + Math.sin(angle) * radius - t ** 3 * height * .75, turn: t * t * 12, scale: 1 - Math.sin(t * Math.PI) * .24 };
}