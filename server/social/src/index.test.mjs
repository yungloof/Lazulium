import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import worker, { retryPurges } from './index.js';
import { openD1 } from './d1-sqlite.js';
import { createMediaStore } from './media-store.js';
import { signTicket, verifyTicket } from './media-ticket.js';

const SCHEMA = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql');
const ORIGIN = 'https://social.test';
const STATE = 'estado-de-teste-1234567890';
const PORT = 50123;

// Steam falsa: confirma o login (ou não) e devolve nome e avatar
function fakeSteam({ valid = true } = {}) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, options });
    if (href === 'https://steamcommunity.com/openid/login') {
      assert.equal(options.method, 'POST');
      assert.match(String(options.body), /openid\.mode=check_authentication/);
      return new Response(`ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n`);
    }
    const profile = href.match(/^https:\/\/steamcommunity\.com\/profiles\/(\d+)\/\?xml=1$/);
    if (profile) {
      const n = profile[1].slice(-2);
      return new Response(
        `<profile><steamID><![CDATA[Jogador ${n}]]></steamID><avatarFull><![CDATA[https://avatars.steamstatic.com/abc${n}_full.jpg]]></avatarFull></profile>`
      );
    }
    throw new Error(`chamada inesperada: ${href}`);
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

function setup() {
  const env = { DB: openD1(':memory:', SCHEMA) };
  const call = async (method, path, { token, body, headers = {} } = {}) => {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
    const res = await worker.fetch(new Request(`${ORIGIN}${path}`, init), env);
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
  return { env, call };
}

function steamReturn(steamId, { state = STATE, port = PORT } = {}) {
  const returnTo = `${ORIGIN}/v1/auth/steam/callback?port=${port}&state=${state}`;
  const claimed = `https://steamcommunity.com/openid/id/${steamId}`;
  return new URLSearchParams({
    port: String(port),
    state,
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': claimed,
    'openid.identity': claimed,
    'openid.return_to': returnTo,
    'openid.response_nonce': '2026-11-11T00:00:00Zabc',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'assinatura'
  });
}

// Login completo: volta da Steam -> código no 127.0.0.1 -> troca por token
async function login(s, steamId) {
  const res = await worker.fetch(new Request(`${ORIGIN}/v1/auth/steam/callback?${steamReturn(steamId)}`), s.env);
  assert.equal(res.status, 302);
  const back = new URL(res.headers.get('Location'));
  assert.equal(back.origin, `http://127.0.0.1:${PORT}`);
  assert.equal(back.searchParams.get('state'), STATE);
  const code = back.searchParams.get('code');
  assert.ok(code, `sem código: ${back}`);
  const { status, body } = await s.call('POST', '/v1/auth/exchange', { body: { code, state: STATE } });
  assert.equal(status, 200);
  return body;
}

async function befriend(s, a, b) {
  const invite = await s.call('POST', '/v1/friends/invite', { token: a.token });
  const accepted = await s.call('POST', '/v1/friends/accept', { token: b.token, body: { code: invite.body.code } });
  assert.equal(accepted.status, 200);
}

const event = (over = {}) => ({ id: 'played|g1|2026-11-10', kind: 'played', gameKey: 'steam:620', gameTitle: 'Portal 2', at: '2026-11-10T20:00:00.000Z', seconds: 3600, ...over });

test('start: manda para a Steam com retorno no próprio servidor', async () => {
  const s = setup();
  const res = await worker.fetch(new Request(`${ORIGIN}/v1/auth/steam/start?port=${PORT}&state=${STATE}`), s.env);
  assert.equal(res.status, 302);
  const target = new URL(res.headers.get('Location'));
  assert.equal(target.origin + target.pathname, 'https://steamcommunity.com/openid/login');
  assert.equal(target.searchParams.get('openid.return_to'), `${ORIGIN}/v1/auth/steam/callback?port=${PORT}&state=${STATE}`);
  assert.equal(target.searchParams.get('openid.realm'), ORIGIN);
});

test('start: porta ou state inválidos não redirecionam', async () => {
  const s = setup();
  for (const q of [`port=80&state=${STATE}`, `port=${PORT}&state=curto`, `port=abc&state=${STATE}`]) {
    assert.equal((await s.call('GET', `/v1/auth/steam/start?${q}`)).status, 400);
  }
});

test('login: Steam confirma -> usuário criado com nome e avatar, token funciona', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const me = await login(s, '76561198000000001');
  assert.equal(me.user.name, 'Jogador 01');
  assert.equal(me.user.avatarUrl, 'https://avatars.steamstatic.com/abc01_full.jpg');
  assert.deepEqual(me.settings.shareActivity, true);
  const { body } = await s.call('GET', '/v1/me', { token: me.token });
  assert.equal(body.user.steamId, '76561198000000001');
  // Mesmo SteamID de novo = mesma conta
  const again = await login(s, '76561198000000001');
  assert.equal(again.user.id, me.user.id);
  // Token guardado só como hash
  const row = s.env.DB.raw.prepare('SELECT token_hash FROM sessions LIMIT 1').get();
  assert.notEqual(row.token_hash, me.token);
});

