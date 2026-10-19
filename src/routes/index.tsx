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
import { hero, imagery, type Property } from '@/lib/enkop';
import { HeroReel } from '@/components/enkop/HeroReel';
import { Entrance } from '@/components/enkop/Entrance';
import { SectionNavigator } from '@/components/enkop/SectionNavigator';
import { IntentPicker } from '@/components/enkop/IntentPicker';
import { getTestimonials } from '@/lib/content.functions';
import { TestimonialsSection } from '@/components/enkop/PeopleSections';
import { HeroSearch } from '@/components/enkop/HeroSearch';
import { getHomepageSlides } from '@/lib/slides.functions';
import { builtInHeroSlides } from '@/lib/hero-media';
import { useCinematicFx } from '@/lib/cinematic';

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: 'ENKOP — Exceptional Spaces in Nairobi' }, { name: 'description', content: 'A considered approach to Nairobi real estate. Discover exceptional residences and a new perspective on property with ENKOP.' }, { property: 'og:title', content: 'ENKOP — Exceptional Spaces in Nairobi' }, { property: 'og:description', content: 'Discover exceptional residences and a new perspective on property with ENKOP.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  loader: async () => { const [properties, slides, quotes] = await Promise.all([getProperties(), getHomepageSlides().catch(() => []), getTestimonials().catch(() => [])]); return { properties, slides, quotes }; },
  component: Index,
});

const NAV = [{ id: 'top', label: 'Welcome' }, { id: 'approach', label: 'Our approach' }, { id: 'collection', label: 'Collection' }, { id: 'locations', label: 'Locations' }, { id: 'services', label: 'Services' }, { id: 'why', label: 'Why ENKOP' }, { id: 'contact', label: 'Contact' }];

function Index() {
  useCinematicFx();
  const { properties: loaded, slides: managed, quotes } = Route.useLoaderData();
  const properties = loaded as Property[];
  const slides = managed.length ? managed : builtInHeroSlides;
  return <Site darkHeader>
    <Entrance />
    <SectionNavigator sections={NAV} />
    <section className="home-hero" id="top">
      <Parallax className="hero-parallax" strength={0.14}>
        <HeroReel slides={slides} poster={hero} />
      </Parallax>
      <div className="hero-shade"/>
      <div className="hero-content">
        <p className="eyebrow">ENKOP REAL ESTATE  /  NAIROBI, KENYA</p>
        <h1>Exceptional<br/><em>spaces.</em></h1>
        <div className="hero-bottom-line">
          <p>Places with presence.<br/>Property with perspective.</p>
          <Button asChild variant="luxuryLight"><Link to="/properties">Explore the collection <ArrowUpRight size={16}/></Link></Button>
        </div>
        <HeroSearch properties={properties} />
      </div>
      <div className="hero-massing" aria-hidden="true"><div className="massing-cube"><i/><i/><i/><i/><i/><i/></div>
      </div>
      <a href="#approach" className="hero-scroll">SCROLL TO EXPLORE <ArrowDown size={17}/></a>
      <span className="hero-side-note">01 — 04 / A DIFFERENT PERSPECTIVE</span>
    </section>

    <Reveal as="section" id="approach" className="intro-section page-gutter" delay={0}>
      <IntentPicker />
      <p className="eyebrow"><span>01 /</span> OUR PERSPECTIVE</p>
      <div className="intro-layout">
        <h2>Real estate,<br/><em>reconsidered.</em></h2>
        <div>
          <p>ENKOP connects people with exceptional spaces through a more considered approach to property.</p>
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
      <div className="collection-note"><span>RESIDENCES / NAIROBI & BEYOND</span><span>{properties.length.toString().padStart(2,'0')} IN THE COLLECTION</span></div>
    </Reveal>

    <Reveal as="section" className="place-section">
      <Parallax className="place-image" strength={0.16}>
        <img src={imagery['residence-3']} alt="Calm courtyard framed by contemporary Nairobi architecture" loading="lazy" width="1200" height="1000"/>
      </Parallax>
      <div className="place-copy">
        <p className="eyebrow"><span>03 /</span> THE ART OF LIVING</p>
        <h2>More than<br/>an <em>address.</em></h2>
        <p>For the life you imagine, and the moments you haven't yet.</p>
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
        <p>From finding the right place to making the right move, we bring clarity to every property decision.</p>
        <div>{['Property sales','Property letting','Property sourcing','Advisory & representation'].map((service, index) => <Link key={service} to="/services"><span>0{index+1}</span>{service}<ArrowUpRight size={18}/></Link>)}</div>
      </div>
    </Reveal>

    <Reveal as="section" className="perspective-band">
      <div className="page-gutter perspective-content">
        <p className="eyebrow">ENKOP PERSPECTIVE</p>
        <h2>Look closer.<br/><em>See further.</em></h2>
        <Button asChild variant="luxuryLight"><Link to="/insights">Explore perspectives <ArrowUpRight size={16}/></Link></Button>
      </div>
      <Parallax className="perspective-parallax" strength={0.2}>
        <img src={imagery['residence-2']} alt="Contemporary living room overlooking Nairobi" loading="lazy" width="1200" height="1000"/>
      </Parallax>
    </Reveal>

    <Reveal as="section" id="why" className="why-section page-gutter">
      <p className="eyebrow"><span>06 /</span> WHY ENKOP</p>
      <div className="why-grid">
        {[['Curated, not crowded','A considered selection of residences, each one personally reviewed.'],['Represented in person','One ENKOP representative from first viewing to final handover.'],['Discreet by default','Private viewings and quiet negotiation, on your terms.']].map(([t,d], i) => <div key={t}><span>0{i+1}</span><h3>{t}</h3><p>{d}</p></div>)}
      </div>
    </Reveal>

    <TestimonialsSection quotes={quotes} index="07" />

    <Reveal as="section" id="contact" className="home-enquire page-gutter">
      <div className="home-enquire-copy">
        <p className="eyebrow"><span>07 /</span> BEGIN THE CONVERSATION</p>
        <h2>Tell us what exceptional<br/><em>looks like to you.</em></h2>
        <p>Share a few details and an ENKOP representative will reach out personally — by email or phone, whichever you prefer.</p>
      </div>
      <EnquiryForm />
    </Reveal>
  </Site>;
}
