// Creates and configures the ENKOP master Supabase project. Safe to re-run: each step checks first.
//   node master-db/scripts/provision.mjs
// Needs SUPABASE_ACCESS_TOKEN (%LOCALAPPDATA%\enkop-sync\SUPABASE_ACCESS_TOKEN.txt). Writes the project
// ref, database password, service key, pooler URL and Hyperdrive id next to it; prints no secrets.
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { api, readSecret, sleep, sql, writeSecret } from './lib.mjs';

const NAME = process.env.ENKOP_SUPABASE_PROJECT || 'enkop';
const REGION = process.env.ENKOP_SUPABASE_REGION || 'eu-west-2';
const MASTER = 'https://enkop.kevinbuluma9-7ff.workers.dev';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const step = (msg) => console.log(`- ${msg}`);

async function project() {
  const existing = (await api('/projects')).find((p) => p.name === NAME);
  if (existing) { step(`project ${NAME} exists (${existing.ref}, ${existing.region})`); return existing; }
  const [org] = await api('/organizations');
  if (!org) throw new Error('No Supabase organization on this account.');
  const password = readSecret('SUPABASE_DB_PASSWORD', false) ?? randomBytes(24).toString('base64url');
  writeSecret('SUPABASE_DB_PASSWORD', password);
  step(`creating project ${NAME} in ${REGION} (organization ${org.name})`);
  return api('/projects', { method: 'POST', body: JSON.stringify({ name: NAME, organization_id: org.id, region: REGION, db_pass: password }) });
}

async function waitHealthy(ref) {
  for (let i = 0; i < 90; i++) {
    const { status } = await api(`/projects/${ref}`);
    if (status === 'ACTIVE_HEALTHY') return step('project is healthy');
    if (i % 6 === 0) step(`waiting for project (${status})`);
    await sleep(10_000);
  }
  throw new Error('Project did not become healthy within 15 minutes.');
}

async function serviceKey(ref) {
  const keys = await api(`/projects/${ref}/api-keys?reveal=true`);
  const key = keys.find((k) => k.name === 'service_role' && k.api_key)?.api_key ?? keys.find((k) => k.type === 'secret' && k.api_key)?.api_key;
  if (!key) throw new Error('No service key returned by the Management API.');
  writeSecret('SUPABASE_SERVICE_KEY', key);
  step('service key saved');
  return key;
}

async function migrate() {
  const [{ exists }] = await sql(`select to_regclass('public.outbox') is not null as exists`);
  if (exists) return step('schema already applied');
  const dir = `${ROOT}master-db/migrations`;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    await sql(readFileSync(`${dir}/${f}`, 'utf8'));
    step(`applied ${f}`);
  }
}

async function bucket(url, key) {
  const auth = key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'property-media', name: 'property-media', public: false, file_size_limit: 50 * 1024 * 1024, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'] }),
  });
  const text = await res.text();
  if (res.ok) return step('bucket property-media created');
  if (/already exists|Duplicate/i.test(text)) return step('bucket property-media exists');
  throw new Error(`Bucket creation failed (${res.status}): ${text.slice(0, 200)}`);
}

async function cron() {
  await sql(`create extension if not exists pg_cron; create extension if not exists pg_net;`);
  const [{ n }] = await sql(`select count(*)::int as n from cron.job where jobname = 'enkop-master-drain'`);
  if (n) return step('cron job enkop-master-drain exists');
  await sql(`select cron.schedule('enkop-master-drain', '*/5 * * * *', $job$
    select net.http_post(url := '${MASTER}/api/public/enkop-master/drain', body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb)
  $job$)`);
  step('cron job enkop-master-drain scheduled (every 5 minutes)');
}

async function poolerUrl(ref) {
  const configs = await api(`/projects/${ref}/config/database/pooler`);
  const primary = configs.find((c) => c.database_type === 'PRIMARY') ?? configs[0];
  if (!primary?.db_host) throw new Error('No pooler configuration returned.');
  // Session mode (port 5432) keeps prepared statements working behind Hyperdrive.
  const password = encodeURIComponent(readSecret('SUPABASE_DB_PASSWORD'));
  const url = `postgres://${primary.db_user}:${password}@${primary.db_host}:5432/${primary.db_name ?? 'postgres'}`;
  writeSecret('SUPABASE_DB_URL', url);
  step(`pooler URL saved (${primary.db_host}, session mode)`);
  return url;
}

/** Runs wrangler with arguments that contain secrets; failures are reported without the command line. */
function wranglerSecretArgs(args, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      return execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', ...args], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      const detail = String(e?.stderr ?? '').split('\n').find((l) => /ERROR|error/.test(l))?.replace(/postgres(ql)?:\/\/\S+/g, '<connection string>') ?? 'unknown error';
      if (i >= attempts) throw new Error(`wrangler ${args[0]} ${args[1]} failed: ${detail}`);
      step(`wrangler ${args[0]} ${args[1]} failed (${detail.trim()}); retrying`);
      execFileSync(process.platform === 'win32' ? 'timeout' : 'sleep', process.platform === 'win32' ? ['/t', '15', '/nobreak'] : ['15'], { stdio: 'ignore', shell: process.platform === 'win32' });
    }
  }
}

function hyperdrive(url) {
  if (readSecret('HYPERDRIVE_ID', false)) return step(`Hyperdrive config exists (${readSecret('HYPERDRIVE_ID')})`);
  const out = wranglerSecretArgs(['hyperdrive', 'create', 'enkop-supabase', `--connection-string=${url}`]);
  const id = /"id":\s*"([0-9a-f]{32})"/.exec(out)?.[1] ?? /\b([0-9a-f]{32})\b/.exec(out)?.[1];
  if (!id) throw new Error('Could not read the Hyperdrive id from wrangler output.');
  writeSecret('HYPERDRIVE_ID', id);
  step(`Hyperdrive config enkop-supabase created (${id})`);
}

const p = await project();
writeSecret('SUPABASE_PROJECT_REF', p.ref ?? p.id);
const ref = readSecret('SUPABASE_PROJECT_REF');
await waitHealthy(ref);
const url = `https://${ref}.supabase.co`;
writeSecret('SUPABASE_URL', url);
const key = await serviceKey(ref);
await migrate();
await bucket(url, key);
await cron();
hyperdrive(await poolerUrl(ref));
console.log(`done: ${url}`);
