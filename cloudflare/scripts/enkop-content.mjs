// Manage ENKOP content on the master from the command line.
//   node cloudflare/scripts/enkop-content.mjs list <table>
//   node cloudflare/scripts/enkop-content.mjs upload <file> <storage-path>
//   node cloudflare/scripts/enkop-content.mjs upsert <table> '<json row>'
//   node cloudflare/scripts/enkop-content.mjs update <table> <key> '<json patch>'
//   node cloudflare/scripts/enkop-content.mjs test-alert
// The internal key comes from ENKOP_INTERNAL_KEY or %LOCALAPPDATA%\enkop-sync\ENKOP_INTERNAL_KEY.txt.
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const MASTER = (process.env.ENKOP_MASTER_URL || 'https://enkoprealestate.com').replace(/\/$/, '');
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' };

function internalKey() {
  if (process.env.ENKOP_INTERNAL_KEY) return process.env.ENKOP_INTERNAL_KEY.trim();
  const file = join(process.env.LOCALAPPDATA ?? '', 'enkop-sync', 'ENKOP_INTERNAL_KEY.txt');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  throw new Error('Set ENKOP_INTERNAL_KEY or create %LOCALAPPDATA%\\enkop-sync\\ENKOP_INTERNAL_KEY.txt');
}

async function call(method, route, body, contentType = 'application/json') {
  const res = await fetch(`${MASTER}/api/public/${route}`, {
    method,
    headers: { 'x-enkop-internal-key': internalKey(), ...(body !== undefined ? { 'Content-Type': contentType } : {}) },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const [cmd, ...args] = process.argv.slice(2);
const enc = encodeURIComponent;
const commands = {
  list: ([table]) => call('GET', `enkop-content/list/${enc(table)}`),
  upload: ([file, path]) => {
    const type = TYPES[extname(file).toLowerCase()];
    if (!type) throw new Error(`Unsupported file type: ${extname(file)}`);
    return call('PUT', `enkop-content/media?path=${enc(path)}`, readFileSync(file), type);
  },
  upsert: ([table, json]) => call('POST', `enkop-content/upsert/${enc(table)}`, JSON.stringify(JSON.parse(json))),
  update: ([table, key, json]) => call('POST', `enkop-content/update/${enc(table)}/${enc(key)}`, JSON.stringify(JSON.parse(json))),
  'test-alert': () => call('POST', 'enkop-master/test-alert'),
};

if (!commands[cmd]) {
  console.error('Usage: enkop-content.mjs list|upload|upsert|update|test-alert ...');
  process.exit(1);
}
try {
  console.log(JSON.stringify(await commands[cmd](args), null, 2));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
