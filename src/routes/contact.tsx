import { createFileRoute } from '@tanstack/react-router';
import { Site } from '@/components/enkop/Site';
import { EnquiryForm } from '@/components/enkop/EnquiryForm';
import { contact, pageSeo } from '@/lib/enkop';

const seo = pageSeo('/contact');

export const Route = createFileRoute('/contact')({
  validateSearch: (search: Record<string, unknown>): { interest?: string } => (typeof search['interest'] === 'string' ? { interest: search['interest'] } : {}),
  head: () => ({ meta: [{ title: 'Contact ENKOP Real Estate | Nairobi Property Consultancy' }, { name: 'description', content: 'Speak to ENKOP Real Estate about buying, selling, renting or investing in property in Nairobi and across Kenya. Call +254 707 465 190 or send an enquiry.' }, { property: 'og:title', content: 'Contact ENKOP Real Estate' }, { property: 'og:description', content: 'Property enquiries, sales, rentals, investment opportunities and consultations in Nairobi.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }, seo.ogUrl], links: [seo.canonical] }),
  component: Contact,
});

function Contact() {
  const { interest } = Route.useSearch();
  return <Site>
    <section className="interior-hero page-gutter"><p className="eyebrow">ENKOP / CONTACT US</p><h1>Let's talk about<br/><em>your next move.</em></h1><div className="interior-hero-bottom"><p>Buying, selling, renting or investing, it starts with a conversation.</p><span>NAIROBI, KENYA</span></div></section>
    <section className="contact-content page-gutter">
      <div>
        <p className="eyebrow">SPEAK TO OUR TEAM</p>
        <h2>Tell us what<br/><em>you're looking for.</em></h2>
        <p>For property enquiries, sales, rentals, investment opportunities and consultations, share a few details and an ENKOP consultant will respond personally. Prefer to talk? Call or message us directly.</p>
        <div className="contact-details">
          <span>OFFICE</span><strong>{contact.location}</strong>
          <span>PHONE</span><strong><a href={`tel:${contact.phone.replaceAll(' ', '')}`}>{contact.phone}</a></strong>
          <span>WHATSAPP</span><strong><a href={`https://wa.me/${contact.whatsappDigits}`} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a></strong>
          <span>EMAIL</span><strong><a href={`mailto:${contact.email}`}>{contact.email}</a></strong>
          <span>SOCIAL</span><strong><a href={contact.instagram} target="_blank" rel="noopener noreferrer">Instagram</a> · <a href={contact.tiktok} target="_blank" rel="noopener noreferrer">TikTok</a></strong>
        </div>
      </div>
      <EnquiryForm interest={interest} />
    </section>
  </Site>;
}