test('login: Steam não confirma ou return_to trocado não cria conta', async (t) => {
  const steam = fakeSteam({ valid: false });
  t.after(steam.restore);
  const s = setup();
  const res = await worker.fetch(new Request(`${ORIGIN}/v1/auth/steam/callback?${steamReturn('76561198000000001')}`), s.env);
  assert.equal(new URL(res.headers.get('Location')).searchParams.get('error'), 'not_verified');

  const forged = steamReturn('76561198000000001');
  forged.set('openid.return_to', 'https://outro.site/callback');
  const res2 = await worker.fetch(new Request(`${ORIGIN}/v1/auth/steam/callback?${forged}`), s.env);
  assert.equal(new URL(res2.headers.get('Location')).searchParams.get('error'), 'not_verified');
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
});

test('login: assinatura da Steam sem o SteamID ou de outro servidor não cria conta', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const variants = [
    (p) => p.set('openid.signed', 'signed,op_endpoint,return_to,response_nonce,assoc_handle'),
    (p) => p.set('openid.op_endpoint', 'https://outro.exemplo/openid/login')
  ];
  for (const change of variants) {
    const params = steamReturn('76561198000000009');
    change(params);
    const res = await worker.fetch(new Request(`${ORIGIN}/v1/auth/steam/callback?${params}`), s.env);
    assert.equal(new URL(res.headers.get('Location')).searchParams.get('error'), 'not_verified');
  }
  assert.equal(await s.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first().then((r) => r.n), 0);
});

test('login cancelado volta para o app com erro', async () => {
  const s = setup();
  const res = await worker.fetch(new Request(`${ORIGIN}/v1/auth/steam/callback?port=${PORT}&state=${STATE}&openid.mode=cancel`), s.env);
  assert.equal(new URL(res.headers.get('Location')).searchParams.get('error'), 'cancelled');
});

test('código de login vale uma vez e só com o mesmo state', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const res = await worker.fetch(new Request(`${ORIGIN}/v1/auth/steam/callback?${steamReturn('76561198000000001')}`), s.env);
  const code = new URL(res.headers.get('Location')).searchParams.get('code');
  assert.equal((await s.call('POST', '/v1/auth/exchange', { body: { code, state: 'outro-state-1234567890' } })).status, 401);
  // O state errado já queimou o código
  assert.equal((await s.call('POST', '/v1/auth/exchange', { body: { code, state: STATE } })).status, 401);
});

test('sem token ou com token inválido: 401', async () => {
  const s = setup();
  assert.equal((await s.call('GET', '/v1/me')).status, 401);
  assert.equal((await s.call('GET', '/v1/me', { token: 'x'.repeat(43) })).status, 401);
});

test('convite: amizade nos dois sentidos, não aceita o próprio código', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  const invite = await s.call('POST', '/v1/friends/invite', { token: a.token });
  assert.match(invite.body.code, /^[A-HJ-NP-Z2-9]{8}$/);
  // Pedir de novo devolve o mesmo código enquanto vale
  assert.equal((await s.call('POST', '/v1/friends/invite', { token: a.token })).body.code, invite.body.code);
  assert.equal((await s.call('POST', '/v1/friends/accept', { token: a.token, body: { code: invite.body.code } })).status, 400);
  const accepted = await s.call('POST', '/v1/friends/accept', { token: b.token, body: { code: invite.body.code.toLowerCase().replace(/(....)/, '$1-') } });
  assert.equal(accepted.body.friend.name, 'Jogador 01');
  assert.equal((await s.call('GET', '/v1/friends', { token: a.token })).body.friends[0].name, 'Jogador 02');
  assert.equal((await s.call('GET', '/v1/friends', { token: b.token })).body.friends[0].name, 'Jogador 01');
  assert.equal((await s.call('POST', '/v1/friends/accept', { token: b.token, body: { code: 'ZZZZZZZZ' } })).status, 404);
});

