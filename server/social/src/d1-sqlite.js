import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// O pedaço da API do Cloudflare D1 que o Worker usa (prepare/bind/first/all/run/batch), em cima do SQLite do Node.
// Serve para os testes e para rodar o servidor social fora da Cloudflare (VPS).

class Statement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Statement(this.db, this.sql, args);
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.args) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args), success: true };
  }
  async run() {
    const info = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: info.changes } };
  }
  runSync() {
    return this.db.prepare(this.sql).run(...this.args);
  }
}

export function openD1(path = ':memory:', schemaPath) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  if (schemaPath) db.exec(readFileSync(schemaPath, 'utf-8'));
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    // Como no D1: tudo ou nada
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const out = statements.map((s) => ({ success: true, meta: { changes: s.runSync().changes } }));
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
  };
}
