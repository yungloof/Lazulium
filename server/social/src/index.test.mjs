import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from './index.js';
import { openD1 } from './d1-sqlite.js';

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
const PAGE = '<!doctype html><html><head><title>Perfil</title></head><body></body></html>';

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
