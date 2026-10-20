// Rotates the master database password and updates the saved pooler URL. Afterwards update the
// Hyperdrive config: npx wrangler hyperdrive update <id> --origin-password <new> (provision.mjs does it).
//   node master-db/scripts/rotate-password.mjs
import { randomBytes } from 'node:crypto';
import { api, readSecret, writeSecret } from './lib.mjs';

const password = randomBytes(24).toString('base64url');
await api(`/projects/${readSecret('SUPABASE_PROJECT_REF')}/database/password`, { method: 'PATCH', body: JSON.stringify({ password }) });
writeSecret('SUPABASE_DB_PASSWORD', password);
const url = new URL(readSecret('SUPABASE_DB_URL'));
url.password = password;
writeSecret('SUPABASE_DB_URL', url.toString());
console.log('database password rotated; saved pooler URL updated');
