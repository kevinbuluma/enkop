import type { D1Database, D1PreparedStatement } from '@/server/runtime';
import { TABLES, decodeRow, encodeValue, rowJsonSql, type MirrorTable, type Row } from './tables';

const now = () => new Date().toISOString();

/**
 * D1 access for the master. Every write and its outbox entry go into one batch, so the Lovable
 * mirror can never miss a committed change.
 */
export class MasterStore {
  constructor(readonly db: D1Database) {}

  async all(table: MirrorTable, where = '', params: unknown[] = [], tail = ''): Promise<Row[]> {
    const sql = `SELECT * FROM ${table}${where ? ` WHERE ${where}` : ''}${tail ? ` ${tail}` : ''}`;
    const { results } = await this.db.prepare(sql).bind(...params).all<Row>();
    return results.map((r) => decodeRow(table, r));
  }

  async first(table: MirrorTable, where: string, params: unknown[] = [], tail = ''): Promise<Row | null> {
    const rows = await this.all(table, where, params, `${tail} LIMIT 1`.trim());
    return rows[0] ?? null;
  }

  private outboxUpsert(table: MirrorTable, pkValue: unknown): D1PreparedStatement {
    const pk = TABLES[table].pk;
    return this.db
      .prepare(`INSERT INTO outbox (kind, table_name, payload) SELECT 'upsert', ?, ${rowJsonSql(table)} FROM ${table} WHERE ${pk} = ?`)
      .bind(table, pkValue);
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
    return {
      pk,
      statements: [this.db.prepare(sql).bind(...cols.map((c) => encodeValue(table, c, values[c]))), this.outboxUpsert(table, pk)],
    };
  }

  /** Updates only the given columns of an existing row. */
  updateStatements(table: MirrorTable, pkValue: unknown, patch: Row): D1PreparedStatement[] {
    const spec = TABLES[table];
    const values: Row = { ...patch };
    if ((spec.columns as readonly string[]).includes('updated_at') && !('updated_at' in patch)) values['updated_at'] = now();
    const cols = Object.keys(values).filter((c) => (spec.columns as readonly string[]).includes(c) && c !== spec.pk);
    return [
      this.db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE ${spec.pk} = ?`).bind(...cols.map((c) => encodeValue(table, c, values[c])), pkValue),
      this.outboxUpsert(table, pkValue),
    ];
  }

  deleteStatements(table: MirrorTable, pkValue: unknown): D1PreparedStatement[] {
    const pk = TABLES[table].pk;
    return [
      this.db.prepare(`DELETE FROM ${table} WHERE ${pk} = ?`).bind(pkValue),
      this.db.prepare(`INSERT INTO outbox (kind, table_name, payload) VALUES ('delete', ?, ?)`).bind(table, JSON.stringify({ [pk]: pkValue })),
    ];
  }

  outboxStatement(kind: 'media_put' | 'media_delete' | 'notify', payload: unknown): D1PreparedStatement {
    return this.db.prepare(`INSERT INTO outbox (kind, payload) VALUES (?, ?)`).bind(kind, JSON.stringify(payload));
  }

  /** Inserts a row copied from the mirror unless it already exists. No outbox entry: the mirror has it. */
  async importRow(table: MirrorTable, row: Row): Promise<boolean> {
    const cols = Object.keys(row).filter((c) => (TABLES[table].columns as readonly string[]).includes(c));
    // Only an existing primary key is skipped; any other constraint failure must surface.
    const res = await this.db
      .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT (${TABLES[table].pk}) DO NOTHING`)
      .bind(...cols.map((c) => encodeValue(table, c, row[c])))
      .run();
    return (res.meta?.changes ?? 0) > 0;
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
