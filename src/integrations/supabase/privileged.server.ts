// Privileged operations that work on any host. On Lovable hosting the managed keys are
// present and calls go direct; elsewhere they go through the authenticated ENKOP bridge.
import type { Enquiry } from '@/lib/enquiry-schema';

const GATEWAY = 'https://ai.gateway.lovable.dev/v1';
const DEFAULT_BRIDGE = 'https://enkop-real-estate.lovable.app';
const BUCKET = 'property-media';

type Env = Record<string, string | undefined>;
export type Mode = 'direct' | 'bridge' | 'none';

export function privilegedMode(kind: 'db' | 'ai', env: Env = process.env): Mode {
  if (kind === 'db' ? env['SUPABASE_SERVICE_ROLE_KEY'] : env['LOVABLE_API_KEY']) return 'direct';
  return env['ENKOP_BRIDGE_SECRET'] ? 'bridge' : 'none';
}

function bridgeUrl(route: string, env: Env = process.env) {
  return `${(env['ENKOP_BRIDGE_URL'] || DEFAULT_BRIDGE).replace(/\/$/, '')}/api/public/enkop-bridge/${route}`;
}

function bridgeFetch(route: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('x-enkop-bridge-secret', process.env['ENKOP_BRIDGE_SECRET']!);
  return fetch(bridgeUrl(route), { ...init, headers });
}

/** Lovable-hosted only: sends a WhatsApp alert through Lovable's managed connection. */
export async function sendWhatsAppAlert(text: string) {
  const lovableKey = process.env['LOVABLE_API_KEY'];
  const whatsappKey = process.env['WHATSAPP_API_KEY'];
  const to = (process.env['ENKOP_NOTIFY_WHATSAPP'] || '254707465190').replace(/\D/g, '');
  if (!lovableKey || !whatsappKey || !to) throw new Error('WhatsApp is not connected.');
  const res = await fetch('https://connector-gateway.lovable.dev/whatsapp/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': whatsappKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  if (!res.ok) throw new Error(`WhatsApp notify failed [${res.status}]: ${await res.text()}`);
}

export function aiAvailable() { return privilegedMode('ai') !== 'none'; }

/** Signed URLs keyed by path; missing entries mean the path could not be signed. */
export async function signStoragePaths(paths: string[], expiresIn: number): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return {};
  const mode = privilegedMode('db');
  if (mode === 'none') throw new Error('Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY');
  if (mode === 'direct') {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrls(list, expiresIn);
    return Object.fromEntries((data ?? []).filter(d => d.signedUrl && d.path).map(d => [d.path!, d.signedUrl as string]));
  }
  const urls: Record<string, string> = {};
  for (let i = 0; i < list.length; i += 200) {
    const res = await bridgeFetch('sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: list.slice(i, i + 200), expiresIn }) });
    if (!res.ok) throw new Error(`Media signing failed (${res.status}).`);
    Object.assign(urls, ((await res.json()) as { urls: Record<string, string> }).urls);
  }
  return urls;
}

/** Stores the enquiry, then notifies ENKOP; a notification failure never fails the insert. */
export async function insertEnquiry(data: Enquiry): Promise<void> {
  const mode = privilegedMode('db');
  if (mode === 'none') throw new Error('Your enquiry could not be sent. Please try again.');
  if (mode === 'bridge') {
    const res = await bridgeFetch('enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Your enquiry could not be sent. Please try again.');
    return;
  }
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('enquiries').insert({
    name: data.name, email: data.email, phone: data.phone, message: data.message,
    property_id: data.property_id, preferred_date: data.preferred_date || null,
    preferred_contact: data.preferred_contact, interest: data.interest,
  });
  if (error) throw new Error('Your enquiry could not be sent. Please try again.');
  await notifyOwner(data).catch(() => {});
}

// WhatsApp notification to ENKOP when the WhatsApp connection is linked (WHATSAPP_API_KEY present).
async function notifyOwner(data: Enquiry) {
  const lovableKey = process.env['LOVABLE_API_KEY'];
  const whatsappKey = process.env['WHATSAPP_API_KEY'];
  const to = (process.env['ENKOP_NOTIFY_WHATSAPP'] || '254707465190').replace(/\D/g, '');
  if (!lovableKey || !whatsappKey || !to) return;
  const lines = [
    'New ENKOP enquiry', `Name: ${data.name}`, `Email: ${data.email}`,
    data.phone ? `Phone: ${data.phone}` : '', `Interest: ${data.interest}`,
    `Preferred contact: ${data.preferred_contact}`, `Message: ${data.message.slice(0, 500)}`,
  ].filter(Boolean).join('\n');
  const res = await fetch('https://connector-gateway.lovable.dev/whatsapp/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': whatsappKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: lines } }),
  });
  if (!res.ok) console.error(`WhatsApp notify failed [${res.status}]: ${await res.text()}`);
}

/** Fetch an AI Gateway path such as "/videos" (relative to /v1). Caller checks aiAvailable() first. */
export function aiGatewayFetch(path: string, init: RequestInit = {}) {
  const mode = privilegedMode('ai');
  if (mode === 'none') throw new Error('AI is not configured.');
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (mode === 'bridge') return bridgeFetch(`ai${clean}`, init);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${process.env['LOVABLE_API_KEY']}`);
  return fetch(`${GATEWAY}${clean}`, { ...init, headers });
}
