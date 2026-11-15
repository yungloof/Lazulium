import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EXCLUDED_TABLES,
  apiSource,
  backupFileName,
  decrypt,
  encrypt,
  oldBackups,
  readBackup,
  restoreBackup,
  sqliteSource,
  wranglerSource,
} from './lib.mjs';

const schema = readFileSync(fileURLToPath(new URL('../schema.sql', import.meta.url)), 'utf-8');
const PASS = 'senha comprida de teste';
const NOW = '2026-11-15T12:00:00.000Z';

function seeded() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const add = (sql, ...args) => db.prepare(sql).run(...args);
  add('INSERT INTO users (id, steam_id, steam_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)', 'u1', '7656', 'Ana', NOW, NOW);
  add('INSERT INTO users (id, steam_id, steam_name, custom_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)', 'u2', '7657', 'Bia', 'Bi ✨', NOW, NOW);
  add('INSERT INTO friendships VALUES (?, ?, ?)', 'u1', 'u2', NOW);
  add('INSERT INTO sessions VALUES (?, ?, ?, ?)', 'hash-secreto', 'u1', NOW, NOW);
  add('INSERT INTO auth_codes VALUES (?, ?, ?, ?)', 'code', 'u1', 'st', NOW);
  add('INSERT INTO view_links VALUES (?, ?, ?)', 'tok', 'u1', NOW);
  add('INSERT INTO media VALUES (?, ?, ?, ?, ?, ?)', 'm', 'u1', 'avatar', 'image/png', 'AAAA', NOW);
  add('INSERT INTO user_sync (user_id, data, updated_at) VALUES (?, ?, ?)', 'u1', '{"notas":"privado"}', NOW);
  for (let i = 0; i < 1203; i++) {
    add(
      'INSERT INTO activities (user_id, id, kind, game_key, game_title, at, rating, seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'u1', `a${i}`, 'played', 'hades', 'Hades', NOW, i % 2 ? 4.5 : null, i,
    );
  }
  add(
    'INSERT INTO library_games (user_id, title_key, title, seconds, ach_ids, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    'u2', 'hades', 'Hades', 3600, '{"a":1}', NOW,
  );
  return db;
}

test('cópia: deixa de fora sessões, códigos, links, imagens e a sincronização privada', async () => {
  const payload = await readBackup(sqliteSource(seeded()), { now: new Date(NOW) });
  for (const name of EXCLUDED_TABLES) assert.equal(payload.tables[name], undefined, name);
  assert.equal(payload.tables.users.rows.length, 2);
  assert.equal(payload.tables.activities.rows.length, 1203);       // Mais de uma página
  assert.ok(payload.schema.some((s) => s.name === 'sessions'));     // Estrutura vai inteira
  assert.ok(!JSON.stringify(payload).includes('hash-secreto'));
  assert.ok(!JSON.stringify(payload).includes('privado'));
});

test('cifra: abre só com a senha certa e acusa arquivo mexido', async () => {
  const payload = await readBackup(sqliteSource(seeded()), { now: new Date(NOW) });
  const file = encrypt(payload, PASS);
  assert.ok(!file.toString('latin1').includes('Hades'));
  assert.deepEqual(decrypt(file, PASS), payload);
  assert.throws(() => decrypt(file, 'outra senha comprida'), /Senha errada/);
  const tampered = Buffer.from(file);
  tampered[40] ^= 1;
  assert.throws(() => decrypt(tampered, PASS), /Senha errada ou arquivo alterado/);
  assert.throws(() => encrypt(payload, 'curta'), /pelo menos 12/);
  assert.throws(() => decrypt(Buffer.from('não é cópia nenhuma, só texto'), PASS), /não é uma cópia/);
  assert.notDeepEqual(encrypt(payload, PASS), file);                // Sal e IV novos a cada cópia
});

test('restaurar: banco novo igual ao original (menos o que ficou de fora), e rodar de novo não duplica', async () => {
  const original = seeded();
  const payload = decrypt(encrypt(await readBackup(sqliteSource(original)), PASS), PASS);
  const fresh = new DatabaseSync(':memory:');
  await restoreBackup(payload, sqliteSource(fresh));
  await restoreBackup(payload, sqliteSource(fresh));
  for (const table of ['users', 'friendships', 'activities', 'library_games']) {
    const q = `SELECT * FROM ${table} ORDER BY rowid`;
    assert.deepEqual(fresh.prepare(q).all(), original.prepare(q).all(), table);
  }
  assert.equal(fresh.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal(fresh.prepare("SELECT custom_name FROM users WHERE id = 'u2'").get().custom_name, 'Bi ✨');
  assert.ok(fresh.prepare("SELECT name FROM sqlite_master WHERE name = 'activities_user_at'").get());
});

test('restaurar não sobrescreve o que já existe no destino', async () => {
  const payload = await readBackup(sqliteSource(seeded()));
  const target = new DatabaseSync(':memory:');
  target.exec(schema);
  target.prepare('INSERT INTO users (id, steam_id, steam_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run('u1', '7656', 'Ana nova', NOW, NOW);
  await restoreBackup(payload, sqliteSource(target));
  assert.equal(target.prepare("SELECT steam_name FROM users WHERE id = 'u1'").get().steam_name, 'Ana nova');
  assert.equal(target.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
});

test('restaurar recusa nome de tabela ou coluna estranho', async () => {
  const payload = await readBackup(sqliteSource(seeded()));
  payload.tables['users; DROP TABLE users'] = { columns: ['id'], rows: [['x']] };
  await assert.rejects(restoreBackup(payload, sqliteSource(new DatabaseSync(':memory:'))), /Nome estranho/);
});

test('cópias antigas: só as do script, guardando as mais novas', () => {
  const names = [
    backupFileName(new Date(2026, 10, 1, 9, 5)),
    'lazulium-social-2026-10-01-0900.lzbk',
    'minha-foto.png',
    'lazulium-social-2026-11-08-0900.lzbk',
    'lazulium-social-2026-11-15-0900.lzbk.tmp',
  ];
  assert.equal(names[0], 'lazulium-social-2026-11-01-0905.lzbk');
  assert.deepEqual(oldBackups(names, 2), ['lazulium-social-2026-10-01-0900.lzbk']);
  assert.deepEqual(oldBackups(names, 8), []);
});

test('API da Cloudflare: manda token e parâmetros, e acusa recusa', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const body = JSON.parse(init.body);
    if (body.sql.startsWith('FAIL')) return new Response(JSON.stringify({ success: false, errors: [{ message: 'sem permissão' }] }), { status: 403 });
    return new Response(JSON.stringify({ success: true, result: [{ results: [{ n: 1 }] }] }));
  };
  const api = apiSource({ accountId: 'acc', databaseId: 'db', token: 'tk', fetchImpl });
  assert.deepEqual(await api.run('SELECT ?', [1]), [{ n: 1 }]);
  assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/accounts/acc/d1/database/db/query');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tk');
  assert.deepEqual(JSON.parse(calls[0].init.body).params, [1]);
  await assert.rejects(api.all('FAIL'), /sem permissão/);
});

test('wrangler: consulta com caractere perigoso para o terminal nem sai', async () => {
  await assert.rejects(wranglerSource('.').all('SELECT 1 WHERE "a" > 0'), /caractere/);
});
