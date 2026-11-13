import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { cleanTitle, normalizeTitle, toCents, toDeal } from './index.js';

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
      assert.ok(!href.includes(SECRET), 'o segredo da Twitch não vai na URL');
      assert.ok(String(options.body).includes('client_secret='), 'o segredo vai no corpo');
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

test('KV sem cota (leitura e gravação) não derruba a resposta nem o token', async (t) => {
  const s = setup((endpoint) => (endpoint === 'games' ? ok([{ id: 7, name: 'Jogo' }]) : ok([TTB])));
  t.after(s.restore);
  const quota = async () => {
    throw new Error('limite diário do KV excedido');
  };
  s.kv.get = quota;
  s.kv.put = quota;
  const { status, body } = await s.get('title=Jogo');
  assert.equal(status, 200);
  assert.equal(body.found, true);
});

test('A cache da borda fica na frente do KV: repetir a consulta não lê nem grava no KV', async (t) => {
  const s = setup((endpoint) => (endpoint === 'games' ? ok([{ id: 7, name: 'Jogo' }]) : ok([TTB])));
  t.after(s.restore);
  const edge = fakeEdgeCache();
  const original = globalThis.caches;
  globalThis.caches = { default: edge };
  t.after(() => (globalThis.caches = original));

  assert.equal((await s.get('title=Jogo')).body.found, true);
  assert.ok(edge.store.has('https://cache.lazulium/kv/ttb%3Av1%3Atitle%3Ajogo'), 'resultado e token vão para a borda');
  assert.ok(edge.store.has('https://cache.lazulium/kv/twitch%3Atoken'));
  assert.equal(s.calls.tokens, 1);

  // Segunda consulta: o KV ficou sem cota, mas a borda responde sem chamar o IGDB de novo
  const igdbCalls = s.calls.igdb.length;
  s.kv.get = async () => {
    throw new Error('limite diário do KV excedido');
  };
  s.kv.put = s.kv.get;
  const again = await s.get('title=Jogo');
  assert.equal(again.body.found, true);
  assert.equal(s.calls.igdb.length, igdbCalls);
});

test('Limpeza de título', () => {
  assert.equal(cleanTitle('The Legend of Zelda (1986)'), 'The Legend of Zelda');
  assert.equal(cleanTitle("Link's Awakening (SWITCH)"), "Link's Awakening");
  assert.equal(normalizeTitle('The Legend of Zelda: OCARINA OF TIME'), normalizeTitle('The Legend of Zelda: Ocarina of Time'));
  assert.equal(normalizeTitle('Pokémon Sword'), normalizeTitle('Pokemon Sword'));
});

const search = async (env, query) => {
  const res = await worker.fetch(new Request(`https://proxy.test/v1/search?${query}`), env);
  const text = await res.text();
  assert.ok(!text.includes(SECRET), 'o segredo vazou na resposta');
  return { status: res.status, body: JSON.parse(text) };
};

