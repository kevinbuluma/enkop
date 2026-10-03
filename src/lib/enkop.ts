import hero from '@/assets/enkop-hero.jpg';
import residence1 from '@/assets/residence-1.jpg';
import residence2 from '@/assets/residence-2.jpg';
import residence3 from '@/assets/residence-3.jpg';

export const imagery: Record<string, string> = {
  'residence-1': residence1,
  'residence-2': residence2,
  'residence-3': residence3,
};
export { hero };

export type Property = {
  id: string;
  slug: string;
  title: string;
  neighborhood: string;
  city: string;
  property_type: string;
  listing_type: string;
  price: number;
  currency: string;
  bedrooms: number;
  bathrooms: number;
  area_sqm: number;
  parking: number;
  description: string;
  amenities: string[];
  image_key: string;
  is_sample: boolean;
  featured: boolean;
};

export function formatPrice(property: Property) {
  return `${property.currency} ${new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 }).format(property.price)}${property.listing_type === 'Rent' ? ' / month' : ''}`;
}

export const navigation = [
  { label: 'Properties', to: '/properties' },
  { label: 'About', to: '/about' },
  { label: 'Services', to: '/services' },
  { label: 'Perspective', to: '/insights' },
  { label: 'Contact', to: '/contact' },
] as const;