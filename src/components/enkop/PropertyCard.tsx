import { useRef, type MouseEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { formatPrice, imagery, type Property } from '@/lib/enkop';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export function PropertyCard({ property, large = false }: { property: Property; large?: boolean }) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const reduced = useReducedMotion();

  const onMove = (e: MouseEvent<HTMLAnchorElement>) => {
    if (reduced) return;
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${(x * 6).toFixed(2)}deg`);
    el.style.setProperty('--tilt-glow-x', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--tilt-glow-y', `${(y + 0.5) * 100}%`);
  };

  const onLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
  };

  return (
    <Link
      ref={cardRef}
      to="/properties/$slug"
      params={{ slug: property.slug }}
      className={['property-card', large && 'property-card--large', !reduced && 'property-card--tilt'].filter(Boolean).join(' ')}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="property-visual">
        <img
          src={imagery[property.image_key] ?? imagery['residence-1']}
          alt={`${property.title}, ${property.neighborhood}`}
          loading="lazy"
          width="1400"
          height="1100"
        />
        <span className="property-tag">{property.listing_type === 'Sale' ? 'For sale' : 'To let'}</span>
        <span className="property-arrow"><ArrowUpRight size={22} /></span>
      </div>
      <div className="property-information">
        <div>
          <p className="eyebrow">{property.neighborhood}, {property.city} · {property.property_type}</p>
          <h3>{property.title}</h3>
          <p className="property-spec">
            {property.bedrooms} Beds <span>·</span> {property.bathrooms} Baths <span>·</span> {property.area_sqm} m²
          </p>
        </div>
        <div className="property-price">
          {formatPrice(property)}
          {property.is_sample && <small>Illustrative listing</small>}
        </div>
      </div>
    </Link>
  );
}