test('feed: mostra eventos dos amigos, nunca de quem não é amigo', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  const c = await login(s, '76561198000000003');
  await befriend(s, a, b);

  const sent = await s.call('POST', '/v1/me/activities', {
    token: b.token,
    body: {
      events: [
        event(),
        event({ id: 'rated-1', kind: 'rated', rating: 4.5, at: '2026-11-10T21:00:00.000Z' }),
        event({ id: 'bad', kind: 'hackeou', gameTitle: 'x' }),
        event({ id: 'cover', coverUrl: 'https://evil.example/x.jpg', at: '2026-11-09T10:00:00.000Z' })
      ]
    }
  });
  assert.deepEqual(sent.body, { accepted: 3, rejected: 1 });
  await s.call('POST', '/v1/me/activities', { token: c.token, body: { events: [event({ id: 'c1' })] } });

  const feed = await s.call('GET', '/v1/feed', { token: a.token });
  assert.deepEqual(feed.body.items.map((i) => i.id), ['rated-1', 'played|g1|2026-11-10', 'cover']);
  assert.equal(feed.body.items[0].user.name, 'Jogador 02');
  assert.equal(feed.body.items[2].coverUrl, null, 'capa de site desconhecido não passa');
  // Reenviar o mesmo evento atualiza em vez de duplicar
  await s.call('POST', '/v1/me/activities', { token: b.token, body: { events: [event({ seconds: 7200 })] } });
  const again = await s.call('GET', '/v1/feed', { token: a.token });
  assert.equal(again.body.items.length, 3);
  assert.equal(again.body.items.find((i) => i.kind === 'played').seconds, 7200);
  // Paginação
  const page = await s.call('GET', `/v1/feed?before=${encodeURIComponent('2026-11-10T21:00:00.000Z')}&limit=1`, { token: a.token });
  assert.deepEqual(page.body.items.map((i) => i.id), ['played|g1|2026-11-10']);
});

test('privacidade: o que a pessoa desliga some do feed e do perfil', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b);
  await s.call('POST', '/v1/me/activities', {
    token: b.token,
    body: { events: [event(), event({ id: 'r', kind: 'reviewed', rating: 5, text: 'Muito bom', at: '2026-11-10T22:00:00.000Z' })] }
  });
  await s.call('PATCH', '/v1/me', { token: b.token, body: { settings: { sharePlaytime: false } } });
  assert.deepEqual((await s.call('GET', '/v1/feed', { token: a.token })).body.items.map((i) => i.kind), ['reviewed']);
  await s.call('PATCH', '/v1/me', { token: b.token, body: { settings: { shareActivity: false } } });
  assert.equal((await s.call('GET', '/v1/feed', { token: a.token })).body.items.length, 0);
  assert.equal((await s.call('GET', `/v1/users/${b.user.id}`, { token: a.token })).body.activities.length, 0);
});

test('jogando agora: aparece para amigos e respeita a chave', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b);
  await s.call('PUT', '/v1/me/now-playing', { token: b.token, body: { gameKey: 'steam:620', gameTitle: 'Portal 2' } });
  assert.equal((await s.call('GET', '/v1/friends', { token: a.token })).body.friends[0].nowPlaying.gameTitle, 'Portal 2');
  await s.call('DELETE', '/v1/me/now-playing', { token: b.token });
  assert.equal((await s.call('GET', '/v1/friends', { token: a.token })).body.friends[0].nowPlaying, null);
  await s.call('PATCH', '/v1/me', { token: b.token, body: { settings: { shareNowPlaying: false } } });
  const put = await s.call('PUT', '/v1/me/now-playing', { token: b.token, body: { gameKey: 'steam:620', gameTitle: 'Portal 2' } });
  assert.equal(put.body.shared, false);
});