test('Busca devolve nome, ano e capa', async (t) => {
  const s = setup(() => ok([{ id: 1, name: 'God of War', first_release_date: 1523577600, cover: { id: 9, image_id: 'abc' } }, { id: 2, name: 'God of War II' }]));
  t.after(s.restore);
  const { status, body } = await search(s.env, 'q=god%20of%20war');
  assert.equal(status, 200);
  assert.deepEqual(body.results[0], { name: 'God of War', year: 2018, coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg' });
  assert.equal(body.results[1].name, 'God of War II');
});

test('Busca hostil não altera a consulta do IGDB', async (t) => {
  const s = setup(() => ok([]));
  t.after(s.restore);
  await search(s.env, `q=${encodeURIComponent('x"; fields *; limit 500; "')}`);
  assert.equal(s.calls.igdb[0].body.match(/"/g).length, 2);
  assert.ok(s.calls.igdb[0].body.includes('limit 12;'));
  assert.ok(!s.calls.igdb[0].body.includes('limit 500;'));
});

test('Busca curta ou longa demais nem chega ao IGDB', async (t) => {
  const s = setup(() => assert.fail('não devia consultar'));
  t.after(s.restore);
  assert.equal((await search(s.env, 'q=a')).status, 400);
  assert.equal((await search(s.env, `q=${'a'.repeat(121)}`)).status, 400);
  assert.equal((await search(s.env, '')).status, 400);
});

test('Falha do IGDB na busca não entra no cache', async (t) => {
  const s = setup(() => new Response('{}', { status: 500 }));
  t.after(s.restore);
  assert.equal((await search(s.env, 'q=zelda')).status, 503);
  assert.ok(![...s.kv.store.keys()].some((k) => k.startsWith('search:')));
});

const GG_SECRET = 'chave-gg-de-teste';

// Cache da borda falso (caches.default do Worker), por URL da requisição
function fakeEdgeCache() {
  const store = new Map();
  return {
    store,
    async match(request) {
      const hit = store.get(request.url);
      return hit ? new Response(hit) : undefined;
    },
    async put(request, response) {
      store.set(request.url, await response.text());
    }
  };
}

function setupPrices(handler, { edgeCache } = {}) {
  const original = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(' '));
  if (edgeCache) globalThis.caches = { default: edgeCache };
  const calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    assert.ok(href.startsWith('https://api.gg.deals/v1/prices/by-steam-app-id/?'), `chamada inesperada: ${href}`);
    const params = new URL(href).searchParams;
    calls.push(params);
    return handler(params);
  };
  const env = { GGDEALS_API_KEY: GG_SECRET };
  const get = async (query, overrideEnv = env) => {
    const res = await worker.fetch(new Request(`https://proxy.test/v1/prices?${query}`), overrideEnv);
    const text = await res.text();
    assert.ok(!text.includes(GG_SECRET), 'a chave vazou na resposta');
    return { status: res.status, body: JSON.parse(text), headers: res.headers };
  };
  return {
    calls,
    logs,
    get,
    restore: () => {
      globalThis.fetch = original;
      globalThis.caches = originalCaches;
      console.error = originalError;
    }
  };
}

// Exemplo no formato da documentação do GG.deals (gg.deals/api/prices): preços em texto decimal, null para o que não existe
const GG_EXAMPLE = {
  success: true,
  data: {
    1: null,
    420: {
      title: 'Half-Life 2: Episode Two',
      url: 'https://gg.deals/game/half-life-2-episode-two/',
      prices: { currentRetail: '91.99', currentKeyshops: null, historicalRetail: '5.61', historicalKeyshops: '5.61', currency: 'BRL' }
    }
  }
};

test('Preços: formato documentado do GG.deals (texto decimal, null e id desconhecido)', async (t) => {
  const s = setupPrices(() => ok(GG_EXAMPLE));
  t.after(s.restore);
  const { status, body } = await s.get('steamAppIds=420,1,999');
  assert.equal(status, 200);
  assert.deepEqual(body.prices['420'], { url: 'https://gg.deals/game/half-life-2-episode-two/', currency: 'BRL', retail: 9199, keyshops: null, lowestRetail: 561, lowestKeyshops: 561 });
  assert.equal(body.prices['1'], null, 'id que o GG.deals não conhece vem como null');
  assert.equal(body.prices['999'], null, 'id ausente na resposta também');
});

test('Preços: só número decimal simples vira centavos', () => {
  assert.equal(toCents('8.19'), 819);
  assert.equal(toCents('0'), 0);
  assert.equal(toCents(3.5), 350);
  assert.equal(toCents('1,234.56'), null, 'separador de milhar não vira 1 real');
  assert.equal(toCents('-1'), null);
  assert.equal(toCents('abc'), null);
  assert.equal(toCents(null), null);
  assert.equal(toCents(undefined), null);
});

test('Preços: entrada sem moeda ou com link de fora não passa', () => {
  assert.equal(toDeal({ url: 'https://gg.deals/x/', prices: { currentRetail: '1.00' } }), null);
  assert.equal(toDeal({ url: 'https://gg.deals/x/', prices: 'x' }), null);
  assert.equal(toDeal({ url: 'https://evil.example/', prices: { currentRetail: '1.00', currency: 'BRL' } }).url, null);
});

test('Preços: cache por jogo, e só os que faltam vão ao GG.deals', async (t) => {
  const edge = fakeEdgeCache();
  const s = setupPrices((params) => ok({ success: true, data: Object.fromEntries(params.get('ids').split(',').map((id) => [id, GG_EXAMPLE.data[420]])) }), { edgeCache: edge });
  t.after(s.restore);
  await s.get('steamAppIds=420,10');
  const second = await s.get('steamAppIds=10,420,20');
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].get('ids'), '20', 'os já guardados não gastam a cota da chave');
  assert.equal(second.body.prices['10'].retail, 9199);
  await s.get('steamAppIds=20,10');
  assert.equal(s.calls.length, 2, 'tudo em cache: nem consulta');
});

