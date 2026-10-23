import type { D1Database } from '@/server/runtime';

// ENKOP's own admin sign-in for the master: PBKDF2-SHA256 password hashes, opaque session tokens
// (only their SHA-256 hash is stored) and one-time password-setup links.

export const SESSION_COOKIE = 'enkop_admin';
export const SESSION_DAYS = 30;
export const PBKDF2_ITERATIONS = 60000;
const SETUP_HOURS = 48;
const enc = new TextEncoder();

function b64url(bytes: Uint8Array | ArrayBuffer) {
  let s = '';
  for (const b of bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(value: string) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}

export async function hashPassword(password: string, salt = randomToken(16), iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations }, key, 256);
  return { hash: b64url(bits), salt, iterations };
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const passwordProblem = (p: string) =>
  p.length < 10 ? 'Use at least 10 characters.' : p.length > 200 ? 'Use at most 200 characters.' : null;

export type Admin = { id: string; email: string; role: string };

type AdminRow = Admin & { password_hash: string | null; password_salt: string | null; password_iterations: number | null };

const normalEmail = (email: string) => email.trim().toLowerCase();

export async function verifyLogin(db: D1Database, email: string, password: string): Promise<Admin | null> {
  const row = await db.prepare('SELECT id, email, role, password_hash, password_salt, password_iterations FROM admins WHERE email = ?').bind(normalEmail(email)).first<AdminRow>();
  // Hash anyway so unknown emails take as long as wrong passwords.
  const { hash } = await hashPassword(password, row?.password_salt ?? 'enkop-no-user', row?.password_iterations ?? PBKDF2_ITERATIONS);
  if (!row?.password_hash || !timingSafeEqual(hash, row.password_hash)) return null;
  return { id: row.id, email: row.email, role: row.role };
}

export async function createSession(db: D1Database, adminId: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), adminId, expires).run();
  return { token, expires };
}

export async function sessionAdmin(db: D1Database, token: string | null): Promise<Admin | null> {
  if (!token) return null;
  return db.prepare(`SELECT a.id, a.email, a.role FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ? AND s.expires_at > ? AND a.role = 'admin'`)
    .bind(await sha256(token), new Date().toISOString()).first<Admin>();
}

export async function endSession(db: D1Database, token: string | null) {
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
}

/** Issues a one-time setup link token for an admin (creating the admin if needed). */
export async function issueSetupToken(db: D1Database, email: string, id: string = crypto.randomUUID()) {
  const token = randomToken();
  const expires = new Date(Date.now() + SETUP_HOURS * 36e5).toISOString();
  await db.prepare(`INSERT INTO admins (id, email, setup_token_hash, setup_expires_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (email) DO UPDATE SET setup_token_hash = excluded.setup_token_hash, setup_expires_at = excluded.setup_expires_at`)
    .bind(id, normalEmail(email), await sha256(token), expires).run();
  return token;
}

export async function completeSetup(db: D1Database, token: string, password: string): Promise<Admin | null> {
  const { hash, salt, iterations } = await hashPassword(password);
  // Checking and consuming the token in one statement means a link can only ever be used once.
  const row = await db.prepare(`UPDATE admins SET password_hash = ?, password_salt = ?, password_iterations = ?, setup_token_hash = NULL, setup_expires_at = NULL
    WHERE setup_token_hash = ? AND setup_expires_at > ? RETURNING id, email, role`)
    .bind(hash, salt, iterations, await sha256(token), new Date().toISOString()).first<Admin>();
  if (!row) return null;
  await db.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(row.id).run();
  return row;
}

export function readCookie(header: string | null, name: string) {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k !== name) continue;
    try { return decodeURIComponent(v.join('=')); } catch { return null; }
  }
  return null;
}

export function sessionCookie(token: string, expires: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${new Date(expires).toUTCString()}`;
}

export const clearedSessionCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** Rejects cross-site browser requests to cookie-authenticated endpoints. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') !== 'cross-site';
  return origin === new URL(request.url).origin;
}
