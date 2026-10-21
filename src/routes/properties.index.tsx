import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { ArrowRight, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Site } from '@/components/enkop/Site';
import { PropertyCard } from '@/components/enkop/PropertyCard';
import { getProperties } from '@/lib/enkop.functions';
import { pageSeo, type Property } from '@/lib/enkop';
import { useRecent, useSaved, resetPersonal } from '@/lib/personal';

const searchSchema = z.object({ location: z.string().optional(), type: z.string().optional(), status: z.string().optional(), price: z.coerce.number().optional(), bedrooms: z.coerce.number().optional(), q: z.string().optional(), sort: z.string().optional(), saved: z.coerce.boolean().optional() });
const seo = pageSeo('/properties');

export const Route = createFileRoute('/properties/')({
  validateSearch: searchSchema,
  loader: () => getProperties(),
  pendingComponent: () => <Site><section className="listing-section page-gutter" style={{ paddingTop: 160 }}><div className="listing-grid">{[0,1,2,3].map(i => <div key={i} className="card-skeleton" aria-hidden="true"><div/><span/><span/></div>)}</div><p className="sr-only">Loading residences…</p></section></Site>,
  head: () => ({ meta: [{ title: 'Properties for Sale & Rent in Nairobi | ENKOP Real Estate' }, { name: 'description', content: 'Browse residential properties for sale and rent across Nairobi’s established and emerging neighbourhoods, presented by ENKOP Real Estate.' }, { property: 'og:title', content: 'The Collection | ENKOP Real Estate' }, { property: 'og:description', content: 'Homes for sale and rent across Nairobi’s established and emerging neighbourhoods.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }, seo.ogUrl], links: [seo.canonical] }),
  component: Collection,
});

const labels: Record<string, string> = { location: 'Location', type: 'Type', status: 'Listing', price: 'Up to KES', bedrooms: 'Beds', q: 'Search', saved: 'Saved only' };

function Collection() {
  const all = Route.useLoaderData() as Property[];
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { saved } = useSaved();
  const recent = useRecent();
  const [query, setQuery] = useState(search.q ?? '');
  const locations = [...new Set(all.map(p => p.neighborhood))].sort();
  const types = [...new Set(all.map(p => p.property_type))].sort();
  const filtered = useMemo(() => {
    const list = all.filter(p => (!search.saved || saved.includes(p.slug)) && (!search.location || p.neighborhood.toLowerCase() === search.location.toLowerCase()) && (!search.type || p.property_type === search.type) && (!search.status || p.listing_type === search.status) && (!search.price || p.price <= search.price) && (!search.bedrooms || p.bedrooms >= search.bedrooms) && (!search.q || `${p.title} ${p.neighborhood} ${p.description}`.toLowerCase().includes(search.q.toLowerCase())));
    if (search.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    if (search.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    if (search.sort === 'size') list.sort((a, b) => b.area_sqm - a.area_sqm);
    return list;
  }, [all, search, saved]);
  const update = (key: keyof typeof search, value: string | boolean | undefined) => navigate({ search: prev => ({ ...prev, [key]: value || undefined }), replace: true });
  const activeFilters = (Object.entries(search) as [keyof typeof search, unknown][]).filter(([k, v]) => k !== 'sort' && v);
  const clear = () => { setQuery(''); navigate({ search: {}, replace: true }); };
  const recentProps = recent.map(s => all.find(p => p.slug === s)).filter((p): p is Property => !!p).slice(0, 2);
  return <Site><section className="interior-hero page-gutter"><nav aria-label="Breadcrumb" className="breadcrumbs"><ol><li><Link to="/">Home</Link></li><li aria-current="page">Collection</li></ol></nav><p className="eyebrow">ENKOP / THE COLLECTION</p><h1>Find a place<br/><em>to belong.</em></h1><div className="interior-hero-bottom"><p>Homes for sale and rent across Nairobi’s established and emerging neighbourhoods.</p><span>{filtered.length.toString().padStart(2,'0')} RESIDENCES</span></div></section>
    <section className="listing-section page-gutter"><div className="filters"><form className="filter-search" onSubmit={e => { e.preventDefault(); update('q', query); }}><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search properties" placeholder="Search residences or locations"/><Button variant="iconPlain" aria-label="Search" type="submit"><ArrowRight size={18}/></Button></form><select aria-label="Location" value={search.location ?? ''} onChange={e => update('location', e.target.value)}><option value="">All locations</option>{locations.map(x => <option key={x}>{x}</option>)}</select><select aria-label="Property type" value={search.type ?? ''} onChange={e => update('type', e.target.value)}><option value="">All property types</option>{types.map(x => <option key={x}>{x}</option>)}</select><select aria-label="Listing status" value={search.status ?? ''} onChange={e => update('status', e.target.value)}><option value="">Sale & rent</option><option value="Sale">For sale</option><option value="Rent">To let</option></select><select aria-label="Maximum price" value={search.price ?? ''} onChange={e => update('price', e.target.value)}><option value="">Any price</option><option value="30000000">Up to KES 30M</option><option value="60000000">Up to KES 60M</option><option value="100000000">Up to KES 100M</option></select><select aria-label="Minimum bedrooms" value={search.bedrooms ?? ''} onChange={e => update('bedrooms', e.target.value)}><option value="">Any beds</option>{[2,3,4,5].map(n => <option value={n} key={n}>{n}+ beds</option>)}</select></div>
      <div className="result-heading"><span aria-live="polite">{filtered.length} {filtered.length === 1 ? 'RESIDENCE' : 'RESIDENCES'}</span><div className="result-tools"><button type="button" className={`chip ${search.saved ? 'chip--on' : ''}`} aria-pressed={!!search.saved} onClick={() => update('saved', !search.saved)}>Saved ({saved.length})</button><select aria-label="Sort by" value={search.sort ?? ''} onChange={e => update('sort', e.target.value)}><option value="">Curated order</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="size">Largest first</option></select></div></div>
      {activeFilters.length > 0 && <div className="active-filters">{activeFilters.map(([k, v]) => <button type="button" className="chip chip--on" key={k} onClick={() => { if (k === 'q') setQuery(''); update(k, undefined); }} aria-label={`Remove filter ${labels[k]}`}>{labels[k]}{k === 'saved' ? '' : `: ${k === 'price' ? `${Number(v) / 1e6}M` : String(v)}`} <X size={13}/></button>)}<Button variant="textArrow" onClick={clear}>Clear all <X size={15}/></Button></div>}
      {filtered.length ? <><h2 className="sr-only">Residences</h2><div className="listing-grid">{filtered.map(p => <PropertyCard key={p.id} property={p}/>)}</div></> : <div className="empty-results"><h2>Nothing matched<br/><em>your search.</em></h2><p>{search.saved ? 'Tap the heart on any residence to save it here.' : 'Try adjusting your location, property type or price range.'}</p><Button variant="primary" onClick={clear}>Clear filters <ArrowRight size={16}/></Button></div>}
    </section>
    {recentProps.length > 0 && <section className="recent-section page-gutter"><div className="result-heading"><span>CONTINUE EXPLORING</span><Button variant="textArrow" onClick={resetPersonal}>Reset saved & recent <X size={15}/></Button></div><div className="listing-grid">{recentProps.map(p => <PropertyCard key={p.id} property={p}/>)}</div></section>}
    <section className="simple-cta page-gutter"><div><h2>Something specific<br/><em>in mind?</em></h2><p className="simple-cta-note">Share your budget, preferred areas and timeline, and we will help you identify properties that fit.</p></div><Link className="inline-arrow" to="/contact" search={{ interest: 'Buying' }}>Tell us what you need <ArrowRight size={18}/></Link></section></Site>;
}
