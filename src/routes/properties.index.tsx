import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { ArrowRight, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Site } from '@/components/enkop/Site';
import { PropertyCard } from '@/components/enkop/PropertyCard';
import { getProperties } from '@/lib/enkop.functions';
import type { Property } from '@/lib/enkop';

const searchSchema = z.object({ location: z.string().optional(), type: z.string().optional(), status: z.string().optional(), price: z.coerce.number().optional(), bedrooms: z.coerce.number().optional(), q: z.string().optional() });
export const Route = createFileRoute('/properties/')({
  validateSearch: searchSchema,
  loader: () => getProperties(),
  head: () => ({ meta: [{ title: 'The Collection | ENKOP Real Estate' }, { name: 'description', content: 'Explore ENKOP’s curated collection of residences in Nairobi, from thoughtful city apartments to exceptional homes.' }, { property: 'og:title', content: 'The Collection | ENKOP Real Estate' }, { property: 'og:description', content: 'Explore a considered collection of residences in Nairobi.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: Collection,
});

function Collection() {
  const all = Route.useLoaderData() as Property[];
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(search.q ?? '');
  const locations = [...new Set(all.map(p => p.neighborhood))].sort();
  const types = [...new Set(all.map(p => p.property_type))].sort();
  const filtered = useMemo(() => all.filter(p => (!search.location || p.neighborhood.toLowerCase() === search.location.toLowerCase()) && (!search.type || p.property_type === search.type) && (!search.status || p.listing_type === search.status) && (!search.price || p.price <= search.price) && (!search.bedrooms || p.bedrooms >= search.bedrooms) && (!search.q || `${p.title} ${p.neighborhood} ${p.description}`.toLowerCase().includes(search.q.toLowerCase()))), [all,search]);
  const update = (key: keyof typeof search, value: string) => navigate({ search: prev => ({ ...prev, [key]: value || undefined }), replace: true });
  const active = Object.values(search).some(Boolean);
  return <Site><section className="interior-hero page-gutter"><p className="eyebrow">ENKOP / THE COLLECTION</p><h1>Find a place<br/><em>to belong.</em></h1><div className="interior-hero-bottom"><p>A curated perspective on living in Nairobi.</p><span>{filtered.length.toString().padStart(2,'0')} RESIDENCES</span></div></section>
    <section className="listing-section page-gutter"><div className="filters"><form className="filter-search" onSubmit={e => { e.preventDefault(); update('q', query); }}><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search properties" placeholder="Search residences or locations"/><Button variant="iconPlain" aria-label="Search" type="submit"><ArrowRight size={18}/></Button></form><select aria-label="Location" value={search.location ?? ''} onChange={e => update('location', e.target.value)}><option value="">All locations</option>{locations.map(x => <option key={x}>{x}</option>)}</select><select aria-label="Property type" value={search.type ?? ''} onChange={e => update('type', e.target.value)}><option value="">All property types</option>{types.map(x => <option key={x}>{x}</option>)}</select><select aria-label="Listing status" value={search.status ?? ''} onChange={e => update('status', e.target.value)}><option value="">Sale & rent</option><option value="Sale">For sale</option><option value="Rent">To let</option></select><select aria-label="Maximum price" value={search.price ?? ''} onChange={e => update('price', e.target.value)}><option value="">Any price</option><option value="30000000">Up to KES 30M</option><option value="60000000">Up to KES 60M</option><option value="100000000">Up to KES 100M</option></select><select aria-label="Minimum bedrooms" value={search.bedrooms ?? ''} onChange={e => update('bedrooms', e.target.value)}><option value="">Any beds</option>{[2,3,4,5].map(n => <option value={n} key={n}>{n}+ beds</option>)}</select></div>
      <div className="result-heading"><span>EXPLORE THE COLLECTION</span>{active && <Button variant="textArrow" onClick={() => { setQuery(''); navigate({ search: {}, replace: true }); }}>Clear filters <X size={15}/></Button>}</div>
      {filtered.length ? <div className="listing-grid">{filtered.map(p => <PropertyCard key={p.id} property={p}/>)}</div> : <div className="empty-results"><h2>Nothing matched<br/><em>your search.</em></h2><p>Try adjusting your location, property type or price range.</p><Button variant="luxury" onClick={() => { setQuery(''); navigate({ search: {}, replace: true }); }}>Clear filters <ArrowRight size={16}/></Button></div>}
    </section><section className="simple-cta page-gutter"><h2>Something specific<br/><em>in mind?</em></h2><Link className="inline-arrow" to="/contact">Talk to ENKOP <ArrowRight size={18}/></Link></section></Site>;
}