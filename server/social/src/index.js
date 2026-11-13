// Conta Lazulium: login pela Steam (verificado aqui, não no app), amigos, "jogando agora" e feed.
// Roda no Cloudflare Workers com D1 (env.DB). O server.mjs roda o mesmo código em Node com SQLite (VPS e testes).
// Nada de e-mail, senha, caminhos do PC ou chaves: só o que aparece para os amigos.

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656\d{13})$/;
const STATE = /^[A-Za-z0-9_-]{16,64}$/;
const SIGNED_FIELDS = ['claimed_id', 'identity', 'return_to', 'op_endpoint', 'response_nonce', 'assoc_handle'];
const UPSTREAM_TIMEOUT_MS = 10_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 180 * DAY_MS;
const AUTH_CODE_TTL_MS = 2 * 60 * 1000;
const INVITE_TTL_MS = 7 * DAY_MS;
const NOW_PLAYING_STALE_MS = 15 * 60 * 1000;   // O app renova a cada 5 min; sem sinal, some
const MAX_EVENTS_PER_POST = 200;
const MAX_ACTIVITIES_PER_USER = 2_000;
const MAX_FEED = 50;
const MAX_SUMMARY_BYTES = 20_000;
const MAX_REVIEW_TEXT = 2_000;
const MAX_TITLE = 200;
const MAX_SHOWCASE_BYTES = 400_000;
const MAX_MEDIA_BASE64 = 1_500_000;       // ~1,1 MB de imagem: o app reduz antes de enviar
const MEDIA_KINDS = ['avatar', 'background', 'artwork'];
const MEDIA_MIME = /^image\/(jpeg|png|webp|gif)$/;   // GIF vai como está, para chegar animado
const VIEW_LINK_TTL_MS = 30 * 60 * 1000;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // Sem 0/O e 1/I, para ditar por voz

export const ACTIVITY_KINDS = ['played', 'started', 'finished', 'completed', 'dropped', 'rated', 'reviewed', 'achievements', 'perfect'];
export const DEFAULT_SETTINGS = { shareProfile: true, shareActivity: true, sharePlaytime: true, shareAchievements: true, shareReviews: true, shareNowPlaying: true };
// Qual chave de privacidade libera cada tipo de evento
const KIND_SETTING = {
  played: 'sharePlaytime',
  achievements: 'shareAchievements',
  perfect: 'shareAchievements',
  rated: 'shareReviews',
  reviewed: 'shareReviews'
};
// Capas só de CDNs públicos conhecidos: o feed não vira hospedagem de qualquer link
const COVER_URL = /^https:\/\/(cdn\.cloudflare\.steamstatic\.com|shared\.[a-z.]*steamstatic\.com|steamcdn-a\.akamaihd\.net|images\.igdb\.com|cdn2\.steamgriddb\.com)\/[\w\-./%]+$/i;
const AVATAR_URL = /^https:\/\/avatars\.(steamstatic|akamai\.steamstatic|cloudflare\.steamstatic)\.com\/[\w\-./]+$/i;
const GAME_KEY = /^(steam:\d{1,10}|t:[a-z0-9]{1,120})$/;

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const redirect = (location) => new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } });
const nowIso = () => new Date().toISOString();
const later = (ms) => new Date(Date.now() + ms).toISOString();

function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function inviteCode() {
  const data = crypto.getRandomValues(new Uint8Array(8));
  return [...data].map((b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
}

const cleanText = (value, max) => (typeof value === 'string' ? value.replace(/\p{C}/gu, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max) : '');

async function readJson(request, maxBytes = 200_000) {
  // Corpo anunciado grande demais é recusado antes de ser lido
  if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes * 4) throw new HttpError(413, 'too_large');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

function parseSettings(raw) {
  let saved = {};
  try {
    saved = JSON.parse(raw || '{}');
  } catch {}
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) if (typeof saved[key] === 'boolean') settings[key] = saved[key];
  return settings;
}

const publicUser = (row) => ({
  id: row.id,
  name: row.custom_name || row.steam_name || 'Jogador',
  avatarUrl: row.steam_avatar || null
});

// ---------- Login pela Steam ----------

function callbackUrl(origin, port, state) {
  return `${origin}/v1/auth/steam/callback?${new URLSearchParams({ port: String(port), state })}`;
}

function parsePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null;
}