test('Preços: cota do GG.deals esgotada vira 429, ou devolve o que já estava em cache', async (t) => {
  const edge = fakeEdgeCache();
  let reply = () => ok(GG_EXAMPLE);
  const s = setupPrices(() => reply(), { edgeCache: edge });
  t.after(s.restore);
  reply = () => new Response('{}', { status: 429, headers: { 'Retry-After': '60' } });
  const limited = await s.get('steamAppIds=420');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  reply = () => ok(GG_EXAMPLE);
  await s.get('steamAppIds=420');
  reply = () => new Response('{}', { status: 429 });
  const partial = await s.get('steamAppIds=420,7');
  assert.equal(partial.status, 200);
  assert.equal(partial.body.incomplete, true);
  assert.equal(partial.body.prices['420'].retail, 9199);
  assert.ok(!('7' in partial.body.prices));
});

test('Preços: falha não vai para o cache nem leva a chave para o log', async (t) => {
  const edge = fakeEdgeCache();
  const s = setupPrices(() => {
    throw new TypeError(`fetch failed for https://api.gg.deals/v1/prices/by-steam-app-id/?ids=1&key=${GG_SECRET}`);
  }, { edgeCache: edge });
  t.after(s.restore);
  assert.equal((await s.get('steamAppIds=420')).status, 503);
  assert.equal(edge.store.size, 0);
  assert.ok(s.logs.length > 0 && !s.logs.some((l) => l.includes(GG_SECRET)), 'a chave não aparece no log');
});

test('Preços: "success" verdadeiro mas sem objeto de dados vira 503', async (t) => {
  const s = setupPrices(() => ok({ success: true, data: [] }));
  t.after(s.restore);
  assert.equal((await s.get('steamAppIds=420')).status, 503);
});

test('Preços: converte para centavos e só repassa os campos conhecidos', async (t) => {
  const s = setupPrices(() => ok({ success: true, data: { 1: null, 420: { title: 'Jogo', url: 'https://gg.deals/game/jogo/', segredo: 'x', prices: { currentRetail: '8.19', currentKeyshops: 3.5, historicalRetail: '0.81', historicalKeyshops: null, currency: 'BRL' } } } }));
  t.after(s.restore);
  const { status, body } = await s.get('steamAppIds=420,1');
  assert.equal(status, 200);
  assert.equal(body.prices['1'], null);
  assert.deepEqual(body.prices['420'], { url: 'https://gg.deals/game/jogo/', currency: 'BRL', retail: 819, keyshops: 350, lowestRetail: 81, lowestKeyshops: null });
  assert.equal(s.calls[0].get('ids'), '1,420');
  assert.equal(s.calls[0].get('region'), 'br');
});

