import type { Enquiry } from '@/lib/enquiry-schema';
import type { MasterEnv } from '@/server/runtime';
import { afterResponse } from '@/server/runtime';
import { MasterStore } from './master-store';
import { MediaStore, signMediaPaths } from './media';
import type { Backend } from './types';

export function enquiryRow(data: Enquiry) {
  return {
    name: data.name, email: data.email, phone: data.phone, message: data.message,
    property_id: data.property_id, preferred_date: data.preferred_date || null,
    preferred_contact: data.preferred_contact, interest: data.interest,
  };
}

export function enquiryAlertText(data: Enquiry) {
  return [
    'New ENKOP enquiry', `Name: ${data.name}`, `Email: ${data.email}`,
    data.phone ? `Phone: ${data.phone}` : '', `Interest: ${data.interest}`,
    `Preferred contact: ${data.preferred_contact}`, `Message: ${data.message.slice(0, 500)}`,
  ].filter(Boolean).join('\n');
}

export function d1Backend(env: MasterEnv): Backend & { store: MasterStore; media: MediaStore } {
  const store = new MasterStore(env.DB);
  const media = new MediaStore(env, store);
  return {
    mode: 'master',
    store,
    media,
    publishedProperties: () => store.all('properties', `status = 'published'`, [], 'ORDER BY featured DESC, created_at ASC'),
    async completedTours() {
      const rows = await store.all('property_tours', `status = 'completed' AND video_path IS NOT NULL`, [], 'ORDER BY created_at DESC');
      return rows.map((r) => ({ property_id: String(r['property_id']), video_path: String(r['video_path']), created_at: String(r['created_at']) }));
    },
    async activeSlides() {
      const rows = await store.all('homepage_slides', 'active = 1', [], 'ORDER BY position');
      return rows.map((r) => ({ id: String(r['id']), label: String(r['label'] ?? ''), video_path: (r['video_path'] as string | null) ?? null, image_path: (r['image_path'] as string | null) ?? null }));
    },
    activeTeam: () => store.all('team_members', 'active = 1', [], 'ORDER BY position'),
    approvedTestimonials: () => store.all('testimonials', 'approved = 1', [], 'ORDER BY position'),
    async setting(key) {
      return (await store.first('site_settings', 'key = ?', [key]))?.['value'] ?? null;
    },
    signMedia: (paths, expiresIn) => signMediaPaths(paths, expiresIn),
    async submitEnquiry(data) {
      const { statements } = store.upsertStatements('enquiries', enquiryRow(data));
      await store.run([...statements, store.outboxStatement('notify', { kind: 'enquiry', text: enquiryAlertText(data), replyTo: data.email })]);
      const { drainOutbox } = await import('@/server/sync');
      await afterResponse(() => drainOutbox(env));
    },
  };
}
