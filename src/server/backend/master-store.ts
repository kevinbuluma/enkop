import type { D1Database, D1PreparedStatement } from '@/server/runtime';
import { TABLES, encodeValue, type MirrorTable, type Row } from './tables';

const now = () => new Date().toISOString();

/**
 * Access to the master Postgres. Every insert, update and delete on a content table is queued for the
 * Lovable mirror by the enkop_outbox() trigger in the same transaction (master-db/migrations), so a
 * committed change can never be missed, whichever code or dashboard made it.
 */
export class MasterStore {
  constructor(readonly db: D1Database) {}

  async all(table: MirrorTable, where = '', params: unknown[] = [], tail = ''): Promise<Row[]> {
    const sql = `SELECT * FROM ${table}${where ? ` WHERE ${where}` : ''}${tail ? ` ${tail}` : ''}`;
    const { results } = await this.db.prepare(sql).bind(...params).all<Row>();
    return results;
  }

  async first(table: MirrorTable, where: string, params: unknown[] = [], tail = ''): Promise<Row | null> {
    const rows = await this.all(table, where, params, `${tail} LIMIT 1`.trim());
    return rows[0] ?? null;
  }

  /** Inserts or updates `row` (columns not given keep their current/default values). Returns the primary key. */
  upsertStatements(table: MirrorTable, row: Row): { pk: unknown; statements: D1PreparedStatement[] } {
    const spec = TABLES[table];
    const values: Row = { ...row };
    if (spec.pk === 'id' && !values['id']) values['id'] = crypto.randomUUID();
    if ((spec.columns as readonly string[]).includes('updated_at') && !('updated_at' in row)) values['updated_at'] = now();
    const cols = Object.keys(values).filter((c) => (spec.columns as readonly string[]).includes(c));
    const updates = cols.filter((c) => c !== spec.pk && c !== 'created_at').map((c) => `${c} = excluded.${c}`);
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      + (updates.length ? ` ON CONFLICT (${spec.pk}) DO UPDATE SET ${updates.join(', ')}` : ` ON CONFLICT (${spec.pk}) DO NOTHING`);
    const pk = values[spec.pk];
    return { pk, statements: [this.db.prepare(sql).bind(...cols.map((c) => encodeValue(table, c, values[c])))] };
  }

  /** Updates only the given columns of an existing row. */
  updateStatements(table: MirrorTable, pkValue: unknown, patch: Row): D1PreparedStatement[] {
    const spec = TABLES[table];
    const cols = Object.keys(patch).filter((c) => (spec.columns as readonly string[]).includes(c) && c !== spec.pk && c !== 'updated_at');
    if (!cols.length) return [];
    return [this.db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE ${spec.pk} = ?`).bind(...cols.map((c) => encodeValue(table, c, patch[c])), pkValue)];
  }

  deleteStatements(table: MirrorTable, pkValue: unknown): D1PreparedStatement[] {
    return [this.db.prepare(`DELETE FROM ${table} WHERE ${TABLES[table].pk} = ?`).bind(pkValue)];
  }

  outboxStatement(kind: 'media_put' | 'media_delete' | 'notify', payload: unknown): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO outbox (kind, payload) VALUES (?, ?)`).bind(kind, JSON.stringify(payload));
  }

  /** Inserts a row copied from the mirror unless its key exists; not queued back to the mirror. */
  async importRow(table: MirrorTable, row: Row): Promise<boolean> {
    const cols = Object.keys(row).filter((c) => (TABLES[table].columns as readonly string[]).includes(c));
    const [, insert] = await this.db.batch([
      this.db.prepare(`SELECT set_config('enkop.skip_outbox', 'on', true)`),
      this.db
        .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT (${TABLES[table].pk}) DO NOTHING`)
        .bind(...cols.map((c) => encodeValue(table, c, row[c]))),
    ]);
    return (insert?.meta?.changes ?? 0) > 0;
  }

  async run(statements: D1PreparedStatement[]) {
    if (statements.length) await this.db.batch(statements);
  }

  async upsert(table: MirrorTable, row: Row) {
    const { pk, statements } = this.upsertStatements(table, row);
    await this.run(statements);
    return pk;
  }

  async update(table: MirrorTable, pkValue: unknown, patch: Row) {
    await this.run(this.updateStatements(table, pkValue, patch));
  }

  async remove(table: MirrorTable, pkValue: unknown) {
    await this.run(this.deleteStatements(table, pkValue));
  }
}

/** Small persistent key/value state in the master's `meta` table. */
export async function readMeta(db: D1Database, key: string): Promise<string | null> {
  return (await db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? null;
}

export async function writeMeta(db: D1Database, key: string, value: string) {
  await db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`).bind(key, value).run();
}
