// npm run restore -- <arquivo.lzbk>                    confere a cópia (data e quantas linhas por tabela)
// npm run restore -- <arquivo.lzbk> --to-sqlite <novo.db>   abre num SQLite novo (olhar ou subir na VPS)
// npm run restore -- <arquivo.lzbk> --to-d1            devolve ao D1 pela API (CLOUDFLARE_API_TOKEN com edição do D1)
// Restaurar nunca sobrescreve: linha que já existe no destino fica como está.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { DatabaseSync } from 'node:sqlite';
import { apiSource, decrypt, restoreBackup, sqliteSource, summary } from './lib.mjs';
import { askPassphrase } from './prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? (process.argv[i + 1] ?? '') : undefined;
}

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith('--') || !existsSync(file)) throw new Error('Diga qual arquivo .lzbk abrir.');
  const payload = decrypt(readFileSync(file), await askPassphrase('Senha da cópia: '));

  console.log(`Cópia de ${new Date(payload.createdAt).toLocaleString('pt-BR')} (${payload.database})`);
  for (const [name, count] of Object.entries(summary(payload))) console.log(`  ${name}: ${count}`);
  console.log(`Fora da cópia: ${payload.excluded.join(', ')}`);

  const toSqlite = arg('--to-sqlite');
  if (toSqlite !== undefined) {
    if (!toSqlite) throw new Error('Diga o nome do arquivo SQLite novo.');
    if (existsSync(toSqlite)) throw new Error(`${toSqlite} já existe: escolha um nome novo.`);
    const db = new DatabaseSync(toSqlite);
    try {
      db.exec('BEGIN');
      await restoreBackup(payload, sqliteSource(db));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      db.close();
    }
    console.log(`Pronto: ${toSqlite}`);
    return;
  }

  if (process.argv.includes('--to-d1')) {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!token || !accountId) throw new Error('Defina CLOUDFLARE_API_TOKEN (com edição do D1) e CLOUDFLARE_ACCOUNT_ID.');
    const toml = readFileSync(join(here, '..', 'wrangler.toml'), 'utf-8');
    const databaseId = toml.match(/database_id\s*=\s*"([^"]+)"/)?.[1];
    if (!process.argv.includes('--yes')) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`Devolver ao D1 ${databaseId}? Linhas que já existem não mudam. Digite RESTAURAR: `);
      rl.close();
      if (answer.trim() !== 'RESTAURAR') throw new Error('Cancelado.');
    }
    await restoreBackup(payload, apiSource({ accountId, databaseId, token }), { log: console.log });
    console.log('Pronto. As pessoas entram de novo pela Steam (as sessões não ficam na cópia).');
  }
}

main().catch((err) => {
  console.error(`Não deu: ${err.message}`);
  process.exit(1);
});
