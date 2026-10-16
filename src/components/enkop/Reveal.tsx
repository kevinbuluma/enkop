import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/** Fades and lifts content into view once, on scroll. Disabled when reduced motion is preferred. */
export function Reveal({
  children,
  className = '',
  as: Tag = 'div',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'span';
  delay?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.classList.add('reveal--in');
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add('reveal--in');
        io.disconnect();
      },
      { threshold: 0.14, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const style = delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined;
  return (
    <Tag ref={ref as never} className={`reveal ${className}`.trim()} style={style}>
      {children}
    </Tag>
  );
}
