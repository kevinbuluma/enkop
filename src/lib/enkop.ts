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
  image_paths: string[];
  photo_urls?: string[];
  tour_url?: string | null;
  is_sample: boolean;
  external_links?: Record<string, string> | null;
  map_query?: string | null;
  featured: boolean;
};

export function formatPrice(property: Property) {
  return `${property.currency} ${new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 }).format(property.price)}${property.listing_type === 'Rent' ? ' / month' : ''}`;
}

// The master site is the one search engines and share cards should point at; mirror hosts serve the same pages.
export const SITE_URL = 'https://enkoprealestate.com';
export const siteUrl = (path = '/') => new URL(path, SITE_URL).href;
export const pageSeo = (path: string) => ({ ogUrl: { property: 'og:url', content: siteUrl(path) }, canonical: { rel: 'canonical', href: siteUrl(path) } });

export const contact = {
  phone: '+254 707 465 190',
  whatsappDigits: '254707465190',
  email: 'enkoprealestateke@gmail.com',
  instagram: 'https://www.instagram.com/enkop_realestate',
  tiktok: 'https://www.tiktok.com/@enkoprealestste',
  location: 'Nairobi, Kenya',
} as const;

// Company positioning, from the ENKOP Real Estate company profile.
export const company = {
  summary: 'ENKOP Real Estate is a Nairobi-based real estate consultancy connecting individuals, families and investors with residential properties across Kenya’s established and emerging neighbourhoods.',
  approach: 'Our approach is built on integrity, transparency and service, making the property journey clearer and more convenient, from identifying the right property to settling into a new home.',
  philosophy: 'We do not just help people find houses. We help them find places they can confidently call home.',
  vision: 'To become Africa’s most trusted and innovative real estate brand, transforming property ownership and investment into a seamless and rewarding experience.',
  mission: 'To empower clients to make informed property decisions through honest advice, personalised guidance, market knowledge and exceptional service.',
  promise: 'One client, one home, one investment at a time.',
} as const;

export const services = [
  {
    id: 'sales',
    title: 'Property sales & marketing',
    summary: 'We connect property owners with prospective buyers through property promotion, active client engagement and dedicated sales support.',
    audience: 'For owners ready to sell',
    interest: 'Selling',
  },
  {
    id: 'off-plan',
    title: 'Off-plan property investment',
    summary: 'We help you explore off-plan developments and weigh the opportunities that fit your investment objectives, timelines and budget.',
    audience: 'For investors planning ahead',
    interest: 'Off-plan investment',
  },
  {
    id: 'consultancy',
    title: 'Real estate consultancy',
    summary: 'Property-related guidance to help you evaluate your options and make informed decisions before you commit.',
    audience: 'For buyers and investors weighing options',
    interest: 'Consultancy',
  },
  {
    id: 'leasing',
    title: 'Leasing & rentals',
    summary: 'We help individuals, families and businesses find rental properties that match their preferences, needs and budgets.',
    audience: 'For tenants and growing businesses',
    interest: 'Renting / Leasing',
  },
] as const;

export const values = [
  ['Integrity', 'Honesty and ethical conduct in every client interaction and transaction.'],
  ['Excellence', 'High professional standards and quality service, consistently delivered.'],
  ['Transparency', 'Clear communication and openness at every stage of the property journey.'],
  ['Commitment', 'Focused on your needs and your property goals, from first call to handover.'],
  ['Innovation', 'Practical ways to make searching for and owning property simpler.'],
  ['Service', 'Clients at the centre of our work, with support tailored to each one.'],
] as const;

export const reasons = [
  ['Personalised guidance', 'We take time to understand your preferences, budget and objectives, then focus only on properties that suit them.'],
  ['Market knowledge', 'Local understanding of Nairobi’s established and emerging neighbourhoods, for homes and investments alike.'],
  ['Transparent communication', 'Clear information, processes and next steps, so every decision is made with confidence.'],
  ['Negotiation support', 'Support through property discussions and negotiations, bringing clarity and confidence to every stage of the transaction.'],
  ['Trust & accountability', 'Professional conduct, reliability and relationships built to last well beyond a single deal.'],
  ['Support beyond the search', 'We guide you through the process and help coordinate household moving arrangements.'],
] as const;

export const enquiryInterests = ['Buying', 'Selling', 'Renting / Leasing', 'Off-plan investment', 'Consultancy', 'General enquiry'] as const;

export const navigation = [
  { label: 'Properties', to: '/properties' },
  { label: 'About', to: '/about' },
  { label: 'Services', to: '/services' },
  { label: 'Perspective', to: '/insights' },
  { label: 'Contact', to: '/contact' },
] as const;