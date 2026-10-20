// In-memory stand-in for Cloudflare D1, backed by Node's built-in SQLite (node:sqlite).
// Tests that need it use `describe.skipIf(!hasSqlite)` so runtimes without node:sqlite skip them.
import { createRequire } from 'node:module';

type Stmt = { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown; run(...p: unknown[]): { changes: number | bigint } };
type Db = { exec(sql: string): void; prepare(sql: string): Stmt };

let DatabaseSync: (new (path: string) => Db) | null = null;
try {
  DatabaseSync = (createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Db }).DatabaseSync;
} catch {
  DatabaseSync = null;
}
export const hasSqlite = DatabaseSync !== null;

const bindable = (v: unknown) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

class FakeStatement {
  private params: unknown[] = [];
  constructor(private db: Db, readonly sql: string) {}
  bind(...values: unknown[]) {
    const s = new FakeStatement(this.db, this.sql);
    s.params = values.map(bindable);
    return s;
  }
  async all<T>() { return { results: this.db.prepare(this.sql).all(...this.params) as T[] }; }
  async first<T>() { return ((this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null); }
  async run() { const r = this.db.prepare(this.sql).run(...this.params); return { results: [], meta: { changes: Number(r.changes) } }; }
  /** Synchronous run used inside batches. */
  runSync() { return this.db.prepare(this.sql).run(...this.params); }
}

export class FakeD1 {
  private db: Db;
  constructor() {
    if (!DatabaseSync) throw new Error('node:sqlite is not available in this runtime');
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON');
  }
  async exec(sql: string) { this.db.exec(sql); }
  prepare(sql: string) { return new FakeStatement(this.db, sql); }
  async batch(statements: FakeStatement[]) {
    this.db.exec('BEGIN');
    try {
      const out = statements.map((s) => { s.runSync(); return { results: [] }; });
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** A FakeD1 with the master schema from cloudflare/migrations applied. */
export async function masterDb() {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const db = new FakeD1();
  await db.exec(readFileSync(resolve(process.cwd(), 'cloudflare/migrations/0001_init.sql'), 'utf8'));
  return db;
}
