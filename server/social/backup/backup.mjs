// npm run backup -- [--out <pasta>] [--keep 8]
// Copia o banco da conta Lazulium (D1) para um arquivo cifrado. Lê pelo login do wrangler; com
// CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID definidos, lê pela API da Cloudflare.
// Nada sai sem cifrar: o conteúdo só existe na memória até virar o arquivo .lzbk.

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { apiSource, backupFileName, encrypt, MIN_PASSPHRASE, oldBackups, readBackup, sqliteSource, wranglerSource } from './lib.mjs';
import { askPassphrase } from './prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = join(here, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function databaseId() {
  const toml = readFileSync(join(serverDir, 'wrangler.toml'), 'utf-8');
  return toml.match(/database_id\s*=\s*"([^"]+)"/)?.[1];
}

async function main() {
  const out = arg('--out', process.env.LAZULIUM_BACKUP_DIR || join(homedir(), 'Lazulium-backups'));
  const keep = Math.max(1, Number(arg('--keep', 8)) || 8);
  const fromSqlite = arg('--from-sqlite');   // Só para testes: lê de um arquivo SQLite no lugar do D1

  const passphrase = await askPassphrase(`Senha da cópia (mínimo ${MIN_PASSPHRASE} caracteres): `, { confirm: true });
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`A senha precisa de pelo menos ${MIN_PASSPHRASE} caracteres.`);

  let db;
  const source = fromSqlite
    ? sqliteSource((db = new DatabaseSync(fromSqlite, { readOnly: true })))
    : process.env.CLOUDFLARE_API_TOKEN
      ? apiSource({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, databaseId: databaseId(), token: process.env.CLOUDFLARE_API_TOKEN })
      : wranglerSource(serverDir);
  if (!fromSqlite && process.env.CLOUDFLARE_API_TOKEN && !process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('Com CLOUDFLARE_API_TOKEN, defina também CLOUDFLARE_ACCOUNT_ID.');
  }

  console.log(`Lendo ${source.label}...`);
  const now = new Date();
  const payload = await readBackup(source, { now, log: console.log });
  db?.close();
  const file = encrypt(payload, passphrase);

  mkdirSync(out, { recursive: true });
  const target = join(out, backupFileName(now));
  writeFileSync(`${target}.tmp`, file);
  renameSync(`${target}.tmp`, target);
  console.log(`Cópia salva: ${target} (${(file.length / 1024).toFixed(0)} KB)`);

  for (const name of oldBackups(readdirSync(out), keep)) {
    rmSync(join(out, name));
    console.log(`Cópia antiga apagada: ${name}`);
  }
  console.log('Guarde a senha num lugar seguro: sem ela, a cópia não abre.');
}

main().catch((err) => {
  console.error(`Não deu: ${err.message}`);
  process.exit(1);
});
