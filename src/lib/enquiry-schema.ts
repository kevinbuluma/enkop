import { z } from 'zod';

export const enquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40),
  message: z.string().trim().min(10).max(3000),
  property_id: z.string().uuid().nullable(),
  preferred_date: z.string().nullable(),
  preferred_contact: z.enum(['Email', 'Phone']),
  interest: z.string().max(80),
  website: z.string().max(200),
});
export type Enquiry = z.infer<typeof enquirySchema>;

/** Storage paths the app signs: homepage scenes, listing photos, tour videos, team portraits. */
export function signablePath(p: string) {
  return p.length <= 300 && !p.includes('..') && (
    /^homepage\/[\w.-]+$/.test(p) ||
    /^[0-9a-f-]{36}\/photos\/[\w./-]+$/.test(p) ||
    /^[0-9a-f-]{36}\/tours\/[0-9a-f-]{36}\.mp4$/.test(p) ||
    /^team\/[\w./-]+$/.test(p)
  );
}
