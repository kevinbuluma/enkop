import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

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

async function requireAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
  if (!isAdmin) throw new Error('Administrator access required.');
}

export const getEnquiries = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { data, error } = await supabase
      .from('enquiries')
      .select('id, property_id, name, email, phone, message, preferred_date, preferred_contact, interest, status, created_at, properties(title)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      property_id: row.property_id,
      property_title: row.properties?.title ?? null,
      name: row.name,
      email: row.email,
      phone: row.phone,
      message: row.message,
      preferred_date: row.preferred_date,
      preferred_contact: row.preferred_contact,
      interest: row.interest,
      status: row.status,
      created_at: row.created_at,
    })) as EnquiryRow[];
  });

export const updateEnquiryStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: 'new' | 'contacted' | 'closed' }) => {
    if (!input?.id || !['new', 'contacted', 'closed'].includes(input.status)) throw new Error('Invalid enquiry update.');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { error } = await supabase.from('enquiries').update({ status: data.status }).eq('id', data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
