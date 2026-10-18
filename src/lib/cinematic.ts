import { useEffect } from 'react';

/**
 * Quiet-luxury motion layer: scroll reveals, gentle parallax and 3D card tilt.
 * Everything is disabled for visitors who prefer reduced motion.
 * Usage: call useCinematicFx() once per page; mark elements with
 * data-reveal (rise in on scroll) and data-parallax="0.12" (drift with scroll).
 */
export function useCinematicFx() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cleanups: (() => void)[] = [];

    // 1. Scroll reveal — elements rise and settle as they enter the viewport.
    const revealEls = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (revealEls.length) {
      const io = new IntersectionObserver(entries => {
        for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      revealEls.forEach(el => io.observe(el));
      cleanups.push(() => io.disconnect());
    }

    // 2. Parallax — marked layers drift at a fraction of scroll speed.
    const parallaxEls = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const vh = window.innerHeight;
        for (const el of parallaxEls) {
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > vh) continue;
          const speed = parseFloat(el.dataset['parallax'] || '0.1');
          const offset = (r.top + r.height / 2 - vh / 2) * speed;
          el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
        }
      });
    };
    if (parallaxEls.length) {
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener('scroll', onScroll));
    }

    // 3. 3D tilt — property cards lean subtly toward the pointer.
    const tiltEls = Array.from(document.querySelectorAll<HTMLElement>('[data-tilt]'));
    for (const el of tiltEls) {
      const inner = (el.querySelector('.property-visual') as HTMLElement | null) ?? el;
      const move = (ev: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5;
        const y = (ev.clientY - r.top) / r.height - 0.5;
        inner.style.transform = `perspective(1100px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) scale(1.015)`;
      };
      const leave = () => { inner.style.transform = ''; };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      cleanups.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); });
    }

    return () => cleanups.forEach(fn => fn());
  }, []);
}
