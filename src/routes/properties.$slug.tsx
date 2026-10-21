import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, X, Maximize2, Share2, Phone, MessageCircle, CalendarDays } from 'lucide-react';
import { Instagram, Facebook, Youtube, Music2, ExternalLink, MapPin, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Site } from '@/components/enkop/Site';
import { EnquiryForm } from '@/components/enkop/EnquiryForm';
import { PropertyCard } from '@/components/enkop/PropertyCard';
import { SaveButton } from '@/components/enkop/SaveButton';
import { getProperties } from '@/lib/enkop.functions';
import { formatPrice, imagery, contact, siteUrl, type Property } from '@/lib/enkop';
import { recordView } from '@/lib/personal';

export const Route = createFileRoute('/properties/$slug')({
  loader: () => getProperties(),
  head: ({ params, loaderData }) => {
    const p = (loaderData as Property[] | undefined)?.find(x => x.slug === params.slug);
    const name = p?.title ?? params.slug.replaceAll('-', ' ');
    const desc = p ? `${p.bedrooms}-bed ${p.property_type.toLowerCase()} ${p.listing_type === 'Sale' ? 'for sale' : 'to let'} in ${p.neighborhood}, ${p.city}. ${formatPrice(p)}.` : 'Explore this residence with ENKOP Real Estate in Nairobi.';
    const photo = p?.photo_urls?.[0];
    const img = photo ? siteUrl(photo) : undefined;
    const url = siteUrl(`/properties/${params.slug}`);
    return {
      meta: [{ title: `${name} | ENKOP Real Estate` }, { name: 'description', content: desc }, { property: 'og:title', content: `${name} | ENKOP` }, { property: 'og:description', content: desc }, { property: 'og:type', content: 'website' }, { property: 'og:url', content: url }, { name: 'twitter:card', content: 'summary_large_image' }, ...(img ? [{ property: 'og:image', content: img }, { name: 'twitter:image', content: img }] : [])],
      links: [{ rel: 'canonical', href: url }],
      scripts: p ? [{ type: 'application/ld+json', children: JSON.stringify({ '@context': 'https://schema.org', '@type': 'RealEstateListing', name: p.title, description: p.description, url, ...(img ? { image: img } : {}), offers: { '@type': 'Offer', price: p.price, priceCurrency: p.currency, businessFunction: p.listing_type === 'Sale' ? 'Sell' : 'LeaseOut' }, address: { '@type': 'PostalAddress', addressLocality: p.neighborhood, addressRegion: p.city, addressCountry: 'KE' }, numberOfRooms: p.bedrooms, floorSize: { '@type': 'QuantitativeValue', value: p.area_sqm, unitCode: 'MTK' } }) }] : [],
    };
  },
  component: Detail,
});

const LINK_META: Record<string, { label: string; Icon: typeof ExternalLink }> = { instagram: { label: 'See on Instagram', Icon: Instagram }, tiktok: { label: 'Watch on TikTok', Icon: Music2 }, facebook: { label: 'See on Facebook', Icon: Facebook }, youtube: { label: 'Watch on YouTube', Icon: Youtube }, listing: { label: 'View original listing', Icon: ExternalLink }, tour: { label: 'Virtual tour', Icon: Video } };

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="detail-action" onClick={async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { window.prompt('Copy this link', url); }
  }}><Share2 size={17}/><span aria-live="polite">{copied ? 'Link copied' : 'Share'}</span></button>;
}

