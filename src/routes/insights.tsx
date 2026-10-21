import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { Site } from '@/components/enkop/Site';
import { imagery } from '@/lib/enkop';

export const Route = createFileRoute('/insights')({ head: () => ({ meta: [{ title: 'Perspective | Property Insights from ENKOP Real Estate' }, { name: 'description', content: 'Practical guidance from ENKOP Real Estate on buying, selling, renting and investing in property in Nairobi.' }, { property: 'og:title', content: 'ENKOP Perspective' }, { property: 'og:description', content: 'Practical property guidance to help you make informed decisions in Nairobi.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }), component: Insights });

const topics = [
  ['Buying in Nairobi', 'What to consider when choosing a neighbourhood, from commute and schools to future development.'],
  ['Investing off-plan', 'How to assess an off-plan development, payment plans and timelines against your objectives.'],
  ['Preparing to sell', 'How presentation, pricing and promotion help the right buyers find your property.'],
] as const;

function Insights() {
  return <Site>
    <section className="interior-hero page-gutter"><p className="eyebrow">ENKOP / PERSPECTIVE</p><h1>Look closer.<br/><em>See further.</em></h1><div className="interior-hero-bottom"><p>Practical guidance for informed property decisions.</p><span>THE JOURNAL</span></div></section>
    <section className="insight-feature page-gutter"><img src={imagery['residence-2']} alt="Apartment overlooking Nairobi" width="1200" height="1000"/><div><p className="eyebrow">ENKOP PERSPECTIVE</p><h2>Knowledge that<br/><em>moves you forward.</em></h2><p>Our mission is to help clients make informed property decisions. The ENKOP journal will share clear, practical notes on Nairobi’s neighbourhoods, buying, selling and investing. Until it launches, our consultants are happy to answer your questions directly.</p><Link className="inline-arrow" to="/contact" search={{ interest: 'Consultancy' }}>Ask a consultant <ArrowRight size={18}/></Link></div></section>
    <section className="why-section page-gutter"><p className="eyebrow">COMING TO THE JOURNAL</p><div className="why-grid">{topics.map(([title, text], i) => <div key={title}><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></div>)}</div></section>
  </Site>;
}
