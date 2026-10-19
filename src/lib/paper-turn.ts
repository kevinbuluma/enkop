export const PAPER_TURN_MS = 1650;
export const PAPER_STRIPS = 20;

/** Integrate a flexible sheet from its spine; the outer edge bends before the binding. */
export function paperStripPose(progress: number, index: number, width: number) {
  const p = Math.max(0, Math.min(1, progress));
  const eased = p * p * (3 - 2 * p);
  const segment = width / PAPER_STRIPS;
  const curl = Math.sin(Math.PI * p) * 1.05;
  let x = -width * eased * .12, z = 0, angle = 0;
  for (let i = 0; i <= index; i++) {
    const u = (i + .5) / PAPER_STRIPS;
    angle = eased * Math.PI + curl * (u * u - .16);
    const length = i === index ? segment / 2 : segment;
    x += Math.cos(angle) * length;
    z += Math.sin(angle) * length;
  }
  return { x: x - segment / 2, z, angle, shade: Math.abs(Math.sin(angle)) * .24 };
}