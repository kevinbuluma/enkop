import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { navigation } from '@/lib/enkop';

export function Site({ children, darkHeader = false }: { children: ReactNode; darkHeader?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMenuOpen(false);
    const onScroll = () => setScrolled(window.scrollY > 32);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);
  useEffect(() => { document.body.style.overflow = menuOpen ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [menuOpen]);

  return <div className="site-shell">
    <header className={`site-header ${darkHeader && !scrolled && !menuOpen ? 'site-header--inverse' : ''} ${scrolled || menuOpen ? 'site-header--solid' : ''}`}>
      <Link to="/" className="wordmark" aria-label="ENKOP home">ENKOP<span className="wordmark-dot">.</span></Link>
      <nav className="desktop-nav" aria-label="Main navigation">{navigation.map(item => <Link key={item.to} to={item.to} activeProps={{ className: 'nav-active' }}>{item.label}</Link>)}</nav>
      <div className="header-actions"><Button asChild variant="textArrow" className="desktop-enquire"><Link to="/contact">Enquire <ArrowRight size={15} /></Link></Button><Button variant="iconPlain" className="menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</Button></div>
    </header>
    {menuOpen && <div className="mobile-menu"><nav aria-label="Mobile navigation">{navigation.map((item, i) => <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)}><span>0{i+1}</span>{item.label}<ArrowRight size={22} /></Link>)}</nav><p>Exceptional spaces. Thoughtfully represented.</p></div>}
    <main>{children}</main>
    <footer className="footer"><div className="footer-top"><div><p className="eyebrow">ENKOP REAL ESTATE · NAIROBI</p><h2>Let's find what<br/><em>moves you.</em></h2></div><Button asChild variant="circleLight"><Link to="/contact" aria-label="Contact ENKOP"><ArrowRight size={26} /></Link></Button></div><div className="footer-bottom"><Link to="/" className="footer-mark">ENKOP.</Link><p>Exceptional spaces. Thoughtfully represented.</p><nav aria-label="Footer navigation">{navigation.map(item => <Link key={item.to} to={item.to}>{item.label}</Link>)}</nav><span>© {new Date().getFullYear()} ENKOP</span></div></footer>
  </div>;
}

export function SectionTop({ index, label, title, action }: { index: string; label: string; title: ReactNode; action?: { label: string; to: string } }) {
  return <div className="section-top"><div><p className="eyebrow"><span>{index} /</span> {label}</p><h2>{title}</h2></div>{action && <Link className="inline-arrow" to={action.to}>{action.label}<ArrowRight size={18}/></Link>}</div>;
}