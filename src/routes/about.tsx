import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { Site } from '@/components/enkop/Site';
import { company, imagery, values } from '@/lib/enkop';
import { getTeam, getTestimonials } from '@/lib/content.functions';
import { TeamSection, TestimonialsSection } from '@/components/enkop/PeopleSections';

export const Route = createFileRoute('/about')({ head: () => ({ meta: [{ title: 'About ENKOP Real Estate | Nairobi Property Consultancy' }, { name: 'description', content: 'ENKOP Real Estate is a Nairobi-based consultancy helping individuals, families and investors buy, sell, rent and invest in residential property with integrity, transparency and personal service.' }, { property: 'og:title', content: 'About ENKOP Real Estate' }, { property: 'og:description', content: 'Honest advice, personalised guidance and market knowledge for every property decision.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }), loader: async () => { const [team, quotes] = await Promise.all([getTeam().catch(() => []), getTestimonials().catch(() => [])]); return { team, quotes }; }, component: About });

function About() {
  const { team, quotes } = Route.useLoaderData();
  return <Site>
    <section className="interior-hero page-gutter"><p className="eyebrow">ENKOP / ABOUT US</p><h1>Guidance you<br/><em>can trust.</em></h1><div className="interior-hero-bottom"><p>A Nairobi-based real estate consultancy.</p><span>INTEGRITY · TRANSPARENCY · SERVICE</span></div></section>
    <section className="editorial-image"><img src={imagery['residence-1']} alt="Contemporary Nairobi residence set among mature trees" width="1400" height="1100"/></section>
    <section className="intro-section page-gutter"><p className="eyebrow"><span>01 /</span> WHO WE ARE</p><div className="intro-layout"><h2>Clarity at every<br/><em>step of the journey.</em></h2><div><p>{company.summary}</p><p>We support clients looking to buy, sell, rent or invest with personalised guidance, relevant property options and professional support throughout the process. {company.approach}</p><Link className="inline-arrow" to="/services">Explore our services <ArrowRight size={18}/></Link></div></div></section>
    <section className="place-section"><div className="place-image"><img src={imagery['residence-3']} alt="Calm courtyard framed by contemporary Nairobi architecture" loading="lazy" width="1200" height="1000"/></div><div className="place-copy"><p className="eyebrow"><span>02 /</span> OUR PHILOSOPHY</p><h2>More than<br/>a <em>transaction.</em></h2><p>Real estate is about more than buildings. It is about finding a place where life can unfold, making informed investment decisions, and creating a sense of belonging.</p><p className="place-quote">{company.philosophy}</p></div></section>
    <section className="statement-section page-gutter"><p className="eyebrow"><span>03 /</span> WHERE WE ARE GOING</p><div className="statement-grid"><div><h3>Our vision</h3><p>{company.vision}</p></div><div><h3>Our mission</h3><p>{company.mission}</p></div></div></section>
    <section className="why-section page-gutter" id="values"><p className="eyebrow"><span>04 /</span> OUR CORE VALUES</p><h2 className="why-heading">What we <em>stand for.</em></h2><div className="why-grid">{values.map(([title, text], i) => <div key={title}><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></div>)}</div></section>
    <TeamSection team={team} index="05"/>
    <TestimonialsSection quotes={quotes} index="06"/>
    <section className="simple-cta page-gutter"><div><p className="eyebrow">OUR COMMITMENT</p><h2>One client, one home,<br/><em>one investment at a time.</em></h2></div><Link className="inline-arrow" to="/contact">Speak to our team <ArrowRight size={18}/></Link></section>
  </Site>;
}