test('perfil: só amigos veem; resumo validado', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  const c = await login(s, '76561198000000003');
  await befriend(s, a, b);
  await s.call('PUT', '/v1/me/summary', {
    token: b.token,
    body: { totals: { games: 40, playtimeSeconds: 360000, achievementsUnlocked: 120 }, topGames: [{ gameKey: 'steam:620', title: 'Portal 2', playtimeSeconds: 36000, rating: 5 }, { gameKey: '../x', title: 'ruim' }] }
  });
  const profile = await s.call('GET', `/v1/users/${b.user.id}`, { token: a.token });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.summary.totals.games, 40);
  assert.deepEqual(profile.body.summary.topGames.map((g) => g.title), ['Portal 2']);
  assert.equal((await s.call('GET', `/v1/users/${b.user.id}`, { token: c.token })).status, 404);
});

test('nome escolhido e desfazer amizade', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b);
  assert.equal((await s.call('PATCH', '/v1/me', { token: b.token, body: { name: 'x' } })).status, 400);
  await s.call('PATCH', '/v1/me', { token: b.token, body: { name: '  Lazuli  ' } });
  assert.equal((await s.call('GET', '/v1/friends', { token: a.token })).body.friends[0].name, 'Lazuli');
  await s.call('DELETE', `/v1/friends/${b.user.id}`, { token: a.token });
  assert.equal((await s.call('GET', '/v1/friends', { token: b.token })).body.friends.length, 0);
});

test('apagar a conta remove tudo e derruba o token', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b);
  await s.call('POST', '/v1/me/activities', { token: b.token, body: { events: [event()] } });
  await s.call('PUT', '/v1/me/now-playing', { token: b.token, body: { gameKey: 'steam:620', gameTitle: 'Portal 2' } });
  assert.equal((await s.call('DELETE', '/v1/me', { token: b.token })).status, 200);
  assert.equal((await s.call('GET', '/v1/me', { token: b.token })).status, 401);
  for (const table of ['activities', 'now_playing', 'friendships', 'sessions']) {
    const n = s.env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    assert.equal(n, table === 'sessions' ? 1 : 0, table);
  }
  assert.equal((await s.call('GET', '/v1/feed', { token: a.token })).body.items.length, 0);
});

test('sair encerra só a sessão atual', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const a2 = await login(s, '76561198000000001');
  await s.call('POST', '/v1/auth/logout', { token: a.token });
  assert.equal((await s.call('GET', '/v1/me', { token: a.token })).status, 401);
  assert.equal((await s.call('GET', '/v1/me', { token: a2.token })).status, 200);
});

test('limites: lote grande demais e JSON quebrado', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const many = Array.from({ length: 201 }, (_, i) => event({ id: `e${i}` }));
  assert.equal((await s.call('POST', '/v1/me/activities', { token: a.token, body: { events: many } })).status, 400);
  assert.equal((await s.call('POST', '/v1/me/activities', { token: a.token, body: '{quebrado' })).status, 400);
  assert.equal((await s.call('GET', '/v1/nada', { token: a.token })).status, 404);
});

// ---------- Vitrine do perfil ----------
const SHOWCASE = { schema: 'lazulium-profile/1', displayName: 'Amiga </script><script>alert(1)</script>', custom: {}, featuredGames: [] };
const PAGE =
  '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src https:; media-src https://*.steamstatic.com; connect-src \'self\'; base-uri \'none\'; form-action \'none\'"><title>Perfil</title></head><body></body></html>';

test('vitrine: amigo abre pelo link temporário; JSON embutido não fecha a tag', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  s.env.PROFILE_PAGE = PAGE;
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  const c = await login(s, '76561198000000003');
  await befriend(s, a, b);
  // Sem vitrine enviada ainda
  assert.deepEqual((await s.call('POST', `/v1/users/${b.user.id}/view`, { token: a.token })).body, { url: null, reason: 'not_sent' });
  assert.equal((await s.call('PUT', '/v1/me/showcase', { token: b.token, body: { schema: 'outro' } })).status, 400);
  assert.equal((await s.call('PUT', '/v1/me/showcase', { token: b.token, body: SHOWCASE })).status, 200);
  const link = await s.call('POST', `/v1/users/${b.user.id}/view`, { token: a.token });
  assert.match(link.body.url, /^https:\/\/social\.test\/v1\/view\/[A-Za-z0-9_-]+$/);
  const res = await worker.fetch(new Request(link.body.url), s.env);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /window\.LAZULIUM_PROFILE = /);
  assert.ok(!html.includes('</script><script>alert(1)'), 'texto do perfil não pode fechar a tag');
  assert.match(res.headers.get('Content-Security-Policy') ?? '', /default-src 'none'.*connect-src 'none'/);
  // Quem não é amigo não consegue link
  assert.equal((await s.call('POST', `/v1/users/${b.user.id}/view`, { token: c.token })).status, 404);
  // Vitrine escondida: link novo não sai e o antigo para de abrir
  await s.call('PATCH', '/v1/me', { token: b.token, body: { settings: { shareProfile: false } } });
  assert.equal((await s.call('POST', `/v1/users/${b.user.id}/view`, { token: a.token })).body.reason, 'hidden');
  assert.equal((await worker.fetch(new Request(link.body.url), s.env)).status, 404);
});