function handleStart(url) {
  const port = parsePort(url.searchParams.get('port'));
  const state = url.searchParams.get('state') ?? '';
  if (!port || !STATE.test(state)) return json({ error: 'invalid_request' }, 400);
  const returnTo = callbackUrl(url.origin, port, state);
  const target = new URL(STEAM_OPENID);
  target.search = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': url.origin,
    'openid.identity': `${OPENID_NS}/identifier_select`,
    'openid.claimed_id': `${OPENID_NS}/identifier_select`
  }).toString();
  return redirect(target.toString());
}

// A própria Steam confirma que a resposta não foi forjada
async function verifySteam(params, expectedReturnTo) {
  if (params.get('openid.return_to') !== expectedReturnTo) return null;
  const steamId = params.get('openid.claimed_id')?.match(CLAIMED_ID)?.[1];
  if (!steamId || params.get('openid.identity') !== params.get('openid.claimed_id')) return null;
  // A assinatura da Steam precisa cobrir o SteamID e o endereço de retorno
  const signed = new Set((params.get('openid.signed') ?? '').split(','));
  if (params.get('openid.op_endpoint') !== STEAM_OPENID || !SIGNED_FIELDS.every((field) => signed.has(field))) return null;
  const body = new URLSearchParams();
  for (const [key, value] of params) if (key.startsWith('openid.')) body.set(key, value);
  body.set('openid.mode', 'check_authentication');
  const res = await fetch(STEAM_OPENID, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  if (!res.ok) return null;
  return /is_valid\s*:\s*true/.test(await res.text()) ? steamId : null;
}

// Nome e avatar públicos (XML da comunidade, sem chave). Falhar aqui não impede o login.
async function fetchSteamProfile(steamId) {
  try {
    const res = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!res.ok) return {};
    const xml = await res.text();
    const field = (tag) => xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`))?.[1]?.trim();
    const avatar = field('avatarFull') || field('avatarMedium');
    return { name: cleanText(field('steamID'), 64) || undefined, avatar: avatar && AVATAR_URL.test(avatar) ? avatar : undefined };
  } catch {
    return {};
  }
}

async function handleCallback(url, env) {
  const port = parsePort(url.searchParams.get('port'));
  const state = url.searchParams.get('state') ?? '';
  if (!port || !STATE.test(state)) return json({ error: 'invalid_request' }, 400);
  const back = (query) => redirect(`http://127.0.0.1:${port}/?${new URLSearchParams({ state, ...query })}`);
  if (url.searchParams.get('openid.mode') !== 'id_res') return back({ error: 'cancelled' });

  let steamId;
  try {
    steamId = await verifySteam(url.searchParams, callbackUrl(url.origin, port, state));
  } catch {
    return back({ error: 'steam_unavailable' });
  }
  if (!steamId) return back({ error: 'not_verified' });

  const profile = await fetchSteamProfile(steamId);
  const now = nowIso();
  const existing = await env.DB.prepare('SELECT id FROM users WHERE steam_id = ?').bind(steamId).first();
  const userId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await env.DB.prepare('UPDATE users SET steam_name = COALESCE(?, steam_name), steam_avatar = COALESCE(?, steam_avatar), last_seen_at = ? WHERE id = ?')
      .bind(profile.name ?? null, profile.avatar ?? null, now, userId)
      .run();
  } else {
    await env.DB.prepare('INSERT INTO users (id, steam_id, steam_name, steam_avatar, settings, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(userId, steamId, profile.name ?? null, profile.avatar ?? null, JSON.stringify(DEFAULT_SETTINGS), now, now)
      .run();
  }
  const code = randomToken();
  await env.DB.prepare('INSERT INTO auth_codes (code_hash, user_id, state, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(code), userId, state, later(AUTH_CODE_TTL_MS))
    .run();
  return back({ code });
}

async function handleExchange(request, env) {
  const body = await readJson(request, 2_000);
  const code = typeof body?.code === 'string' ? body.code : '';
  const state = typeof body?.state === 'string' ? body.state : '';
  if (!code || !STATE.test(state)) throw new HttpError(400, 'invalid_request');
  const hash = await sha256(code);
  const row = await env.DB.prepare('SELECT user_id, state, expires_at FROM auth_codes WHERE code_hash = ?').bind(hash).first();
  // Uso único: apaga antes de conferir, para um código vazado não servir duas vezes
  await env.DB.prepare('DELETE FROM auth_codes WHERE code_hash = ? OR expires_at < ?').bind(hash, nowIso()).run();
  if (!row || row.state !== state || row.expires_at < nowIso()) throw new HttpError(401, 'invalid_code');

  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), row.user_id, nowIso(), later(SESSION_TTL_MS))
    .run();
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.user_id).first();
  return json({ token, user: publicUser(user), settings: parseSettings(user.settings) });
}

