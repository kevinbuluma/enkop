import type { MasterEnv } from '@/server/runtime';
import { bridgeFetch } from '@/server/bridge-client';
import { MasterStore } from '@/server/backend/master-store';
import { MediaStore } from '@/server/backend/media';

// Pushes outbox rows to the Lovable mirror. Mirror changes are strictly ordered: if one fails, the
// rows after it wait (so a delete can never overtake the upsert before it). Alerts are independent.

type OutboxRow = { id: number; kind: string; table_name: string | null; payload: string; attempts: number };

const LEASE_MS = 2 * 60_000;
// One mirror drainer at a time: two would interleave deliveries and could replay an upsert after its delete.
const DRAINER_KEY = 'mirror-drainer';
const DRAINER_LEASE_MS = 5 * 60_000;
// A row the mirror can never accept would otherwise block every later change; it is set aside and reported.
const MAX_ATTEMPTS = 20;
const backoffMs = (attempts: number) => Math.min(60 * 60_000, 30_000 * 2 ** Math.min(attempts, 7));
const iso = (ms: number) => new Date(ms).toISOString();
const mediaRoute = (path: string) => `mirror/media/${path.split('/').map(encodeURIComponent).join('/')}`;

async function expectOk(res: Response) {
  if (!res.ok) throw new Error(`bridge ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

export async function deliver(env: MasterEnv, row: OutboxRow) {
  const payload = JSON.parse(row.payload);
  switch (row.kind) {
    case 'upsert':
      return expectOk(await bridgeFetch('mirror/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: row.table_name, rows: [payload] }) }));
    case 'delete':
      return expectOk(await bridgeFetch('mirror/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: row.table_name, keys: [payload] }) }));
    case 'media_put': {
      const file = await new MediaStore(env, new MasterStore(env.DB)).bytes(payload.path);
      if (!file) return; // deleted since; the matching media_delete follows
      return expectOk(await bridgeFetch(mediaRoute(payload.path), { method: 'PUT', headers: { 'Content-Type': file.contentType }, body: file.data }));
    }
    case 'media_delete':
      return expectOk(await bridgeFetch(mediaRoute(payload.path), { method: 'DELETE' }));
    case 'notify': {
      const { notify } = await import('@/server/notify');
      await notify(env, payload);
      return;
    }
    default:
      throw new Error(`unknown outbox kind ${row.kind}`);
  }
}

async function claim(env: MasterEnv, kinds: 'mirror' | 'notify', limit: number, nowMs: number): Promise<OutboxRow[]> {
  const kindFilter = kinds === 'notify' ? `kind = 'notify'` : `kind <> 'notify'`;
  if (kinds === 'mirror') {
    const head = await env.DB.prepare(`SELECT next_attempt_at FROM outbox WHERE done_at IS NULL AND ${kindFilter} ORDER BY id LIMIT 1`).first<{ next_attempt_at: string }>();
    if (!head || head.next_attempt_at > iso(nowMs)) return [];
  }
  // The outer lease check is re-evaluated after a concurrent claim commits, so no row is claimed twice.
  const { results } = await env.DB.prepare(
    `UPDATE outbox SET next_attempt_at = ? WHERE id IN (SELECT id FROM outbox WHERE done_at IS NULL AND ${kindFilter} AND next_attempt_at <= ? ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED)
       AND done_at IS NULL AND next_attempt_at <= ? RETURNING id, kind, table_name, payload, attempts`,
  ).bind(iso(nowMs + LEASE_MS), iso(nowMs), limit, iso(nowMs)).all<OutboxRow>();
  return results.sort((a, b) => a.id - b.id);
}

/** Takes or renews the mirror-drainer lease for `token`; false while another drainer holds it. */
async function holdDrainer(env: MasterEnv, token: string) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()
     WHERE split_part(meta.value, ':', 1) = ? OR split_part(meta.value, ':', 2)::bigint < ? RETURNING key`,
  ).bind(DRAINER_KEY, `${token}:${now + DRAINER_LEASE_MS}`, token, now).all();
  return results.length > 0;
}

async function releaseDrainer(env: MasterEnv, token: string) {
  await env.DB.prepare(`DELETE FROM meta WHERE key = ? AND split_part(value, ':', 1) = ?`).bind(DRAINER_KEY, token).run();
}

async function markDone(env: MasterEnv, id: number) {
  await env.DB.prepare(`UPDATE outbox SET done_at = ?, last_error = NULL WHERE id = ?`).bind(iso(Date.now()), id).run();
}

