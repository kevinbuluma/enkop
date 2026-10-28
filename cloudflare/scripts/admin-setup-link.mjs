// Creates (or refreshes) an ENKOP master admin and a one-time password-setup link (valid 48 hours).
//
// Usage: node cloudflare/scripts/admin-setup-link.mjs <email> <sql-out> <link-out> [admin-id]
//        node master-db/scripts/sql.mjs <sql-out>
// Then open the link in <link-out> and choose a password. Keep the link private; it works once.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';

const [rawEmail, sqlOut, linkOut, id = randomUUID()] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
if (!email || !sqlOut || !linkOut) {
  console.error('usage: admin-setup-link.mjs <email> <sql-out> <link-out> [admin-id]');
  process.exit(1);
}
const master = (process.env.ENKOP_MASTER_URL || 'https://enkoprealestate.com').replace(/\/$/, '');
const token = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(token).digest('base64url');
const expires = new Date(Date.now() + 48 * 36e5).toISOString();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

appendFileSync(sqlOut, `INSERT INTO admins (id, email, role, setup_token_hash, setup_expires_at) VALUES (${q(id)}, ${q(email)}, 'admin', ${q(hash)}, ${q(expires)}) ON CONFLICT (email) DO UPDATE SET setup_token_hash = excluded.setup_token_hash, setup_expires_at = excluded.setup_expires_at;\n`);
writeFileSync(linkOut, `${master}/admin?setup=${token}\n`);
console.error(`setup link for ${email} written to ${linkOut} (expires ${expires})`);
