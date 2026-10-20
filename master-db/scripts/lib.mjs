// Shared helpers for the master-db scripts. Secrets live in %LOCALAPPDATA%\enkop-sync\*.txt (outside the
// repo) and are never printed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SECRETS_DIR = join(process.env.LOCALAPPDATA ?? process.env.HOME ?? '.', 'enkop-sync');
export const API = 'https://api.supabase.com/v1';

export function readSecret(name, required = true) {
  if (process.env[name]) return process.env[name].trim();
  const file = join(SECRETS_DIR, `${name}.txt`);
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  if (required) throw new Error(`Missing ${name}: set it or create ${file}`);
  return null;
}

export function writeSecret(name, value) {
  writeFileSync(join(SECRETS_DIR, `${name}.txt`), value, { encoding: 'utf8' });
}

export async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${readSecret('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase API ${init.method ?? 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** Runs SQL on the ENKOP project through the Management API and returns the rows. */
export async function sql(query, ref = readSecret('SUPABASE_PROJECT_REF')) {
  return api(`/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
