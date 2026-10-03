import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { formatPrice, imagery, type Property } from '@/lib/enkop';

export function PropertyCard({ property, large = false }: { property: Property; large?: boolean }) {
  return <Link to="/properties/$slug" params={{ slug: property.slug }} className={`property-card ${large ? 'property-card--large' : ''}`}>
    <div className="property-visual"><img src={imagery[property.image_key] ?? imagery['residence-1']} alt={`${property.title}, ${property.neighborhood}`} loading="lazy" width="1400" height="1100"/><span className="property-tag">{property.listing_type === 'Sale' ? 'For sale' : 'To let'}</span><span className="property-arrow"><ArrowUpRight size={22}/></span></div>
    <div className="property-information"><div><p className="eyebrow">{property.neighborhood}, {property.city} · {property.property_type}</p><h3>{property.title}</h3><p className="property-spec">{property.bedrooms} Beds <span>·</span> {property.bathrooms} Baths <span>·</span> {property.area_sqm} m²</p></div><div className="property-price">{formatPrice(property)}{property.is_sample && <small>Illustrative listing</small>}</div></div>
  </Link>;
}