test('Preços: entradas inválidas nem chegam ao GG.deals', async (t) => {
  const s = setupPrices(() => assert.fail('não devia consultar'));
  t.after(s.restore);
  assert.equal((await s.get('steamAppIds=')).status, 400);
  assert.equal((await s.get('steamAppIds=1;drop')).status, 400);
  assert.equal((await s.get(`steamAppIds=${Array.from({ length: 51 }, (_, i) => i + 1).join(',')}`)).status, 400);
});

test('Preços: sem chave configurada responde 503 sem consultar', async (t) => {
  const s = setupPrices(() => assert.fail('não devia consultar'));
  t.after(s.restore);
  const { status, body } = await s.get('steamAppIds=420', {});
  assert.equal(status, 503);
  assert.equal(body.error, 'not_configured');
});

test('Preços: falha ou formato estranho do GG.deals vira 503, sem repassar o corpo', async (t) => {
  let reply = () => new Response('chave inválida: ' + GG_SECRET, { status: 401 });
  const s = setupPrices(() => reply());
  t.after(s.restore);
  assert.equal((await s.get('steamAppIds=420')).status, 503);
  reply = () => ok({ success: false, message: 'x' });
  assert.equal((await s.get('steamAppIds=420')).status, 503);
});

test('páginas públicas: início e política de privacidade em HTML', async () => {
  const { default: worker } = await import('./index.js');
  for (const path of ['/', '/privacidade', '/privacidade/']) {
    const res = await worker.fetch(new Request(`https://x.dev${path}`), {});
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const body = await res.text();
    assert.match(body, /Lazulium/);
  }
  const policy = await (await worker.fetch(new Request('https://x.dev/privacidade'), {})).text();
  assert.match(policy, /drive\.file/);
  assert.match(policy, /Uso Limitado/);
  assert.doesNotMatch(policy, /\*\*/);
  const post = await worker.fetch(new Request('https://x.dev/privacidade', { method: 'POST' }), {});
  assert.equal(post.status, 404);
});

// Artes para quem não entrou no SteamGridDB
async function getArtwork(s, query) {
  const res = await worker.fetch(new Request(`https://proxy.test/v1/artwork?${query}`), s.env);
  return { status: res.status, body: await res.json() };
}

test('artwork: nome igual devolve capa e arte oficial como fundo', async (t) => {
  const s = setup(() =>
    ok([
      { id: 1, name: 'Hollow Knight: Silksong', cover: { image_id: 'zzz111' } },
      { id: 2, name: 'Hollow Knight', cover: { image_id: 'co93cr' }, artworks: [{ image_id: 'ar5x2' }], screenshots: [{ image_id: 'sc6ab' }] }
    ])
  );
  t.after(s.restore);
  const { status, body } = await getArtwork(s, 'title=Hollow%20Knight');
  assert.equal(status, 200);
  assert.deepEqual(body, {
    found: true,
    name: 'Hollow Knight',
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co93cr.jpg',
    hero: 'https://images.igdb.com/igdb/image/upload/t_1080p/ar5x2.jpg'
  });
  assert.match(s.calls.igdb[0].body, /cover\.image_id/);
  assert.ok(s.kv.store.has('art:v1:hollowknight'), 'resultado vai para o cache');
});

test('artwork: sem arte oficial usa captura; sem nada fica sem fundo', async (t) => {
  const s = setup(() => ok([{ id: 2, name: 'Celeste', cover: { image_id: 'co1abc' }, screenshots: [{ image_id: 'sc9' + 'xyz' }] }]));
  t.after(s.restore);
  const { body } = await getArtwork(s, 'title=Celeste');
  assert.equal(body.hero, 'https://images.igdb.com/igdb/image/upload/t_1080p/sc9xyz.jpg');

  const s2 = setup(() => ok([{ id: 3, name: 'Celeste', cover: { image_id: 'co1abc' } }]));
  t.after(s2.restore);
  assert.equal((await getArtwork(s2, 'title=Celeste')).body.hero, null);
});