// ---------- Sessão ----------

async function authenticate(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || token.length > 100) throw new HttpError(401, 'unauthorized');
  const hash = await sha256(token);
  const row = await env.DB.prepare('SELECT u.*, s.expires_at AS session_expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .bind(hash)
    .first();
  if (!row || row.session_expires < nowIso()) throw new HttpError(401, 'unauthorized');
  // "Visto por último" com folga de 10 min: não grava a cada pedido
  if (Date.parse(row.last_seen_at) < Date.now() - 10 * 60 * 1000) {
    await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(nowIso(), row.id).run();
  }
  return { user: row, tokenHash: hash };
}

async function areFriends(env, a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return !!(await env.DB.prepare('SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?').bind(x, y).first());
}

async function friendIds(env, userId) {
  const { results } = await env.DB.prepare('SELECT user_b AS id FROM friendships WHERE user_a = ? UNION SELECT user_a AS id FROM friendships WHERE user_b = ?')
    .bind(userId, userId)
    .all();
  return results.map((r) => r.id);
}

// ---------- Eu ----------

async function handleMe(request, env, auth) {
  const { user } = auth;
  if (request.method === 'GET') return json({ user: { ...publicUser(user), steamId: user.steam_id }, settings: parseSettings(user.settings) });

  if (request.method === 'PATCH') {
    const body = await readJson(request, 5_000);
    const updates = [];
    if (body && 'name' in body) {
      const name = body.name === null ? '' : cleanText(body.name, 32);
      if (body.name !== null && name.length < 2) throw new HttpError(400, 'invalid_name');
      updates.push(env.DB.prepare('UPDATE users SET custom_name = ? WHERE id = ?').bind(name || null, user.id));
    }
    if (body && typeof body.settings === 'object' && body.settings) {
      const settings = parseSettings(user.settings);
      for (const key of Object.keys(DEFAULT_SETTINGS)) if (typeof body.settings[key] === 'boolean') settings[key] = body.settings[key];
      updates.push(env.DB.prepare('UPDATE users SET settings = ? WHERE id = ?').bind(JSON.stringify(settings), user.id));
      if (!settings.shareNowPlaying) updates.push(env.DB.prepare('DELETE FROM now_playing WHERE user_id = ?').bind(user.id));
    }
    if (updates.length) await env.DB.batch(updates);
    const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    return json({ user: { ...publicUser(fresh), steamId: fresh.steam_id }, settings: parseSettings(fresh.settings) });
  }

  if (request.method === 'DELETE') {
    // Apagar a conta remove tudo, na hora
    await env.DB.batch(
      [
        'DELETE FROM activities WHERE user_id = ?',
        'DELETE FROM now_playing WHERE user_id = ?',
        'DELETE FROM invites WHERE user_id = ?',
        'DELETE FROM auth_codes WHERE user_id = ?',
        'DELETE FROM sessions WHERE user_id = ?',
        'DELETE FROM showcases WHERE user_id = ?',
        'DELETE FROM media WHERE user_id = ?',
        'DELETE FROM view_links WHERE owner_id = ?',
        'DELETE FROM users WHERE id = ?'
      ]
        .map((sql) => env.DB.prepare(sql).bind(user.id))
        .concat(env.DB.prepare('DELETE FROM friendships WHERE user_a = ? OR user_b = ?').bind(user.id, user.id))
    );
    return json({ deleted: true });
  }
  throw new HttpError(405, 'method_not_allowed');
}

