import { SITE_PAGES } from './site.js';
// Intermediário entre o Lazulium e o IGDB. A credencial da Twitch fica só aqui: o app nunca a vê.
// Também guarda a chave do GG.deals e responde "quanto custa este jogo nas lojas".
// Só responde "quanto tempo leva este jogo" e "quais jogos têm esse nome": não aceita consulta livre, então a URL pública não serve para mais nada.

const IGDB_BASE = 'https://api.igdb.com/v4';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const STEAM_SOURCE = 1;             // external_game_sources: Steam
const TOKEN_KEY = 'twitch:token';
const TOKEN_MARGIN_SECONDS = 24 * 60 * 60;
const FOUND_TTL_SECONDS = 30 * 24 * 60 * 60;
const NOT_FOUND_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_TITLE_LENGTH = 120;
const MAX_CANDIDATES = 10;
const MAX_SEARCH_RESULTS = 12;
const MIN_SEARCH_LENGTH = 2;
const GGDEALS_URL = 'https://api.gg.deals/v1/prices/by-steam-app-id/';
const GGDEALS_REGION = 'br';
const MAX_PRICE_IDS = 50;
const PRICES_TTL_SECONDS = 6 * 60 * 60;
const COVER_URL = (imageId) => `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
const RETRY_DELAY_MS = 300;
const UPSTREAM_TIMEOUT_MS = 10_000;  // Twitch, IGDB ou GG.deals travados não seguram o app esperando

class UpstreamError extends Error {}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function normalizeTitle(value) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

// "The Legend of Zelda (1986)" -> "The Legend of Zelda". Aspas, barra e ponto e vírgula encerrariam a consulta do IGDB.
export function cleanTitle(value) {
  return value
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .replace(/[™®©]/g, '')
    .replace(/["\\;*]/g, ' ')
    .replace(/\p{C}/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function requestToken(env) {
  // Segredo no corpo do POST, não na URL (URLs aparecem em logs)
  const body = new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  if (!res.ok) throw new UpstreamError(`Twitch recusou a credencial (${res.status})`);
  const data = await res.json();
  if (!data.access_token) throw new UpstreamError('Twitch não devolveu token');
  // A Twitch mantém só 25 tokens ativos: guardar evita gerar um a cada requisição
  const ttl = Math.max(60, (data.expires_in ?? 0) - TOKEN_MARGIN_SECONDS);
  await env.IGDB_CACHE.put(TOKEN_KEY, data.access_token, { expirationTtl: ttl });
  return data.access_token;
}

async function igdb(env, endpoint, body, state) {
  state.token ??= (await env.IGDB_CACHE.get(TOKEN_KEY)) ?? (await requestToken(env));
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${IGDB_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'Client-ID': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${state.token}`, Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
    if (res.ok) return res.json();
    if (res.status === 401 && attempt === 0) {
      state.token = await requestToken(env);
      continue;
    }
    if (res.status === 429 && attempt === 0) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    throw new UpstreamError(`IGDB respondeu ${res.status} em ${endpoint}`);
  }
}

const timeToBeat = (env, gameIds, state) =>
  igdb(env, 'game_time_to_beats', `fields game_id,hastily,normally,completely,count; where game_id = (${gameIds.join(',')}); limit ${gameIds.length};`, state);

function toResult(entry, name) {
  return { found: true, gameId: entry.game_id, name, hastily: entry.hastily ?? null, normally: entry.normally ?? null, completely: entry.completely ?? null, count: entry.count ?? 0 };
}

const hasTimes = (entry) => entry.hastily || entry.normally || entry.completely;

async function lookupBySteam(env, appId, state) {
  const [external] = await igdb(env, 'external_games', `fields game,game.name; where external_game_source = ${STEAM_SOURCE} & uid = "${appId}"; limit 1;`, state);
  if (!external?.game?.id) return null;
  const [entry] = await timeToBeat(env, [external.game.id], state);
  return entry && hasTimes(entry) ? toResult(entry, external.game.name) : { found: false };
}

// Só aceita nome igual (ignorando pontuação e maiúsculas): sugestão parecida traria o tempo de outro jogo.
// Versões de mesmo nome (original e remake) ficam com a que tem mais envios.
async function lookupByTitle(env, title, state) {
  const wanted = normalizeTitle(title);
  if (wanted.length < 2) return { found: false };
  const games = await igdb(env, 'games', `search "${title}"; fields name,alternative_names.name; where version_parent = null; limit 50;`, state);
  const candidates = games
    .filter((g) => normalizeTitle(g.name ?? '') === wanted || g.alternative_names?.some((alt) => normalizeTitle(alt.name ?? '') === wanted))
    .slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return { found: false };
  const entries = (await timeToBeat(env, candidates.map((g) => g.id), state)).filter(hasTimes).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  if (entries.length === 0) return { found: false };
  return toResult(entries[0], candidates.find((g) => g.id === entries[0].game_id)?.name ?? title);
}

