import { createServerFn } from '@tanstack/react-start';
import { requireAdmin } from '@/lib/require-admin';

export type EnquiryRow = {
  id: string;
  property_id: string | null;
  property_title: string | null;
  name: string;
  email: string;
  phone: string;
  message: string;
  preferred_date: string | null;
  preferred_contact: string;
  interest: string;
  status: string;
  created_at: string;
};

export const getEnquiries = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { results } = await context.master.env.DB.prepare(
      `SELECT e.id, e.property_id, p.title AS property_title, e.name, e.email, e.phone, e.message, e.preferred_date, e.preferred_contact, e.interest, e.status, e.created_at
       FROM enquiries e LEFT JOIN properties p ON p.id = e.property_id ORDER BY e.created_at DESC LIMIT 200`,
    ).all<EnquiryRow>();
    return results;
  });

export const updateEnquiryStatus = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .inputValidator((input: { id: string; status: 'new' | 'contacted' | 'closed' }) => {
    if (!input?.id || !['new', 'contacted', 'closed'].includes(input.status)) throw new Error('Invalid enquiry update.');
    return input;
  })
  .handler(async ({ data, context }) => {
    await context.master.store.update('enquiries', data.id, { status: data.status });
    await context.master.afterWrite();
    return { ok: true };
  });
