import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Site } from '@/components/enkop/Site';
import { imagery, pageSeo, services } from '@/lib/enkop';

const seo = pageSeo('/services');

export const Route = createFileRoute('/services')({ head: () => ({ meta: [{ title: 'Services | ENKOP Real Estate, Nairobi' }, { name: 'description', content: 'Property sales and marketing, off-plan property investment, real estate consultancy, and leasing and rentals in Nairobi and across Kenya.' }, { property: 'og:title', content: 'Services | ENKOP Real Estate' }, { property: 'og:description', content: 'Buy, sell, rent or invest with personalised guidance from ENKOP Real Estate.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }, seo.ogUrl], links: [seo.canonical] }), component: Services });

const process = [
  ['Understand your goals', 'We start with your preferences, budget, timeline and objectives, whether you are buying, selling, renting or investing.'],
  ['Curate relevant options', 'You see properties and opportunities that match your needs, preferred locations and intended use, not an endless list.'],
  ['View and evaluate', 'We arrange viewings and share clear information so you can compare options and decide with confidence.'],
  ['Negotiate and transact', 'We support you through discussions, offers and next steps, keeping communication open throughout.'],
  ['Settle in', 'Our support continues after the search, including help coordinating household moving arrangements.'],
] as const;

function Services() {
  return <Site>
    <section className="interior-hero page-gutter"><p className="eyebrow">ENKOP / OUR SERVICES</p><h1>Property, with<br/><em>purpose.</em></h1><div className="interior-hero-bottom"><p>Buy, sell, rent or invest, with personalised guidance at every step.</p><span>WHAT WE DO</span></div></section>
    <section className="editorial-image"><img src={imagery['residence-3']} alt="Contemporary courtyard residence" width="1200" height="1000"/></section>
    <section className="service-list page-gutter">
      <p className="eyebrow">OUR EXPERTISE / 01</p>
      {services.map((s, i) => <Link key={s.id} id={s.id} to="/contact" search={{ interest: s.interest }} className="service-row"><span>0{i+1}</span><div><h2>{s.title}</h2><small className="service-audience">{s.audience}</small></div><p>{s.summary}</p><ArrowUpRight size={24}/></Link>)}
    </section>
    <section className="process-section page-gutter">
      <p className="eyebrow">HOW WE WORK / 02</p>
      <h2>A clear path,<br/><em>from first call to keys.</em></h2>
      <ol className="process-grid">{process.map(([title, text], i) => <li key={title}><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol>
    </section>
    <section className="simple-cta page-gutter"><h2>Tell us where<br/><em>you want to be.</em></h2><Link className="inline-arrow" to="/contact">Book a consultation <ArrowRight size={18}/></Link></section>
  </Site>;
}