async function searchGames(env, query, state) {
  const games = await igdb(env, 'games', `search "${query}"; fields name,first_release_date,cover.image_id; where version_parent = null; limit ${MAX_SEARCH_RESULTS};`, state);
  const results = games
    .filter((g) => g.name)
    .map((g) => ({
      name: g.name,
      year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : undefined,
      coverUrl: g.cover?.image_id ? COVER_URL(g.cover.image_id) : undefined
    }));
  return { found: results.length > 0, results };
}

async function cached(env, key, load) {
  const hit = await env.IGDB_CACHE.get(key, 'json');
  if (hit) return hit;
  const result = await load();
  // Cota de escrita esgotada não pode derrubar uma resposta que já está pronta
  await env.IGDB_CACHE.put(key, JSON.stringify(result), { expirationTtl: result.found ? FOUND_TTL_SECONDS : NOT_FOUND_TTL_SECONDS }).catch(() => undefined);
  return result;
}

// O GG.deals manda preços como texto decimal ("91.99") ou null. Só aceita número simples: "1,234.56" ou "abc" viram null,
// em vez de um preço errado (parseFloat("1,234.56") daria 1).
export function toCents(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  if (typeof value !== 'string' || !/^\s*\d+(\.\d+)?\s*$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

// Formato documentado em gg.deals/api/prices: { success, data: { "<appId>": { title, url, prices: { currentRetail,
// currentKeyshops, historicalRetail, historicalKeyshops, currency } } | null } }. Só os campos que o app usa saem daqui.
export function toDeal(entry) {
  if (!entry || typeof entry !== 'object' || !entry.prices || typeof entry.prices !== 'object') return null;
  const { prices } = entry;
  const currency = typeof prices.currency === 'string' && /^[A-Z]{3}$/.test(prices.currency) ? prices.currency : null;
  if (!currency) return null;
  return {
    // O link vai como veio (o GG.deals pede o link original), mas só para o próprio site
    url: typeof entry.url === 'string' && entry.url.startsWith('https://gg.deals/') ? entry.url : null,
    currency,
    retail: toCents(prices.currentRetail),
    keyshops: toCents(prices.currentKeyshops),
    lowestRetail: toCents(prices.historicalRetail),
    lowestKeyshops: toCents(prices.historicalKeyshops)
  };
}

const priceCacheKey = (id) => new Request(`https://cache.lazulium/prices/v2/${GGDEALS_REGION}/${id}`);

// A chave do GG.deals tem limite por jogo consultado (100 por minuto, 1.000 por hora), e cada pessoa tem uma lista diferente:
// o cache é por jogo, na borda da Cloudflare (não gasta a cota de escrita do KV), e só os que faltam vão ao GG.deals.
async function handlePrices(url, request, env) {
  const raw = url.searchParams.get('steamAppIds') ?? '';
  const ids = [...new Set(raw.split(',').filter(Boolean))];
  if (ids.length === 0 || ids.length > MAX_PRICE_IDS || ids.some((id) => !/^\d{1,10}$/.test(id))) return json({ error: 'invalid_steam_app_ids' }, 400);
  if (!env.GGDEALS_API_KEY) return json({ error: 'not_configured' }, 503);
  if (await isRateLimited(request, env)) return json({ error: 'rate_limited' }, 429);

  ids.sort((a, b) => Number(a) - Number(b));
  const edgeCache = globalThis.caches?.default;
  const prices = {};
  const missing = [];
  for (const id of ids) {
    const hit = await edgeCache?.match(priceCacheKey(id)).catch(() => undefined);
    const cached = hit ? await hit.json().catch(() => undefined) : undefined;
    if (cached && typeof cached === 'object' && 'deal' in cached) prices[id] = cached.deal;
    else missing.push(id);
  }
  if (missing.length === 0) return json({ source: 'gg.deals', region: GGDEALS_REGION, prices });

  try {
    const params = new URLSearchParams({ ids: missing.join(','), key: env.GGDEALS_API_KEY, region: GGDEALS_REGION });
    const res = await fetch(`${GGDEALS_URL}?${params}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (res.status === 429) {
      // Cota da chave esgotada: o app tenta de novo na próxima atualização; o que já estava em cache segue junto
      const retryAfter = res.headers.get('Retry-After');
      if (Object.keys(prices).length > 0) return json({ source: 'gg.deals', region: GGDEALS_REGION, prices, incomplete: true });
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(retryAfter && /^\d{1,5}$/.test(retryAfter) ? { 'Retry-After': retryAfter } : {}) }
      });
    }
    if (!res.ok) throw new UpstreamError(`GG.deals respondeu ${res.status}`);
    const body = await res.json().catch(() => null);
    if (!body || body.success !== true || typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) {
      throw new UpstreamError('GG.deals devolveu um formato inesperado');
    }
    for (const id of missing) {
      const deal = toDeal(body.data[id]);
      prices[id] = deal;
      if (edgeCache) {
        const stored = new Response(JSON.stringify({ deal }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${PRICES_TTL_SECONDS}` } });
        await edgeCache.put(priceCacheKey(id), stored).catch(() => undefined);
      }
    }
    return json({ source: 'gg.deals', region: GGDEALS_REGION, prices });
  } catch (err) {
    // Parte em cache ainda serve: o app só atualiza os jogos que vieram
    if (Object.keys(prices).length > 0) {
      upstreamFailure(err);
      return json({ source: 'gg.deals', region: GGDEALS_REGION, prices, incomplete: true });
    }
    return upstreamFailure(err);
  }
}

