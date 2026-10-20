import { useEffect, useState } from 'react';
import { BrandLogo } from './BrandLogo';

/** Short cinematic opening for first-time visitors only. Skippable; never shown with reduced motion. */
export function Entrance() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (localStorage.getItem('enkop:intro') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    localStorage.setItem('enkop:intro', '1');
    setShow(true);
    const t1 = setTimeout(() => setLeaving(true), 2200);
    const t2 = setTimeout(() => setShow(false), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (!show) return null;
  const skip = () => { setLeaving(true); setTimeout(() => setShow(false), 500); };
  return <div className={`entrance ${leaving ? 'entrance--out' : ''}`} role="presentation" onClick={skip}>
    <div className="entrance-line" />
    <BrandLogo tone="light" className="entrance-mark" />
    <p className="entrance-tag">Exceptional spaces</p>
    <button type="button" className="entrance-skip" onClick={skip}>Skip intro</button>
  </div>;
}
