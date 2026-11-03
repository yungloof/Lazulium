import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { cleanTitle, normalizeTitle } from './index.js';

const SECRET = 'segredo-de-teste';

function fakeKv() {
  const store = new Map();
  return {
    store,
    puts: [],
    async get(key, type) {
      const value = store.get(key);
      if (value === undefined) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value, options) {
      this.puts.push({ key, options });
      store.set(key, value);
    }
  };
}

const ok = (body) => new Response(JSON.stringify(body), { status: 200 });

// Twitch e IGDB falsos: cada teste diz como o IGDB responde; o resto é o código real do Worker
function setup(igdbHandler, { tokenStatus = 200 } = {}) {
  const calls = { igdb: [], tokens: 0 };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.startsWith('https://id.twitch.tv/')) {
      calls.tokens++;
      assert.equal(options.method, 'POST');
      if (tokenStatus !== 200) return new Response('{}', { status: tokenStatus });
      return ok({ access_token: `token-${calls.tokens}`, expires_in: 5000000, token_type: 'bearer' });
    }
    const match = href.match(/^https:\/\/api\.igdb\.com\/v4\/(.+)$/);
    assert.ok(match, `chamada inesperada: ${href}`);
    assert.equal(options.headers['Client-ID'], 'cliente');
    calls.igdb.push({ endpoint: match[1], body: options.body, auth: options.headers.Authorization });
    return igdbHandler(match[1], options.body, calls);
  };
  const kv = fakeKv();
  const env = { TWITCH_CLIENT_ID: 'cliente', TWITCH_CLIENT_SECRET: SECRET, IGDB_CACHE: kv };
  const get = async (query, overrideEnv = env, init) => {
    const res = await worker.fetch(new Request(`https://proxy.test/v1/time-to-beat?${query}`, init), overrideEnv);
    const text = await res.text();
    assert.ok(!text.includes(SECRET), 'o segredo vazou na resposta');
    return { status: res.status, body: JSON.parse(text) };
  };
  return { calls, kv, env, get, restore: () => (globalThis.fetch = original) };
}

const TTB = { game_id: 7, hastily: 3600, normally: 7200, completely: 14400, count: 12 };

test('Steam: usa external_game_source e devolve os três tempos', async (t) => {
  const s = setup((endpoint) => (endpoint === 'external_games' ? ok([{ id: 1, game: { id: 7, name: 'Portal 2' } }]) : ok([TTB])));
  t.after(s.restore);
  const { status, body } = await s.get('steamAppId=620');
  assert.equal(status, 200);
  assert.deepEqual(body, { found: true, gameId: 7, name: 'Portal 2', hastily: 3600, normally: 7200, completely: 14400, count: 12 });
  assert.match(s.calls.igdb[0].body, /external_game_source = 1 & uid = "620"/);
  assert.ok(!s.calls.igdb[0].body.includes('category'), 'category está descontinuado');
  assert.match(s.calls.igdb[1].body, /where game_id = \(7\)/);
});

test('Steam sem vínculo no IGDB cai para a busca por título', async (t) => {
  const s = setup((endpoint) => {
    if (endpoint === 'external_games') return ok([]);
    if (endpoint === 'games') return ok([{ id: 7, name: 'Portal 2' }]);
    return ok([TTB]);
  });
  t.after(s.restore);
  const { body } = await s.get('steamAppId=620&title=Portal%202');
  assert.equal(body.found, true);
  assert.equal(body.name, 'Portal 2');
});

test('Steam com vínculo mas sem tempos não inventa resultado por título', async (t) => {
  const s = setup((endpoint) => (endpoint === 'external_games' ? ok([{ game: { id: 7, name: 'Portal 2' } }]) : ok([])));
  t.after(s.restore);
  const { body } = await s.get('steamAppId=620&title=Portal%202');
  assert.deepEqual(body, { found: false });
  assert.ok(!s.calls.igdb.some((c) => c.endpoint === 'games'));
});