test('imagens: envio troca a anterior, endereço público serve o arquivo', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
  const first = await s.call('PUT', '/v1/me/media/avatar', { token: a.token, body: { mime: 'image/png', data: png } });
  const second = await s.call('PUT', '/v1/me/media/avatar', { token: a.token, body: { mime: 'image/png', data: png } });
  assert.notEqual(first.body.url, second.body.url);
  assert.equal((await worker.fetch(new Request(first.body.url), s.env)).status, 404, 'a anterior some');
  const img = await worker.fetch(new Request(second.body.url), s.env);
  assert.equal(img.headers.get('Content-Type'), 'image/png');
  assert.equal(Buffer.from(await img.arrayBuffer()).toString('hex'), '89504e470d0a1a0a');
  assert.equal((await s.call('PUT', '/v1/me/media/avatar', { token: a.token, body: { mime: 'text/html', data: png } })).status, 400);
  // GIF vai como está (animado)
  const gif = Buffer.from('GIF89a').toString('base64');
  const moving = await s.call('PUT', '/v1/me/media/background', { token: a.token, body: { mime: 'image/gif', data: gif } });
  const served = await worker.fetch(new Request(moving.body.url), s.env);
  assert.equal(served.headers.get('Content-Type'), 'image/gif');
  assert.equal(Buffer.from(await served.arrayBuffer()).toString(), 'GIF89a');
  assert.equal((await s.call('PUT', '/v1/me/media/outra', { token: a.token, body: { mime: 'image/png', data: png } })).status, 404);
  // Apagar a conta leva as imagens
  await s.call('DELETE', '/v1/me', { token: a.token });
  assert.equal((await worker.fetch(new Request(second.body.url), s.env)).status, 404);
});

// ---------- GIF maior e vídeo de fundo (guarda de arquivos da VPS) ----------
const STORE_ORIGIN = 'https://arquivos.test';
const MEDIA_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const WEBM = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(60, 7)]);
const MP4 = Buffer.concat([Buffer.from('00000018', 'hex'), Buffer.from('ftypmp42'), Buffer.alloc(40, 3)]);
const BIG_GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(50, 1)]);
const PNG = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');

// Servidor da conta e guarda de arquivos ligados no mesmo processo, com a pasta num diretório temporário
function setupWithStore(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lazulium-media-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = createMediaStore({ dir, secret: MEDIA_SECRET, publicOrigin: STORE_ORIGIN, minFreeBytes: 0, ...options });
  const s = setup();
  Object.assign(s.env, { MEDIA_STORE_URL: STORE_ORIGIN, MEDIA_SECRET, MEDIA_STORE: store });
  const ticket = (token, mime, size) => s.call('POST', '/v1/me/media/background/upload', { token, body: { mime, size } });
  const put = (ticketText, mime, bytes) =>
    store.fetch(new Request(`${STORE_ORIGIN}/media/upload`, { method: 'PUT', headers: { Authorization: `Bearer ${ticketText}`, 'Content-Type': mime, 'Content-Length': String(bytes.length) }, body: bytes }));
  const send = async (token, mime, bytes) => {
    const issued = await ticket(token, mime, bytes.length);
    assert.equal(issued.status, 200);
    const res = await put(issued.body.ticket, mime, bytes);
    return { status: res.status, body: await res.json() };
  };
  const get = (url, headers = {}) => store.fetch(new Request(url, { headers }));
  const files = () => readdirSync(dir, { recursive: true }).filter((name) => /\.(gif|webm|mp4)$/.test(String(name)));
  return { ...s, dir, store, ticket, put, send, get, files };
}

