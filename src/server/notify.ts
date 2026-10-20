import type { MasterEnv } from '@/server/runtime';
import { envString } from '@/server/runtime';
import { bridgeFetch } from '@/server/bridge-client';

export type Alert = { kind: string; text: string; replyTo?: string };

// Sends an ENKOP alert on every configured channel; succeeds if at least one delivered it.
// Order of preference: email (Cloudflare Email Sending), Meta WhatsApp Cloud API, then
// Lovable's WhatsApp connection through the bridge.
export async function notify(env: MasterEnv, alert: Alert): Promise<string[]> {
  const delivered: string[] = [];
  const errors: string[] = [];

  const from = envString('ENKOP_ALERT_FROM');
  const to = envString('ENKOP_ALERT_TO');
  if (env.EMAIL && from && to) {
    try {
      await env.EMAIL.send({ from: { email: from, name: 'ENKOP website' }, to: to.split(',').map((s) => s.trim()), subject: alert.text.split('\n')[0] ?? 'ENKOP alert', text: alert.text, ...(alert.replyTo ? { replyTo: alert.replyTo } : {}) });
      delivered.push('email');
    } catch (e) { errors.push(`email: ${e instanceof Error ? e.message : e}`); }
  }

  const waTo = (envString('ENKOP_NOTIFY_WHATSAPP') ?? '').replace(/\D/g, '');
  const metaToken = envString('META_WA_TOKEN');
  const metaPhone = envString('META_WA_PHONE_ID');
  if (metaToken && metaPhone && waTo) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${metaPhone}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${metaToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: waTo, type: 'text', text: { body: alert.text } }),
    }).catch((e) => e as Error);
    if (res instanceof Response && res.ok) delivered.push('whatsapp');
    else errors.push(`whatsapp: ${res instanceof Response ? res.status : res.message}`);
  }

  if (!delivered.includes('whatsapp')) {
    const res = await bridgeFetch('notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(alert) }).catch((e) => e as Error);
    if (res instanceof Response && res.ok) delivered.push('lovable-whatsapp');
    else errors.push(`bridge: ${res instanceof Response ? res.status : res.message}`);
  }

  if (!delivered.length) throw new Error(errors.join('; ') || 'No alert channel is configured.');
  return delivered;
}