test('Título: ignora maiúsculas e pontuação, e rejeita nome só parecido', async (t) => {
  const s = setup((endpoint) => {
    if (endpoint === 'games') return ok([{ id: 9, name: 'The Legend of Zelda: Ocarina of Time 3D' }, { id: 7, name: 'The Legend of Zelda: Ocarina of Time' }]);
    return ok([TTB]);
  });
  t.after(s.restore);
  const { body } = await s.get(`title=${encodeURIComponent('The Legend of Zelda: OCARINA OF TIME')}`);
  assert.equal(body.name, 'The Legend of Zelda: Ocarina of Time');
  assert.match(s.calls.igdb[1].body, /where game_id = \(7\)/);
});

test('Título sem nome igual não devolve o jogo mais parecido', async (t) => {
  const s = setup(() => ok([{ id: 9, name: 'Mario Party 2' }]));
  t.after(s.restore);
  const { body } = await s.get('title=Mario%20Party');
  assert.deepEqual(body, { found: false });
  assert.equal(s.calls.igdb.length, 1);
});

test('Nome alternativo também vale', async (t) => {
  const s = setup((endpoint) => (endpoint === 'games' ? ok([{ id: 7, name: 'Biohazard', alternative_names: [{ name: 'Resident Evil' }] }]) : ok([TTB])));
  t.after(s.restore);
  const { body } = await s.get('title=Resident%20Evil');
  assert.equal(body.found, true);
});

test('Versões de mesmo nome: vence a que tem mais envios', async (t) => {
  const s = setup((endpoint) => {
    if (endpoint === 'games') return ok([{ id: 1, name: 'Link Awakening' }, { id: 2, name: 'Link Awakening' }]);
    return ok([{ ...TTB, game_id: 1, count: 2 }, { ...TTB, game_id: 2, count: 40 }]);
  });
  t.after(s.restore);
  const { body } = await s.get('title=Link%20Awakening');
  assert.equal(body.gameId, 2);
});

test('Entrada com tempos vazios conta como não encontrado', async (t) => {
  const s = setup((endpoint) => (endpoint === 'games' ? ok([{ id: 7, name: 'Jogo' }]) : ok([{ game_id: 7, count: 0 }])));
  t.after(s.restore);
  assert.deepEqual((await s.get('title=Jogo')).body, { found: false });
});

