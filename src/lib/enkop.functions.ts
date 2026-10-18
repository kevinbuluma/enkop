import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const getProperties = createServerFn({ method: 'GET' }).handler(async () => {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data, error } = await supabase.from('properties').select('*').eq('status', 'published').order('featured', { ascending: false }).order('created_at', { ascending: true });
  if (error) throw new Error('The collection is temporarily unavailable. Please try again.');
  const rows = data ?? [];

  // Sign only admin-uploaded gallery photos and finished tour videos of published listings.
  const photoPaths = [...new Set(rows.flatMap((r) => r.image_paths ?? []))];
  const { data: tours } = await supabase.from('property_tours').select('property_id,video_path,created_at').eq('status', 'completed').not('video_path', 'is', null).order('created_at', { ascending: false });
  const tourByProperty = new Map<string, string>();
  for (const t of tours ?? []) if (t.video_path && !tourByProperty.has(t.property_id)) tourByProperty.set(t.property_id, t.video_path);
  const allPaths = [...photoPaths, ...tourByProperty.values()];
  let urls: Record<string, string> = {};
  if (allPaths.length) {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: signed } = await supabaseAdmin.storage.from('property-media').createSignedUrls(allPaths, 60 * 60 * 24);
    urls = Object.fromEntries((signed ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  }
  return rows.map((r) => ({
    ...r,
    photo_urls: (r.image_paths ?? []).map((p: string) => urls[p]).filter(Boolean),
    tour_url: tourByProperty.has(r.id) ? urls[tourByProperty.get(r.id)!] ?? null : null,
  }));
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
    await notifyOwner(data).catch(() => {});
    return { success: true };
  });

// WhatsApp notification to ENKOP when the WhatsApp connection is linked (WHATSAPP_API_KEY present).
async function notifyOwner(data: z.infer<typeof enquirySchema>) {
  const lovableKey = process.env['LOVABLE_API_KEY'];
  const whatsappKey = process.env['WHATSAPP_API_KEY'];
  const to = (process.env['ENKOP_NOTIFY_WHATSAPP'] ?? '').replace(/\D/g, '');
  if (!lovableKey || !whatsappKey || !to) return;
  const lines = [
    'New ENKOP enquiry',
    `Name: ${data.name}`,
    `Email: ${data.email}`,
    data.phone ? `Phone: ${data.phone}` : '',
    `Interest: ${data.interest}`,
    `Preferred contact: ${data.preferred_contact}`,
    `Message: ${data.message.slice(0, 500)}`,
  ].filter(Boolean).join('\n');
  const res = await fetch('https://connector-gateway.lovable.dev/whatsapp/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': whatsappKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: lines } }),
  });
  if (!res.ok) console.error(`WhatsApp notify failed [${res.status}]: ${await res.text()}`);
}