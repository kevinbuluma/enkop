import { z } from 'zod';
import { enquiryInterests } from '@/lib/enkop';

const PROPERTY_INTEREST = 'Property: ';

export const enquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40),
  message: z.string().trim().min(10).max(3000),
  property_id: z.string().uuid().nullable(),
  preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  preferred_contact: z.enum(['Email', 'Phone']),
  // A topic from the form, or the listing's title (up to 120 characters) on a property page.
  interest: z.string().max(140).refine((v) => (enquiryInterests as readonly string[]).includes(v) || v.startsWith(PROPERTY_INTEREST)),
  website: z.string().max(200),
});
export type Enquiry = z.infer<typeof enquirySchema>;

export const propertyInterest = (title: string) => `${PROPERTY_INTEREST}${title}`.slice(0, 140);

const PROBLEMS: Record<string, string> = {
  name: 'Please enter your full name.',
  email: 'Please enter a valid email address.',
  phone: 'Please enter a phone number of up to 40 characters.',
  message: 'Please write a message of at least 10 characters.',
  preferred_date: 'Please choose a valid viewing date.',
};

/** One plain-language message for the first invalid field, for visitors rather than developers. */
export function enquiryProblem(error: z.ZodError) {
  const field = String(error.issues[0]?.path[0] ?? '');
  return PROBLEMS[field] ?? 'Please check your details and try again.';
}

/** Storage paths the app signs: homepage scenes, listing photos, tour videos, team portraits. */
export function signablePath(p: string) {
  return p.length <= 300 && !p.includes('..') && (
    /^homepage\/[\w.-]+$/.test(p) ||
    /^[0-9a-f-]{36}\/photos\/[\w./-]+$/.test(p) ||
    /^[0-9a-f-]{36}\/gallery\/[\w./-]+$/.test(p) ||
    /^[0-9a-f-]{36}\/tours\/[0-9a-f-]{36}\.mp4$/.test(p) ||
    /^team\/[\w./-]+$/.test(p)
  );
}
