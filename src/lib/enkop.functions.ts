import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const getProperties = createServerFn({ method: 'GET' }).handler(async () => {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data, error } = await supabase.from('properties').select('*').eq('status', 'published').order('featured', { ascending: false }).order('created_at', { ascending: true });
  if (error) throw new Error('The collection is temporarily unavailable. Please try again.');
  return data;
});

const enquirySchema = z.object({
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

export const sendEnquiry = createServerFn({ method: 'POST' })
  .inputValidator((data) => enquirySchema.parse(data))
  .handler(async ({ data }) => {
    if (data.website) return { success: true };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('enquiries').insert({
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message,
      property_id: data.property_id,
      preferred_date: data.preferred_date || null,
      preferred_contact: data.preferred_contact,
      interest: data.interest,
    });
    if (error) throw new Error('Your enquiry could not be sent. Please try again.');
    return { success: true };
  });