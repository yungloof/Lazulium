// Cópia de segurança do banco da conta Lazulium (D1), cifrada antes de tocar o disco.
// Lê pelo login do wrangler (ou por um token da Cloudflare), junta as tabelas num JSON, comprime e cifra com
// AES-256-GCM. A chave sai de uma senha (scrypt) que fica só com a dona: sem ela, o arquivo não abre.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(exec);

export const DATABASE = 'lazulium-social';

// Fora da cópia: segredos de login (restaurar traria sessões de volta), o que vence sozinho em horas ou dias,
// as imagens em base64 (pesadas, a pessoa envia de novo) e a sincronização privada entre PCs (anotações
// pessoais; a cópia de verdade fica nos PCs de cada um). Tabela nova entra na cópia sozinha.
export const EXCLUDED_TABLES = new Set([
  'sessions',
  'auth_codes',
  'invites',
  'view_links',
  'view_viewers',
  'media',
  'calls',
  'now_playing',
  'user_sync',
]);

const MAGIC = Buffer.from('LZBK');
const VERSION = 1;
const SCRYPT_LOG_N = 17;          // N = 131072: alguns décimos de segundo por tentativa
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 2 + SALT_BYTES + IV_BYTES;
export const MIN_PASSPHRASE = 12;
const MAX_PARAMS = 100;           // Limite de parâmetros por comando no D1
const PAGE_ROWS = 500;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function keyFrom(passphrase, salt, logN) {
  const N = 2 ** logN;
  return scryptSync(passphrase.normalize('NFC'), salt, 32, { N, r: 8, p: 1, maxmem: 256 * N * 8 });
}

export function encrypt(payload, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`A senha da cópia precisa de pelo menos ${MIN_PASSPHRASE} caracteres.`);
  }
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION, SCRYPT_LOG_N]), salt, iv]);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(passphrase, salt, SCRYPT_LOG_N), iv);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(payload), 'utf-8'))), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}

export function decrypt(file, passphrase) {
  if (file.length < HEADER_BYTES + TAG_BYTES || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Este arquivo não é uma cópia do Lazulium.');
  }
  const version = file[MAGIC.length];
  const logN = file[MAGIC.length + 1];
  if (version !== VERSION) throw new Error(`Cópia feita por uma versão mais nova do script (formato ${version}).`);
  if (logN < 14 || logN > 20) throw new Error('Cabeçalho da cópia estragado.');
  const header = file.subarray(0, HEADER_BYTES);
  const salt = header.subarray(MAGIC.length + 2, MAGIC.length + 2 + SALT_BYTES);
  const iv = header.subarray(HEADER_BYTES - IV_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(passphrase, salt, logN), iv);
  decipher.setAAD(header);
  decipher.setAuthTag(file.subarray(file.length - TAG_BYTES));
  let plain;
  try {
    plain = Buffer.concat([decipher.update(file.subarray(HEADER_BYTES, file.length - TAG_BYTES)), decipher.final()]);
  } catch {
    throw new Error('Senha errada ou arquivo alterado.');
  }
  const payload = JSON.parse(gunzipSync(plain).toString('utf-8'));
  if (payload?.format !== 'lazulium-social-backup') throw new Error('Conteúdo da cópia não reconhecido.');
  return payload;
}

// ---- De onde ler e para onde gravar: o D1 (wrangler ou token) ou um arquivo SQLite (testes e VPS) ----

// Pelo wrangler já logado no PC. Sem aspas duplas nem < > no SQL: passa inteiro pelo cmd do Windows.
export function wranglerSource(cwd) {
  return {
    label: `D1 ${DATABASE} (login do wrangler)`,
    async all(sql) {
      if (/["<>|&^%]/.test(sql)) throw new Error('Consulta com caractere que o terminal não aceita.');
      const { stdout } = await run(`npx wrangler d1 execute ${DATABASE} --remote --json --command "${sql}"`, {
        cwd,
        maxBuffer: 512 * 1024 * 1024,
        windowsHide: true,
      });
      const start = stdout.indexOf('[');
      const parsed = JSON.parse(stdout.slice(start));
      if (!Array.isArray(parsed) || parsed[0]?.success === false) throw new Error('O wrangler não devolveu o resultado.');
      return parsed[0].results ?? [];
    },
  };
}

// Pela API da Cloudflare com um token (D1 leitura para a cópia; D1 edição para restaurar)
export function apiSource({ accountId, databaseId, token, fetchImpl = fetch }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  async function query(sql, params = []) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      const why = data?.errors?.map((e) => e.message).join('; ') || `erro ${res.status}`;
      throw new Error(`A Cloudflare recusou: ${why}`);
    }
    return data.result?.[0]?.results ?? [];
  }
  return { label: `D1 ${databaseId} (token)`, all: (sql) => query(sql), run: query };
}