test('Título hostil não consegue alterar a consulta do IGDB', async (t) => {
  const s = setup(() => ok([]));
  t.after(s.restore);
  await s.get(`title=${encodeURIComponent('x"; fields *; where id = 1; \\')}`);
  const [query] = s.calls.igdb;
  assert.equal(query.body.match(/"/g).length, 2, 'só as aspas da própria consulta');
  assert.equal(query.body.match(/;/g).length, 4, 'nenhum comando a mais');
});

test('Entradas inválidas nem chegam ao IGDB', async (t) => {
  const s = setup(() => assert.fail('não devia consultar'));
  t.after(s.restore);
  assert.equal((await s.get('')).status, 400);
  assert.equal((await s.get('steamAppId=abc')).status, 400);
  assert.equal((await s.get('steamAppId=1%20or%201')).status, 400);
  assert.equal((await s.get(`title=${'a'.repeat(121)}`)).status, 400);
  assert.equal((await s.get('title=%22%3B')).status, 400);
  assert.equal((await s.get('title=%20')).status, 400);
});

test('Só aceita GET no caminho certo', async (t) => {
  const s = setup(() => assert.fail('não devia consultar'));
  t.after(s.restore);
  assert.equal((await worker.fetch(new Request('https://proxy.test/qualquer'), s.env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://proxy.test/v1/time-to-beat?title=x', { method: 'POST', body: 'fields *;' }), s.env)).status, 405);
});

test('Resultado encontrado fica 30 dias em cache', async (t) => {
  const s = setup((endpoint) => (endpoint === 'games' ? ok([{ id: 7, name: 'Jogo' }]) : ok([TTB])));
  t.after(s.restore);
  await s.get('title=Jogo');
  const before = s.calls.igdb.length;
  assert.equal((await s.get('title=JOGO')).body.found, true);
  assert.equal(s.calls.igdb.length, before, 'segunda busca não consulta o IGDB');
  assert.equal(s.kv.puts.find((p) => p.key.startsWith('ttb:')).options.expirationTtl, 30 * 86400);
});

test('Não encontrado tem validade menor', async (t) => {
  const s = setup(() => ok([]));
  t.after(s.restore);
  await s.get('title=Inexistente');
  assert.equal(s.kv.puts.find((p) => p.key.startsWith('ttb:')).options.expirationTtl, 7 * 86400);
});

test('Token é reaproveitado entre requisições', async (t) => {
  const s = setup(() => ok([]));
  t.after(s.restore);
  await s.get('title=Um');
  await s.get('title=Dois');
  assert.equal(s.calls.tokens, 1);
  assert.equal(s.calls.igdb[1].auth, 'Bearer token-1');
});

test('Token recusado (401) é renovado uma vez', async (t) => {
  const s = setup((_e, _b, calls) => (calls.igdb.length === 1 ? new Response('{}', { status: 401 }) : ok([])));
  t.after(s.restore);
  const { status } = await s.get('title=Jogo');
  assert.equal(status, 200);
  assert.equal(s.calls.tokens, 2);
  assert.equal(s.calls.igdb[1].auth, 'Bearer token-2');
});

test('429 tenta de novo uma vez', async (t) => {
  const s = setup((_e, _b, calls) => (calls.igdb.length === 1 ? new Response('{}', { status: 429 }) : ok([])));
  t.after(s.restore);
  assert.equal((await s.get('title=Jogo')).status, 200);
});

test('IGDB fora do ar devolve 503 e nada vai para o cache', async (t) => {
  const s = setup(() => new Response('{}', { status: 500 }));
  t.after(s.restore);
  const { status, body } = await s.get('title=Jogo');
  assert.equal(status, 503);
  assert.deepEqual(body, { error: 'upstream_unavailable' });
  assert.ok(!s.kv.puts.some((p) => p.key.startsWith('ttb:')));
});

test('Falha de rede também não vai para o cache', async (t) => {
  const s = setup(() => {
    throw new TypeError('fetch failed');
  });
  t.after(s.restore);
  assert.equal((await s.get('title=Jogo')).status, 503);
  assert.ok(!s.kv.puts.some((p) => p.key.startsWith('ttb:')));
});

test('Credencial recusada pela Twitch devolve 503 sem vazar nada', async (t) => {
  const s = setup(() => ok([]), { tokenStatus: 403 });
  t.after(s.restore);
  assert.equal((await s.get('title=Jogo')).status, 503);
});

test('Sem configuração responde 503', async (t) => {
  const s = setup(() => ok([]));
  t.after(s.restore);
  assert.equal((await s.get('title=Jogo', { IGDB_CACHE: s.kv })).status, 503);
});

test('Limitador recusa antes de consultar', async (t) => {
  const s = setup(() => assert.fail('não devia consultar'));
  t.after(s.restore);
  const env = { ...s.env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await s.get('title=Jogo', env)).status, 429);
});

test('Falha ao gravar no cache não derruba a resposta', async (t) => {
  const s = setup((endpoint) => (endpoint === 'games' ? ok([{ id: 7, name: 'Jogo' }]) : ok([TTB])));
  t.after(s.restore);
  await s.kv.put('twitch:token', 'token-pronto');
  s.kv.put = async () => {
    throw new Error('cota esgotada');
  };
  const { status, body } = await s.get('title=Jogo');
  assert.equal(status, 200);
  assert.equal(body.found, true);
});

test('Limpeza de título', () => {
  assert.equal(cleanTitle('The Legend of Zelda (1986)'), 'The Legend of Zelda');
  assert.equal(cleanTitle("Link's Awakening (SWITCH)"), "Link's Awakening");
  assert.equal(normalizeTitle('The Legend of Zelda: OCARINA OF TIME'), normalizeTitle('The Legend of Zelda: Ocarina of Time'));
  assert.equal(normalizeTitle('Pokémon Sword'), normalizeTitle('Pokemon Sword'));
});
