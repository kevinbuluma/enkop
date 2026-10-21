import { createFileRoute } from "@tanstack/react-router";
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Site, SectionTop } from '@/components/enkop/Site';
import { PropertyCard } from '@/components/enkop/PropertyCard';
import { EnquiryForm } from '@/components/enkop/EnquiryForm';
import { Reveal } from '@/components/enkop/Reveal';
import { Parallax } from '@/components/enkop/Parallax';
import { getProperties } from '@/lib/enkop.functions';
import { company, hero, imagery, reasons, services, type Property } from '@/lib/enkop';
import { HeroReel } from '@/components/enkop/HeroReel';
import { Entrance } from '@/components/enkop/Entrance';
import { SectionNavigator } from '@/components/enkop/SectionNavigator';
import { IntentPicker } from '@/components/enkop/IntentPicker';
import { getTestimonials } from '@/lib/content.functions';
import { TestimonialsSection } from '@/components/enkop/PeopleSections';
import { HeroSearch } from '@/components/enkop/HeroSearch';
import { GlassEmblem } from '@/components/enkop/GlassEmblem';
import { getHomepageSlides } from '@/lib/slides.functions';
import { builtInHeroSlides } from '@/lib/hero-media';
import { useCinematicFx } from '@/lib/cinematic';

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: 'ENKOP Real Estate | Buy, Sell, Rent & Invest in Nairobi' }, { name: 'description', content: 'ENKOP Real Estate is a Nairobi-based consultancy helping individuals, families and investors buy, sell, rent and invest in residential property across Kenya, with honest advice and personalised guidance.' }, { property: 'og:title', content: 'ENKOP Real Estate | Nairobi Property Consultancy' }, { property: 'og:description', content: 'Homes you can confidently call home, and investments made with clarity.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  loader: async () => { const [properties, slides, quotes] = await Promise.all([getProperties(), getHomepageSlides().catch(() => []), getTestimonials().catch(() => [])]); return { properties, slides, quotes }; },
  component: Index,
});

const NAV = [{ id: 'top', label: 'Welcome' }, { id: 'approach', label: 'Who we are' }, { id: 'collection', label: 'Collection' }, { id: 'locations', label: 'Locations' }, { id: 'services', label: 'Services' }, { id: 'goals', label: 'Buy, sell or invest' }, { id: 'why', label: 'Why ENKOP' }, { id: 'contact', label: 'Contact' }];

const goals = [
  { id: 'buy', label: 'BUYERS & FAMILIES', title: 'Find a place you can', em: 'confidently call home.', points: ['Options matched to your budget, preferred areas and lifestyle', 'Viewings arranged around your schedule', 'Negotiation support and help coordinating your move'], cta: 'Browse homes', to: '/properties' as const, search: { status: 'Sale' } },
  { id: 'invest', label: 'INVESTORS', title: 'Invest with', em: 'clarity, not guesswork.', points: ['Off-plan and ready residential opportunities across Nairobi', 'Guidance grounded in local market knowledge', 'Transparent information to support informed decisions'], cta: 'Discuss an investment', to: '/contact' as const, search: { interest: 'Off-plan investment' } },
  { id: 'sell', label: 'PROPERTY OWNERS', title: 'Sell or let to', em: 'the right people.', points: ['Professional property promotion and marketing', 'Active engagement with prospective buyers and tenants', 'Clear communication and support through to agreement'], cta: 'Sell or let your property', to: '/contact' as const, search: { interest: 'Selling' } },
];