const statusOf = async (response) => (await response).status;

test('arquivo grande: sem guarda configurada o servidor avisa e o resto segue igual', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  s.env.PROFILE_PAGE = PAGE;
  const a = await login(s, '76561198000000001');
  assert.equal((await s.call('POST', '/v1/me/media/background/upload', { token: a.token, body: { mime: 'video/webm', size: 100 } })).status, 501);
  // Endereço sem segredo (ou com segredo curto) não liga nada
  s.env.MEDIA_STORE_URL = STORE_ORIGIN;
  s.env.MEDIA_SECRET = 'curto';
  assert.equal((await s.call('POST', '/v1/me/media/background/upload', { token: a.token, body: { mime: 'video/webm', size: 100 } })).status, 501);
  await s.call('PUT', '/v1/me/showcase', { token: a.token, body: SHOWCASE });
  const link = await s.call('POST', `/v1/users/${a.user.id}/view`, { token: a.token });
  const pageRes = await worker.fetch(new Request(link.body.url), s.env);
  const csp = pageRes.headers.get('Content-Security-Policy');
  const html = await pageRes.text();
  assert.match(csp, /media-src https:\/\/\*\.steamstatic\.com;/);
  assert.match(html, /media-src https:\/\/\*\.steamstatic\.com;/);
  // Imagem comum e apagar a conta não dependem da tabela nova nem da VPS
  s.env.DB.raw.exec('DROP TABLE stored_media');
  assert.equal((await s.call('PUT', '/v1/me/media/background', { token: a.token, body: { mime: 'image/png', data: PNG } })).status, 200);
  assert.equal((await s.call('DELETE', '/v1/me', { token: a.token })).status, 200);
});

test('arquivo grande: bilhete só para fundo, GIF ou vídeo, dentro do limite', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setupWithStore(t);
  const a = await login(s, '76561198000000001');
  assert.equal((await s.call('POST', '/v1/me/media/background/upload', { body: { mime: 'video/webm', size: 100 } })).status, 401);
  assert.equal((await s.call('POST', '/v1/me/media/avatar/upload', { token: a.token, body: { mime: 'image/gif', size: 100 } })).status, 404);
  assert.equal((await s.ticket(a.token, 'image/png', 100)).status, 400);
  assert.equal((await s.ticket(a.token, 'video/webm', 0)).status, 400);
  assert.equal((await s.ticket(a.token, 'video/webm', 50 * 1024 * 1024 + 1)).status, 413);
  const ok = await s.ticket(a.token, 'video/mp4', 50 * 1024 * 1024);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.uploadUrl, `${STORE_ORIGIN}/media/upload`);
  assert.equal(ok.body.maxBytes, 50 * 1024 * 1024);
  const payload = await verifyTicket(MEDIA_SECRET, ok.body.ticket);
  assert.deepEqual({ a: payload.a, u: payload.u, k: payload.k }, { a: 'put', u: a.user.id, k: 'background' });
  assert.equal(await verifyTicket('outro-segredo-com-mais-de-32-caracteres!', ok.body.ticket), null);
});

