// Cloudflare bindings for the master backend. The master's database is your Supabase Postgres,
// reached through the HYPERDRIVE binding. On Lovable hosting and in `vite dev` there are no ENKOP
// bindings, so everything here resolves to null and the app runs in mirror mode.

export interface D1Result<T = Record<string, unknown>> { results: T[]; meta?: { changes?: number } }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}
export interface KVNamespace {
  get(key: string, type: 'stream'): Promise<ReadableStream | null>;
  getWithMetadata<M>(key: string, type: 'stream'): Promise<{ value: ReadableStream | null; metadata: M | null }>;
  put(key: string, value: ArrayBuffer | ReadableStream | string, options?: { metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
}
export interface SendEmail { send(message: { from: string | { email: string; name?: string }; to: string | string[]; subject: string; text: string; html?: string; replyTo?: string }): Promise<unknown> }

export interface MasterEnv {
  /** The master Postgres (built from HYPERDRIVE). */
  DB: D1Database;
  HYPERDRIVE?: { connectionString: string };
  /** Legacy Cloudflare KV media, kept only so it can be copied into Supabase Storage. */
  MEDIA_KV?: KVNamespace;
  EMAIL?: SendEmail;
  [key: string]: unknown;
}

type WorkersModule = { env?: Record<string, unknown>; waitUntil?: (p: Promise<unknown>) => void };
let mod: WorkersModule | null | undefined;

async function workers(): Promise<WorkersModule | null> {
  if (mod !== undefined) return mod;
  try {
    // A computed specifier keeps the bundler from resolving this Workers-only built-in.
    const spec = ['cloudflare', 'workers'].join(':');
    mod = (await import(/* @vite-ignore */ spec)) as WorkersModule;
  } catch {
    mod = null;
  }
  return mod;
}

let master: MasterEnv | null | undefined;

/** The master's bindings, or null when running as the Lovable mirror. */
export async function masterEnv(): Promise<MasterEnv | null> {
  if (master !== undefined) return master;
  const env = (await workers())?.env;
  const hyperdrive = env?.['HYPERDRIVE'] as { connectionString?: string } | undefined;
  if (!hyperdrive?.connectionString) return (master = null);
  const { hyperdriveDatabase } = await import('@/server/backend/pg');
  return (master = Object.assign(Object.create(env as object), { DB: hyperdriveDatabase(hyperdrive.connectionString) }) as MasterEnv);
}

export async function isMaster() {
  return (await masterEnv()) !== null;
}

/** Runs `task` after the response is sent when the runtime allows it; otherwise awaits it. */
export async function afterResponse(task: () => Promise<unknown>) {
  const m = await workers();
  const p = task().catch((e) => console.error('[enkop] background task failed', e));
  if (m?.waitUntil) m.waitUntil(p); else await p;
}

export function envString(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length ? v : undefined;
}