function toActivityRow(event) {
  if (!event || typeof event !== 'object') return null;
  const id = typeof event.id === 'string' && /^[\w|:.\-]{1,200}$/.test(event.id) ? event.id : null;
  const kind = ACTIVITY_KINDS.includes(event.kind) ? event.kind : null;
  const gameKey = typeof event.gameKey === 'string' && GAME_KEY.test(event.gameKey) ? event.gameKey : null;
  const title = cleanText(event.gameTitle, MAX_TITLE);
  const at = typeof event.at === 'string' && !Number.isNaN(Date.parse(event.at)) ? new Date(event.at).toISOString() : null;
  if (!id || !kind || !gameKey || !title || !at || Date.parse(at) > Date.now() + DAY_MS) return null;
  const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  return {
    id,
    kind,
    gameKey,
    title,
    cover: typeof event.coverUrl === 'string' && COVER_URL.test(event.coverUrl) ? event.coverUrl : null,
    at,
    rating: kind === 'rated' || kind === 'reviewed' ? num(event.rating, 5) : null,
    count: kind === 'achievements' ? num(event.count, 100_000) : null,
    seconds: kind === 'played' ? num(event.seconds, 7 * 24 * 3600) : null,
    text: kind === 'reviewed' ? cleanText(event.text, MAX_REVIEW_TEXT) || null : null
  };
}

async function handleActivities(request, env, auth) {
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  const body = await readJson(request, 1_000_000);
  const events = Array.isArray(body?.events) ? body.events : null;
  if (!events || events.length > MAX_EVENTS_PER_POST) throw new HttpError(400, 'invalid_events');
  const rows = events.map(toActivityRow).filter(Boolean);
  if (rows.length) {
    await env.DB.batch(
      rows.map((r) =>
        env.DB.prepare(
          `INSERT INTO activities (user_id, id, kind, game_key, game_title, cover_url, at, rating, count, seconds, text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, id) DO UPDATE SET kind = excluded.kind, game_key = excluded.game_key, game_title = excluded.game_title,
             cover_url = excluded.cover_url, at = excluded.at, rating = excluded.rating, count = excluded.count, seconds = excluded.seconds, text = excluded.text`
        ).bind(auth.user.id, r.id, r.kind, r.gameKey, r.title, r.cover, r.at, r.rating, r.count, r.seconds, r.text)
      )
    );
    // Guarda só os mais recentes de cada pessoa
    await env.DB.prepare(
      'DELETE FROM activities WHERE user_id = ? AND id IN (SELECT id FROM activities WHERE user_id = ? ORDER BY at DESC LIMIT -1 OFFSET ?)'
    )
      .bind(auth.user.id, auth.user.id, MAX_ACTIVITIES_PER_USER)
      .run();
  }
  return json({ accepted: rows.length, rejected: events.length - rows.length });
}

// O app manda os eventos que a pessoa removeu (nota apagada, jogo escondido)
async function handleActivityDelete(request, env, auth) {
  const body = await readJson(request, 50_000);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id) => typeof id === 'string' && id.length <= 200).slice(0, MAX_EVENTS_PER_POST) : [];
  if (ids.length) await env.DB.batch(ids.map((id) => env.DB.prepare('DELETE FROM activities WHERE user_id = ? AND id = ?').bind(auth.user.id, id)));
  return json({ deleted: ids.length });
}

async function handleNowPlaying(request, env, auth) {
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM now_playing WHERE user_id = ?').bind(auth.user.id).run();
    return json({ ok: true });
  }
  if (request.method !== 'PUT') throw new HttpError(405, 'method_not_allowed');
  if (!parseSettings(auth.user.settings).shareNowPlaying) return json({ ok: true, shared: false });
  const body = await readJson(request, 5_000);
  const gameKey = typeof body?.gameKey === 'string' && GAME_KEY.test(body.gameKey) ? body.gameKey : null;
  const title = cleanText(body?.gameTitle, MAX_TITLE);
  const since = typeof body?.since === 'string' && !Number.isNaN(Date.parse(body.since)) ? new Date(body.since).toISOString() : nowIso();
  if (!gameKey || !title) throw new HttpError(400, 'invalid_game');
  const cover = typeof body.coverUrl === 'string' && COVER_URL.test(body.coverUrl) ? body.coverUrl : null;
  await env.DB.prepare(
    `INSERT INTO now_playing (user_id, game_key, game_title, cover_url, since, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET game_key = excluded.game_key, game_title = excluded.game_title, cover_url = excluded.cover_url,
       since = excluded.since, updated_at = excluded.updated_at`
  )
    .bind(auth.user.id, gameKey, title, cover, since, nowIso())
    .run();
  return json({ ok: true, shared: true });
}