test('arquivo grande: envio com bilhete, endereço público com faixas, troca o anterior', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setupWithStore(t);
  s.env.PROFILE_PAGE = PAGE;
  const a = await login(s, '76561198000000001');
  // A imagem pequena que estava no banco sai quando o vídeo toma o lugar
  const inline = await s.call('PUT', '/v1/me/media/background', { token: a.token, body: { mime: 'image/png', data: PNG } });
  const video = await s.send(a.token, 'video/webm', WEBM);
  assert.equal(video.status, 200);
  assert.match(video.body.url, new RegExp(`^${STORE_ORIGIN}/media/f/${a.user.id}/background-[A-Za-z0-9_-]+\\.webm$`));
  assert.equal((await worker.fetch(new Request(inline.body.url), s.env)).status, 404);

  const whole = await s.get(video.body.url);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('Content-Type'), 'video/webm');
  assert.equal(whole.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(whole.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(Buffer.from(await whole.arrayBuffer()), WEBM);
  const part = await s.get(video.body.url, { Range: 'bytes=4-9' });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('Content-Range'), `bytes 4-9/${WEBM.length}`);
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), WEBM.subarray(4, 10));
  const tail = await s.get(video.body.url, { Range: 'bytes=-8' });
  assert.equal(tail.headers.get('Content-Range'), `bytes ${WEBM.length - 8}-${WEBM.length - 1}/${WEBM.length}`);
  assert.equal((await tail.arrayBuffer()).byteLength, 8);
  const open = await s.get(video.body.url, { Range: 'bytes=60-' });
  assert.equal((await open.arrayBuffer()).byteLength, WEBM.length - 60);
  assert.equal(await statusOf(s.get(video.body.url, { Range: `bytes=${WEBM.length}-` })), 416);
  const head = await s.store.fetch(new Request(video.body.url, { method: 'HEAD' }));
  assert.equal(head.headers.get('Content-Length'), String(WEBM.length));

  // Outro envio troca o anterior: um arquivo por conta
  const gif = await s.send(a.token, 'image/gif', BIG_GIF);
  assert.match(gif.body.url, /\.gif$/);
  assert.equal(await statusOf(s.get(video.body.url)), 404);
  const servedGif = await s.get(gif.body.url);
  assert.equal(servedGif.headers.get('Content-Type'), 'image/gif');
  await servedGif.arrayBuffer();
  assert.equal((await s.send(a.token, 'video/mp4', MP4)).status, 200);
  assert.equal(s.files().length, 1);

  // A página do amigo pode tocar vídeo da guarda de arquivos (e da Steam), de mais nenhum lugar
  await s.call('PUT', '/v1/me/showcase', { token: a.token, body: SHOWCASE });
  const link = await s.call('POST', `/v1/users/${a.user.id}/view`, { token: a.token });
  const pageRes = await worker.fetch(new Request(link.body.url), s.env);
  const csp = pageRes.headers.get('Content-Security-Policy');
  const html = await pageRes.text();
  assert.match(csp, /media-src https:\/\/\*\.steamstatic\.com https:\/\/arquivos\.test;/);
  assert.match(html, /media-src https:\/\/\*\.steamstatic\.com https:\/\/arquivos\.test;/);
});