/** Schedules a retry, or after MAX_ATTEMPTS sets the row aside (done, with its error kept). Returns true when set aside. */
async function markFailed(env: MasterEnv, row: OutboxRow, error: unknown) {
  const attempts = row.attempts + 1;
  const message = String(error instanceof Error ? error.message : error).slice(0, 480);
  if (attempts >= MAX_ATTEMPTS) {
    console.error(`[enkop] outbox row ${row.id} (${row.kind}) set aside after ${attempts} attempts: ${message}`);
    await env.DB.prepare(`UPDATE outbox SET attempts = ?, last_error = ?, done_at = ? WHERE id = ?`).bind(attempts, `set aside: ${message}`, iso(Date.now()), row.id).run();
    return true;
  }
  await env.DB.prepare(`UPDATE outbox SET attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?`)
    .bind(attempts, message, iso(Date.now() + backoffMs(attempts)), row.id).run();
  return false;
}

export async function drainOutbox(env: MasterEnv, limit = 25) {
  const nowMs = Date.now();
  let sent = 0, failed = 0;

  const token = crypto.randomUUID();
  if (await holdDrainer(env, token)) {
    try {
      const mirror = await claim(env, 'mirror', limit, nowMs);
      const requeue = (rows: OutboxRow[]) => rows.length
        ? env.DB.prepare(`UPDATE outbox SET next_attempt_at = ? WHERE id IN (${rows.map(() => '?').join(',')})`).bind(iso(nowMs), ...rows.map((r) => r.id)).run()
        : null;
      for (let i = 0; i < mirror.length; i++) {
        const row = mirror[i]!;
        if (i > 0 && !(await holdDrainer(env, token))) { await requeue(mirror.slice(i)); break; }
        try {
          await deliver(env, row);
          await markDone(env, row.id);
          sent++;
        } catch (e) {
          failed++;
          if (await markFailed(env, row, e)) continue;
          await requeue(mirror.slice(i + 1));
          break;
        }
      }
    } finally {
      await releaseDrainer(env, token);
    }
  }

  for (const row of await claim(env, 'notify', 10, nowMs)) {
    try { await deliver(env, row); await markDone(env, row.id); sent++; }
    catch (e) { failed++; await markFailed(env, row, e); }
  }

  const pending = await env.DB.prepare(`SELECT count(*) AS n FROM outbox WHERE done_at IS NULL`).first<{ n: number }>();
  return { sent, failed, pending: pending?.n ?? 0 };
}

async function drainRounds(env: MasterEnv) {
  const rounds = [];
  // Up to four rounds so a backlog clears within one cron tick.
  for (let i = 0; i < 4; i++) {
    const r = await drainOutbox(env, 25);
    rounds.push(r);
    if (!r.sent || r.failed || !r.pending) break;
  }
  return rounds;
}

/**
 * Full two-way sync with the Lovable mirror: push queued changes first (so the mirror has the
 * master's deletes before anything is read back), then pull enquiries the mirror took while the
 * master was unavailable, then push the alerts that pull queued.
 */
export async function syncWithMirror(env: MasterEnv) {
  const rounds = await drainRounds(env);
  const { pullMirrorEnquiries } = await import('@/server/reconcile');
  const enquiries = await pullMirrorEnquiries(env).catch((e) => {
    console.error('[enkop] mirror enquiry pull failed', e);
    return { error: e instanceof Error ? e.message : String(e) };
  });
  if ('imported' in enquiries && enquiries.imported.length) rounds.push(...(await drainRounds(env)));
  return { enquiries, rounds };
}

export async function outboxStatus(env: MasterEnv) {
  const { results } = await env.DB.prepare(
    `SELECT kind, count(*) AS pending, max(attempts) AS max_attempts, min(created_at) AS oldest FROM outbox WHERE done_at IS NULL GROUP BY kind`,
  ).all<{ kind: string; pending: number; max_attempts: number; oldest: string }>();
  const last = await env.DB.prepare(`SELECT last_error FROM outbox WHERE done_at IS NULL AND last_error IS NOT NULL ORDER BY id LIMIT 1`).first<{ last_error: string }>();
  const aside = await env.DB.prepare(`SELECT count(*) AS n FROM outbox WHERE done_at IS NOT NULL AND last_error IS NOT NULL`).first<{ n: number }>();
  return { pending: results, lastError: last?.last_error ?? null, setAside: aside?.n ?? 0 };
}
