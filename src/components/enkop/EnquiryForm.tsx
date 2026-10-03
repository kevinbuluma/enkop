import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sendEnquiry } from '@/lib/enkop.functions';
import type { Property } from '@/lib/enkop';

export function EnquiryForm({ property }: { property?: Property }) {
  const [status, setStatus] = useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [errorText, setErrorText] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setStatus('sending');
    try {
      await sendEnquiry({ data: {
        name: String(values.get('name') || ''), email: String(values.get('email') || ''), phone: String(values.get('phone') || ''), message: String(values.get('message') || ''),
        property_id: property?.id ?? null, preferred_date: String(values.get('preferred_date') || '') || null,
        preferred_contact: String(values.get('preferred_contact') || 'Email') as 'Email' | 'Phone', interest: property ? `Property: ${property.title}` : String(values.get('interest') || 'General enquiry'),
        website: String(values.get('website') || ''),
      }});
      setStatus('sent'); form.reset();
    } catch (error) { setErrorText(error instanceof Error ? error.message : 'Please try again.'); setStatus('error'); }
  }
  if (status === 'sent') return <div className="form-success" role="status"><span className="eyebrow">ENQUIRY RECEIVED</span><h3>Thank you.<br/><em>We'll be in touch.</em></h3><p>An ENKOP representative will respond shortly.</p><Button variant="textArrow" onClick={() => setStatus('idle')}>Send another enquiry <ArrowRight size={16}/></Button></div>;
  return <form className="enquiry-form" onSubmit={submit}>
    <div className="form-row"><label>Full name<input name="name" autoComplete="name" placeholder="Your name" required minLength={2} maxLength={100}/></label><label>Email address<input type="email" name="email" autoComplete="email" placeholder="you@example.com" required/></label></div>
    <div className="form-row"><label>Phone number<input type="tel" name="phone" autoComplete="tel" placeholder="Your number"/></label>{property ? <label>Preferred viewing date<input type="date" name="preferred_date" min={new Date().toISOString().slice(0,10)}/></label> : <label>I'm interested in<select name="interest"><option>Buying</option><option>Selling</option><option>Renting</option><option>Property Management</option><option>Partnership</option><option>General enquiry</option></select></label>}</div>
    <label>Preferred contact method<select name="preferred_contact"><option>Email</option><option>Phone</option></select></label>
    <label>Message<textarea name="message" rows={4} minLength={10} maxLength={3000} required placeholder={property ? `I'd like to know more about ${property.title}...` : 'Tell us what you have in mind...'}/></label>
    <div className="trap-field" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
    {status === 'error' && <p role="alert" className="form-error">{errorText}</p>}
    <Button type="submit" variant="luxury" disabled={status === 'sending'}>{status === 'sending' ? 'Sending...' : 'Send enquiry'}<ArrowRight size={17}/></Button>
  </form>;
}