test('arquivo grande: a guarda recusa bilhete falso ou vencido, tipo trocado e arquivo acima do limite', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setupWithStore(t, { maxBytes: 200 });
  const a = await login(s, '76561198000000001');
  const { ticket } = (await s.ticket(a.token, 'video/webm', WEBM.length)).body;
  assert.equal(await statusOf(s.put('', 'video/webm', WEBM)), 401);
  assert.equal(await statusOf(s.put(`${ticket}x`, 'video/webm', WEBM)), 401);
  const forged = await signTicket('outro-segredo-com-mais-de-32-caracteres!', { a: 'put', u: a.user.id, k: 'background', e: Date.now() + 60_000, m: 200 });
  assert.equal(await statusOf(s.put(forged, 'video/webm', WEBM)), 401);
  const expired = await signTicket(MEDIA_SECRET, { a: 'put', u: a.user.id, k: 'background', e: Date.now() - 1, m: 200 });
  assert.equal(await statusOf(s.put(expired, 'video/webm', WEBM)), 401);
  // Bilhete de apagar não serve para enviar, nem o de enviar para apagar
  const del = await signTicket(MEDIA_SECRET, { a: 'del', u: a.user.id, k: 'background', e: Date.now() + 60_000 });
  assert.equal(await statusOf(s.put(del, 'video/webm', WEBM)), 401);
  assert.equal(await statusOf(s.store.fetch(new Request(`${STORE_ORIGIN}/media/purge`, { method: 'POST', headers: { Authorization: `Bearer ${ticket}` } }))), 401);
  // O conteúdo precisa ser do tipo anunciado
  assert.equal(await statusOf(s.put(ticket, 'text/html', WEBM)), 400);
  assert.equal(await statusOf(s.put(ticket, 'video/webm', Buffer.from('<html><script>alert(1)</script></html>'))), 400);
  assert.equal(await statusOf(s.put(ticket, 'video/mp4', WEBM)), 400);
  assert.equal(await statusOf(s.put(ticket, 'image/gif', Buffer.from('GIF'))), 400);
  // Limite: pelo tamanho anunciado e pelo que chega de verdade
  const big = Buffer.concat([WEBM, Buffer.alloc(200)]);
  assert.equal(await statusOf(s.put(ticket, 'video/webm', big)), 413);
  const unannounced = new Request(`${STORE_ORIGIN}/media/upload`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${ticket}`, 'Content-Type': 'video/webm' },
    body: new Blob([big]).stream(),
    duplex: 'half'
  });
  assert.equal(await statusOf(s.store.fetch(unannounced)), 413);
  assert.equal(s.files().length, 0);
  assert.deepEqual(readdirSync(s.dir).filter((name) => name.startsWith('.tmp-')), [], 'nada de sobra de envio recusado');
  // Caminho fora do padrão não sai da pasta; rota de outro servidor não é com a guarda
  assert.equal(await statusOf(s.get(`${STORE_ORIGIN}/media/f/${a.user.id}/..%2F..%2Fsegredo.mp4`)), 404);
  assert.equal(await s.store.fetch(new Request(`${STORE_ORIGIN}/v1/me`)), null);
});

test('arquivo grande: sem espaço em disco a guarda recusa', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setupWithStore(t, { minFreeBytes: Number.MAX_SAFE_INTEGER });
  const a = await login(s, '76561198000000001');
  assert.equal((await s.send(a.token, 'video/webm', WEBM)).status, 507);
});

test('arquivo grande: imagem nova, tirar o fundo e apagar a conta levam o arquivo da VPS', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setupWithStore(t);
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  const rows = () => s.env.DB.raw.prepare('SELECT user_id, purge FROM stored_media ORDER BY user_id').all();

  // Voltar para uma imagem comum apaga o vídeo
  const first = await s.send(a.token, 'video/webm', WEBM);
  await s.call('PUT', '/v1/me/media/background', { token: a.token, body: { mime: 'image/png', data: PNG } });
  assert.equal(await statusOf(s.get(first.body.url)), 404);
  assert.equal(rows().length, 0);
  // Tirar o fundo também
  const second = await s.send(a.token, 'video/webm', WEBM);
  assert.equal((await s.call('DELETE', '/v1/me/media/background', { token: a.token })).status, 200);
  assert.equal(await statusOf(s.get(second.body.url)), 404);
  // Avatar novo não mexe no fundo
  const third = await s.send(a.token, 'video/webm', WEBM);
  await s.call('PUT', '/v1/me/media/avatar', { token: a.token, body: { mime: 'image/png', data: PNG } });
  assert.equal(s.files().length, 1);
  // Apagar a conta leva o arquivo dela e só o dela
  const other = await s.send(b.token, 'image/gif', BIG_GIF);
  assert.equal((await s.call('DELETE', '/v1/me', { token: a.token })).status, 200);
  assert.equal(await statusOf(s.get(third.body.url)), 404);
  assert.deepEqual(s.files().map((name) => String(name).replace(/\\/g, '/')), [new URL(other.body.url).pathname.replace('/media/f/', '')]);
  assert.deepEqual(rows().map((r) => r.user_id), [b.user.id]);
});

test('arquivo grande: VPS fora do ar não impede apagar a conta; o pedido é repetido depois', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setupWithStore(t);
  const a = await login(s, '76561198000000001');
  const sent = await s.send(a.token, 'video/webm', WEBM);
  const working = s.env.MEDIA_STORE;
  s.env.MEDIA_STORE = {
    fetch: async () => {
      throw new Error('fora do ar');
    }
  };
  assert.equal((await s.call('DELETE', '/v1/me', { token: a.token })).status, 200);
  assert.equal((await s.call('GET', '/v1/me', { token: a.token })).status, 401);
  assert.equal(s.env.DB.raw.prepare('SELECT purge FROM stored_media').get().purge, 1);
  assert.equal(s.files().length, 1, 'o arquivo ainda está lá');
  // Ainda fora do ar: continua anotado
  await worker.scheduled(null, s.env);
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM stored_media').get().n, 1);
  // Voltou: a rodada de hora em hora apaga e dá baixa
  s.env.MEDIA_STORE = working;
  assert.equal(await retryPurges(s.env), 1);
  assert.equal(await statusOf(working.fetch(new Request(sent.body.url))), 404);
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM stored_media').get().n, 0);
  assert.equal(s.files().length, 0);
});
