// Depois do seed e com o servidor local no ar: amigo C, e a biblioteca resumida de B e C.
// node scripts/social-test/lib-friends.mjs <banco.db> [ids.json]  (ids.json: { mine: [...], not: [...] } com ids de conquistas do Cyberpunk; sem ele, B e C ficam sem conquistas)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const [dbPath, idsPath] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
const now = new Date().toISOString();
const C = '33333333-3333-4333-8333-333333333333';
const A = '11111111-1111-4111-8111-111111111111';
db.prepare('INSERT OR IGNORE INTO users (id, steam_id, steam_name, steam_avatar, settings, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
  C, '76561198000000003', 'Amigo Três (teste)', null, '{}', now, now
);
db.prepare('INSERT OR IGNORE INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
  createHash('sha256').update('token-c-teste-0000000000000000').digest('hex'), C, now, new Date(Date.now() + 86400000).toISOString()
);
db.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)').run(A, C, now);
db.close();

const { mine, not } = idsPath ? JSON.parse(readFileSync(idsPath, 'utf8')) : { mine: [], not: [] };
const at = (days) => Math.floor(Date.now() / 1000) - days * 86400;
const post = async (token, path, body, method = 'POST') => {
  const res = await fetch(`http://127.0.0.1:3199${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return `${res.status} ${await res.text()}`;
};

const B = 'token-b-teste-0000000000000000';
const TC = 'token-c-teste-0000000000000000';
console.log(
  await post(B, '/v1/me/library', {
    reset: true,
    games: [
      {
        titleKey: 't:cyberpunk2077',
        steamKey: 'steam:1091500',
        title: 'Cyberpunk 2077',
        playtimeSeconds: 212 * 3600,
        lastPlayedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        status: 'completed',
        rating: 5,
        review:
          'Joguei na estreia, larguei, voltei depois da 2.0 e virou outro jogo. Night City é a cidade mais viva que já andei num jogo, e o final com o Johnny me pegou de jeito.\n\nPhantom Liberty é obrigatório. A missão do Songbird no estádio é das melhores coisas que joguei nos últimos anos.',
        reviewAt: '2026-10-20',
        achievements: { source: 'steam', total: 57, unlocked: 50, ids: Object.fromEntries([...mine.slice(0, 22), ...not.slice(0, 28)].map((id, i) => [id, at(200 - i)])) }
      },
      { titleKey: 't:palworld', title: 'Palworld', playtimeSeconds: 40 * 3600, status: 'paused', rating: 3.5 },
      { titleKey: 't:eldenring', steamKey: 'steam:1245620', title: 'ELDEN RING', playtimeSeconds: 310 * 3600, status: 'finished', rating: 4.5 },
      { titleKey: 't:hades', title: 'Hades', playtimeSeconds: 60 * 3600, rating: 5 }
    ]
  })
);
console.log(
  await post(TC, '/v1/me/library', {
    reset: true,
    games: [
      {
        titleKey: 't:cyberpunk2077',
        title: 'Cyberpunk 2077',
        playtimeSeconds: 18 * 3600,
        status: 'playing',
        rating: 3.5,
        review: 'Bonito demais, mas o carro anda como um sabonete.',
        achievements: { source: 'steam', total: 57, unlocked: 6, ids: Object.fromEntries(not.slice(0, 6).map((id, i) => [id, at(5 - i)])) }
      }
    ]
  })
);
console.log(await post(TC, '/v1/me/now-playing', { gameKey: 'steam:1091500', gameTitle: 'Cyberpunk 2077' }, 'PUT'));
