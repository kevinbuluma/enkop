export const PAPER_TURN_MS = 1380;
export const PAPER_STRIPS = 20;
/** Each strip holds a copy of the page, so narrow screens use fewer (still about 30px wide). */
export const paperStripsFor = (width: number) => (width < 760 ? 12 : PAPER_STRIPS);

/** Integrate a flexible sheet from its spine; the outer edge bends before the binding. */
export function paperStripPose(progress: number, index: number, width: number, strips = PAPER_STRIPS) {
  const p = Math.max(0, Math.min(1, progress));
  // A deliberate fingertip lift, brisk sweep, then a soft landing.
  const eased = p < .22
    ? .085 * (p / .22) ** 2
    : p < .78
      ? .085 + .83 * ((p - .22) / .56) ** 1.12
      : 1 - .085 * ((1 - p) / .22) ** 2;
  const segment = width / strips;
  const curl = Math.sin(Math.PI * p) * (.95 - p * .35);
  const lift = Math.sin(Math.PI * p) * (1 - p) * .095;
  let x = -width * eased * .12, z = 0, y = 0, angle = 0, slope = 0;
  for (let i = 0; i <= index; i++) {
    const u = (i + .5) / strips;
    angle = eased * Math.PI + curl * u ** 2.6;
    slope = -lift * u * u;
    const length = i === index ? segment / 2 : segment;
    x += Math.cos(angle) * length;
    z += Math.sin(angle) * length;
    y += slope * length;
  }
  return { x: x - segment / 2, z, y, slope, angle, shade: Math.abs(Math.sin(angle)) * .18,
    highlight: Math.max(0, Math.sin(angle * 2)) * .12 };
}