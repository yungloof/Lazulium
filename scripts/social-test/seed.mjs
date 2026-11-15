// Banco do servidor social local para o teste: eu (A) e um amigo falso (B), amigos, com sessões conhecidas.
// node scripts/social-test/seed.mjs <banco.db> [avatarA]  (apaga o banco antes; veja docs/handoff-3.0.md)
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openD1 } from '../../server/social/src/d1-sqlite.js';

const [dbPath, avatarA] = process.argv.slice(2);
for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true });
const db = openD1(dbPath, fileURLToPath(new URL('../../server/social/schema.sql', import.meta.url))).raw;
const now = new Date().toISOString();
const later = new Date(Date.now() + 86400000).toISOString();
const hash = (t) => createHash('sha256').update(t).digest('hex');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const insertUser = db.prepare('INSERT INTO users (id, steam_id, steam_name, steam_avatar, settings, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
insertUser.run(A, '76561198000000001', 'Lazuli (teste)', avatarA || null, '{}', now, now);
insertUser.run(B, '76561198000000002', 'Syrea (teste)', null, '{}', now, now);
db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(hash('token-a-teste-0000000000000000'), A, now, later);
db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(hash('token-b-teste-0000000000000000'), B, now, later);
db.prepare('INSERT INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)').run(A, B, now);
console.log(JSON.stringify({ A, B }));