// Resumo do perfil (totais e jogos mais jogados), mandado pelo app: o amigo vê sem o servidor recalcular nada
function cleanSummary(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
  const totals = raw.totals && typeof raw.totals === 'object' ? raw.totals : {};
  const games = Array.isArray(raw.topGames) ? raw.topGames.slice(0, 24) : [];
  return {
    totals: {
      games: count(totals.games),
      playtimeSeconds: count(totals.playtimeSeconds),
      achievementsUnlocked: count(totals.achievementsUnlocked),
      perfectGames: count(totals.perfectGames),
      finishedGames: count(totals.finishedGames)
    },
    topGames: games
      .map((g) => ({
        gameKey: typeof g?.gameKey === 'string' && GAME_KEY.test(g.gameKey) ? g.gameKey : null,
        title: cleanText(g?.title, MAX_TITLE),
        coverUrl: typeof g?.coverUrl === 'string' && COVER_URL.test(g.coverUrl) ? g.coverUrl : null,
        playtimeSeconds: count(g?.playtimeSeconds),
        rating: typeof g?.rating === 'number' && g.rating >= 0.5 && g.rating <= 5 ? g.rating : null
      }))
      .filter((g) => g.gameKey && g.title),
    updatedAt: nowIso()
  };
}

async function handleSummary(request, env, auth) {
  if (request.method !== 'PUT') throw new HttpError(405, 'method_not_allowed');
  const summary = cleanSummary(await readJson(request, MAX_SUMMARY_BYTES));
  if (!summary) throw new HttpError(400, 'invalid_summary');
  await env.DB.prepare('UPDATE users SET summary = ? WHERE id = ?').bind(JSON.stringify(summary), auth.user.id).run();
  return json({ ok: true });
}

// ---------- Amigos ----------

async function handleInvite(request, env, auth) {
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  const now = nowIso();
  const current = await env.DB.prepare('SELECT code, expires_at FROM invites WHERE user_id = ? AND expires_at > ? ORDER BY expires_at DESC').bind(auth.user.id, now).first();
  if (current) return json({ code: current.code, expiresAt: current.expires_at });
  const code = inviteCode();
  const expiresAt = later(INVITE_TTL_MS);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM invites WHERE user_id = ? OR expires_at < ?').bind(auth.user.id, now),
    env.DB.prepare('INSERT INTO invites (code, user_id, expires_at) VALUES (?, ?, ?)').bind(code, auth.user.id, expiresAt)
  ]);
  return json({ code, expiresAt });
}

async function handleAccept(request, env, auth) {
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  const body = await readJson(request, 1_000);
  const code = typeof body?.code === 'string' ? body.code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  if (code.length !== 8) throw new HttpError(400, 'invalid_code');
  const invite = await env.DB.prepare('SELECT user_id, expires_at FROM invites WHERE code = ?').bind(code).first();
  if (!invite || invite.expires_at < nowIso()) throw new HttpError(404, 'invite_not_found');
  if (invite.user_id === auth.user.id) throw new HttpError(400, 'own_invite');
  const [a, b] = invite.user_id < auth.user.id ? [invite.user_id, auth.user.id] : [auth.user.id, invite.user_id];
  await env.DB.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)').bind(a, b, nowIso()).run();
  const friend = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(invite.user_id).first();
  return json({ friend: publicUser(friend) });
}

function nowPlayingOf(row, settings) {
  if (!row?.np_game_key || !settings.shareNowPlaying || Date.parse(row.np_updated_at) < Date.now() - NOW_PLAYING_STALE_MS) return null;
  return { gameKey: row.np_game_key, gameTitle: row.np_game_title, coverUrl: row.np_cover_url, since: row.np_since };
}