function Index() {
  useCinematicFx();
  const { properties: loaded, slides: managed, quotes } = Route.useLoaderData();
  const properties = loaded as Property[];
  const slides = managed.length ? managed : builtInHeroSlides;
  return <Site darkHeader>
    <Entrance />
    <SectionNavigator sections={NAV} />
    <section className="home-hero" id="top">
      <HeroReel slides={slides} poster={hero} />
      <div className="hero-shade"/>
      <div className="hero-content">
        <p className="eyebrow">ENKOP REAL ESTATE  /  NAIROBI, KENYA</p>
        <h1>Exceptional<br/><em>spaces.</em></h1>
        <div className="hero-bottom-line">
          <p>Places you can confidently call home.<br/>Investments made with clarity.</p>
          <Button asChild variant="onDark"><Link to="/properties">Explore the collection <ArrowUpRight size={16}/></Link></Button>
        </div>
        <HeroSearch properties={properties} />
      </div>
      <GlassEmblem className="hero-emblem" />
      <a href="#approach" className="hero-scroll">SCROLL TO EXPLORE <ArrowDown size={17}/></a>
    </section>

    <Reveal as="section" id="approach" className="intro-section page-gutter" delay={0}>
      <IntentPicker />
      <p className="eyebrow"><span>01 /</span> WHO WE ARE</p>
      <div className="intro-layout">
        <h2>Real estate,<br/><em>made clearer.</em></h2>
        <div>
          <p>{company.summary}</p>
          <p>Built on integrity, transparency and service, we guide you from the first conversation to the day you settle in.</p>
          <Link className="inline-arrow" to="/about">Discover ENKOP <ArrowRight size={18}/></Link>
        </div>
      </div>
    </Reveal>

    <Reveal as="section" id="collection" className="collection-section page-gutter">
      <SectionTop index="02" label="THE COLLECTION" title={<>Spaces worth <em>discovering.</em></>} action={{ label: 'View all properties', to: '/properties' }}/>
      <div className="featured-grid">
        {properties.slice(0,2).map((property, index) => (
          <Reveal key={property.id} delay={index * 120}>
            <PropertyCard property={property} large={index===0}/>
          </Reveal>
        ))}
      </div>
      <div className="collection-note"><span>ESTABLISHED & EMERGING NEIGHBOURHOODS</span><span>{properties.length.toString().padStart(2,'0')} IN THE COLLECTION</span></div>
    </Reveal>

    <Reveal as="section" className="place-section">
      <Parallax className="place-image" strength={0.16}>
        <img src={imagery['residence-3']} alt="Calm courtyard framed by contemporary Nairobi architecture" loading="lazy" width="1200" height="1000"/>
      </Parallax>
      <div className="place-copy">
        <p className="eyebrow"><span>03 /</span> OUR PHILOSOPHY</p>
        <h2>More than<br/>an <em>address.</em></h2>
        <p>{company.philosophy}</p>
        <Link className="inline-arrow" to="/properties">Find your space <ArrowRight size={18}/></Link>
      </div>
    </Reveal>

    <Reveal as="section" id="locations" className="neighborhood-section page-gutter">
      <SectionTop index="04" label="EXPLORE NAIROBI" title={<>A city of <em>possibilities.</em></>}/>
      <div className="neighborhood-links">
        {['Karen','Westlands','Runda','Kilimani'].map((area, index) => (
          <Link key={area} to="/properties" search={{ location: area }} style={{ transitionDelay: `${index * 40}ms` }}>
            <span>0{index+1}</span><strong>{area}</strong><ArrowUpRight size={24}/>
          </Link>
        ))}
      </div>
    </Reveal>

    <Reveal as="section" id="services" className="services-preview page-gutter">
      <div>
        <p className="eyebrow"><span>05 /</span> WHAT WE DO</p>
        <h2>Property, with<br/><em>purpose.</em></h2>
      </div>
      <div className="services-preview-right">
        <p>Whether you are buying, selling, renting or investing, we provide personalised guidance, relevant options and professional support throughout the process.</p>
        <div>{services.map((service, index) => <Link key={service.id} to="/services" hash={service.id}><span>0{index+1}</span>{service.title}<ArrowUpRight size={18}/></Link>)}</div>
      </div>
    </Reveal>

    <Reveal as="section" id="goals" className="goals-section page-gutter">
      <p className="eyebrow"><span>06 /</span> YOUR GOAL, OUR FOCUS</p>
      <div className="goals-grid">
        {goals.map((g) => <article key={g.id} className="goal-card">
          <p className="eyebrow">{g.label}</p>
          <h3>{g.title} <em>{g.em}</em></h3>
          <ul>{g.points.map((p) => <li key={p}>{p}</li>)}</ul>
          <Button asChild variant={g.id === 'sell' ? 'premium' : 'line'}><Link to={g.to} search={g.search as never}>{g.cta} <ArrowRight size={16}/></Link></Button>
        </article>)}
      </div>
    </Reveal>

    <Reveal as="section" className="perspective-band">
      <div className="page-gutter perspective-content">
        <p className="eyebrow">ENKOP PERSPECTIVE</p>
        <h2>Look closer.<br/><em>See further.</em></h2>
        <Button asChild variant="onDark"><Link to="/insights">Explore perspectives <ArrowUpRight size={16}/></Link></Button>
      </div>
      <Parallax className="perspective-parallax" strength={0.2}>
        <img src={imagery['residence-2']} alt="Contemporary living room overlooking Nairobi" loading="lazy" width="1200" height="1000"/>
      </Parallax>
    </Reveal>

    <Reveal as="section" id="why" className="why-section page-gutter">
      <p className="eyebrow"><span>07 /</span> WHY CHOOSE ENKOP</p>
      <h2 className="why-heading">Advice you can trust,<br/><em>support you can feel.</em></h2>
      <div className="why-grid">
        {reasons.map(([t,d], i) => <div key={t}><span>0{i+1}</span><h3>{t}</h3><p>{d}</p></div>)}
      </div>
    </Reveal>

    <TestimonialsSection quotes={quotes} index="08" />

    <Reveal as="section" id="contact" className="home-enquire page-gutter">
      <div className="home-enquire-copy">
        <p className="eyebrow"><span>08 /</span> BEGIN THE CONVERSATION</p>
        <h2>Tell us what you're<br/><em>looking for.</em></h2>
        <p>A home, a sale, a rental or an investment: share a few details and an ENKOP consultant will respond personally, by email or phone, whichever you prefer.</p>
        <p className="home-enquire-promise">{company.promise}</p>
      </div>
      <EnquiryForm />
    </Reveal>
  </Site>;
}
