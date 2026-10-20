import type { Enquiry } from '@/lib/enquiry-schema';
import type { MasterEnv } from '@/server/runtime';
import { bridgeFetch } from '@/server/bridge-client';
import { MasterStore } from '@/server/backend/master-store';
import { enquiryAlertText } from '@/server/backend/d1';

// Enquiries are the one thing the Lovable site can write on its own: it stores a lead in Lovable
// Cloud whenever the master can't take it. This pulls those back into D1 and alerts ENKOP.

const CURSOR_KEY = 'meta:enquiry-pull-since';
const FIRST_LOOKBACK_MS = 30 * 24 * 60 * 60_000;
const toIso = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : v);

async function readCursor(env: MasterEnv) {
  const stream = env.MEDIA_KV ? await env.MEDIA_KV.get(CURSOR_KEY, 'stream') : null;
  const text = stream ? await new Response(stream).text() : '';
  return text || new Date(Date.now() - FIRST_LOOKBACK_MS).toISOString();
}

export async function pullMirrorEnquiries(env: MasterEnv) {
  const since = await readCursor(env);
  const res = await bridgeFetch('mirror/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since }) });
  if (!res.ok) throw new Error(`bridge ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const { rows } = (await res.json()) as { rows: Record<string, unknown>[] };

  const store = new MasterStore(env.DB);
  const imported: string[] = [];
  let cursor = since;
  for (const raw of rows) {
    const row: Record<string, unknown> = { ...raw, created_at: toIso(raw['created_at']), updated_at: toIso(raw['updated_at']) };
    let added = false;
    try {
      added = await store.importRow('enquiries', row);
    } catch (e) {
      // Usually a listing deleted on the master since; keep the lead without the link.
      try {
        added = await store.importRow('enquiries', { ...row, property_id: null });
      } catch {
        console.error(`[enkop] skipped mirror enquiry ${String(row['id'])}`, e);
      }
    }
    if (added) {
      imported.push(String(row['id']));
      const text = `${enquiryAlertText(row as unknown as Enquiry)}\n(Received by the Lovable fallback site)`;
      await store.run([store.outboxStatement('notify', { kind: 'enquiry', text, replyTo: row['email'] })]);
    }
    const created = row['created_at'];
    if (typeof created === 'string' && created > cursor) cursor = created;
  }
  if (env.MEDIA_KV && cursor !== since) await env.MEDIA_KV.put(CURSOR_KEY, cursor);
  return { checked: rows.length, imported };
}