async function handleFriends(request, env, auth, friendId) {
  if (friendId) {
    if (request.method !== 'DELETE') throw new HttpError(405, 'method_not_allowed');
    const [a, b] = friendId < auth.user.id ? [friendId, auth.user.id] : [auth.user.id, friendId];
    await env.DB.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').bind(a, b).run();
    return json({ ok: true });
  }
  if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
  const ids = await friendIds(env, auth.user.id);
  if (ids.length === 0) return json({ friends: [] });
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT u.*, n.game_key AS np_game_key, n.game_title AS np_game_title, n.cover_url AS np_cover_url, n.since AS np_since, n.updated_at AS np_updated_at
     FROM users u LEFT JOIN now_playing n ON n.user_id = u.id WHERE u.id IN (${placeholders})`
  )
    .bind(...ids)
    .all();
  const friends = results
    .map((row) => ({ ...publicUser(row), lastSeenAt: row.last_seen_at, nowPlaying: nowPlayingOf(row, parseSettings(row.settings)) }))
    .sort((x, y) => Number(!!y.nowPlaying) - Number(!!x.nowPlaying) || y.lastSeenAt.localeCompare(x.lastSeenAt));
  return json({ friends });
}

const activityJson = (row) => ({
  id: row.id,
  kind: row.kind,
  gameKey: row.game_key,
  gameTitle: row.game_title,
  coverUrl: row.cover_url,
  at: row.at,
  rating: row.rating ?? undefined,
  count: row.count ?? undefined,
  seconds: row.seconds ?? undefined,
  text: row.text ?? undefined
});

// Só o que a pessoa escolheu mostrar
const visibleKinds = (settings) => (settings.shareActivity ? ACTIVITY_KINDS.filter((k) => !KIND_SETTING[k] || settings[KIND_SETTING[k]]) : []);

async function handleFeed(url, env, auth) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), MAX_FEED);
  const before = url.searchParams.get('before');
  const beforeIso = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : '9999-12-31T00:00:00.000Z';
  const ids = await friendIds(env, auth.user.id);
  if (ids.length === 0) return json({ items: [] });
  const { results: friends } = await env.DB.prepare(`SELECT * FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();

  const clauses = [];
  const args = [];
  for (const friend of friends) {
    const kinds = visibleKinds(parseSettings(friend.settings));
    if (kinds.length === 0) continue;
    clauses.push(`(a.user_id = ? AND a.kind IN (${kinds.map(() => '?').join(',')}))`);
    args.push(friend.id, ...kinds);
  }
  if (clauses.length === 0) return json({ items: [] });
  const { results } = await env.DB.prepare(`SELECT a.* FROM activities a WHERE (${clauses.join(' OR ')}) AND a.at < ? ORDER BY a.at DESC LIMIT ?`)
    .bind(...args, beforeIso, limit)
    .all();
  const byId = new Map(friends.map((f) => [f.id, publicUser(f)]));
  return json({ items: results.map((row) => ({ ...activityJson(row), user: byId.get(row.user_id) })) });
}

async function handleUser(env, auth, userId) {
  if (userId !== auth.user.id && !(await areFriends(env, auth.user.id, userId))) throw new HttpError(404, 'not_found');
  const row = await env.DB.prepare(
    `SELECT u.*, n.game_key AS np_game_key, n.game_title AS np_game_title, n.cover_url AS np_cover_url, n.since AS np_since, n.updated_at AS np_updated_at
     FROM users u LEFT JOIN now_playing n ON n.user_id = u.id WHERE u.id = ?`
  )
    .bind(userId)
    .first();
  if (!row) throw new HttpError(404, 'not_found');
  const settings = parseSettings(row.settings);
  const kinds = visibleKinds(settings);
  const { results } = kinds.length
    ? await env.DB.prepare(`SELECT * FROM activities WHERE user_id = ? AND kind IN (${kinds.map(() => '?').join(',')}) ORDER BY at DESC LIMIT 40`)
        .bind(userId, ...kinds)
        .all()
    : { results: [] };
  let summary = null;
  try {
    summary = row.summary ? JSON.parse(row.summary) : null;
  } catch {}
  if (summary && !settings.sharePlaytime) {
    summary = { ...summary, totals: { ...summary.totals, playtimeSeconds: 0 }, topGames: summary.topGames.map((g) => ({ ...g, playtimeSeconds: 0 })) };
  }
  if (summary && !settings.shareReviews) summary = { ...summary, topGames: summary.topGames.map((g) => ({ ...g, rating: null })) };
  return json({
    user: { ...publicUser(row), lastSeenAt: row.last_seen_at },
    nowPlaying: nowPlayingOf(row, settings),
    summary,
    activities: results.map(activityJson)
  });
}

