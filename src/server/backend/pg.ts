import type { D1Database, D1PreparedStatement, D1Result } from '@/server/runtime';

// Postgres behind the small D1-style interface the master code uses (prepare/bind/all/first/run/batch).
// `?` placeholders become $1..$n, so SQL must not use the jsonb `?` operators or a literal `?`.
// A batch runs in one transaction. Timestamps come back as ISO strings, numeric/bigint as numbers and
// date as 'YYYY-MM-DD', matching what the Supabase API returns.

export type PgResult = { rows: Record<string, unknown>[]; rowCount: number | null };
export interface PgConnection {
  query(text: string, params: unknown[]): Promise<PgResult>;
  end(): Promise<void>;
}
export type Connect = () => Promise<PgConnection>;

export function toPositional(sql: string) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

const normalize = (rows: Record<string, unknown>[]) =>
  rows.map((row) => {
    for (const k in row) if (row[k] instanceof Date) row[k] = (row[k] as Date).toISOString();
    return row;
  });

class PgStatement implements D1PreparedStatement {
  constructor(private db: PgDatabase, readonly sql: string, readonly params: unknown[] = []) {}
  bind(...values: unknown[]) {
    return new PgStatement(this.db, this.sql, values.map((v) => (v === undefined ? null : v)));
  }
  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.db.execute<T>(this);
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (await this.all<T>()).results[0] ?? null;
  }
  async run(): Promise<D1Result> {
    const { meta } = await this.all();
    return { results: [], meta: meta ?? { changes: 0 } };
  }
}

export class PgDatabase implements D1Database {
  constructor(private connect: Connect) {}

  prepare(sql: string): D1PreparedStatement {
    return new PgStatement(this, toPositional(sql));
  }

  private static async query<T>(conn: PgConnection, s: PgStatement): Promise<D1Result<T>> {
    const r = await conn.query(s.sql, s.params);
    return { results: normalize(r.rows) as T[], meta: { changes: r.rowCount ?? 0 } };
  }

  async execute<T>(s: PgStatement): Promise<D1Result<T>> {
    const conn = await this.connect();
    try {
      return await PgDatabase.query<T>(conn, s);
    } finally {
      // A close failure after a committed write must not report the write as failed.
      await conn.end().catch(() => {});
    }
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const conn = await this.connect();
    try {
      await conn.query('BEGIN', []);
      const out: D1Result[] = [];
      for (const s of statements) out.push(await PgDatabase.query(conn, s as PgStatement));
      await conn.query('COMMIT', []);
      return out;
    } catch (e) {
      await conn.query('ROLLBACK', []).catch(() => {});
      throw e;
    } finally {
      await conn.end().catch(() => {});
    }
  }
}

const NUMBER = (v: string) => Number(v);
const RAW = (v: string) => v;
/** Type parsers by OID: int8, numeric -> number; date stays a string. */
export const PG_PARSERS: Record<number, (v: string) => unknown> = { 20: NUMBER, 1700: NUMBER, 1082: RAW };

/**
 * The master database through Cloudflare Hyperdrive. Workers may not reuse a socket across requests,
 * so each query (or batch) opens its own connection; Hyperdrive keeps the pool to Supabase warm.
 */
export function hyperdriveDatabase(connectionString: string): PgDatabase {
  return new PgDatabase(async () => {
    const { default: pg } = await import('pg');
    const client = new pg.Client({
      connectionString,
      types: { getTypeParser: ((oid: number, format?: string) => PG_PARSERS[oid] ?? pg.types.getTypeParser(oid, format as 'text')) as never },
    });
    await client.connect();
    return { query: (text, params) => client.query(text, params) as Promise<PgResult>, end: () => client.end() };
  });
}
