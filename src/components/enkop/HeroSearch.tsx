import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Property } from '@/lib/enkop';

export function HeroSearch({ properties }: { properties: Property[] }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ location: '', type: '', status: '', price: '', bedrooms: '' });
  const locations = [...new Set(properties.map(p => p.neighborhood))].sort();
  const types = [...new Set(properties.map(p => p.property_type))].sort();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return <form className="hero-search" role="search" aria-label="Search properties" onSubmit={e => { e.preventDefault(); navigate({ to: '/properties', search: { location: f.location || undefined, type: f.type || undefined, status: f.status || undefined, price: f.price ? Number(f.price) : undefined, bedrooms: f.bedrooms ? Number(f.bedrooms) : undefined } }); }}>
    <label><span>Location</span><select value={f.location} onChange={set('location')}><option value="">Anywhere</option>{locations.map(l => <option key={l}>{l}</option>)}</select></label>
    <label><span>Type</span><select value={f.type} onChange={set('type')}><option value="">Any type</option>{types.map(t => <option key={t}>{t}</option>)}</select></label>
    <label><span>Buy / Rent</span><select value={f.status} onChange={set('status')}><option value="">Both</option><option value="Sale">Buy</option><option value="Rent">Rent</option></select></label>
    <label><span>Budget</span><select value={f.price} onChange={set('price')}><option value="">Any</option><option value="30000000">To KES 30M</option><option value="60000000">To KES 60M</option><option value="100000000">To KES 100M</option></select></label>
    <label><span>Beds</span><select value={f.bedrooms} onChange={set('bedrooms')}><option value="">Any</option>{[2,3,4,5].map(n => <option key={n} value={n}>{n}+</option>)}</select></label>
    <Button type="submit" variant="primary"><Search size={17}/> Search</Button>
  </form>;
}