// ---------- Vitrine do perfil ----------

async function handleShowcase(request, env, auth) {
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM showcases WHERE user_id = ?').bind(auth.user.id).run();
    return json({ ok: true });
  }
  if (request.method !== 'PUT') throw new HttpError(405, 'method_not_allowed');
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_SHOWCASE_BYTES * 4) throw new HttpError(413, 'too_large');
  const text = await request.text();
  if (text.length > MAX_SHOWCASE_BYTES) throw new HttpError(413, 'too_large');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.schema !== 'lazulium-profile/1') throw new HttpError(400, 'invalid_showcase');
  await env.DB.prepare(
    'INSERT INTO showcases (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  )
    .bind(auth.user.id, JSON.stringify(data), nowIso())
    .run();
  return json({ ok: true });
}

async function handleMediaUpload(request, env, auth, kind, origin) {
  if (!MEDIA_KINDS.includes(kind)) throw new HttpError(404, 'not_found');
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM media WHERE user_id = ? AND kind = ?').bind(auth.user.id, kind).run();
    return json({ ok: true });
  }
  if (request.method !== 'PUT') throw new HttpError(405, 'method_not_allowed');
  const body = await readJson(request, MAX_MEDIA_BASE64 + 200);
  const mime = typeof body?.mime === 'string' && MEDIA_MIME.test(body.mime) ? body.mime : null;
  const data = typeof body?.data === 'string' && /^[A-Za-z0-9+/]+=*$/.test(body.data) && body.data.length <= MAX_MEDIA_BASE64 ? body.data : null;
  if (!mime || !data) throw new HttpError(400, 'invalid_media');
  const token = randomToken(24);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM media WHERE user_id = ? AND kind = ?').bind(auth.user.id, kind),
    env.DB.prepare('INSERT INTO media (token, user_id, kind, mime, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(token, auth.user.id, kind, mime, data, nowIso())
  ]);
  return json({ url: `${origin}/v1/media/${token}` });
}

async function handleMediaGet(env, token) {
  const row = await env.DB.prepare('SELECT mime, data FROM media WHERE token = ?').bind(token).first();
  if (!row) return new Response('Not found', { status: 404 });
  const bytes = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
  // O endereço muda a cada envio: pode ficar em cache para sempre
  return new Response(bytes, { headers: { 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}

// O app pede um link de 30 minutos para mostrar a vitrine de um amigo (ou a própria) numa moldura
async function handleViewLink(env, auth, ownerId, origin) {
  if (ownerId !== auth.user.id && !(await areFriends(env, auth.user.id, ownerId))) throw new HttpError(404, 'not_found');
  const owner = await env.DB.prepare('SELECT settings FROM users WHERE id = ?').bind(ownerId).first();
  if (!owner) throw new HttpError(404, 'not_found');
  if (!parseSettings(owner.settings).shareProfile) return json({ url: null, reason: 'hidden' });
  const showcase = await env.DB.prepare('SELECT 1 FROM showcases WHERE user_id = ?').bind(ownerId).first();
  if (!showcase) return json({ url: null, reason: 'not_sent' });
  const token = randomToken(24);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM view_links WHERE expires_at < ?').bind(nowIso()),
    env.DB.prepare('INSERT INTO view_links (token, owner_id, expires_at) VALUES (?, ?, ?)').bind(token, ownerId, later(VIEW_LINK_TTL_MS))
  ]);
  return json({ url: `${origin}/v1/view/${token}` });
}

// A mesma política da página (que também vem no <meta>), agora no cabeçalho: vale antes de qualquer HTML ser lido.
// A página não faz pedidos de rede (o perfil vem embutido) nem envia formulários.
const PAGE_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https:; media-src https://*.steamstatic.com; connect-src 'none'; base-uri 'none'; form-action 'none'";
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': PAGE_CSP,
  'Cross-Origin-Opener-Policy': 'same-origin'
};
const UNAVAILABLE_PAGE =
  '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0b1020;color:#cbd5e1;display:grid;place-items:center;height:100vh;margin:0">Este perfil não está disponível agora.';

