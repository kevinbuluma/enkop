import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Rises and settles into place when scrolled into view. Disabled for reduced-motion visitors. */
export function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'section' | 'article' }) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setInView(true); return; }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { setInView(true); io.disconnect(); }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style: CSSProperties = delay ? { transitionDelay: `${delay}ms` } : {};
  return <Tag ref={ref as never} style={style} className={`reveal ${inView ? 'reveal--in' : ''} ${className}`}>{children}</Tag>;
}