test('artwork: nome só parecido, sem capa ou com id de imagem estranho não devolve nada', async (t) => {
  const s = setup(() =>
    ok([
      { id: 1, name: 'Celeste Classic', cover: { image_id: 'co1abc' } },
      { id: 2, name: 'Celeste' },
      { id: 3, name: 'Celeste', cover: { image_id: '../../x' } }
    ])
  );
  t.after(s.restore);
  const { status, body } = await getArtwork(s, 'title=Celeste');
  assert.equal(status, 200);
  assert.deepEqual(body, { found: false });
});

test('artwork: título inválido responde 400 sem consultar o IGDB', async (t) => {
  const s = setup(() => ok([]));
  t.after(s.restore);
  assert.equal((await getArtwork(s, 'title=x')).status, 400);
  assert.equal((await getArtwork(s, `title=${'a'.repeat(200)}`)).status, 400);
  assert.equal(s.calls.igdb.length, 0);
});

test('Preços: lotes de 20 e de 50 jogos cabem no teto de 50 subrequests da Cloudflare', async (t) => {
  const edge = fakeEdgeCache();
  let subrequests = 0;
  const countOp = () => {
    subrequests += 1;
    if (subrequests > 50) throw new Error('Too many subrequests.');
  };
  const meteredEdge = {
    store: edge.store,
    match: async (req) => { countOp(); return edge.match(req); },
    put: async (req, res) => { countOp(); return edge.put(req, res); }
  };
  const s = setupPrices(
    (params) => {
      countOp();
      return ok({ success: true, data: Object.fromEntries(params.get('ids').split(',').map((id) => [id, GG_EXAMPLE.data[420]])) });
    },
    { edgeCache: meteredEdge }
  );
  t.after(s.restore);

  const ids50 = Array.from({ length: 50 }, (_, i) => i + 100).join(',');
  subrequests = 0;
  const first50 = await s.get(`steamAppIds=${ids50}`);
  assert.equal(first50.status, 200);
  assert.equal(Object.keys(first50.body.prices).length, 50);
  assert.ok(subrequests <= 3, `50 IDs usaram ${subrequests} subrequests`);

  subrequests = 0;
  const second50 = await s.get(`steamAppIds=${ids50}`);
  assert.equal(second50.status, 200);
  assert.equal(s.calls.length, 1, '50 IDs aproveitam o cache do lote');
  assert.equal(subrequests, 1);

  const ids20 = Array.from({ length: 20 }, (_, i) => i + 1000).join(',');
  subrequests = 0;
  const first20 = await s.get(`steamAppIds=${ids20}`);
  assert.equal(first20.status, 200);
  assert.equal(Object.keys(first20.body.prices).length, 20);
  assert.ok(subrequests <= 41, `20 IDs usaram ${subrequests} subrequests`);

  subrequests = 0;
  const second20 = await s.get(`steamAppIds=${ids20}`);
  assert.equal(second20.status, 200);
  assert.equal(s.calls.length, 2, '20 IDs reaproveitam cache por jogo');
  assert.equal(subrequests, 20);
});

const getMetadata = async (s, query, overrideEnv = s.env) => {
  const res = await worker.fetch(new Request(`https://proxy.test/v1/metadata?${query}`), overrideEnv);
  return { status: res.status, body: await res.json() };
};