// JSON dentro de <script>: "<" e separadores de linha escapados para nenhum texto do perfil fechar a tag
export const scriptSafeJson = (text) => text.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

async function handleView(env, token) {
  const link = await env.DB.prepare('SELECT owner_id, expires_at FROM view_links WHERE token = ?').bind(token).first();
  const owner = link && link.expires_at > nowIso() ? await env.DB.prepare('SELECT settings FROM users WHERE id = ?').bind(link.owner_id).first() : null;
  const showcase = owner && parseSettings(owner.settings).shareProfile ? await env.DB.prepare('SELECT data FROM showcases WHERE user_id = ?').bind(link.owner_id).first() : null;
  if (!showcase || !env.PROFILE_PAGE) return new Response(UNAVAILABLE_PAGE, { status: 404, headers: PAGE_HEADERS });
  const inline = `<script>window.LAZULIUM_PROFILE = ${scriptSafeJson(showcase.data)};</script>`;
  return new Response(env.PROFILE_PAGE.replace('</head>', `${inline}\n</head>`), { headers: PAGE_HEADERS });
}

// ---------- Roteamento ----------

async function isRateLimited(request, env, key) {
  if (!env.RATE_LIMITER) return false;
  const { success } = await env.RATE_LIMITER.limit({ key: key ?? request.headers.get('CF-Connecting-IP') ?? 'unknown' });
  return !success;
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (!env.DB) return json({ error: 'not_configured' }, 503);

  if (path === '/v1/auth/steam/start' && request.method === 'GET') return handleStart(url);
  if (path === '/v1/auth/steam/callback' && request.method === 'GET') return handleCallback(url, env);
  const mediaGet = path.match(/^\/v1\/media\/([A-Za-z0-9_-]{20,64})$/);
  if (mediaGet && request.method === 'GET') return handleMediaGet(env, mediaGet[1]);
  const view = path.match(/^\/v1\/view\/([A-Za-z0-9_-]{20,64})$/);
  if (view && request.method === 'GET') return handleView(env, view[1]);
  if (await isRateLimited(request, env)) return json({ error: 'rate_limited' }, 429);
  if (path === '/v1/auth/exchange' && request.method === 'POST') return handleExchange(request, env);

  const auth = await authenticate(request, env);
  if (path === '/v1/auth/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(auth.tokenHash).run();
    return json({ ok: true });
  }
  if (path === '/v1/me') return handleMe(request, env, auth);
  if (path === '/v1/me/activities') return handleActivities(request, env, auth);
  if (path === '/v1/me/activities/delete' && request.method === 'POST') return handleActivityDelete(request, env, auth);
  if (path === '/v1/me/now-playing') return handleNowPlaying(request, env, auth);
  if (path === '/v1/me/summary') return handleSummary(request, env, auth);
  if (path === '/v1/me/showcase') return handleShowcase(request, env, auth);
  const mediaPut = path.match(/^\/v1\/me\/media\/([a-z]+)$/);
  if (mediaPut) return handleMediaUpload(request, env, auth, mediaPut[1], url.origin);
  if (path === '/v1/friends/invite') return handleInvite(request, env, auth);
  if (path === '/v1/friends/accept') return handleAccept(request, env, auth);
  if (path === '/v1/friends') return handleFriends(request, env, auth);
  const friendMatch = path.match(/^\/v1\/friends\/([0-9a-f-]{36})$/);
  if (friendMatch) return handleFriends(request, env, auth, friendMatch[1]);
  if (path === '/v1/feed' && request.method === 'GET') return handleFeed(url, env, auth);
  const userMatch = path.match(/^\/v1\/users\/([0-9a-f-]{36})$/);
  if (userMatch && request.method === 'GET') return handleUser(env, auth, userMatch[1]);
  const viewLink = path.match(/^\/v1\/users\/([0-9a-f-]{36})\/view$/);
  if (viewLink && request.method === 'POST') return handleViewLink(env, auth, viewLink[1], url.origin);
  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code }, err.status);
      console.error(`Erro inesperado: ${err?.name ?? 'Error'}: ${String(err?.message ?? '')}`);
      return json({ error: 'internal_error' }, 500);
    }
  }
};
