import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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

test('login: campo repetido não entra como outra conta (SteamID da vítima antes da resposta real)', async (t) => {
  const steam = fakeSteam(); // a Steam confirmaria a assinatura da conta de quem ataca
  t.after(steam.restore);
  const s = setup();
  const victim = 'https://steamcommunity.com/openid/id/76561198000000077';
  const prefixes = [
    { 'openid.claimed_id': victim, 'openid.identity': victim },
    { 'openid.return_to': `${ORIGIN}/v1/auth/steam/callback?port=${PORT}&state=${STATE}` },
    { 'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle' }
  ];
  for (const prefix of prefixes) {
    const query = `${new URLSearchParams(prefix)}&${steamReturn('76561198000000001')}`;
    const res = await worker.fetch(new Request(`${ORIGIN}/v1/auth/steam/callback?${query}`), s.env);
    const back = new URL(res.headers.get('Location'));
    assert.equal(back.searchParams.get('error'), 'not_verified');
    assert.equal(back.searchParams.get('code'), null);
  }
  // port ou state repetidos também param antes de tudo
  const dupState = `state=outro-estado-0987654321&${steamReturn('76561198000000001')}`;
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/v1/auth/steam/callback?${dupState}`), s.env)).status, 400);
  assert.equal(steam.calls.length, 0, 'nem chega a perguntar à Steam');
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
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
  assert.match(res.headers.get('Content-Security-Policy') ?? '', /default-src 'none'.*connect-src 'self'/);
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

test('status: amigos veem ausente e não perturbar; invisível aparece off-line e sem jogo', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b);
  const friendOfA = async () => (await s.call('GET', '/v1/friends', { token: a.token })).body.friends[0];
  assert.equal((await friendOfA()).presence, 'online');

  await s.call('PUT', '/v1/me/presence', { token: b.token, body: { status: 'dnd' } });
  assert.equal((await friendOfA()).presence, 'dnd');
  assert.equal((await s.call('GET', `/v1/users/${b.user.id}`, { token: a.token })).body.user.presence, 'dnd');

  await s.call('PUT', '/v1/me/now-playing', { token: b.token, body: { gameKey: 'steam:620', gameTitle: 'Portal 2' } });
  await s.call('PUT', '/v1/me/presence', { token: b.token, body: { status: 'invisible' } });
  const hidden = await friendOfA();
  assert.equal(hidden.presence, 'offline');
  assert.equal(hidden.nowPlaying, null);
  // Nem o perfil entrega
  const profile = (await s.call('GET', `/v1/users/${b.user.id}`, { token: a.token })).body;
  assert.equal(profile.user.presence, 'offline');
  assert.equal(profile.nowPlaying, null);

  // Prazo vencido volta para online
  await s.call('PUT', '/v1/me/presence', { token: b.token, body: { status: 'away', until: new Date(Date.now() + 60_000).toISOString() } });
  assert.equal((await friendOfA()).presence, 'away');
  s.env.DB.raw.prepare('UPDATE presence SET until = ? WHERE user_id = ?').run(new Date(Date.now() - 1000).toISOString(), b.user.id);
  assert.equal((await friendOfA()).presence, 'online');

  assert.equal((await s.call('PUT', '/v1/me/presence', { token: b.token, body: { status: 'ocupadíssimo' } })).status, 400);
});

test('chamar pra call: só amigos, chega uma vez, resposta volta para quem chamou', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  const c = await login(s, '76561198000000003');
  await befriend(s, a, b);

  assert.equal((await s.call('POST', '/v1/calls', { token: a.token, body: { to: c.user.id } })).status, 404);
  assert.equal((await s.call('POST', '/v1/calls', { token: a.token, body: { to: a.user.id } })).status, 400);

  const sent = await s.call('POST', '/v1/calls', { token: a.token, body: { to: b.user.id } });
  assert.equal(sent.status, 200);
  // Segunda chamada seguida para o mesmo amigo espera
  const again = await s.call('POST', '/v1/calls', { token: a.token, body: { to: b.user.id } });
  assert.equal(again.status, 429);
  assert.equal(again.body.error, 'call_cooldown');
  assert.ok(again.body.retryAfterSeconds > 0);

  const inbox = (await s.call('GET', '/v1/calls', { token: b.token })).body;
  assert.equal(inbox.incoming.length, 1);
  assert.equal(inbox.incoming[0].from.id, a.user.id);
  assert.equal(inbox.incoming[0].missed, false);
  assert.equal((await s.call('GET', '/v1/calls', { token: b.token })).body.incoming.length, 0);

  // Só quem recebeu responde; a primeira resposta vale
  const callId = sent.body.call.id;
  assert.equal((await s.call('POST', `/v1/calls/${callId}/answer`, { token: c.token, body: { answer: 'yes' } })).status, 404);
  assert.equal((await s.call('POST', `/v1/calls/${callId}/answer`, { token: b.token, body: { answer: 'talvez' } })).status, 400);
  await s.call('POST', `/v1/calls/${callId}/answer`, { token: b.token, body: { answer: 'yes' } });
  assert.equal((await s.call('POST', `/v1/calls/${callId}/answer`, { token: b.token, body: { answer: 'no' } })).body.answer, 'yes');

  const answers = (await s.call('GET', '/v1/calls', { token: a.token })).body.answers;
  assert.deepEqual(answers.map((x) => [x.user.id, x.answer]), [[b.user.id, 'yes']]);
  assert.equal((await s.call('GET', '/v1/calls', { token: a.token })).body.answers.length, 0);

  // Desligar: só quem chamou. Antes de tocar, a chamada nem chega; depois de tocar, o outro lado fica sabendo uma vez
  const old = (id, ms) => s.env.DB.raw.prepare('UPDATE calls SET created_at = ? WHERE id = ?').run(new Date(Date.now() - ms).toISOString(), id);
  old(callId, 60_000); // a do "yes" já não conta para o intervalo entre chamadas
  const second = (await s.call('POST', '/v1/calls', { token: a.token, body: { to: b.user.id } })).body.call.id;
  assert.equal((await s.call('POST', `/v1/calls/${second}/cancel`, { token: b.token })).status, 404);
  assert.equal((await s.call('POST', `/v1/calls/${second}/cancel`, { token: a.token })).body.answer, 'cancelled');
  const afterCancel = (await s.call('GET', '/v1/calls', { token: b.token })).body;
  assert.equal(afterCancel.incoming.length, 0);
  assert.deepEqual(afterCancel.cancelled, []);
  assert.equal((await s.call('GET', '/v1/calls', { token: a.token })).body.answers.length, 0, 'desligar não vira resposta');

  old(second, 60_000);
  const third = (await s.call('POST', '/v1/calls', { token: a.token, body: { to: b.user.id } })).body.call.id;
  assert.equal((await s.call('GET', '/v1/calls', { token: a.token })).body.rang.length, 0, 'ainda não tocou');
  assert.equal((await s.call('GET', '/v1/calls', { token: b.token })).body.incoming[0].id, third);
  const ringingNow = (await s.call('GET', '/v1/calls', { token: a.token })).body.rang;
  assert.deepEqual(ringingNow.map((r) => [r.id, r.user.id]), [[third, b.user.id]]);
  await s.call('POST', `/v1/calls/${third}/cancel`, { token: a.token });
  assert.deepEqual((await s.call('GET', '/v1/calls', { token: b.token })).body.cancelled, [third]);
  assert.deepEqual((await s.call('GET', '/v1/calls', { token: b.token })).body.cancelled, [], 'uma vez só');
  assert.equal((await s.call('GET', '/v1/calls', { token: a.token })).body.rang.length, 0, 'desligada não toca mais');
  // Resposta depois de desligar não muda nada
  assert.equal((await s.call('POST', `/v1/calls/${third}/answer`, { token: b.token, body: { answer: 'yes' } })).body.answer, 'cancelled');

  // Chamada antiga chega como perdida
  s.env.DB.raw.prepare('UPDATE calls SET created_at = ?, delivered_at = NULL, answer = NULL WHERE id = ?').run(new Date(Date.now() - 5 * 60_000).toISOString(), callId);
  assert.equal((await s.call('GET', '/v1/calls', { token: b.token })).body.incoming[0].missed, true);

  // Apagar a conta leva as chamadas
  await s.call('DELETE', '/v1/me', { token: b.token });
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM calls').get().n, 0);
});

test('biblioteca resumida: amigos no jogo, por AppID ou nome, com as chaves de privacidade', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  const c = await login(s, '76561198000000003');
  await befriend(s, a, b);

  const portal = {
    titleKey: 't:portal2',
    steamKey: 'steam:620',
    title: 'Portal 2',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/620/library_600x900.jpg',
    playtimeSeconds: 36_000,
    lastPlayedAt: '2026-11-10T20:00:00.000Z',
    status: 'completed',
    rating: 4.5,
    review: 'Melhor co-op que existe.',
    reviewAt: '2026-11-11T10:00:00.000Z',
    achievements: { source: 'steam', unlocked: 2, total: 51, ids: { ACH_WAKE_UP: 1762000000, ACH_LASER: 0 } }
  };
  const lixo = { titleKey: 'nada disso', title: 'x' };
  const sent = await s.call('POST', '/v1/me/library', { token: b.token, body: { reset: true, games: [portal, lixo, { titleKey: 't:hades', title: 'Hades', playtimeSeconds: 600 }] } });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.accepted, 2);

  // Pelo AppID (minha cópia é da Steam) ou pelo nome (minha cópia é de outra loja)
  for (const query of ['key=steam:620', 'key=t:portal2', 'key=t:outronome&key=steam:620']) {
    const res = await s.call('GET', `/v1/games/friends?${query}`, { token: a.token });
    assert.equal(res.status, 200, query);
    assert.equal(res.body.friends.length, 1, query);
  }
  const [friend] = (await s.call('GET', '/v1/games/friends?key=t:portal2', { token: a.token })).body.friends;
  assert.equal(friend.user.id, b.user.id);
  assert.equal(friend.playtimeSeconds, 36_000);
  assert.equal(friend.rating, 4.5);
  assert.equal(friend.status, 'completed');
  assert.equal(friend.review, 'Melhor co-op que existe.');
  assert.deepEqual(friend.achievements, { source: 'steam', unlocked: 2, total: 51, ids: { ACH_WAKE_UP: 1762000000, ACH_LASER: 0 } });
  assert.equal(friend.playingNow, false);

  // Jogando agora este jogo
  await s.call('PUT', '/v1/me/now-playing', { token: b.token, body: { gameKey: 'steam:620', gameTitle: 'Portal 2' } });
  assert.equal((await s.call('GET', '/v1/games/friends?key=t:portal2', { token: a.token })).body.friends[0].playingNow, true);

  // Quem não é amigo não vê; chave inválida é recusada
  assert.equal((await s.call('GET', '/v1/games/friends?key=t:portal2', { token: c.token })).body.friends.length, 0);
  assert.equal((await s.call('GET', '/v1/games/friends?key=portal', { token: a.token })).status, 400);
  assert.equal((await s.call('GET', `/v1/users/${b.user.id}/games`, { token: c.token })).status, 404);

  // Comparar: a biblioteca inteira, sem resenha nem lista de conquistas
  const library = (await s.call('GET', `/v1/users/${b.user.id}/games`, { token: a.token })).body.games;
  assert.deepEqual(library.map((g) => g.title), ['Portal 2', 'Hades']);
  assert.equal(library[0].review, undefined);
  assert.equal(library[0].achievements.ids, undefined);
  assert.equal(library[0].steamKey, 'steam:620');

  // Chaves desligadas escondem horas, notas e conquistas
  await s.call('PATCH', '/v1/me', { token: b.token, body: { settings: { sharePlaytime: false, shareReviews: false, shareAchievements: false } } });
  const quiet = (await s.call('GET', '/v1/games/friends?key=t:portal2', { token: a.token })).body.friends[0];
  for (const field of ['playtimeSeconds', 'lastPlayedAt', 'rating', 'status', 'review', 'achievements']) assert.equal(quiet[field], undefined, field);

  // Remover um jogo
  await s.call('POST', '/v1/me/library', { token: b.token, body: { removed: ['t:hades'] } });
  assert.equal((await s.call('GET', '/v1/games/friends?key=t:hades', { token: a.token })).body.friends.length, 0);

  // Vitrine desligada: some do servidor e novos envios são ignorados
  await s.call('PATCH', '/v1/me', { token: b.token, body: { settings: { shareProfile: false } } });
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM library_games WHERE user_id = ?').get(b.user.id).n, 0);
  assert.equal((await s.call('POST', '/v1/me/library', { token: b.token, body: { games: [portal] } })).body.shared, false);
  assert.equal((await s.call('GET', '/v1/games/friends?key=t:portal2', { token: a.token })).body.friends.length, 0);

  // Apagar a conta leva junto
  await s.call('PATCH', '/v1/me', { token: b.token, body: { settings: { shareProfile: true } } });
  await s.call('POST', '/v1/me/library', { token: b.token, body: { games: [portal] } });
  await s.call('DELETE', '/v1/me', { token: b.token });
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM library_games').get().n, 0);
});

test('imagens das resenhas: envio uma vez por imagem, endereço público, resenha dos amigos com imagens e limpeza', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b);

  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(40, 7)]).toString('base64');
  const id = 'abcdef0123456789.webp';
  const first = await s.call('PUT', `/v1/me/review-images/${id}`, { token: b.token, body: { data: webp } });
  assert.equal(first.status, 200);
  assert.match(first.body.url, /^https:\/\/social\.test\/v1\/review-images\/[A-Za-z0-9_-]{32}$/);
  // De novo (outro PC): mesmo endereço, sem duplicar
  const again = await s.call('PUT', `/v1/me/review-images/${id}`, { token: b.token, body: { data: webp } });
  assert.equal(again.body.url, first.body.url);
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM review_images').get().n, 1);
  assert.deepEqual((await s.call('GET', '/v1/me/review-images', { token: b.token })).body.images, [{ id, url: first.body.url }]);
  assert.deepEqual((await s.call('GET', '/v1/me/review-images', { token: a.token })).body.images, []);

  // Público, como as outras imagens da vitrine
  const res = await worker.fetch(new Request(first.body.url), s.env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'image/webp');
  assert.equal(Buffer.from(await res.arrayBuffer()).toString('base64'), webp);

  // Nome inválido, bytes que não são da imagem e PNG disfarçado são recusados
  assert.equal((await s.call('PUT', '/v1/me/review-images/../x.webp', { token: b.token, body: { data: webp } })).status, 404);
  assert.equal((await s.call('PUT', '/v1/me/review-images/0123456789abcdef.png', { token: b.token, body: { data: webp } })).status, 404);
  const png = Buffer.from('\x89PNG\r\n\x1a\n0000000000000000').toString('base64');
  assert.equal((await s.call('PUT', '/v1/me/review-images/0123456789abcdef.webp', { token: b.token, body: { data: png } })).status, 400);
  assert.equal((await s.call('PUT', '/v1/me/review-images/0123456789abcdef.gif', { token: b.token, body: { data: webp } })).status, 400);
  // Base64 com tamanho quebrado (não decodifica): recusado na entrada, não quebra ao servir
  assert.equal((await s.call('PUT', '/v1/me/review-images/0123456789abcdef.webp', { token: b.token, body: { data: webp.slice(0, 41) } })).status, 400);
  assert.match(res.headers.get('Content-Security-Policy') ?? '', /sandbox/);

  // Resenha com imagem no meio; endereço de fora vira nada, posição além do texto vai para o fim
  const review = 'Primeiro parágrafo.\n\nSegundo.';
  const game = {
    titleKey: 't:celeste',
    title: 'Celeste',
    playtimeSeconds: 3600,
    rating: 5,
    review,
    reviewImages: [
      { at: 19, url: first.body.url, width: 1600, height: 900 },
      { at: 5, url: 'https://evil.example/x.png', width: 10, height: 10 },
      { at: 9999, url: first.body.url }
    ]
  };
  await s.call('POST', '/v1/me/library', { token: b.token, body: { reset: true, games: [game, { titleKey: 't:soimagem', title: 'Só imagem', playtimeSeconds: 60, reviewImages: [{ at: 0, url: first.body.url }] }] } });
  const [friend] = (await s.call('GET', '/v1/games/friends?key=t:celeste', { token: a.token })).body.friends;
  assert.equal(friend.review, review);
  assert.deepEqual(friend.reviewImages, [
    { at: 19, url: first.body.url, width: 1600, height: 900 },
    { at: review.length, url: first.body.url }
  ]);
  // Feed e perfil do amigo também trazem as imagens anexadas nas resenhas
  await s.call('POST', '/v1/me/activities', {
    token: b.token,
    body: { events: [event({ id: 'rev-celeste', kind: 'reviewed', gameKey: 't:celeste', gameTitle: 'Celeste', rating: 5, text: review })] }
  });
  const feedWithImgs = (await s.call('GET', '/v1/feed', { token: a.token })).body.items;
  assert.equal(feedWithImgs[0].reviewImages.length, 2);
  assert.equal(feedWithImgs[0].reviewImages[0].url, first.body.url);
  const profileWithImgs = (await s.call('GET', `/v1/users/${b.user.id}`, { token: a.token })).body.activities;
  assert.equal(profileWithImgs[0].reviewImages.length, 2);
  // Resenha só com imagem também aparece
  const [onlyImage] = (await s.call('GET', '/v1/games/friends?key=t:soimagem', { token: a.token })).body.friends;
  assert.equal(onlyImage.review, '');
  assert.equal(onlyImage.reviewImages.length, 1);
  // Comparar não leva resenha nem imagens; resenhas desligadas escondem as imagens
  assert.equal((await s.call('GET', `/v1/users/${b.user.id}/games`, { token: a.token })).body.games[0].reviewImages, undefined);
  await s.call('PATCH', '/v1/me', { token: b.token, body: { settings: { shareReviews: false } } });
  assert.equal((await s.call('GET', '/v1/games/friends?key=t:celeste', { token: a.token })).body.friends[0].reviewImages, undefined);
  assert.equal((await s.call('GET', '/v1/feed', { token: a.token })).body.items.length, 0);
  await s.call('PATCH', '/v1/me', { token: b.token, body: { settings: { shareReviews: true } } });

  // Apagar uma imagem e apagar a conta
  assert.equal((await s.call('DELETE', `/v1/me/review-images/${id}`, { token: b.token })).status, 200);
  assert.equal((await worker.fetch(new Request(first.body.url), s.env)).status, 404);
  await s.call('PUT', `/v1/me/review-images/${id}`, { token: b.token, body: { data: webp } });
  await s.call('DELETE', '/v1/me', { token: b.token });
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM review_images').get().n, 0);
});

test('imagens das resenhas: limite por pessoa', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const big = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(500_000, 1)]).toString('base64');
  let full = null;
  for (let i = 0; i < 70 && !full; i++) {
    const res = await s.call('PUT', `/v1/me/review-images/${i.toString(16).padStart(16, '0')}.webp`, { token: a.token, body: { data: big } });
    if (res.status !== 200) full = res;
  }
  assert.equal(full?.status, 413);
  assert.equal(full.body.error, 'review_images_full');
  // Grande demais para uma imagem só
  const huge = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(600_000, 1)]).toString('base64');
  assert.equal((await s.call('PUT', '/v1/me/review-images/ffffffffffffffff.webp', { token: a.token, body: { data: huge } })).status, 413);
});

test('curtidas e comentários: só amigos do dono, contagens, avisos e respostas; a vitrine comenta pelo link', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  s.env.PROFILE_PAGE = PAGE;
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  const c = await login(s, '76561198000000003');
  const d = await login(s, '76561198000000004');
  await befriend(s, a, b);
  await befriend(s, a, c);
  const review = { owner: a.user.id, kind: 'review', target: 't:hades', title: 'Hades' };
  const list = { owner: a.user.id, kind: 'list', target: '0b6f7f0e-2f7a-4c55-9d7a-1f0a3c1d2e3f', title: 'Top 10' };

  // Quem não é amigo do dono não curte nem vê
  assert.equal((await s.call('POST', '/v1/social/like', { token: d.token, body: review })).status, 404);
  assert.equal((await s.call('GET', `/v1/social/thread?owner=${a.user.id}&kind=review&target=t:hades`, { token: d.token })).status, 404);
  assert.equal((await s.call('POST', '/v1/social/like', { token: b.token, body: { ...review, target: 'hades' } })).status, 400);

  assert.deepEqual((await s.call('POST', '/v1/social/like', { token: b.token, body: review })).body, { likes: 1, liked: true, comments: 0 });
  await s.call('POST', '/v1/social/like', { token: c.token, body: review });
  await s.call('POST', '/v1/social/like', { token: b.token, body: review }); // de novo não conta duas vezes
  const commented = await s.call('POST', '/v1/social/comments', { token: b.token, body: { ...review, text: '  Melhor roguelike!\u0007\n\n\n\nconcordo?  ' } });
  assert.equal(commented.status, 200);
  assert.equal(commented.body.comments[0].text, 'Melhor roguelike! \n\nconcordo?');
  assert.equal((await s.call('POST', '/v1/social/comments', { token: b.token, body: { ...review, text: '   ' } })).status, 400);

  // C, amigo do dono mas não de B, vê o comentário de B; e responde
  const thread = (await s.call('GET', `/v1/social/thread?owner=${a.user.id}&kind=review&target=t:hades`, { token: c.token })).body;
  assert.equal(thread.likes, 2);
  assert.equal(thread.liked, true);
  assert.equal(thread.comments[0].user.id, b.user.id);
  assert.equal(thread.likers.length, 2);
  await s.call('POST', '/v1/social/comments', { token: c.token, body: { ...review, text: 'Concordo' } });
  await s.call('POST', '/v1/social/like', { token: b.token, body: list });

  // Contagens de vários alvos (os de quem não é amigo ficam de fora)
  const summary = (await s.call('POST', '/v1/social/summary', { token: b.token, body: { targets: [review, list, { owner: d.user.id, kind: 'review', target: 't:x' }] } })).body.items;
  assert.deepEqual(summary[`${a.user.id}|review|t:hades`], { likes: 2, liked: true, comments: 2 });
  assert.deepEqual(summary[`${a.user.id}|list|${list.target}`], { likes: 1, liked: true, comments: 0 });
  assert.equal(Object.keys(summary).length, 2);

  // Avisos do dono: curtidas e comentários dos outros; B recebe a resposta de C
  const mine = (await s.call('GET', '/v1/me/notifications', { token: a.token })).body.items;
  assert.equal(mine.filter((n) => n.type === 'like').length, 3);
  assert.equal(mine.filter((n) => n.type === 'comment').length, 2);
  // O título mandado por quem curte não vale: a lista não está no servidor, então o aviso vem sem nome
  assert.equal(mine.find((n) => n.type === 'like' && n.kind === 'list').title, null);
  const forB = (await s.call('GET', '/v1/me/notifications', { token: b.token })).body.items;
  assert.equal(forB.length, 1);
  assert.equal(forB[0].type, 'reply');
  assert.equal(forB[0].user.id, c.user.id);
  const later = new Date(Date.now() + 1000).toISOString();
  assert.equal((await s.call('GET', `/v1/me/notifications?since=${later}`, { token: a.token })).body.items.length, 0);

  // Apagar: quem escreveu ou o dono; os outros não
  const commentId = thread.comments[0].id;
  assert.equal((await s.call('DELETE', `/v1/social/comments/${commentId}`, { token: c.token })).status, 404);
  assert.equal((await s.call('DELETE', `/v1/social/comments/${commentId}`, { token: a.token })).body.comments.length, 1);
  // Descurtir
  assert.equal((await s.call('POST', '/v1/social/like', { token: c.token, body: { ...review, like: false } })).body.likes, 1);

  // Vitrine aberta por B: a página comenta como B, sem o token da conta
  await s.call('PUT', '/v1/me/showcase', { token: a.token, body: SHOWCASE });
  const link = (await s.call('POST', `/v1/users/${a.user.id}/view`, { token: b.token })).body.url;
  const html = await (await worker.fetch(new Request(link), s.env)).text();
  assert.match(html, new RegExp(`"viewerId":"${b.user.id}"`));
  assert.ok(!html.includes(b.token));
  const viaPage = await worker.fetch(
    new Request(`${link}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...list, text: 'Lista boa' }) }),
    s.env
  );
  assert.equal(viaPage.status, 200);
  assert.equal((await viaPage.json()).comments[0].user.id, b.user.id);
  assert.equal((await worker.fetch(new Request(`https://social.test/v1/view/${'x'.repeat(30)}/like`, { method: 'POST', body: JSON.stringify(list) }), s.env)).status, 401);

  // O link da vitrine de A só vale na vitrine de A: nada em C, mesmo C sendo amigo de B
  await befriend(s, b, c);
  const other = { owner: c.user.id, kind: 'review', target: 't:celeste', title: 'Celeste' };
  const viaLink = (path, init = {}) => worker.fetch(new Request(`${link}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init }), s.env);
  assert.equal((await viaLink('/like', { method: 'POST', body: JSON.stringify(other) })).status, 404);
  assert.equal((await viaLink('/comments', { method: 'POST', body: JSON.stringify({ ...other, text: 'oi' }) })).status, 404);
  assert.equal((await viaLink(`/thread?owner=${c.user.id}&kind=review&target=t:celeste`)).status, 404);
  const scoped = await (await viaLink('/summary', { method: 'POST', body: JSON.stringify({ targets: [list, other] }) })).json();
  assert.deepEqual(Object.keys(scoped.items), [`${a.user.id}|list|${list.target}`]);
  // Comentário de B em C: apaga pela conta, nunca pelo link da vitrine de A
  const onC = (await s.call('POST', '/v1/social/comments', { token: b.token, body: { ...other, text: 'Que jogo' } })).body.comments[0].id;
  assert.equal((await viaLink(`/comments/${onC}`, { method: 'DELETE' })).status, 404);
  assert.equal((await s.call('DELETE', `/v1/social/comments/${onC}`, { token: b.token })).status, 200);
  assert.equal(s.env.DB.raw.prepare("SELECT COUNT(*) AS n FROM reactions WHERE owner_id = ?").get(c.user.id).n, 0);

  // Apagar a conta leva curtidas e comentários dela
  await s.call('DELETE', '/v1/me', { token: b.token });
  const left = s.env.DB.raw.prepare('SELECT (SELECT COUNT(*) FROM reactions WHERE user_id = ?1) + (SELECT COUNT(*) FROM comments WHERE user_id = ?1) AS n').get(b.user.id);
  assert.equal(left.n, 0);
});

test('listas em grupo: só amigos entram, edição atômica, reordenação segura e limpeza ao desfazer amizade ou apagar conta', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000011');
  const b = await login(s, '76561198000000012');
  const c = await login(s, '76561198000000013');
  const d = await login(s, '76561198000000014'); // não é amigo de ninguém
  await befriend(s, a, b);
  await befriend(s, a, c);

  // Não cria com título vazio nem convidando quem não é amigo
  assert.equal((await s.call('POST', '/v1/group-lists', { token: a.token, body: { title: '   ' } })).status, 400);
  const badInvite = await s.call('POST', '/v1/group-lists', { token: a.token, body: { title: 'Co-op', memberIds: [b.user.id, d.user.id] } });
  assert.equal(badInvite.status, 400);
  assert.equal(badInvite.body.error, 'not_friends');

  // A cria lista em grupo com B
  const created = await s.call('POST', '/v1/group-lists', {
    token: a.token,
    body: { title: 'Para jogar juntos', description: 'Campanhas\n\n\n\nboas', ranked: true, memberIds: [b.user.id] }
  });
  assert.equal(created.status, 201);
  const listId = created.body.list.id;
  assert.equal(created.body.list.owner.id, a.user.id);
  assert.equal(created.body.list.ranked, true);
  assert.equal(created.body.list.description, 'Campanhas\n\nboas');
  assert.deepEqual(created.body.list.members.map((m) => m.id), [b.user.id]);

  // C e D ainda não são membros (404, não vaza existência)
  assert.equal((await s.call('GET', `/v1/group-lists/${listId}`, { token: c.token })).status, 404);
  assert.equal((await s.call('GET', `/v1/group-lists/${listId}`, { token: d.token })).status, 404);
  assert.equal((await s.call('GET', '/v1/group-lists', { token: d.token })).body.lists.length, 0);

  // A convida C (e tenta convidar D sem ser amigo)
  assert.equal((await s.call('POST', `/v1/group-lists/${listId}/members`, { token: a.token, body: { userId: d.user.id } })).body.error, 'not_friends');
  const invitedC = await s.call('POST', `/v1/group-lists/${listId}/members`, { token: a.token, body: { userId: c.user.id } });
  assert.equal(invitedC.status, 200);
  assert.equal(invitedC.body.list.members.length, 2);

  // Participantes enxergam e adicionam jogos (título normalizado + steamKey + capa segura)
  assert.equal((await s.call('GET', '/v1/group-lists', { token: b.token })).body.lists.length, 1);
  const hades = {
    title: 'Hades',
    titleKey: 't:hades',
    steamKey: 'steam:1145360',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/library_600x900.jpg'
  };
  const celeste = {
    title: 'Celeste',
    titleKey: 't:celeste',
    coverUrl: 'https://evil.example/fake.jpg' // fora das CDNs permitidas -> null
  };
  const portal = {
    title: 'Portal 2',
    titleKey: 't:portal2',
    steamKey: 'steam:620'
  };
  const afterHades = await s.call('POST', `/v1/group-lists/${listId}/games`, { token: b.token, body: hades });
  assert.equal(afterHades.status, 200);
  assert.equal(afterHades.body.list.items[0].addedBy.id, b.user.id);
  const afterCeleste = await s.call('POST', `/v1/group-lists/${listId}/games`, { token: c.token, body: celeste });
  assert.equal(afterCeleste.body.list.items[1].coverUrl, null);
  assert.equal(afterCeleste.body.list.items[1].addedBy.id, c.user.id);

  // B adiciona Portal 2 enquanto C reordena só os 2 anteriores: o jogo novo de B não some
  await s.call('POST', `/v1/group-lists/${listId}/games`, { token: b.token, body: portal });
  const reordered = await s.call('PUT', `/v1/group-lists/${listId}/order`, {
    token: c.token,
    body: { titleKeys: ['t:celeste', 't:hades'] }
  });
  assert.deepEqual(
    reordered.body.list.items.map((i) => i.titleKey),
    ['t:celeste', 't:hades', 't:portal2']
  );

  // B (não dono) não edita nome/convite/expulsão/exclusão (403)
  assert.equal((await s.call('PATCH', `/v1/group-lists/${listId}`, { token: b.token, body: { title: 'Outro' } })).status, 403);
  assert.equal((await s.call('POST', `/v1/group-lists/${listId}/members`, { token: b.token, body: { userId: d.user.id } })).status, 403);
  assert.equal((await s.call('DELETE', `/v1/group-lists/${listId}/members/${c.user.id}`, { token: b.token })).status, 403);
  assert.equal((await s.call('DELETE', `/v1/group-lists/${listId}`, { token: b.token })).status, 403);

  // Participante remove um jogo
  const removedGame = await s.call('DELETE', `/v1/group-lists/${listId}/games/${encodeURIComponent('t:hades')}`, { token: b.token });
  assert.deepEqual(removedGame.body.list.items.map((i) => i.titleKey), ['t:celeste', 't:portal2']);

  // Curtidas e comentários usam kind: 'list'
  const react = await s.call('POST', '/v1/social/comments', { token: b.token, body: { owner: a.user.id, kind: 'list', target: listId, title: 'Para jogar juntos', text: 'Bora!' } });
  assert.equal(react.status, 200);
  assert.equal(react.body.comments.length, 1);

  // C apaga a conta -> sai da lista e addedBy dos jogos de C vira null, mas a lista de A continua intacta
  await s.call('DELETE', '/v1/me', { token: c.user.id ? c.token : '' });
  const afterCDelete = (await s.call('GET', `/v1/group-lists/${listId}`, { token: a.token })).body.list;
  assert.deepEqual(afterCDelete.members.map((m) => m.id), [b.user.id]);
  assert.equal(afterCDelete.items.find((i) => i.titleKey === 't:celeste').addedBy, null);

  // Desfazer amizade tira o acesso na hora
  await s.call('DELETE', `/v1/friends/${b.user.id}`, { token: a.token });
  assert.equal((await s.call('GET', `/v1/group-lists/${listId}`, { token: b.token })).status, 404);
  assert.equal((await s.call('GET', '/v1/group-lists', { token: b.token })).body.lists.length, 0);

  // Dono edita, reconvida após nova amizade, membro sai por conta própria, depois dono apaga tudo
  await befriend(s, a, b);
  await s.call('POST', `/v1/group-lists/${listId}/members`, { token: a.token, body: { userId: b.user.id } });
  const edited = await s.call('PATCH', `/v1/group-lists/${listId}`, { token: a.token, body: { title: 'Lista final', ranked: false } });
  assert.equal(edited.body.list.title, 'Lista final');
  assert.equal(edited.body.list.ranked, false);
  const left = await s.call('DELETE', `/v1/group-lists/${listId}/members/${b.user.id}`, { token: b.token });
  assert.equal(left.body.left, true);
  assert.equal((await s.call('GET', `/v1/group-lists/${listId}`, { token: b.token })).status, 404);

  const deleted = await s.call('DELETE', `/v1/group-lists/${listId}`, { token: a.token });
  assert.equal(deleted.body.deleted, true);
  assert.equal(s.env.DB.raw.prepare("SELECT COUNT(*) AS n FROM comments WHERE target = ?").get(listId).n, 0);

  // Apagar a conta do dono leva as listas dele junto
  const second = await s.call('POST', '/v1/group-lists', { token: a.token, body: { title: 'Segunda' } });
  assert.equal(second.status, 201);
  await s.call('DELETE', '/v1/me', { token: a.token });
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM group_lists').get().n, 0);
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM group_list_items').get().n, 0);
});

test('sincronização entre PCs: leitura privada, controle otimista (409) e limpeza ao apagar conta', async () => {
  const steam = fakeSteam();
  try {
  const s = setup();
  const a = await login(s, '76561198000000101');
  const b = await login(s, '76561198000000102');
  await befriend(s, a, b);

  const initial = await s.call('GET', '/v1/me/sync', { token: a.token });
  assert.equal(initial.status, 200);
  assert.equal(initial.body.revision, 0);
  assert.equal(initial.body.data, null);

  const snap1 = {
    schema: 'lazulium-sync/1',
    games: [{ key: 'steam:620', steamKey: 'steam:620', titleKey: 't:portal2', title: 'Portal 2', log: { notes: 'segredo meu' } }],
    lists: [],
    categories: []
  };
  const put1 = await s.call('PUT', '/v1/me/sync', { token: a.token, body: { baseRevision: 0, data: snap1 } });
  assert.equal(put1.status, 200);
  assert.equal(put1.body.revision, 1);

  // Outro usuário (mesmo amigo) nunca acessa o sync de A: GET /v1/me/sync retorna só o dele (vazio)
  const bGet = await s.call('GET', '/v1/me/sync', { token: b.token });
  assert.equal(bGet.status, 200);
  assert.equal(bGet.body.data, null);

  // Enviar com baseRevision vencida retorna 409 com a versão mais nova do servidor
  const stale = await s.call('PUT', '/v1/me/sync', { token: a.token, body: { baseRevision: 0, data: { ...snap1, games: [] } } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'conflict');
  assert.equal(stale.body.revision, 1);
  assert.equal(stale.body.data.games[0].log.notes, 'segredo meu');

  // Versão correta avança para revisão 2
  const put2 = await s.call('PUT', '/v1/me/sync', { token: a.token, body: { baseRevision: 1, data: { ...snap1, games: [] } } });
  assert.equal(put2.status, 200);
  assert.equal(put2.body.revision, 2);

  // Schema inválido rejeitado com 400
  const bad = await s.call('PUT', '/v1/me/sync', { token: a.token, body: { baseRevision: 2, data: { schema: 'outro' } } });
  assert.equal(bad.status, 400);

  // O limite conta bytes (uma linha do D1 cabe até 2 MB): 1 milhão de "ã" são 2 MB, apesar de 1 milhão de letras
  const accents = { ...snap1, games: [{ ...snap1.games[0], log: { notes: 'ã'.repeat(1_000_000) } }] };
  const big = await s.call('PUT', '/v1/me/sync', { token: a.token, body: { baseRevision: 2, data: accents } });
  assert.equal(big.status, 413);
  assert.equal(big.body.error, 'too_large');
  assert.equal((await s.call('GET', '/v1/me/sync', { token: a.token })).body.revision, 2);

  // DELETE /v1/me/sync apaga só a cópia da nuvem; apagar a conta também remove
  assert.equal((await s.call('DELETE', '/v1/me/sync', { token: a.token })).status, 200);
  assert.equal((await s.call('GET', '/v1/me/sync', { token: a.token })).body.revision, 0);

  await s.call('PUT', '/v1/me/sync', { token: a.token, body: { baseRevision: 0, data: snap1 } });
  await s.call('DELETE', '/v1/me', { token: a.token });
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM user_sync').get().n, 0);
  } finally {
    steam.restore();
  }
});

test('consulta única: chamadas, amigos e avisos num pedido só, e só as partes pedidas', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b);
  await s.call('POST', '/v1/calls', { token: a.token, body: { to: b.user.id } });
  await s.call('POST', '/v1/social/like', { token: a.token, body: { owner: b.user.id, kind: 'review', target: 't:hades', title: 'Hades' } });

  const all = await s.call('GET', '/v1/me/poll?parts=calls,friends,notifications', { token: b.token });
  assert.equal(all.status, 200);
  assert.equal(all.body.calls.incoming.length, 1);
  assert.equal(all.body.calls.incoming[0].from.id, a.user.id);
  assert.deepEqual(all.body.friends.map((f) => f.id), [a.user.id]);
  assert.equal(all.body.notifications.length, 1);
  assert.equal(all.body.notifications[0].type, 'like');

  // A chamada chega uma vez só, como na rota antiga; parte não pedida não vem
  const onlyCalls = await s.call('GET', '/v1/me/poll?parts=calls', { token: b.token });
  assert.deepEqual(onlyCalls.body, { calls: { incoming: [], answers: [], rang: [], cancelled: [] } });
  const later = new Date(Date.now() + 1000).toISOString();
  assert.deepEqual((await s.call('GET', `/v1/me/poll?parts=notifications&since=${later}`, { token: b.token })).body, { notifications: [] });

  assert.equal((await s.call('GET', '/v1/me/poll?parts=nada', { token: b.token })).status, 400);
  assert.equal((await s.call('GET', '/v1/me/poll?parts=calls')).status, 401);
  assert.equal((await s.call('POST', '/v1/me/poll?parts=calls', { token: b.token })).status, 405);
});

const fakeLimiter = (limit) => {
  const hits = new Map();
  return {
    async limit({ key }) {
      const n = (hits.get(key) ?? 0) + 1;
      hits.set(key, n);
      return { success: n <= limit };
    }
  };
};

test('avisos: o nome do jogo ou da lista vem do que o dono mandou, nunca de quem curte', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b);
  await s.call('PUT', '/v1/me/showcase', {
    token: a.token,
    body: { ...SHOWCASE, lists: [{ id: '0b6f7f0e-2f7a-4c55-9d7a-1f0a3c1d2e3f', title: 'Top 10 de verdade' }], ratings: [{ title: 'Hollow Knight', rating: 5 }] }
  });
  const forged = 'Jogo que você nunca resenhou';
  await s.call('POST', '/v1/social/like', { token: b.token, body: { owner: a.user.id, kind: 'list', target: '0b6f7f0e-2f7a-4c55-9d7a-1f0a3c1d2e3f', title: forged } });
  await s.call('POST', '/v1/social/comments', { token: b.token, body: { owner: a.user.id, kind: 'review', target: 't:hollowknight', title: forged, text: 'Joga!' } });
  await s.call('POST', '/v1/social/like', { token: b.token, body: { owner: a.user.id, kind: 'review', target: 't:naoexiste', title: forged } });
  const items = (await s.call('GET', '/v1/me/notifications', { token: a.token })).body.items;
  const titleOf = (kind, target) => items.find((n) => n.kind === kind && n.target === target).title;
  assert.equal(titleOf('list', '0b6f7f0e-2f7a-4c55-9d7a-1f0a3c1d2e3f'), 'Top 10 de verdade');
  assert.equal(titleOf('review', 't:hollowknight'), 'Hollow Knight');
  assert.equal(titleOf('review', 't:naoexiste'), null);
  assert.ok(!JSON.stringify(items).includes(forged));
});

test('limites por conta: curtidas em sequência e pedidos que gravam', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  s.env.ACTION_LIMITER = fakeLimiter(3);
  s.env.USER_LIMITER = fakeLimiter(5);
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b); // 2 pedidos que gravam (convite de A, aceite de B)
  const review = { owner: a.user.id, kind: 'review', target: 't:hades' };
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await s.call('POST', '/v1/social/like', { token: b.token, body: { ...review, like: i % 2 === 0 } })).status);
  assert.deepEqual(statuses, [200, 200, 200, 429]);
  assert.equal((await s.call('POST', '/v1/social/like', { token: b.token, body: review })).body.error, 'rate_limited'); // 6º pedido que grava de B (aceite + 4 curtidas antes)
  // Ler continua liberado, e a outra conta não é afetada
  assert.equal((await s.call('GET', '/v1/me/notifications', { token: b.token })).status, 200);
  assert.equal((await s.call('PUT', '/v1/me/presence', { token: a.token, body: { status: 'away' } })).status, 200);
});

test('convite vale para uma pessoa só; o próximo pedido gera outro código', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  const c = await login(s, '76561198000000003');
  const invite = (await s.call('POST', '/v1/friends/invite', { token: a.token })).body.code;
  assert.equal((await s.call('POST', '/v1/friends/accept', { token: b.token, body: { code: invite } })).status, 200);
  const reused = await s.call('POST', '/v1/friends/accept', { token: c.token, body: { code: invite } });
  assert.equal(reused.status, 404);
  assert.equal(reused.body.error, 'invite_not_found');
  const next = (await s.call('POST', '/v1/friends/invite', { token: a.token })).body.code;
  assert.notEqual(next, invite);
  assert.equal((await s.call('POST', '/v1/friends/accept', { token: c.token, body: { code: next } })).status, 200);
});

test('apagar a conta leva os links da vitrine em que ela era quem via', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  s.env.PROFILE_PAGE = PAGE;
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b);
  await s.call('PUT', '/v1/me/showcase', { token: a.token, body: SHOWCASE });
  const link = (await s.call('POST', `/v1/users/${a.user.id}/view`, { token: b.token })).body.url;
  assert.ok(link);
  await s.call('DELETE', '/v1/me', { token: b.token });
  const left = s.env.DB.raw.prepare('SELECT (SELECT COUNT(*) FROM view_links) + (SELECT COUNT(*) FROM view_viewers) AS n').get();
  assert.equal(left.n, 0);
  const res = await worker.fetch(new Request(`${link}/like`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: a.user.id, kind: 'review', target: 't:hades' }) }), s.env);
  assert.equal(res.status, 401);
});

test('vitrine: imagens só de endereços conhecidos', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  s.env.PROFILE_PAGE = PAGE;
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b);
  await s.call('PUT', '/v1/me/showcase', { token: a.token, body: SHOWCASE });
  const link = (await s.call('POST', `/v1/users/${a.user.id}/view`, { token: b.token })).body.url;
  const csp = (await worker.fetch(new Request(link), s.env)).headers.get('Content-Security-Policy');
  assert.match(csp, /img-src 'self' data: https:\/\/\*\.steamstatic\.com /);
  assert.ok(!/img-src https:;/.test(csp), 'img-src não aceita qualquer https');
});

test('dar um tempo: silenciar some com feed, avisos e chamados só para quem silenciou, e volta no prazo', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  const c = await login(s, '76561198000000003');
  await befriend(s, a, b);
  await befriend(s, a, c);
  await s.call('POST', '/v1/me/activities', { token: b.token, body: { events: [event()] } });
  await s.call('POST', '/v1/me/activities', { token: c.token, body: { events: [event({ id: 'c1' })] } });

  // Só amigo; prazo no futuro e até um ano; sem prazo vale até desfazer
  assert.equal((await s.call('PUT', `/v1/friends/${b.user.id}/mute`, { token: c.token, body: { until: null } })).status, 404);
  assert.equal((await s.call('PUT', `/v1/friends/${b.user.id}/mute`, { token: a.token, body: { until: '2020-01-01T00:00:00Z' } })).status, 400);
  assert.equal((await s.call('PUT', `/v1/friends/${b.user.id}/mute`, { token: a.token, body: { until: '2099-01-01T00:00:00Z' } })).status, 400);
  const until = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
  const muted = await s.call('PUT', `/v1/friends/${b.user.id}/mute`, { token: a.token, body: { until } });
  assert.deepEqual(muted.body, { muted: { until } });

  // A vê que silenciou; B não fica sabendo
  const friendsA = (await s.call('GET', '/v1/friends', { token: a.token })).body.friends;
  assert.deepEqual(friendsA.find((f) => f.id === b.user.id).muted, { until });
  assert.equal(friendsA.find((f) => f.id === c.user.id).muted, null);
  assert.equal((await s.call('GET', '/v1/friends', { token: b.token })).body.friends[0].muted, null);
  assert.deepEqual((await s.call('GET', `/v1/users/${b.user.id}`, { token: a.token })).body.muted, { until });

  // Feed de A sem B
  assert.deepEqual((await s.call('GET', '/v1/feed', { token: a.token })).body.items.map((i) => i.user.id), [c.user.id]);

  // Curtida de B não vira aviso para A; a de C vira
  const review = { owner: a.user.id, kind: 'review', target: 't:hades' };
  await s.call('POST', '/v1/social/like', { token: b.token, body: review });
  await s.call('POST', '/v1/social/like', { token: c.token, body: review });
  assert.deepEqual((await s.call('GET', '/v1/me/notifications', { token: a.token })).body.items.map((n) => n.user.id), [c.user.id]);

  // Chamado de B: aceito pelo servidor (B não descobre), mas não chega para A, nem depois
  assert.equal((await s.call('POST', '/v1/calls', { token: b.token, body: { to: a.user.id } })).status, 200);
  await s.call('POST', '/v1/calls', { token: c.token, body: { to: a.user.id } });
  assert.deepEqual((await s.call('GET', '/v1/calls', { token: a.token })).body.incoming.map((x) => x.from.id), [c.user.id]);

  // Prazo vencido: tudo volta sozinho, e o chamado de quando estava silenciado não aparece atrasado
  s.env.DB.raw.prepare('UPDATE friend_mutes SET until = ?').run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await s.call('GET', '/v1/friends', { token: a.token })).body.friends.find((f) => f.id === b.user.id).muted, null);
  assert.equal((await s.call('GET', '/v1/feed', { token: a.token })).body.items.length, 2);
  assert.equal((await s.call('GET', '/v1/calls', { token: a.token })).body.incoming.length, 0);
  await worker.scheduled({}, s.env);
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM friend_mutes').get().n, 0);

  // Sem prazo, e desfazer
  await s.call('PUT', `/v1/friends/${b.user.id}/mute`, { token: a.token, body: { until: null } });
  assert.deepEqual((await s.call('GET', '/v1/friends', { token: a.token })).body.friends.find((f) => f.id === b.user.id).muted, { until: null });
  assert.deepEqual((await s.call('DELETE', `/v1/friends/${b.user.id}/mute`, { token: a.token })).body, { muted: null });
  assert.equal((await s.call('GET', '/v1/feed', { token: a.token })).body.items.length, 2);

  // Apagar a conta leva o silêncio
  await s.call('PUT', `/v1/friends/${b.user.id}/mute`, { token: a.token, body: { until: null } });
  await s.call('DELETE', '/v1/me', { token: b.token });
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM friend_mutes').get().n, 0);
});

test('bloquear: desfaz a amizade, limpa o que a pessoa deixou e nenhum convite vale até desbloquear', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  s.env.PROFILE_PAGE = PAGE;
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  const c = await login(s, '76561198000000003');
  await befriend(s, a, b);
  await befriend(s, a, c);
  const review = { owner: a.user.id, kind: 'review', target: 't:hades' };
  await s.call('POST', '/v1/social/like', { token: b.token, body: review });
  await s.call('POST', '/v1/social/comments', { token: b.token, body: { ...review, text: 'chato' } });
  await s.call('POST', '/v1/social/comments', { token: c.token, body: { ...review, text: 'legal' } });
  await s.call('POST', '/v1/calls', { token: b.token, body: { to: a.user.id } });
  await s.call('PUT', '/v1/me/showcase', { token: a.token, body: SHOWCASE });
  const link = (await s.call('POST', `/v1/users/${a.user.id}/view`, { token: b.token })).body.url;
  await s.call('PUT', `/v1/friends/${b.user.id}/mute`, { token: a.token, body: { until: null } });

  assert.equal((await s.call('POST', `/v1/friends/${a.user.id}/block`, { token: a.token })).status, 400);
  assert.equal((await s.call('POST', '/v1/friends/00000000-0000-4000-8000-000000000000/block', { token: a.token })).status, 404);
  assert.equal((await s.call('POST', `/v1/friends/${b.user.id}/block`, { token: a.token })).status, 200);

  // Amizade acabou nos dois lados; curtida, comentário, chamado, link da vitrine e silêncio sumiram
  assert.deepEqual((await s.call('GET', '/v1/friends', { token: a.token })).body.friends.map((f) => f.id), [c.user.id]);
  assert.equal((await s.call('GET', '/v1/friends', { token: b.token })).body.friends.length, 0);
  const thread = (await s.call('GET', `/v1/social/thread?owner=${a.user.id}&kind=review&target=t:hades`, { token: c.token })).body;
  assert.equal(thread.likes, 0);
  assert.deepEqual(thread.comments.map((x) => x.text), ['legal']);
  assert.equal((await s.call('GET', '/v1/calls', { token: a.token })).body.incoming.length, 0);
  const viaLink = await worker.fetch(new Request(`${link}/like`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review) }), s.env);
  assert.equal(viaLink.status, 401);
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM friend_mutes').get().n, 0);
  assert.equal((await s.call('POST', '/v1/calls', { token: b.token, body: { to: a.user.id } })).status, 404);

  // Convite em qualquer sentido não vale; quem bloqueou fica sabendo por quê
  const fromA = (await s.call('POST', '/v1/friends/invite', { token: a.token })).body.code;
  const tryB = await s.call('POST', '/v1/friends/accept', { token: b.token, body: { code: fromA } });
  assert.deepEqual([tryB.status, tryB.body.error], [404, 'invite_not_found']);
  const fromB = (await s.call('POST', '/v1/friends/invite', { token: b.token })).body.code;
  const tryA = await s.call('POST', '/v1/friends/accept', { token: a.token, body: { code: fromB } });
  assert.deepEqual([tryA.status, tryA.body.error], [409, 'you_blocked']);

  // Lista de bloqueados só de quem bloqueou; desbloquear deixa virar amigo de novo
  const blocked = (await s.call('GET', '/v1/friends/blocked', { token: a.token })).body.blocked;
  assert.deepEqual(blocked.map((u) => u.id), [b.user.id]);
  assert.ok(blocked[0].name && blocked[0].blockedAt);
  assert.equal((await s.call('GET', '/v1/friends/blocked', { token: b.token })).body.blocked.length, 0);
  await s.call('DELETE', `/v1/friends/blocked/${b.user.id}`, { token: a.token });
  assert.equal((await s.call('POST', '/v1/friends/accept', { token: a.token, body: { code: fromB } })).status, 200);

  // Apagar a conta leva o bloqueio
  await s.call('POST', `/v1/friends/${b.user.id}/block`, { token: a.token });
  await s.call('DELETE', '/v1/me', { token: a.token });
  assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM blocks').get().n, 0);
});

test('atividades: resenha e nota deduplicadas no envio, no feed, no perfil e na migração D1', async (t) => {
  const steam = fakeSteam();
  t.after(steam.restore);
  const s = setup();
  const a = await login(s, '76561198000000001');
  const b = await login(s, '76561198000000002');
  await befriend(s, a, b);

  // Vários rascunhos da mesma resenha e nota com ids diferentes (em um mesmo POST e em POSTs separados)
  const batchRes = await s.call('POST', '/v1/me/activities', {
    token: b.token,
    body: {
      events: [
        event({ id: 'rev-1', kind: 'reviewed', gameKey: 'steam:1546970', gameTitle: 'GTA San Andreas: The Definitive Edition', rating: 3.5, text: 'Rascunho 1', at: '2026-11-10T18:00:00.000Z' }),
        event({ id: 'rev-2', kind: 'reviewed', gameKey: 'steam:1546970', gameTitle: 'GTA San Andreas: The Definitive Edition', rating: 3.5, text: 'Rascunho 2', at: '2026-11-10T18:05:00.000Z' }),
        event({ id: 'rat-1', kind: 'rated', gameKey: 'steam:1546970', gameTitle: 'GTA San Andreas: The Definitive Edition', rating: 3, at: '2026-11-10T18:00:00.000Z' })
      ]
    }
  });
  assert.deepEqual(batchRes.body, { accepted: 3, rejected: 0 });

  await s.call('POST', '/v1/me/activities', {
    token: b.token,
    body: {
      events: [
        event({ id: 'rev-3', kind: 'reviewed', gameKey: 'steam:1546970', gameTitle: 'GTA San Andreas: The Definitive Edition', rating: 3.5, text: 'Resenha final', at: '2026-11-10T18:10:00.000Z' }),
        event({ id: 'rat-2', kind: 'rated', gameKey: 'steam:1546970', gameTitle: 'GTA San Andreas: The Definitive Edition', rating: 3.5, at: '2026-11-10T18:11:00.000Z' })
      ]
    }
  });

  // Envio atrasado com data mais antiga não sobrescreve nem duplica o mais recente
  await s.call('POST', '/v1/me/activities', {
    token: b.token,
    body: {
      events: [
        event({ id: 'rev-stale', kind: 'reviewed', gameKey: 'steam:1546970', gameTitle: 'GTA San Andreas: The Definitive Edition', rating: 2, text: 'Velha', at: '2026-11-10T17:00:00.000Z' })
      ]
    }
  });

  const feed1 = await s.call('GET', '/v1/feed', { token: a.token });
  assert.deepEqual(feed1.body.items.map((i) => i.id), ['rat-2', 'rev-3']);
  assert.equal(feed1.body.items[1].text, 'Resenha final');
  const profile1 = await s.call('GET', `/v1/users/${b.user.id}`, { token: a.token });
  assert.deepEqual(profile1.body.activities.map((i) => i.id), ['rat-2', 'rev-3']);

  // Duplicatas antigas já salvas direto no banco também são filtradas no feed (inclusive com paginação) e no perfil
  const insertLegacy = s.env.DB.raw.prepare(
    'INSERT INTO activities (user_id, id, kind, game_key, game_title, cover_url, at, rating, count, seconds, text) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?)'
  );
  insertLegacy.run(b.user.id, 'rev-legacy-1', 'reviewed', 'steam:1546970', 'GTA San Andreas: The Definitive Edition', '2026-11-10T16:00:00.000Z', 3.5, 'Antiga 1');
  insertLegacy.run(b.user.id, 'rev-legacy-2', 'reviewed', 'steam:1546970', 'GTA San Andreas: The Definitive Edition', '2026-11-10T16:30:00.000Z', 3.5, 'Antiga 2');
  insertLegacy.run(b.user.id, 'played-legacy', 'played', 'steam:1546970', 'GTA San Andreas: The Definitive Edition', '2026-11-10T15:00:00.000Z', null, null);
  insertLegacy.run(b.user.id, 'finished-legacy', 'finished', 'steam:1546970', 'GTA San Andreas: The Definitive Edition', '2026-11-10T14:00:00.000Z', null, null);

  const page1 = await s.call('GET', '/v1/feed?limit=2', { token: a.token });
  assert.deepEqual(page1.body.items.map((i) => i.id), ['rat-2', 'rev-3']);
  const page2 = await s.call('GET', `/v1/feed?before=${encodeURIComponent(page1.body.items[1].at)}&limit=5`, { token: a.token });
  assert.deepEqual(page2.body.items.map((i) => i.id), ['played-legacy', 'finished-legacy']);
  const profile2 = await s.call('GET', `/v1/users/${b.user.id}`, { token: a.token });
  assert.deepEqual(profile2.body.activities.map((i) => i.id), ['rat-2', 'rev-3', 'played-legacy', 'finished-legacy']);

  // Migração SQL limpa as linhas antigas duplicadas mantendo a mais recente e preservando outros tipos
  const migrationPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '2026-11-dedupe-activities.sql');
  s.env.DB.raw.exec(readFileSync(migrationPath, 'utf8'));
  const remaining = s.env.DB.raw.prepare('SELECT id FROM activities WHERE user_id = ? ORDER BY at DESC').all(b.user.id).map((r) => r.id);
  assert.deepEqual(remaining, ['rat-2', 'rev-3', 'played-legacy', 'finished-legacy']);
});
