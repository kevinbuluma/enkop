import { useEffect, useState } from 'react';

/** Discreet right-edge navigator for the homepage. Hidden on small screens. */
export function SectionNavigator({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  useEffect(() => {
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) setActive(e.target.id); }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(s => { const el = document.getElementById(s.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [sections]);
  return <nav className="section-navigator" aria-label="Jump to section">
    {sections.map(s => <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? 'true' : undefined}><span>{s.label}</span><i/></a>)}
  </nav>;
}