test('metadata: busca por Steam AppID e extrai ano, gêneros, temas e série', async (t) => {
  const s = setup((endpoint) => {
    if (endpoint === 'external_games') {
      return ok([
        {
          id: 1,
          game: {
            id: 72,
            name: 'Portal 2',
            first_release_date: 1303171200,
            genres: [{ name: 'Shooter' }, { name: 'Puzzle' }, { name: 'Shooter' }],
            themes: [{ name: 'Sci-fi' }, { name: 'Comedy' }],
            collections: [{ name: 'Portal' }]
          }
        }
      ]);
    }
    assert.fail(`endpoint inesperado: ${endpoint}`);
  });
  t.after(s.restore);

  const { status, body } = await getMetadata(s, 'steamAppId=620&title=Portal%202');
  assert.equal(status, 200);
  assert.deepEqual(body, {
    found: true,
    gameId: 72,
    name: 'Portal 2',
    year: 2011,
    genres: ['Shooter', 'Puzzle'],
    themes: ['Sci-fi', 'Comedy'],
    series: 'Portal'
  });
  assert.ok(s.kv.store.has('meta:v1:steam:620'));
});

test('metadata: completa dados da edição pai quando version_parent está preenchido', async (t) => {
  const s = setup((endpoint) => {
    if (endpoint === 'external_games') {
      return ok([{ game: { id: 900, name: 'The Witcher 3: Complete', version_parent: 1942 } }]);
    }
    return ok([
      {
        id: 1942,
        name: 'The Witcher 3: Wild Hunt',
        first_release_date: 1431993600,
        genres: [{ name: 'Role-playing (RPG)' }],
        collections: [{ name: 'The Witcher' }]
      }
    ]);
  });
  t.after(s.restore);

  const { status, body } = await getMetadata(s, 'steamAppId=292030');
  assert.equal(status, 200);
  assert.equal(body.found, true);
  assert.equal(body.year, 2015);
  assert.deepEqual(body.genres, ['Role-playing (RPG)']);
  assert.equal(body.series, 'The Witcher');
});

test('metadata: fallback por título aceita nome alternativo, usa franquia sem coleção e prioriza melhor correspondência', async (t) => {
  const s = setup((endpoint) => {
    if (endpoint === 'external_games') return ok([]);
    return ok([
      { id: 1, name: 'Resident Evil Zero', genres: [{ name: 'Shooter' }] },
      { id: 2, name: 'Biohazard', alternative_names: [{ name: 'Resident Evil' }], first_release_date: 827452800 },
      {
        id: 3,
        name: 'Biohazard',
        alternative_names: [{ name: 'Resident Evil' }],
        first_release_date: 827452800,
        genres: [{ name: 'Adventure' }],
        themes: [{ name: 'Horror' }],
        franchises: [{ name: 'Resident Evil' }],
        total_rating_count: 500
      }
    ]);
  });
  t.after(s.restore);

  const { status, body } = await getMetadata(s, 'steamAppId=999999&title=Resident%20Evil');
  assert.equal(status, 200);
  assert.deepEqual(body, {
    found: true,
    gameId: 3,
    name: 'Biohazard',
    year: 1996,
    genres: ['Adventure'],
    themes: ['Horror'],
    series: 'Resident Evil'
  });
  assert.ok(s.kv.store.has('meta:v1:title:residentevil'));
});

test('metadata: valida parâmetros e reaproveita cache sem rechamar IGDB', async (t) => {
  const s = setup(() =>
    ok([
      {
        id: 5,
        name: 'Celeste',
        first_release_date: 1516838400,
        genres: [{ name: 'Platform' }, { name: 'Indie' }],
        themes: [{ name: 'Action' }]
      }
    ])
  );
  t.after(s.restore);

  assert.equal((await getMetadata(s, '')).status, 400);
  assert.equal((await getMetadata(s, 'steamAppId=xyz')).status, 400);
  assert.equal((await getMetadata(s, 'title=%20')).status, 400);

  const first = await getMetadata(s, 'title=Celeste');
  assert.equal(first.status, 200);
  assert.equal(first.body.series, null);
  const callsBefore = s.calls.igdb.length;
  const second = await getMetadata(s, 'title=CELESTE');
  assert.equal(second.status, 200);
  assert.equal(s.calls.igdb.length, callsBefore);
});
