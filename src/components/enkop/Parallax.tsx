import { useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/** Moves a layer slower than the page scroll for cinematic depth. No-ops when reduced motion is preferred. */
export function Parallax({
  children,
  className = '',
  strength = 0.18,
}: {
  children: ReactNode;
  className?: string;
  /** Fraction of scroll delta applied as translateY. Keep low (0.1–0.25). */
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const view = window.innerHeight || 1;
      // 0 when centred in viewport; negative above, positive below
      const progress = (rect.top + rect.height / 2 - view / 2) / view;
      // Cap travel so the oversized layer never reveals empty edges
      const max = 7;
      const y = Math.max(-max, Math.min(max, progress * strength * 100));
      el.style.setProperty('--parallax-y', `${y.toFixed(2)}%`);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced, strength]);

  return (
    <div ref={ref} className={`parallax ${className}`.trim()}>
      <div className="parallax-layer">{children}</div>
    </div>
  );
}