async function isRateLimited(request, env) {
  if (!env.RATE_LIMITER) return false;
  const { success } = await env.RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' });
  return !success;
}

function upstreamFailure(err) {
  // Falha temporária nunca vai para o cache: a próxima tentativa consulta de novo.
  // No log, só nome e mensagem, sem chave nem segredo que algum erro traga junto (URL com ?key=, client_secret=).
  const detail = err instanceof UpstreamError ? err.message : `Erro inesperado: ${err?.name ?? 'Error'}: ${String(err?.message ?? '')}`;
  console.error(detail.replace(/(key|client_secret|access_token)=[^&\s]+/gi, '$1=***'));
  return json({ error: 'upstream_unavailable' }, 503);
}

async function handleSearch(url, request, env) {
  const raw = url.searchParams.get('q') ?? '';
  const query = cleanTitle(raw);
  if (raw.length > MAX_TITLE_LENGTH || query.length < MIN_SEARCH_LENGTH) return json({ error: 'invalid_query' }, 400);
  if (await isRateLimited(request, env)) return json({ error: 'rate_limited' }, 429);
  try {
    return json(await cached(env, `search:v1:${normalizeTitle(query)}`, () => searchGames(env, query, {})));
  } catch (err) {
    return upstreamFailure(err);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Páginas públicas (início e política de privacidade), exigidas pelo Google para o login do Drive
    const sitePath = url.pathname.replace(/\/+$/, '') || '/';
    if (SITE_PAGES[sitePath] && (request.method === 'GET' || request.method === 'HEAD')) {
      return new Response(request.method === 'HEAD' ? null : SITE_PAGES[sitePath], {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'" }
      });
    }
    const isSearch = url.pathname === '/v1/search';
    const isPrices = url.pathname === '/v1/prices';
    if (!isSearch && !isPrices && url.pathname !== '/v1/time-to-beat') return json({ error: 'not_found' }, 404);
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    if (isPrices) return handlePrices(url, request, env);
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET || !env.IGDB_CACHE) return json({ error: 'not_configured' }, 503);
    if (isSearch) return handleSearch(url, request, env);

    const appId = url.searchParams.get('steamAppId');
    const rawTitle = url.searchParams.get('title');
    const title = rawTitle ? cleanTitle(rawTitle) : '';
    if (appId !== null && !/^\d{1,10}$/.test(appId)) return json({ error: 'invalid_steam_app_id' }, 400);
    if (rawTitle !== null && (rawTitle.length > MAX_TITLE_LENGTH || !title)) return json({ error: 'invalid_title' }, 400);
    if (appId === null && !title) return json({ error: 'missing_query' }, 400);

    if (await isRateLimited(request, env)) return json({ error: 'rate_limited' }, 429);

    const state = {};
    try {
      if (appId !== null) {
        const bySteam = await cached(env, `ttb:v1:steam:${appId}`, async () => (await lookupBySteam(env, appId, state)) ?? { found: false, unmapped: true });
        if (bySteam.found || !bySteam.unmapped || !title) return json(bySteam);
      }
      return json(await cached(env, `ttb:v1:title:${normalizeTitle(title)}`, () => lookupByTitle(env, title, state)));
    } catch (err) {
      return upstreamFailure(err);
    }
  }
};