function Detail() {
  const { slug } = Route.useParams();
  const properties = Route.useLoaderData() as Property[];
  const property = properties.find(p => p.slug === slug);
  const [viewer, setViewer] = useState<number | null>(null);
  const photos = property ? (property.photo_urls?.length ? property.photo_urls : [imagery[property.image_key] ?? imagery['residence-1'], ...Object.values(imagery).filter(src => src !== imagery[property.image_key])]) : [];
  useEffect(() => { if (property) recordView(property.slug); }, [property?.slug]);
  useEffect(() => { if (viewer === null) return; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewer(null); if (e.key === 'ArrowRight') setViewer(n => n === null ? null : (n + 1) % photos.length); if (e.key === 'ArrowLeft') setViewer(n => n === null ? null : (n - 1 + photos.length) % photos.length); }; window.addEventListener('keydown',key); document.body.style.overflow = 'hidden'; return () => { window.removeEventListener('keydown',key); document.body.style.overflow = ''; }; }, [viewer, photos.length]);
  if (!property) return <Site><section className="empty-results page-gutter"><p className="eyebrow">ENKOP / 404</p><h1>This property is<br/><em>no longer available.</em></h1><Button asChild variant="primary"><Link to="/properties">Explore the collection <ArrowRight size={17}/></Link></Button></section></Site>;
  const related = properties.filter(p => p.id !== property.id).sort((a, b) => Number(b.neighborhood === property.neighborhood) - Number(a.neighborhood === property.neighborhood)).slice(0, 2);
  const waText = encodeURIComponent(`Hello ENKOP, I'm interested in ${property.title} (${typeof window !== 'undefined' ? window.location.href : ''})`);
  const links = Object.entries(property.external_links ?? {}).filter(([, u]) => typeof u === 'string' && u.startsWith('https://'));
  const sections = [['overview','Overview'],['details','Details'],...(property.tour_url ? [['tour','Tour']] : []),['features','Features'],...(property.map_query ? [['location','Location']] : []),['enquire','Enquire']];
  return <Site>
    <section className="detail-heading page-gutter">
      <nav aria-label="Breadcrumb" className="breadcrumbs"><ol><li><Link to="/">Home</Link></li><li><Link to="/properties">Collection</Link></li><li><Link to="/properties" search={{ location: property.neighborhood }}>{property.neighborhood}</Link></li><li aria-current="page">{property.title}</li></ol></nav>
      <div className="detail-heading-row"><div><p className="eyebrow">{property.neighborhood.toUpperCase()}, {property.city.toUpperCase()} / {property.property_type.toUpperCase()} / {property.listing_type === 'Sale' ? 'FOR SALE' : 'TO LET'}</p><h1>{property.title}<em>.</em></h1></div><p>{formatPrice(property)}</p></div>
      <div className="detail-actions"><a className="detail-action detail-action--primary" href="#enquire"><CalendarDays size={17}/>Request a private viewing</a><SaveButton slug={property.slug} title={property.title} withLabel className="detail-action"/><ShareButton title={property.title}/><a className="detail-action" href={`https://wa.me/${contact.whatsappDigits}?text=${waText}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={17}/>WhatsApp</a><a className="detail-action" href={`tel:${contact.phone.replaceAll(' ', '')}`}><Phone size={17}/>Call</a></div>
      {property.is_sample && <span className="sample-notice">Illustrative listing · Imagery and details are conceptual, not a live property offering.</span>}
    </section>
    <section className="detail-gallery page-gutter"><Button variant="iconPlain" className="detail-main-image" onClick={() => setViewer(0)} aria-label={`Open gallery, ${photos.length} images`}><img src={photos[0]} alt={`${property.title} exterior or interior`} width="1400" height="1100"/><span>{photos.length} IMAGES · VIEW GALLERY <Maximize2 size={16}/></span></Button><div className="detail-side-images">{photos.slice(1,3).map((src,i) => <Button variant="iconPlain" onClick={() => setViewer(i+1)} key={src} aria-label={`Open gallery at image ${i+2}`}><img src={src} alt={`${property.title} gallery view ${i+2}`} width="1200" height="1000" loading="lazy"/></Button>)}</div></section>
    {photos.length > 3 && <div className="detail-filmstrip page-gutter" aria-label="All photos">{photos.map((src,i) => <button type="button" key={src} onClick={() => setViewer(i)} aria-label={`View image ${i+1} of ${photos.length}`}><img src={src} alt="" loading="lazy" width="240" height="170"/></button>)}</div>}
    <nav className="section-nav page-gutter" aria-label="On this page">{sections.map(([id,label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
    <section className="detail-content page-gutter" id="overview"><div className="detail-overview"><p className="eyebrow">A CLOSER LOOK / 01</p><h2>A place to<br/><em>make your own.</em></h2><p>{property.description}</p><a className="inline-arrow" href="#enquire">Enquire about this residence <ArrowRight size={18}/></a></div><div className="detail-facts" id="details"><p className="eyebrow">PROPERTY DETAILS</p>{[['Location',`${property.neighborhood}, ${property.city}`],['Property type',property.property_type],['Listing',property.listing_type === 'Sale' ? 'For sale' : 'To let'],['Bedrooms',String(property.bedrooms)],['Bathrooms',String(property.bathrooms)],['Area',`${property.area_sqm} m²`],['Parking',`${property.parking} spaces`]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
    {property.tour_url && <section className="tour-section page-gutter" id="tour"><p className="eyebrow">THE CINEMATIC TOUR</p><h2>Step inside,<br/><em>from here.</em></h2><div className="tour-frame"><video src={property.tour_url} controls playsInline preload="none" poster={photos[0]}/></div></section>}
    {property.amenities.length > 0 && <section className="amenities-section page-gutter" id="features"><p className="eyebrow">THE DETAILS / 02</p><h2>Thoughtfully <em>appointed.</em></h2><div className="amenities-list">{property.amenities.map((amenity,i) => <span key={amenity}><small>0{i+1}</small>{amenity}</span>)}</div></section>}
    {links.length > 0 && <section className="elsewhere-section page-gutter"><p className="eyebrow">EXPLORE THIS PROPERTY ELSEWHERE</p><div className="elsewhere-links">{links.map(([k, u]) => { const meta = LINK_META[k] ?? { label: 'View link', Icon: ExternalLink }; return <a key={k} href={u} target="_blank" rel="noopener noreferrer"><meta.Icon size={18}/>{meta.label}<ExternalLink size={14}/></a>; })}</div></section>}
    {property.map_query && <section className="location-section page-gutter" id="location"><p className="eyebrow">LOCATION & SURROUNDINGS</p><h2>{property.neighborhood}, <em>{property.city}.</em></h2><p className="location-note">Approximate area shown for privacy. Exact address shared on viewing.</p><div className="map-frame"><iframe title={`Map of ${property.map_query}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps?q=${encodeURIComponent(property.map_query)}&z=13&output=embed`}/></div><a className="inline-arrow" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(property.map_query)}`} target="_blank" rel="noopener noreferrer"><MapPin size={16}/> Get directions</a></section>}
    <section className="detail-enquire page-gutter" id="enquire"><div><p className="eyebrow">REQUEST A PRIVATE VIEWING / 03</p><h2>Could this be<br/><em>your place?</em></h2><p>Tell us when suits you and an ENKOP representative will arrange a private viewing.</p><div className="concierge-contact"><span>Prefer to talk?</span><a href={`tel:${contact.phone.replaceAll(' ', '')}`}>{contact.phone}</a><a href={`https://wa.me/${contact.whatsappDigits}?text=${waText}`} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a></div></div><EnquiryForm property={property}/></section>
    {related.length > 0 && <section className="related-section page-gutter"><p className="eyebrow">YOU MAY ALSO CONSIDER</p><div className="listing-grid">{related.map(p => <PropertyCard key={p.id} property={p}/>)}</div></section>}
    <Link className="back-link page-gutter" to="/properties"><ArrowLeft size={17}/> Back to the collection</Link>
    {viewer !== null && <div className="gallery-viewer" role="dialog" aria-modal="true" aria-label="Property gallery"><div className="gallery-toolbar"><span>{String(viewer+1).padStart(2,'0')} / {String(photos.length).padStart(2,'0')}</span><Button variant="iconPlain" onClick={() => setViewer(null)} aria-label="Close gallery" autoFocus><X size={25}/></Button></div><Button variant="iconPlain" className="gallery-prev" onClick={() => setViewer((viewer-1+photos.length)%photos.length)} aria-label="Previous image"><ChevronLeft/></Button><img src={photos[viewer]} alt={`${property.title}, image ${viewer+1}`}/><Button variant="iconPlain" className="gallery-next" onClick={() => setViewer((viewer+1)%photos.length)} aria-label="Next image"><ChevronRight/></Button><div className="gallery-thumbs">{photos.map((src,i) => <Button variant="iconPlain" key={src} aria-label={`View image ${i+1}`} aria-pressed={viewer===i} onClick={() => setViewer(i)}><img src={src} alt=""/></Button>)}</div></div>}
  </Site>;
}
