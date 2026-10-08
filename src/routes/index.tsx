import { createFileRoute } from "@tanstack/react-router";
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Site, SectionTop } from '@/components/enkop/Site';
import { PropertyCard } from '@/components/enkop/PropertyCard';
import { getProperties } from '@/lib/enkop.functions';
import { hero, imagery, type Property } from '@/lib/enkop';
import { HeroReel } from '@/components/enkop/HeroReel';
import { getHomepageSlides } from '@/lib/slides.functions';

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: 'ENKOP — Exceptional Spaces in Nairobi' }, { name: 'description', content: 'A considered approach to Nairobi real estate. Discover exceptional residences and a new perspective on property with ENKOP.' }, { property: 'og:title', content: 'ENKOP — Exceptional Spaces in Nairobi' }, { property: 'og:description', content: 'Discover exceptional residences and a new perspective on property with ENKOP.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  loader: async () => { const [properties, slides] = await Promise.all([getProperties(), getHomepageSlides().catch(() => [])]); return { properties, slides }; },
  component: Index,
});

function Index() {
  const { properties: loaded, slides: managed } = Route.useLoaderData();
  const properties = loaded as Property[];
  const slides = managed.length ? managed : [{ id: 'built-in-loop', label: '', video_url: '/videos/enkop-hero-loop.mp4', image_url: '/videos/enkop-hero-loop.jpg' }];
  return <Site darkHeader>
    <section className="home-hero"><HeroReel slides={slides} poster={hero} /><div className="hero-shade"/><div className="hero-content"><p className="eyebrow">ENKOP REAL ESTATE  /  NAIROBI, KENYA</p><h1>Exceptional<br/><em>spaces.</em></h1><div className="hero-bottom-line"><p>Places with presence.<br/>Property with perspective.</p><Button asChild variant="luxuryLight"><Link to="/properties">Explore the collection <ArrowUpRight size={16}/></Link></Button></div></div><a href="#introduction" className="hero-scroll">SCROLL TO EXPLORE <ArrowDown size={17}/></a><span className="hero-side-note">01 — 04 / A DIFFERENT PERSPECTIVE</span></section>
    <section className="intro-section page-gutter" id="introduction"><p className="eyebrow"><span>01 /</span> OUR PERSPECTIVE</p><div className="intro-layout"><h2>Real estate,<br/><em>reconsidered.</em></h2><div><p>ENKOP connects people with exceptional spaces through a more considered approach to property.</p><Link className="inline-arrow" to="/about">Discover ENKOP <ArrowRight size={18}/></Link></div></div></section>
    <section className="collection-section page-gutter"><SectionTop index="02" label="THE COLLECTION" title={<>Spaces worth <em>discovering.</em></>} action={{ label: 'View all properties', to: '/properties' }}/><div className="featured-grid">{properties.slice(0,2).map((property, index) => <PropertyCard key={property.id} property={property} large={index===0}/>)}</div><div className="collection-note"><span>RESIDENCES / NAIROBI & BEYOND</span><span>{properties.length.toString().padStart(2,'0')} IN THE COLLECTION</span></div></section>
    <section className="place-section"><div className="place-image"><img src={imagery['residence-3']} alt="Calm courtyard framed by contemporary Nairobi architecture" loading="lazy" width="1200" height="1000"/></div><div className="place-copy"><p className="eyebrow"><span>03 /</span> THE ART OF LIVING</p><h2>More than<br/>an <em>address.</em></h2><p>For the life you imagine, and the moments you haven't yet.</p><Link className="inline-arrow" to="/properties">Find your space <ArrowRight size={18}/></Link></div></section>
    <section className="neighborhood-section page-gutter"><SectionTop index="04" label="EXPLORE NAIROBI" title={<>A city of <em>possibilities.</em></>}/><div className="neighborhood-links">{['Karen','Westlands','Runda','Kilimani'].map((area, index) => <Link key={area} to="/properties" search={{ location: area }}><span>0{index+1}</span><strong>{area}</strong><ArrowUpRight size={24}/></Link>)}</div></section>
    <section className="services-preview page-gutter"><div><p className="eyebrow"><span>05 /</span> WHAT WE DO</p><h2>Property, with<br/><em>purpose.</em></h2></div><div className="services-preview-right"><p>From finding the right place to making the right move, we bring clarity to every property decision.</p><div>{['Property sales','Property letting','Property sourcing','Advisory & representation'].map((service, index) => <Link key={service} to="/services"><span>0{index+1}</span>{service}<ArrowUpRight size={18}/></Link>)}</div></div></section>
    <section className="perspective-band"><div className="page-gutter perspective-content"><p className="eyebrow">ENKOP PERSPECTIVE</p><h2>Look closer.<br/><em>See further.</em></h2><Button asChild variant="luxuryLight"><Link to="/insights">Explore perspectives <ArrowUpRight size={16}/></Link></Button></div><img src={imagery['residence-2']} alt="Contemporary living room overlooking Nairobi" loading="lazy" width="1200" height="1000"/></section>
  </Site>;
}