export function sqliteSource(db) {
  return {
    label: 'arquivo SQLite',
    async all(sql) {
      return db.prepare(sql).all();
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...params);
      return [];
    },
  };
}

// ---- Cópia ----

export async function readBackup(source, { now = new Date(), log = () => {} } = {}) {
  const master = await source.all('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type DESC, name');
  const schema = master.filter(
    (row) => row.sql && IDENT.test(row.tbl_name) && !row.tbl_name.startsWith('_cf_') && !row.tbl_name.startsWith('sqlite_'),
  );
  const tables = {};
  for (const { name } of schema.filter((row) => row.type === 'table' && !EXCLUDED_TABLES.has(row.name))) {
    const rows = [];
    let columns = null;
    let last = 0;
    for (;;) {
      // BETWEEN no lugar de > para o SQL passar pelo terminal do Windows
      const page = await source.all(
        `SELECT rowid AS lzbk_rowid, * FROM ${name} WHERE rowid BETWEEN ${last + 1} AND 9223372036854775807 ORDER BY rowid LIMIT ${PAGE_ROWS}`,
      );
      for (const row of page) {
        last = Number(row.lzbk_rowid);
        delete row.lzbk_rowid;
        columns ??= Object.keys(row);
        rows.push(columns.map((col) => row[col] ?? null));
      }
      if (page.length < PAGE_ROWS) break;
    }
    tables[name] = { columns: columns ?? [], rows };
    log(`  ${name}: ${rows.length}`);
  }
  return {
    format: 'lazulium-social-backup',
    version: VERSION,
    createdAt: now.toISOString(),
    database: DATABASE,
    excluded: [...EXCLUDED_TABLES],
    schema: schema.map(({ type, name, sql }) => ({ type, name, sql })),
    tables,
  };
}

export function backupFileName(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `lazulium-social-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.lzbk`;
}

export const BACKUP_FILE = /^lazulium-social-\d{4}-\d{2}-\d{2}-\d{4}\.lzbk$/;

// Só os arquivos com o nome que o script dá, do mais velho para o mais novo, além dos `keep` mais recentes
export function oldBackups(names, keep) {
  const ours = names.filter((name) => BACKUP_FILE.test(name)).sort();
  return ours.slice(0, Math.max(0, ours.length - keep));
}

// ---- Restaurar ----

function ifNotExists(sql) {
  return sql.replace(/^CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\s+(?!IF\s+NOT\s+EXISTS)/i, (m, unique = '', kind) => `CREATE ${unique}${kind} IF NOT EXISTS `);
}

// Nunca sobrescreve: linha que já existe no destino fica como está (INSERT OR IGNORE)
export async function restoreBackup(payload, target, { log = () => {} } = {}) {
  for (const item of payload.schema.filter((s) => s.type === 'table')) await target.run(ifNotExists(item.sql));
  for (const item of payload.schema.filter((s) => s.type === 'index')) await target.run(ifNotExists(item.sql));
  const counts = {};
  for (const [name, { columns, rows }] of Object.entries(payload.tables)) {
    if (!IDENT.test(name) || !columns.every((col) => IDENT.test(col))) throw new Error(`Nome estranho na cópia: ${name}`);
    counts[name] = rows.length;
    if (!rows.length) continue;
    const perStatement = Math.max(1, Math.floor(MAX_PARAMS / columns.length));
    const one = `(${columns.map(() => '?').join(', ')})`;
    for (let i = 0; i < rows.length; i += perStatement) {
      const chunk = rows.slice(i, i + perStatement);
      await target.run(
        `INSERT OR IGNORE INTO ${name} (${columns.join(', ')}) VALUES ${chunk.map(() => one).join(', ')}`,
        chunk.flat(),
      );
    }
    log(`  ${name}: ${rows.length}`);
  }
  return counts;
}

export function summary(payload) {
  return Object.fromEntries(Object.entries(payload.tables).map(([name, t]) => [name, t.rows.length]));
}
