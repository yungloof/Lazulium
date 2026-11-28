// Conta Lazulium: login pela Steam (verificado aqui, não no app), amigos, "jogando agora" e feed.
// Roda no Cloudflare Workers com D1 (env.DB). O server.mjs roda o mesmo código em Node com SQLite (VPS e testes).
// Nada de e-mail, senha, caminhos do PC ou chaves: só o que aparece para os amigos.
import { signTicket } from './media-ticket.js';

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
const MAX_SHOWCASE_BYTES = 900_000; // O perfil leva também as avaliações (nota e resenha), por isso mais que os 400 mil de antes
// Sincronização privada entre PCs (Diário, listas, categorias e favoritos), em bytes: uma linha do D1 cabe até 2 MB
const MAX_SYNC_BYTES = 1_900_000;
const MAX_MEDIA_BASE64 = 1_500_000;       // ~1,1 MB de imagem: o app reduz antes de enviar
const MEDIA_KINDS = ['avatar', 'background', 'artwork'];
const MEDIA_MIME = /^image\/(jpeg|png|webp|gif)$/;   // GIF vai como está, para chegar animado
// GIF maior e vídeo de fundo não cabem no D1 (2 MB por valor): ficam em disco na VPS (src/media-store.js)
const MAX_STORE_BYTES = 50 * 1024 * 1024;
const STORE_KINDS = ['background'];
const STORE_MIME = /^(image\/gif|video\/(webm|mp4))$/;
const UPLOAD_TICKET_TTL_MS = 10 * 60 * 1000;
const PURGE_TICKET_TTL_MS = 60 * 1000;
const PURGE_TIMEOUT_MS = 8_000;
const MAX_PURGE_RETRIES = 20;
const VIEW_LINK_TTL_MS = 30 * 60 * 1000;
// Status (como no Discord) e "chamar pra call"
export const PRESENCE_STATUSES = ['online', 'away', 'dnd', 'invisible'];
const MAX_PRESENCE_MS = 30 * DAY_MS;
const CALL_PAIR_COOLDOWN_MS = 30_000;          // Uma chamada por amigo a cada 30 s
const CALL_WINDOW_MS = 10 * 60_000;
const MAX_CALLS_PER_WINDOW = 12;               // Por pessoa, para qualquer amigo
const CALL_RING_MS = 2 * 60_000;               // Entregue depois disso, chega como chamada perdida
const CALL_TTL_MS = DAY_MS;
export const CALL_ANSWERS = ['yes', 'no', 'busy'];
const UUID = /^[0-9a-f-]{36}$/;
// Biblioteca resumida (página do jogo com os amigos)
const MAX_LIBRARY_GAMES_PER_POST = 100;
const MAX_LIBRARY_REMOVED_PER_POST = 500;
const MAX_LIBRARY_GAMES = 5_000;
const MAX_LIBRARY_BYTES = 800_000;
const MAX_LIBRARY_REVIEW = 6_000;            // Igual à vitrine
// Imagens no meio das resenhas (3.3). O app reduz cada uma (WebP) antes de enviar; GIF vai como está
const MAX_REVIEW_IMAGE_BASE64 = 700_000;     // ~500 KB por imagem
const MAX_REVIEW_IMAGES_PER_USER = 300;
const MAX_REVIEW_IMAGE_STORAGE = 20_000_000; // Base64 somado por pessoa (~15 MB): o D1 é dividido entre todos
const MAX_REVIEW_IMAGES_PER_GAME = 30;
const REVIEW_IMAGE_ID = /^[a-f0-9]{16}\.(webp|gif)$/;
const REVIEW_IMAGE_TOKEN = /^[A-Za-z0-9_-]{32}$/;
const REVIEW_IMAGE_URL = /\/v1\/review-images\/([A-Za-z0-9_-]{32})$/;
const MAX_ACHIEVEMENT_IDS = 1_000;
const MAX_GAME_KEYS = 8;
export const LIBRARY_STATUSES = ['backlog', 'playing', 'endless', 'paused', 'finished', 'completed', 'dropped'];
const ACHIEVEMENT_SOURCES = ['steam', 'retroachievements'];
const TITLE_KEY = /^t:[a-z0-9]{1,120}$/;
const STEAM_KEY = /^steam:\d{1,10}$/;
// Curtidas e comentários
export const REACTION_KINDS = ['review', 'list'];
const MAX_COMMENT_TEXT = 1_000;
const MAX_COMMENTS_PER_WINDOW = 30;            // Por pessoa, a cada 10 min
const COMMENT_WINDOW_MS = 10 * 60_000;
const MAX_COMMENTS_PER_THREAD = 200;
const MAX_SUMMARY_TARGETS = 100;
const MAX_NOTIFICATIONS = 50;
const MAX_MUTE_MS = 366 * 24 * 60 * 60 * 1000;   // Prazo mais longo de "Dar um tempo"; sem prazo = até desfazer
// Listas em grupo
const MAX_GROUP_LISTS_OWNED = 50;
const MAX_GROUP_LIST_MEMBERS = 30;
const MAX_GROUP_LIST_GAMES = 200;
const MAX_LIST_TITLE = 80;
const MAX_LIST_DESCRIPTION = 500;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // Sem 0/O e 1/I, para ditar por voz

export const ACTIVITY_KINDS = ['played', 'started', 'finished', 'completed', 'dropped', 'rated', 'reviewed', 'achievements', 'perfect'];
const SINGLETON_ACTIVITY_KINDS = new Set(['reviewed', 'rated']);
const STATUS_ACTIVITY_KINDS = new Set(['started', 'finished', 'completed', 'dropped']);
const ACTIVITY_MERGE_WINDOW_MS = 6 * 60 * 60 * 1000;
const DEDUPE_SINGLETON_SQL = `(a.kind NOT IN ('reviewed', 'rated') OR NOT EXISTS (SELECT 1 FROM activities newer WHERE newer.user_id = a.user_id AND newer.kind = a.kind AND newer.game_key = a.game_key AND (newer.at > a.at OR (newer.at = a.at AND newer.id > a.id))))`;
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
const cleanMultiline = (value, max) =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[^\P{C}\n]/gu, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '';

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

const LAST_SEEN_REFRESH_MS = 3 * 60 * 1000;

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
  // Campo repetido é recusado: get() lê a primeira cópia e a Steam conferiria a última,
  // e daria para mostrar o SteamID de outra pessoa com a assinatura válida da própria conta
  const keys = [...params.keys()].filter((key) => key.startsWith('openid.'));
  if (new Set(keys).size !== keys.length) return null;
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
  if (url.searchParams.getAll('port').length > 1 || url.searchParams.getAll('state').length > 1) return json({ error: 'invalid_request' }, 400);
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
  // "Visto por último" com folga de 3 min: não grava a cada pedido. O app aberto consulta os amigos a cada 90 s,
  // então quem foi visto há menos de 5 min está com o app aberto (On-line na lista dos amigos)
  if (Date.parse(row.last_seen_at) < Date.now() - LAST_SEEN_REFRESH_MS) {
    await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(nowIso(), row.id).run();
  }
  return { user: row, tokenHash: hash };
}

async function areFriends(env, a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return !!(await env.DB.prepare('SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?').bind(x, y).first());
}

// Silenciados agora (com prazo vencido não conta) e bloqueados: o que deles não chega para userId
async function mutesOf(env, userId) {
  const { results } = await env.DB.prepare('SELECT friend_id, until FROM friend_mutes WHERE user_id = ? AND (until IS NULL OR until > ?)')
    .bind(userId, nowIso())
    .all();
  return new Map(results.map((r) => [r.friend_id, { until: r.until ?? null }]));
}

async function hiddenFrom(env, userId) {
  const [mutes, { results }] = await Promise.all([
    mutesOf(env, userId),
    env.DB.prepare('SELECT blocked_id FROM blocks WHERE user_id = ?').bind(userId).all()
  ]);
  return new Set([...mutes.keys(), ...results.map((r) => r.blocked_id)]);
}

async function isBlocked(env, a, b) {
  return !!(await env.DB.prepare('SELECT 1 FROM blocks WHERE (user_id = ?1 AND blocked_id = ?2) OR (user_id = ?2 AND blocked_id = ?1)').bind(a, b).first());
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
      // Vitrine desligada: a biblioteca resumida sai do servidor (o app manda tudo de novo se ligar)
      if (!settings.shareProfile) updates.push(env.DB.prepare('DELETE FROM library_games WHERE user_id = ?').bind(user.id));
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
        'DELETE FROM review_images WHERE user_id = ?',
        'DELETE FROM view_links WHERE token IN (SELECT token FROM view_viewers WHERE viewer_id = ?1)',
        'DELETE FROM view_viewers WHERE viewer_id = ?1 OR token IN (SELECT token FROM view_links WHERE owner_id = ?1)',
        'DELETE FROM view_links WHERE owner_id = ?',
        'DELETE FROM presence WHERE user_id = ?',
        'DELETE FROM library_games WHERE user_id = ?',
        'DELETE FROM reactions WHERE owner_id = ?1 OR user_id = ?1',
        'DELETE FROM comments WHERE owner_id = ?1 OR user_id = ?1',
        'DELETE FROM calls WHERE from_id = ?1 OR to_id = ?1',
        'DELETE FROM group_list_items WHERE list_id IN (SELECT id FROM group_lists WHERE owner_id = ?1)',
        'DELETE FROM group_list_members WHERE user_id = ?1 OR list_id IN (SELECT id FROM group_lists WHERE owner_id = ?1)',
        'DELETE FROM group_lists WHERE owner_id = ?1',
        'DELETE FROM user_sync WHERE user_id = ?',
        'UPDATE group_list_items SET added_by = NULL WHERE added_by = ?1',
        'DELETE FROM friend_mutes WHERE user_id = ?1 OR friend_id = ?1',
        'DELETE FROM blocks WHERE user_id = ?1 OR blocked_id = ?1',
        'DELETE FROM users WHERE id = ?'
      ]
        .map((sql) => env.DB.prepare(sql).bind(user.id))
        .concat(env.DB.prepare('DELETE FROM friendships WHERE user_a = ? OR user_b = ?').bind(user.id, user.id))
    );
    await purgeStored(env, user.id);
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
  const rawRows = events.map(toActivityRow).filter(Boolean);
  if (rawRows.length) {
    const singletonByKey = new Map();
    const rows = [];
    for (const r of rawRows) {
      if (SINGLETON_ACTIVITY_KINDS.has(r.kind)) {
        const key = `${r.kind}|${r.gameKey}`;
        const prev = singletonByKey.get(key);
        if (!prev || r.at > prev.at || (r.at === prev.at && r.id > prev.id)) singletonByKey.set(key, r);
      } else {
        rows.push(r);
      }
    }
    rows.push(...singletonByKey.values());

    const statements = rows.map((r) =>
      env.DB.prepare(
        `INSERT INTO activities (user_id, id, kind, game_key, game_title, cover_url, at, rating, count, seconds, text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, id) DO UPDATE SET kind = excluded.kind, game_key = excluded.game_key, game_title = excluded.game_title,
           cover_url = excluded.cover_url, at = excluded.at, rating = excluded.rating, count = excluded.count, seconds = excluded.seconds, text = excluded.text`
      ).bind(auth.user.id, r.id, r.kind, r.gameKey, r.title, r.cover, r.at, r.rating, r.count, r.seconds, r.text)
    );

    for (const r of rows) {
      if (SINGLETON_ACTIVITY_KINDS.has(r.kind)) {
        statements.push(
          env.DB.prepare(
            `DELETE FROM activities
             WHERE user_id = ? AND kind = ? AND game_key = ?
               AND id != (
                 SELECT id FROM activities
                 WHERE user_id = ? AND kind = ? AND game_key = ?
                 ORDER BY at DESC, id DESC
                 LIMIT 1
               )`
          ).bind(auth.user.id, r.kind, r.gameKey, auth.user.id, r.kind, r.gameKey)
        );
      } else if (STATUS_ACTIVITY_KINDS.has(r.kind)) {
        const windowStart = new Date(Date.parse(r.at) - ACTIVITY_MERGE_WINDOW_MS).toISOString();
        statements.push(
          env.DB.prepare(
            `DELETE FROM activities
             WHERE user_id = ? AND kind = ? AND game_key = ?
               AND (at < ? OR (at = ? AND id < ?))
               AND at >= ?`
          ).bind(auth.user.id, r.kind, r.gameKey, r.at, r.at, r.id, windowStart)
        );
      }
    }

    await env.DB.batch(statements);
    // Guarda só os mais recentes de cada pessoa
    await env.DB.prepare(
      'DELETE FROM activities WHERE user_id = ? AND id IN (SELECT id FROM activities WHERE user_id = ? ORDER BY at DESC LIMIT -1 OFFSET ?)'
    )
      .bind(auth.user.id, auth.user.id, MAX_ACTIVITIES_PER_USER)
      .run();
  }
  return json({ accepted: rawRows.length, rejected: events.length - rawRows.length });
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
  const presence = await env.DB.prepare('SELECT status AS p_status, until AS p_until FROM presence WHERE user_id = ?').bind(auth.user.id).first();
  if (effectiveStatus(presence) === 'invisible') return json({ ok: true, shared: false });
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
  // Quem bloqueou fica sabendo por que não deu; quem foi bloqueado vê só "convite não encontrado"
  if (await env.DB.prepare('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?').bind(auth.user.id, invite.user_id).first()) {
    throw new HttpError(409, 'you_blocked');
  }
  if (await isBlocked(env, auth.user.id, invite.user_id)) throw new HttpError(404, 'invite_not_found');
  const [a, b] = invite.user_id < auth.user.id ? [invite.user_id, auth.user.id] : [auth.user.id, invite.user_id];
  // O convite vale para uma pessoa: some ao ser usado (código que vazou não vira amizade com estranhos)
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)').bind(a, b, nowIso()),
    env.DB.prepare('DELETE FROM invites WHERE code = ?').bind(code)
  ]);
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
    await env.DB.batch([
      env.DB.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').bind(a, b),
      env.DB.prepare('DELETE FROM group_list_members WHERE user_id = ?1 AND list_id IN (SELECT id FROM group_lists WHERE owner_id = ?2)').bind(friendId, auth.user.id),
      env.DB.prepare('DELETE FROM group_list_members WHERE user_id = ?1 AND list_id IN (SELECT id FROM group_lists WHERE owner_id = ?2)').bind(auth.user.id, friendId)
    ]);
    return json({ ok: true });
  }
  if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
  const ids = await friendIds(env, auth.user.id);
  if (ids.length === 0) return json({ friends: [] });
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT u.*, n.game_key AS np_game_key, n.game_title AS np_game_title, n.cover_url AS np_cover_url, n.since AS np_since, n.updated_at AS np_updated_at
            , p.status AS p_status, p.until AS p_until, p.since AS p_since
     FROM users u LEFT JOIN now_playing n ON n.user_id = u.id LEFT JOIN presence p ON p.user_id = u.id WHERE u.id IN (${placeholders})`
  )
    .bind(...ids)
    .all();
  const mutes = await mutesOf(env, auth.user.id);
  const friends = results
    .map((row) => ({ ...publicUser(row), ...presenceView(row), muted: mutes.get(row.id) ?? null }))
    .sort((x, y) => Number(!!y.nowPlaying) - Number(!!x.nowPlaying) || y.lastSeenAt.localeCompare(x.lastSeenAt));
  return json({ friends });
}

// ---------- Dar um tempo: silenciar com prazo e bloquear ----------

async function handleMute(request, env, auth, friendId) {
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM friend_mutes WHERE user_id = ? AND friend_id = ?').bind(auth.user.id, friendId).run();
    return json({ muted: null });
  }
  if (request.method !== 'PUT') throw new HttpError(405, 'method_not_allowed');
  if (friendId === auth.user.id || !(await areFriends(env, auth.user.id, friendId))) throw new HttpError(404, 'not_found');
  const body = await readJson(request, 500);
  let until = null;
  if (body?.until !== null && body?.until !== undefined) {
    const ms = typeof body.until === 'string' ? Date.parse(body.until) : NaN;
    if (!(ms > Date.now() && ms <= Date.now() + MAX_MUTE_MS)) throw new HttpError(400, 'invalid_until');
    until = new Date(ms).toISOString();
  }
  await env.DB.prepare(
    `INSERT INTO friend_mutes (user_id, friend_id, until, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, friend_id) DO UPDATE SET until = excluded.until, created_at = excluded.created_at`
  )
    .bind(auth.user.id, friendId, until, nowIso())
    .run();
  return json({ muted: { until } });
}

// Bloquear: acaba a amizade, tira as listas em grupo de um com o outro, as curtidas e comentários da pessoa no
// que é meu, os chamados pendentes e o link da minha vitrine que estiver com ela. Ela não recebe aviso.
async function handleBlock(env, auth, otherId) {
  const me = auth.user.id;
  if (otherId === me) throw new HttpError(400, 'invalid_friend');
  if (!(await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(otherId).first())) throw new HttpError(404, 'not_found');
  const [a, b] = otherId < me ? [otherId, me] : [me, otherId];
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  await env.DB.batch([
    q('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', a, b),
    q('DELETE FROM group_list_members WHERE user_id = ?1 AND list_id IN (SELECT id FROM group_lists WHERE owner_id = ?2)', otherId, me),
    q('DELETE FROM group_list_members WHERE user_id = ?1 AND list_id IN (SELECT id FROM group_lists WHERE owner_id = ?2)', me, otherId),
    q('DELETE FROM reactions WHERE owner_id = ? AND user_id = ?', me, otherId),
    q('DELETE FROM comments WHERE owner_id = ? AND user_id = ?', me, otherId),
    q('DELETE FROM calls WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)', me, otherId),
    q('DELETE FROM view_links WHERE owner_id = ?1 AND token IN (SELECT token FROM view_viewers WHERE viewer_id = ?2)', me, otherId),
    q('DELETE FROM view_viewers WHERE viewer_id = ? AND token NOT IN (SELECT token FROM view_links)', otherId),
    q('DELETE FROM friend_mutes WHERE (user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1)', me, otherId),
    q('INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)', me, otherId, nowIso())
  ]);
  return json({ ok: true });
}

async function handleBlockedList(env, auth) {
  const { results } = await env.DB.prepare(
    'SELECT u.*, b.created_at AS blocked_at FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.user_id = ? ORDER BY b.created_at DESC'
  )
    .bind(auth.user.id)
    .all();
  return json({ blocked: results.map((row) => ({ ...publicUser(row), blockedAt: row.blocked_at })) });
}

async function handleUnblock(env, auth, otherId) {
  await env.DB.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').bind(auth.user.id, otherId).run();
  return json({ ok: true });
}

const activityJson = (row, reviewImages) => ({
  id: row.id,
  kind: row.kind,
  gameKey: row.game_key,
  gameTitle: row.game_title,
  coverUrl: row.cover_url,
  at: row.at,
  rating: row.rating ?? undefined,
  count: row.count ?? undefined,
  seconds: row.seconds ?? undefined,
  text: row.text ?? undefined,
  ...(reviewImages?.length ? { reviewImages } : {})
});

async function attachReviewImages(env, rows, origin) {
  const reviewed = rows.filter((r) => r.kind === 'reviewed');
  if (reviewed.length === 0) return new Map();
  const userIds = [...new Set(reviewed.map((r) => r.user_id))];
  const { results: libs } = await env.DB.prepare(
    `SELECT user_id, title_key, steam_key, review_images FROM library_games WHERE user_id IN (${userIds.map(() => '?').join(',')}) AND review_images IS NOT NULL`
  )
    .bind(...userIds)
    .all();
  const byKey = new Map();
  for (const lg of libs) {
    const imgs = reviewImagesView(lg.review_images, origin);
    if (!imgs.length) continue;
    byKey.set(`${lg.user_id}|${lg.title_key}`, imgs);
    if (lg.steam_key) byKey.set(`${lg.user_id}|${lg.steam_key}`, imgs);
  }
  const out = new Map();
  for (const r of reviewed) {
    const tKey = titleKeyOf(r.game_title);
    const imgs = byKey.get(`${r.user_id}|${r.game_key}`) ?? (tKey ? byKey.get(`${r.user_id}|t:${tKey}`) : undefined);
    if (imgs?.length) out.set(`${r.user_id}|${r.id}`, imgs);
  }
  return out;
}

// Só o que a pessoa escolheu mostrar
const visibleKinds = (settings) => (settings.shareActivity ? ACTIVITY_KINDS.filter((k) => !KIND_SETTING[k] || settings[KIND_SETTING[k]]) : []);

async function handleFeed(url, env, auth) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), MAX_FEED);
  const before = url.searchParams.get('before');
  const beforeIso = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : '9999-12-31T00:00:00.000Z';
  const muted = await mutesOf(env, auth.user.id);
  const ids = (await friendIds(env, auth.user.id)).filter((id) => !muted.has(id));
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
  const { results } = await env.DB.prepare(
    `SELECT a.* FROM activities a WHERE (${clauses.join(' OR ')}) AND a.at < ? AND ${DEDUPE_SINGLETON_SQL} ORDER BY a.at DESC LIMIT ?`
  )
    .bind(...args, beforeIso, limit)
    .all();
  const images = await attachReviewImages(env, results, url.origin);
  const byId = new Map(friends.map((f) => [f.id, publicUser(f)]));
  return json({ items: results.map((row) => ({ ...activityJson(row, images.get(`${row.user_id}|${row.id}`)), user: byId.get(row.user_id) })) });
}

async function handleUser(env, auth, userId, origin) {
  if (userId !== auth.user.id && !(await areFriends(env, auth.user.id, userId))) throw new HttpError(404, 'not_found');
  const row = await env.DB.prepare(
    `SELECT u.*, n.game_key AS np_game_key, n.game_title AS np_game_title, n.cover_url AS np_cover_url, n.since AS np_since, n.updated_at AS np_updated_at
            , p.status AS p_status, p.until AS p_until, p.since AS p_since
     FROM users u LEFT JOIN now_playing n ON n.user_id = u.id LEFT JOIN presence p ON p.user_id = u.id WHERE u.id = ?`
  )
    .bind(userId)
    .first();
  if (!row) throw new HttpError(404, 'not_found');
  const settings = parseSettings(row.settings);
  const kinds = visibleKinds(settings);
  const { results } = kinds.length
    ? await env.DB.prepare(
        `SELECT a.* FROM activities a WHERE a.user_id = ? AND a.kind IN (${kinds.map(() => '?').join(',')}) AND ${DEDUPE_SINGLETON_SQL} ORDER BY a.at DESC LIMIT 40`
      )
        .bind(userId, ...kinds)
        .all()
    : { results: [] };
  const images = origin ? await attachReviewImages(env, results, origin) : new Map();
  let summary = null;
  try {
    summary = row.summary ? JSON.parse(row.summary) : null;
  } catch {}
  if (summary && !settings.sharePlaytime) {
    summary = { ...summary, totals: { ...summary.totals, playtimeSeconds: 0 }, topGames: summary.topGames.map((g) => ({ ...g, playtimeSeconds: 0 })) };
  }
  if (summary && !settings.shareReviews) summary = { ...summary, topGames: summary.topGames.map((g) => ({ ...g, rating: null })) };
  const view = presenceView(row);
  return json({
    user: { ...publicUser(row), lastSeenAt: view.lastSeenAt, presence: view.presence },
    muted: userId === auth.user.id ? null : ((await mutesOf(env, auth.user.id)).get(userId) ?? null),
    nowPlaying: view.nowPlaying,
    summary,
    activities: results.map((r) => activityJson(r, images.get(`${r.user_id}|${r.id}`)))
  });
}

// ---------- Biblioteca resumida e amigos de um jogo ----------

const isoOrNull = (value) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) && Date.parse(value) <= Date.now() + DAY_MS ? new Date(value).toISOString() : null);
const intOrNull = (value, max) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : null);

export function toLibraryRow(game) {
  if (!game || typeof game !== 'object') return null;
  const titleKey = typeof game.titleKey === 'string' && TITLE_KEY.test(game.titleKey) ? game.titleKey : null;
  const title = cleanText(game.title, MAX_TITLE);
  if (!titleKey || !title) return null;
  let achievements = null;
  const a = game.achievements;
  if (a && typeof a === 'object' && ACHIEVEMENT_SOURCES.includes(a.source)) {
    const total = intOrNull(a.total, 100_000);
    const unlocked = total ? intOrNull(a.unlocked, total) : null;
    if (total && unlocked !== null) {
      const ids = {};
      if (a.ids && typeof a.ids === 'object' && !Array.isArray(a.ids)) {
        for (const [id, at] of Object.entries(a.ids).slice(0, MAX_ACHIEVEMENT_IDS)) {
          if (id.length > 100 || /\p{C}/u.test(id)) continue;
          ids[id] = intOrNull(at, 4_000_000_000) ?? 0;
        }
      }
      achievements = { source: a.source, total, unlocked, ids };
    }
  }
  const rating = typeof game.rating === 'number' && game.rating >= 0.5 && game.rating <= 5 ? Math.round(game.rating * 2) / 2 : null;
  // Com parágrafos (as imagens ficam entre eles); o app já manda o texto neste formato, então as posições batem
  const review = cleanMultiline(game.review, MAX_LIBRARY_REVIEW) || null;
  return {
    titleKey,
    steamKey: typeof game.steamKey === 'string' && STEAM_KEY.test(game.steamKey) ? game.steamKey : null,
    title,
    cover: typeof game.coverUrl === 'string' && COVER_URL.test(game.coverUrl) ? game.coverUrl : null,
    seconds: intOrNull(game.playtimeSeconds, 1_000_000_000),
    lastPlayed: isoOrNull(game.lastPlayedAt),
    status: LIBRARY_STATUSES.includes(game.status) ? game.status : null,
    rating,
    review,
    reviewAt: isoOrNull(game.reviewAt),
    reviewImages: toReviewImages(game.reviewImages, review?.length ?? 0),
    achievements
  };
}

// Imagens da resenha: guarda só o token de cada uma (o endereço é montado na hora de mostrar) e a posição no texto
export function toReviewImages(list, reviewLength) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const image of list.slice(0, MAX_REVIEW_IMAGES_PER_GAME)) {
    const token = typeof image?.url === 'string' && image.url.length < 300 ? image.url.match(REVIEW_IMAGE_URL)?.[1] : null;
    const at = intOrNull(image?.at, 1_000_000);
    if (!token || at === null) continue;
    const entry = { at: Math.min(at, reviewLength), t: token };
    const w = intOrNull(image.width, 20_000);
    const h = intOrNull(image.height, 20_000);
    if (w && h) Object.assign(entry, { w, h });
    out.push(entry);
  }
  return out.length ? out : null;
}

function reviewImagesView(raw, origin) {
  try {
    const list = JSON.parse(raw || '[]');
    if (!Array.isArray(list)) return [];
    return list
      .filter((i) => i && REVIEW_IMAGE_TOKEN.test(i.t) && Number.isInteger(i.at))
      .map((i) => ({ at: i.at, url: `${origin}/v1/review-images/${i.t}`, ...(i.w && i.h ? { width: i.w, height: i.h } : {}) }));
  } catch {
    return [];
  }
}

// O app manda só o que mudou, em lotes; reset = primeiro lote de um envio completo
async function handleLibrary(request, env, auth) {
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  const body = await readJson(request, MAX_LIBRARY_BYTES);
  const games = Array.isArray(body?.games) ? body.games : [];
  const removed = Array.isArray(body?.removed) ? body.removed : [];
  if (games.length > MAX_LIBRARY_GAMES_PER_POST || removed.length > MAX_LIBRARY_REMOVED_PER_POST) throw new HttpError(413, 'too_large');
  if (!parseSettings(auth.user.settings).shareProfile) return json({ ok: true, shared: false });
  const now = nowIso();
  const userId = auth.user.id;
  const statements = [];
  if (body.reset === true) statements.push(env.DB.prepare('DELETE FROM library_games WHERE user_id = ?').bind(userId));
  for (const key of removed) {
    if (typeof key === 'string' && TITLE_KEY.test(key)) statements.push(env.DB.prepare('DELETE FROM library_games WHERE user_id = ? AND title_key = ?').bind(userId, key));
  }
  let accepted = 0;
  for (const raw of games) {
    const row = toLibraryRow(raw);
    if (!row) continue;
    accepted++;
    const a = row.achievements;
    statements.push(
      env.DB.prepare(
        `INSERT INTO library_games (user_id, title_key, steam_key, title, cover_url, seconds, last_played, status, rating, review, review_at, ach_source, ach_unlocked, ach_total, ach_ids, updated_at, review_images)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
         ON CONFLICT (user_id, title_key) DO UPDATE SET steam_key = ?3, title = ?4, cover_url = ?5, seconds = ?6, last_played = ?7, status = ?8, rating = ?9,
           review = ?10, review_at = ?11, ach_source = ?12, ach_unlocked = ?13, ach_total = ?14, ach_ids = ?15, updated_at = ?16, review_images = ?17`
      ).bind(
        userId,
        row.titleKey,
        row.steamKey,
        row.title,
        row.cover,
        row.seconds,
        row.lastPlayed,
        row.status,
        row.rating,
        row.review,
        row.reviewAt,
        a?.source ?? null,
        a?.unlocked ?? null,
        a?.total ?? null,
        a ? JSON.stringify(a.ids) : null,
        now,
        row.reviewImages ? JSON.stringify(row.reviewImages) : null
      )
    );
  }
  // Teto por pessoa: sobra quem tem menos horas
  statements.push(
    env.DB.prepare(
      'DELETE FROM library_games WHERE user_id = ?1 AND title_key IN (SELECT title_key FROM library_games WHERE user_id = ?1 ORDER BY COALESCE(seconds, 0) DESC, updated_at DESC LIMIT -1 OFFSET ?2)'
    ).bind(userId, MAX_LIBRARY_GAMES)
  );
  await env.DB.batch(statements);
  return json({ ok: true, accepted });
}

// O que um amigo deixa ver de um jogo, pelas chaves de privacidade dele
function libraryView(row, settings, { withDetails, origin = '' }) {
  const view = { titleKey: row.title_key, title: row.title, coverUrl: row.cover_url ?? null };
  if (settings.sharePlaytime) {
    view.playtimeSeconds = row.seconds ?? 0;
    if (row.last_played) view.lastPlayedAt = row.last_played;
  }
  if (settings.shareReviews) {
    if (row.status) view.status = row.status;
    if (row.rating) view.rating = row.rating;
    const images = withDetails ? reviewImagesView(row.review_images, origin) : [];
    if (withDetails && (row.review || images.length)) {
      view.review = row.review ?? '';
      if (images.length) view.reviewImages = images;
      if (row.review_at) view.reviewAt = row.review_at;
    }
  }
  if (settings.shareAchievements && row.ach_source && row.ach_total) {
    view.achievements = { source: row.ach_source, unlocked: row.ach_unlocked ?? 0, total: row.ach_total };
    if (withDetails) {
      try {
        view.achievements.ids = JSON.parse(row.ach_ids || '{}');
      } catch {
        view.achievements.ids = {};
      }
    }
  }
  return view;
}

// GET /v1/games/friends?key=t:...&key=steam:...: amigos que têm o jogo, com o que cada um deixa ver
async function handleGameFriends(url, env, auth) {
  const origin = url.origin;
  const keys = [...new Set(url.searchParams.getAll('key'))].slice(0, MAX_GAME_KEYS);
  const titleKeys = keys.filter((k) => TITLE_KEY.test(k));
  const steamKeys = keys.filter((k) => STEAM_KEY.test(k));
  if (titleKeys.length + steamKeys.length === 0) throw new HttpError(400, 'invalid_game');
  const ids = await friendIds(env, auth.user.id);
  if (ids.length === 0) return json({ friends: [] });
  const marks = (list) => list.map(() => '?').join(',');
  const match = [titleKeys.length ? `title_key IN (${marks(titleKeys)})` : '', steamKeys.length ? `steam_key IN (${marks(steamKeys)})` : ''].filter(Boolean).join(' OR ');
  const { results: rows } = await env.DB.prepare(`SELECT * FROM library_games WHERE user_id IN (${marks(ids)}) AND (${match})`)
    .bind(...ids, ...titleKeys, ...steamKeys)
    .all();
  if (rows.length === 0) return json({ friends: [] });
  // Mesmo jogo em duas linhas (nome diferente, mesmo AppID): fica a com mais horas
  const best = new Map();
  for (const row of rows) {
    const current = best.get(row.user_id);
    if (!current || (row.seconds ?? 0) > (current.seconds ?? 0)) best.set(row.user_id, row);
  }
  const owners = [...best.keys()];
  const { results: users } = await env.DB.prepare(
    `SELECT u.*, n.game_key AS np_game_key, n.game_title AS np_game_title, n.cover_url AS np_cover_url, n.since AS np_since, n.updated_at AS np_updated_at
            , p.status AS p_status, p.until AS p_until, p.since AS p_since
     FROM users u LEFT JOIN now_playing n ON n.user_id = u.id LEFT JOIN presence p ON p.user_id = u.id WHERE u.id IN (${marks(owners)})`
  )
    .bind(...owners)
    .all();
  const friends = [];
  for (const user of users) {
    const settings = parseSettings(user.settings);
    if (!settings.shareProfile) continue;
    const row = best.get(user.id);
    const presence = presenceView(user);
    const playingNow = !!presence.nowPlaying && (keys.includes(presence.nowPlaying.gameKey) || presence.nowPlaying.gameKey === row.title_key || presence.nowPlaying.gameKey === row.steam_key);
    friends.push({
      user: { ...publicUser(user), lastSeenAt: presence.lastSeenAt, presence: presence.presence },
      playingNow,
      ...libraryView(row, settings, { withDetails: true, origin })
    });
  }
  friends.sort((x, y) => Number(y.playingNow) - Number(x.playingNow) || (y.playtimeSeconds ?? 0) - (x.playtimeSeconds ?? 0));
  return json({ friends });
}

// GET /v1/users/:id/games: a biblioteca resumida de um amigo, para comparar (sem resenha nem lista de conquistas)
async function handleUserGames(env, auth, userId) {
  if (userId !== auth.user.id && !(await areFriends(env, auth.user.id, userId))) throw new HttpError(404, 'not_found');
  const owner = await env.DB.prepare('SELECT settings FROM users WHERE id = ?').bind(userId).first();
  if (!owner) throw new HttpError(404, 'not_found');
  const settings = parseSettings(owner.settings);
  if (!settings.shareProfile) return json({ games: [], hidden: true });
  const { results } = await env.DB.prepare('SELECT * FROM library_games WHERE user_id = ? ORDER BY COALESCE(seconds, 0) DESC').bind(userId).all();
  return json({ games: results.map((row) => ({ ...libraryView(row, settings, { withDetails: false }), steamKey: row.steam_key ?? undefined })) });
}

// ---------- Curtidas e comentários (resenhas e listas) ----------

// Alvo: resenha de um jogo (t:<nome>) ou lista (id). Quem vê: o dono e os amigos dele
function cleanTarget(raw) {
  const owner = typeof raw?.owner === 'string' && UUID.test(raw.owner) ? raw.owner : null;
  const kind = REACTION_KINDS.includes(raw?.kind) ? raw.kind : null;
  const target = typeof raw?.target === 'string' ? raw.target : '';
  if (!owner || !kind) return null;
  if (kind === 'review' && !TITLE_KEY.test(target)) return null;
  if (kind === 'list' && !UUID.test(target)) return null;
  return { owner, kind, target };
}

async function canSee(env, viewerId, ownerId) {
  return viewerId === ownerId || (await areFriends(env, viewerId, ownerId));
}

const targetKey = (t) => `${t.owner}|${t.kind}|${t.target}`;

const commentJson = (row) => ({
  id: row.id,
  user: { id: row.user_id, name: row.custom_name || row.steam_name || 'Jogador', avatarUrl: row.steam_avatar || null },
  text: row.text,
  createdAt: row.created_at
});

// Contagens de vários alvos de uma vez (feed, aba Avaliações): curtidas, se eu curti e quantos comentários
async function reactionSummary(env, viewerId, targets) {
  const allowed = [];
  const checked = new Map();
  for (const t of targets) {
    if (!checked.has(t.owner)) checked.set(t.owner, await canSee(env, viewerId, t.owner));
    if (checked.get(t.owner)) allowed.push(t);
  }
  const items = {};
  for (const t of allowed) items[targetKey(t)] = { likes: 0, liked: false, comments: 0 };
  if (allowed.length === 0) return items;
  const where = allowed.map(() => '(owner_id = ? AND kind = ? AND target = ?)').join(' OR ');
  const args = allowed.flatMap((t) => [t.owner, t.kind, t.target]);
  const [likes, comments] = await Promise.all([
    env.DB.prepare(`SELECT owner_id, kind, target, COUNT(*) AS n, SUM(user_id = ?) AS mine FROM reactions WHERE ${where} GROUP BY owner_id, kind, target`).bind(viewerId, ...args).all(),
    env.DB.prepare(`SELECT owner_id, kind, target, COUNT(*) AS n FROM comments WHERE ${where} GROUP BY owner_id, kind, target`).bind(...args).all()
  ]);
  for (const row of likes.results) {
    const item = items[targetKey({ owner: row.owner_id, kind: row.kind, target: row.target })];
    if (item) {
      item.likes = row.n;
      item.liked = row.mine > 0;
    }
  }
  for (const row of comments.results) {
    const item = items[targetKey({ owner: row.owner_id, kind: row.kind, target: row.target })];
    if (item) item.comments = row.n;
  }
  return items;
}

async function reactionThread(env, viewerId, t) {
  if (!(await canSee(env, viewerId, t.owner))) throw new HttpError(404, 'not_found');
  const [summary, comments, likers] = await Promise.all([
    reactionSummary(env, viewerId, [t]),
    env.DB.prepare(
      `SELECT c.*, u.custom_name, u.steam_name, u.steam_avatar FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.owner_id = ? AND c.kind = ? AND c.target = ? ORDER BY c.created_at ASC LIMIT ?`
    ).bind(t.owner, t.kind, t.target, MAX_COMMENTS_PER_THREAD).all(),
    env.DB.prepare(
      `SELECT u.id, u.custom_name, u.steam_name, u.steam_avatar FROM reactions r JOIN users u ON u.id = r.user_id
       WHERE r.owner_id = ? AND r.kind = ? AND r.target = ? ORDER BY r.created_at DESC LIMIT 20`
    ).bind(t.owner, t.kind, t.target).all()
  ]);
  return {
    ...summary[targetKey(t)],
    likers: likers.results.map((u) => publicUser(u)),
    comments: comments.results.map(commentJson)
  };
}

// A mesma regra do app (src/shared/utils/title-key.ts) e da vitrine
const titleKeyOf = (title) =>
  String(title || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, 'and').replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 120);

// Nome do jogo ou da lista no aviso: só o que o dono mandou ao servidor (biblioteca, lista em grupo ou vitrine).
// O título que vem de quem curte ou comenta é ignorado, para ninguém forjar "curtiu sua resenha de X".
async function storedTitle(env, t) {
  if (t.kind === 'review') {
    const row = await env.DB.prepare('SELECT title FROM library_games WHERE user_id = ? AND title_key = ?').bind(t.owner, t.target.slice(2)).first();
    if (row?.title) return cleanText(row.title, MAX_TITLE) || null;
  } else {
    const row = await env.DB.prepare('SELECT title FROM group_lists WHERE id = ? AND owner_id = ?').bind(t.target, t.owner).first();
    if (row?.title) return cleanText(row.title, MAX_TITLE) || null;
  }
  const showcase = await env.DB.prepare('SELECT data FROM showcases WHERE user_id = ?').bind(t.owner).first();
  if (!showcase) return null;
  let data;
  try {
    data = JSON.parse(showcase.data);
  } catch {
    return null;
  }
  if (t.kind === 'list') {
    const list = (Array.isArray(data?.lists) ? data.lists : []).find((l) => l?.id === t.target);
    return cleanText(list?.title, MAX_TITLE) || null;
  }
  const key = t.target.slice(2);
  for (const field of ['ratings', 'journal', 'favorites', 'mostPlayed', 'recentlyPlayed']) {
    const item = (Array.isArray(data?.[field]) ? data[field] : []).find((g) => typeof g?.title === 'string' && titleKeyOf(g.title) === key);
    if (item) return cleanText(item.title, MAX_TITLE) || null;
  }
  return null;
}

async function setLike(env, viewerId, t, like) {
  if (!(await canSee(env, viewerId, t.owner))) throw new HttpError(404, 'not_found');
  if (await limitedBy(env.ACTION_LIMITER, `like:${viewerId}`)) throw new HttpError(429, 'like_limit');
  if (like) {
    await env.DB.prepare('INSERT OR IGNORE INTO reactions (owner_id, kind, target, user_id, target_title, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(t.owner, t.kind, t.target, viewerId, await storedTitle(env, t), nowIso())
      .run();
  } else {
    await env.DB.prepare('DELETE FROM reactions WHERE owner_id = ? AND kind = ? AND target = ? AND user_id = ?').bind(t.owner, t.kind, t.target, viewerId).run();
  }
  return (await reactionSummary(env, viewerId, [t]))[targetKey(t)];
}

async function addComment(env, viewerId, t, text) {
  if (!(await canSee(env, viewerId, t.owner))) throw new HttpError(404, 'not_found');
  const clean = typeof text === 'string' ? text.replace(/\r\n?/g, '\n').replace(/[^\P{C}\n]/gu, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_COMMENT_TEXT) : '';
  if (!clean) throw new HttpError(400, 'empty_comment');
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE user_id = ? AND created_at > ?')
    .bind(viewerId, new Date(Date.now() - COMMENT_WINDOW_MS).toISOString())
    .first();
  if ((recent?.n ?? 0) >= MAX_COMMENTS_PER_WINDOW) throw new HttpError(429, 'comment_limit');
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO comments (id, owner_id, kind, target, user_id, text, target_title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, t.owner, t.kind, t.target, viewerId, clean, await storedTitle(env, t), nowIso())
    .run();
  return reactionThread(env, viewerId, t);
}

// Apaga quem escreveu ou o dono da resenha/lista
async function deleteComment(env, viewerId, id, scopeOwner = null) {
  const row = await env.DB.prepare('SELECT owner_id, kind, target, user_id FROM comments WHERE id = ?').bind(id).first();
  if (!row || (row.user_id !== viewerId && row.owner_id !== viewerId)) throw new HttpError(404, 'not_found');
  if (scopeOwner && row.owner_id !== scopeOwner) throw new HttpError(404, 'not_found');
  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return reactionThread(env, viewerId, { owner: row.owner_id, kind: row.kind, target: row.target });
}

// POST /v1/social/summary { targets } | GET /v1/social/thread?owner&kind&target | POST /v1/social/like | POST /v1/social/comments | DELETE /v1/social/comments/:id
// scopeOwner: pela vitrine aberta por link, só vale o que é do dono daquela vitrine
async function handleReactions(request, url, env, viewerId, action, commentId, scopeOwner = null) {
  const target = (raw) => {
    const t = cleanTarget(raw);
    if (!t) throw new HttpError(400, 'invalid_target');
    if (scopeOwner && t.owner !== scopeOwner) throw new HttpError(404, 'not_found');
    return t;
  };
  if (action === 'summary' && request.method === 'POST') {
    const body = await readJson(request, 50_000);
    const targets = (Array.isArray(body?.targets) ? body.targets : [])
      .slice(0, MAX_SUMMARY_TARGETS)
      .map(cleanTarget)
      .filter((t) => t && (!scopeOwner || t.owner === scopeOwner));
    return json({ items: await reactionSummary(env, viewerId, targets) });
  }
  if (action === 'thread' && request.method === 'GET') {
    const t = target({ owner: url.searchParams.get('owner'), kind: url.searchParams.get('kind'), target: url.searchParams.get('target') });
    return json(await reactionThread(env, viewerId, t));
  }
  if (action === 'like' && request.method === 'POST') {
    const body = await readJson(request, 2_000);
    const t = target(body);
    return json(await setLike(env, viewerId, t, body.like !== false));
  }
  if (action === 'comments' && request.method === 'POST') {
    const body = await readJson(request, 8_000);
    const t = target(body);
    return json(await addComment(env, viewerId, t, body.text));
  }
  if (action === 'comments' && commentId && request.method === 'DELETE') return json(await deleteComment(env, viewerId, commentId, scopeOwner));
  throw new HttpError(405, 'method_not_allowed');
}

// Avisos: curtidas e comentários nas minhas resenhas e listas, e respostas onde eu comentei
async function handleNotifications(url, env, auth) {
  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw).toISOString() : new Date(Date.now() - 14 * DAY_MS).toISOString();
  const me = auth.user.id;
  const userCols = 'u.id AS u_id, u.custom_name, u.steam_name, u.steam_avatar';
  // De quem eu silenciei (enquanto vale) ou bloqueei, nada chega
  const hidden = (col) =>
    `${col} NOT IN (SELECT friend_id FROM friend_mutes WHERE user_id = ?1 AND (until IS NULL OR until > ?4)) AND ${col} NOT IN (SELECT blocked_id FROM blocks WHERE user_id = ?1)`;
  const args = [me, since, MAX_NOTIFICATIONS, nowIso()];
  const [likes, comments, replies] = await Promise.all([
    env.DB.prepare(
      `SELECT r.kind, r.target, r.target_title, r.created_at, r.owner_id, ${userCols} FROM reactions r JOIN users u ON u.id = r.user_id
       WHERE r.owner_id = ?1 AND r.user_id != ?1 AND r.created_at > ?2 AND ${hidden('r.user_id')} ORDER BY r.created_at DESC LIMIT ?3`
    ).bind(...args).all(),
    env.DB.prepare(
      `SELECT c.id, c.kind, c.target, c.target_title, c.text, c.created_at, c.owner_id, ${userCols} FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.owner_id = ?1 AND c.user_id != ?1 AND c.created_at > ?2 AND ${hidden('c.user_id')} ORDER BY c.created_at DESC LIMIT ?3`
    ).bind(...args).all(),
    env.DB.prepare(
      `SELECT c.id, c.kind, c.target, c.target_title, c.text, c.created_at, c.owner_id, ${userCols}, o.custom_name AS o_custom, o.steam_name AS o_steam
       FROM comments c JOIN users u ON u.id = c.user_id JOIN users o ON o.id = c.owner_id
       WHERE c.owner_id != ?1 AND c.user_id != ?1 AND c.created_at > ?2 AND ${hidden('c.user_id')}
         AND EXISTS (SELECT 1 FROM comments m WHERE m.owner_id = c.owner_id AND m.kind = c.kind AND m.target = c.target AND m.user_id = ?1 AND m.created_at < c.created_at)
       ORDER BY c.created_at DESC LIMIT ?3`
    ).bind(...args).all()
  ]);
  const who = (row) => ({ id: row.u_id, name: row.custom_name || row.steam_name || 'Jogador', avatarUrl: row.steam_avatar || null });
  const base = (row) => ({ kind: row.kind, target: row.target, owner: row.owner_id, title: row.target_title ?? null, user: who(row), at: row.created_at });
  const items = [
    ...likes.results.map((row) => ({ type: 'like', ...base(row) })),
    ...comments.results.map((row) => ({ type: 'comment', id: row.id, text: row.text, ...base(row) })),
    ...replies.results.map((row) => ({ type: 'reply', id: row.id, text: row.text, ownerName: row.o_custom || row.o_steam || 'Jogador', ...base(row) }))
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_NOTIFICATIONS);
  return json({ items });
}

// A vitrine aberta por link curte e comenta como quem pediu o link (o token da conta não vai para a página)
async function viewerOf(env, token) {
  const row = await env.DB.prepare('SELECT l.owner_id, l.expires_at, v.viewer_id FROM view_links l JOIN view_viewers v ON v.token = l.token WHERE l.token = ?').bind(token).first();
  if (!row || row.expires_at <= nowIso()) throw new HttpError(401, 'link_expired');
  return { viewerId: row.viewer_id, ownerId: row.owner_id };
}

// ---------- Status e chamadas ----------

// O que vale agora: escolha com prazo vencido volta para online
export function effectiveStatus(row, now = Date.now()) {
  if (!row?.p_status || !PRESENCE_STATUSES.includes(row.p_status)) return 'online';
  if (row.p_until && Date.parse(row.p_until) <= now) return 'online';
  return row.p_status;
}

// O que os amigos veem. Invisível = off-line desde que ficou invisível, sem "jogando agora"
function presenceView(row) {
  const status = effectiveStatus(row);
  if (status === 'invisible') {
    const hiddenAt = row.p_since && row.p_since < row.last_seen_at ? row.p_since : row.last_seen_at;
    return { lastSeenAt: hiddenAt, presence: 'offline', nowPlaying: null };
  }
  return { lastSeenAt: row.last_seen_at, presence: status, nowPlaying: nowPlayingOf(row, parseSettings(row.settings)) };
}

async function handlePresence(request, env, auth) {
  if (request.method !== 'PUT') throw new HttpError(405, 'method_not_allowed');
  const body = await readJson(request, 1_000);
  const status = PRESENCE_STATUSES.includes(body?.status) ? body.status : null;
  if (!status) throw new HttpError(400, 'invalid_status');
  const untilMs = typeof body.until === 'string' ? Date.parse(body.until) : NaN;
  const until = status !== 'online' && untilMs > Date.now() && untilMs <= Date.now() + MAX_PRESENCE_MS ? new Date(untilMs).toISOString() : null;
  const auto = status === 'away' && body.auto === true ? 1 : 0;
  const now = nowIso();
  const updates = [
    env.DB.prepare(
      `INSERT INTO presence (user_id, status, until, auto, since, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET since = CASE WHEN presence.status = excluded.status THEN presence.since ELSE excluded.since END,
         status = excluded.status, until = excluded.until, auto = excluded.auto, updated_at = excluded.updated_at`
    ).bind(auth.user.id, status, until, auto, now, now)
  ];
  // Invisível não mostra o jogo, nem o que já estava lá
  if (status === 'invisible') updates.push(env.DB.prepare('DELETE FROM now_playing WHERE user_id = ?').bind(auth.user.id));
  await env.DB.batch(updates);
  return json({ presence: { status, until, auto: !!auto } });
}

async function handleCallCreate(request, env, auth) {
  const body = await readJson(request, 1_000);
  const to = typeof body?.to === 'string' && UUID.test(body.to) ? body.to : null;
  if (!to || to === auth.user.id) throw new HttpError(400, 'invalid_friend');
  if (!(await areFriends(env, auth.user.id, to))) throw new HttpError(404, 'not_found');
  const now = Date.now();
  const { results: recent } = await env.DB.prepare('SELECT to_id, created_at FROM calls WHERE from_id = ? AND created_at > ?')
    .bind(auth.user.id, new Date(now - CALL_WINDOW_MS).toISOString())
    .all();
  const last = Math.max(0, ...recent.filter((r) => r.to_id === to).map((r) => Date.parse(r.created_at)));
  if (now - last < CALL_PAIR_COOLDOWN_MS) {
    return json({ error: 'call_cooldown', retryAfterSeconds: Math.ceil((CALL_PAIR_COOLDOWN_MS - (now - last)) / 1000) }, 429);
  }
  if (recent.length >= MAX_CALLS_PER_WINDOW) return json({ error: 'call_limit' }, 429);
  const call = { id: crypto.randomUUID(), to, createdAt: new Date(now).toISOString() };
  await env.DB.prepare('INSERT INTO calls (id, from_id, to_id, created_at) VALUES (?, ?, ?, ?)').bind(call.id, auth.user.id, to, call.createdAt).run();
  return json({ call });
}

// Uma consulta traz as chamadas novas para mim e as respostas das minhas; cada uma chega uma vez só
// GET /v1/me/poll?parts=calls,friends,notifications[&since=]: o app pergunta tudo de uma vez,
// e só as partes que venceram (corta pedidos no plano grátis). As rotas antigas continuam.
const POLL_PARTS = ['calls', 'friends', 'notifications'];

async function handlePoll(request, url, env, auth) {
  if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
  const parts = new Set((url.searchParams.get('parts') ?? '').split(',').filter((part) => POLL_PARTS.includes(part)));
  if (parts.size === 0) throw new HttpError(400, 'invalid_request');
  const out = {};
  if (parts.has('calls')) out.calls = await (await handleCalls(env, auth)).json();
  if (parts.has('friends')) out.friends = (await (await handleFriends(request, env, auth)).json()).friends;
  if (parts.has('notifications')) out.notifications = (await (await handleNotifications(url, env, auth)).json()).items;
  return json(out);
}

// incoming: chamadas novas para mim (uma vez só). answers: respostas às minhas (uma vez só).
// rang: minhas chamadas que já tocaram no PC do amigo e esperam resposta (a cada consulta, enquanto tocam).
// cancelled: chamadas para mim que quem chamou desligou depois de tocar (uma vez só), para fechar a tela e o aviso.
// Desligar usa a mesma coluna da resposta ('cancelled'): nada de coluna nova no banco.
async function handleCalls(env, auth) {
  const now = Date.now();
  const since = new Date(now - CALL_TTL_MS).toISOString();
  const ringing = new Date(now - CALL_RING_MS).toISOString();
  const [incoming, answers, rang, cancelled] = await Promise.all([
    env.DB.prepare(
      `SELECT c.id AS call_id, c.created_at AS call_at, u.* FROM calls c JOIN users u ON u.id = c.from_id
       WHERE c.to_id = ? AND c.delivered_at IS NULL AND c.answer IS NULL AND c.created_at > ? ORDER BY c.created_at`
    )
      .bind(auth.user.id, since)
      .all(),
    env.DB.prepare(
      `SELECT c.id AS call_id, c.answer, c.answered_at, u.* FROM calls c JOIN users u ON u.id = c.to_id
       WHERE c.from_id = ? AND c.answer IS NOT NULL AND c.answer != 'cancelled' AND c.answer_seen = 0 AND c.created_at > ?`
    )
      .bind(auth.user.id, since)
      .all(),
    env.DB.prepare(
      `SELECT c.id AS call_id, c.delivered_at, u.* FROM calls c JOIN users u ON u.id = c.to_id
       WHERE c.from_id = ? AND c.delivered_at IS NOT NULL AND c.answer IS NULL AND c.created_at > ?`
    )
      .bind(auth.user.id, ringing)
      .all(),
    env.DB.prepare(
      `SELECT c.id AS call_id FROM calls c
       WHERE c.to_id = ? AND c.answer = 'cancelled' AND c.delivered_at IS NOT NULL AND c.answer_seen = 0 AND c.created_at > ?`
    )
      .bind(auth.user.id, since)
      .all()
  ]);
  const stamp = nowIso();
  // Chamado de quem eu silenciei: conta como entregue, mas não aparece (para quem chamou, fica sem resposta)
  const hidden = incoming.results.length ? await hiddenFrom(env, auth.user.id) : new Set();
  const marks = [
    ...incoming.results.map((r) => env.DB.prepare('UPDATE calls SET delivered_at = ? WHERE id = ?').bind(stamp, r.call_id)),
    ...answers.results.map((r) => env.DB.prepare('UPDATE calls SET answer_seen = 1 WHERE id = ?').bind(r.call_id)),
    ...cancelled.results.map((r) => env.DB.prepare('UPDATE calls SET answer_seen = 1 WHERE id = ?').bind(r.call_id))
  ];
  if (marks.length) await env.DB.batch(marks);
  return json({
    incoming: incoming.results
      .filter((r) => !hidden.has(r.id))
      .map((r) => ({ id: r.call_id, from: publicUser(r), createdAt: r.call_at, missed: now - Date.parse(r.call_at) > CALL_RING_MS })),
    answers: answers.results.map((r) => ({ id: r.call_id, user: publicUser(r), answer: r.answer, answeredAt: r.answered_at })),
    rang: rang.results.map((r) => ({ id: r.call_id, user: publicUser(r), deliveredAt: r.delivered_at })),
    cancelled: cancelled.results.map((r) => r.call_id)
  });
}

// Quem chamou desliga: a chamada que ainda não tocou nem chega; a que já tocou fecha do outro lado na próxima consulta
async function handleCallCancel(env, auth, callId) {
  const call = await env.DB.prepare('SELECT from_id, answer, delivered_at FROM calls WHERE id = ?').bind(callId).first();
  if (!call || call.from_id !== auth.user.id) throw new HttpError(404, 'not_found');
  if (call.answer) return json({ ok: true, answer: call.answer });
  // Não tocou: ninguém precisa saber que foi desligada
  await env.DB.prepare("UPDATE calls SET answer = 'cancelled', answered_at = ?, answer_seen = ? WHERE id = ? AND answer IS NULL")
    .bind(nowIso(), call.delivered_at ? 0 : 1, callId)
    .run();
  return json({ ok: true, answer: 'cancelled' });
}

async function handleCallAnswer(request, env, auth, callId) {
  const body = await readJson(request, 500);
  const answer = CALL_ANSWERS.includes(body?.answer) ? body.answer : null;
  if (!answer) throw new HttpError(400, 'invalid_answer');
  const call = await env.DB.prepare('SELECT to_id, answer FROM calls WHERE id = ?').bind(callId).first();
  if (!call || call.to_id !== auth.user.id) throw new HttpError(404, 'not_found');
  if (call.answer) return json({ ok: true, answer: call.answer });
  await env.DB.prepare('UPDATE calls SET answer = ?, answered_at = ? WHERE id = ?').bind(answer, nowIso(), callId).run();
  return json({ ok: true, answer });
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

// ---------- Sincronização privada entre PCs ----------

function parseSyncData(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

async function handleSync(request, env, auth) {
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT revision, data, updated_at FROM user_sync WHERE user_id = ?').bind(auth.user.id).first();
    if (!row) return json({ revision: 0, updatedAt: null, data: null });
    return json({ revision: Number(row.revision) || 1, updatedAt: row.updated_at, data: parseSyncData(row.data) });
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM user_sync WHERE user_id = ?').bind(auth.user.id).run();
    return json({ ok: true });
  }

  if (request.method !== 'PUT') throw new HttpError(405, 'method_not_allowed');
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_SYNC_BYTES * 4) throw new HttpError(413, 'too_large');
  const text = await request.text();
  if (text.length > MAX_SYNC_BYTES) throw new HttpError(413, 'too_large');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
  const data = body && typeof body === 'object' ? body.data : null;
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    data.schema !== 'lazulium-sync/1' ||
    !Array.isArray(data.games) ||
    !Array.isArray(data.lists) ||
    !Array.isArray(data.categories)
  ) {
    throw new HttpError(400, 'invalid_sync');
  }
  const baseRevision = body.baseRevision;
  if (baseRevision !== undefined && baseRevision !== null && (!Number.isInteger(baseRevision) || baseRevision < 0)) {
    throw new HttpError(400, 'invalid_revision');
  }

  const serialized = JSON.stringify(data);
  // length conta letras; acento e emoji ocupam mais de um byte
  if (new TextEncoder().encode(serialized).length > MAX_SYNC_BYTES) throw new HttpError(413, 'too_large');

  const now = nowIso();
  const existing = await env.DB.prepare('SELECT revision, data, updated_at FROM user_sync WHERE user_id = ?').bind(auth.user.id).first();

  if (existing) {
    const curRev = Number(existing.revision) || 1;
    if (typeof baseRevision === 'number' && baseRevision !== curRev) {
      return json({ error: 'conflict', revision: curRev, updatedAt: existing.updated_at, data: parseSyncData(existing.data) }, 409);
    }
    const nextRev = curRev + 1;
    const res = await env.DB.prepare('UPDATE user_sync SET revision = ?, data = ?, updated_at = ? WHERE user_id = ? AND revision = ?')
      .bind(nextRev, serialized, now, auth.user.id, curRev)
      .run();
    if (!res.meta?.changes) {
      const latest = await env.DB.prepare('SELECT revision, data, updated_at FROM user_sync WHERE user_id = ?').bind(auth.user.id).first();
      return json(
        { error: 'conflict', revision: Number(latest?.revision) || 0, updatedAt: latest?.updated_at ?? null, data: latest ? parseSyncData(latest.data) : null },
        409
      );
    }
    return json({ revision: nextRev, updatedAt: now });
  }

  if (typeof baseRevision === 'number' && baseRevision > 0) {
    return json({ error: 'conflict', revision: 0, updatedAt: null, data: null }, 409);
  }
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO user_sync (user_id, revision, data, updated_at) VALUES (?, 1, ?, ?)')
    .bind(auth.user.id, serialized, now)
    .run();
  if (!ins.meta?.changes) {
    const latest = await env.DB.prepare('SELECT revision, data, updated_at FROM user_sync WHERE user_id = ?').bind(auth.user.id).first();
    return json(
      { error: 'conflict', revision: Number(latest?.revision) || 0, updatedAt: latest?.updated_at ?? null, data: latest ? parseSyncData(latest.data) : null },
      409
    );
  }
  return json({ revision: 1, updatedAt: now });
}

async function handleMediaUpload(request, env, auth, kind, origin) {
  if (!MEDIA_KINDS.includes(kind)) throw new HttpError(404, 'not_found');
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM media WHERE user_id = ? AND kind = ?').bind(auth.user.id, kind).run();
    await purgeStored(env, auth.user.id, kind);
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
  // A imagem nova toma o lugar do GIF ou vídeo que estava na VPS
  await purgeStored(env, auth.user.id, kind);
  return json({ url: `${origin}/v1/media/${token}` });
}

async function handleMediaGet(env, token) {
  const row = await env.DB.prepare('SELECT mime, data FROM media WHERE token = ?').bind(token).first();
  if (!row) return new Response('Not found', { status: 404 });
  const bytes = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
  // O endereço muda a cada envio: pode ficar em cache para sempre
  return new Response(bytes, { headers: { 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}

// ---------- Imagens das resenhas ----------
// O app manda cada imagem uma vez (o id é o hash do conteúdo) e guarda o endereço que volta. A lista serve para
// outro PC da mesma pessoa saber o que já está aqui. Imagem que saiu de todas as resenhas o app apaga depois de 15 dias.

const reviewImageUrl = (origin, token) => `${origin}/v1/review-images/${token}`;

function isReviewImageBytes(base64, mime) {
  const head = atob(base64.slice(0, 24));
  if (mime === 'image/gif') return head.startsWith('GIF87a') || head.startsWith('GIF89a');
  return head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
}

async function handleReviewImages(request, env, auth, imageId, origin) {
  const userId = auth.user.id;
  if (!imageId) {
    if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
    const { results } = await env.DB.prepare('SELECT image_id, token FROM review_images WHERE user_id = ? ORDER BY created_at').bind(userId).all();
    return json({ images: results.map((r) => ({ id: r.image_id, url: reviewImageUrl(origin, r.token) })) });
  }
  if (!REVIEW_IMAGE_ID.test(imageId)) throw new HttpError(404, 'not_found');
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM review_images WHERE user_id = ? AND image_id = ?').bind(userId, imageId).run();
    return json({ ok: true });
  }
  if (request.method !== 'PUT') throw new HttpError(405, 'method_not_allowed');
  const existing = await env.DB.prepare('SELECT token FROM review_images WHERE user_id = ? AND image_id = ?').bind(userId, imageId).first();
  if (existing) return json({ url: reviewImageUrl(origin, existing.token) });

  const body = await readJson(request, MAX_REVIEW_IMAGE_BASE64 + 200);
  const mime = imageId.endsWith('.gif') ? 'image/gif' : 'image/webp';
  const data = typeof body?.data === 'string' && body.data.length <= MAX_REVIEW_IMAGE_BASE64 && body.data.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(body.data) ? body.data : null;
  if (!data || !isReviewImageBytes(data, mime)) throw new HttpError(400, 'invalid_media');
  const usage = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(data)), 0) AS size FROM review_images WHERE user_id = ?').bind(userId).first();
  if (Number(usage?.n) >= MAX_REVIEW_IMAGES_PER_USER || Number(usage?.size) + data.length > MAX_REVIEW_IMAGE_STORAGE) {
    throw new HttpError(413, 'review_images_full');
  }
  const token = randomToken(24);
  // Dois envios ao mesmo tempo (dois PCs): o segundo não duplica e devolve o endereço do primeiro
  await env.DB.prepare('INSERT INTO review_images (token, user_id, image_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, image_id) DO NOTHING')
    .bind(token, userId, imageId, mime, data, nowIso())
    .run();
  const saved = await env.DB.prepare('SELECT token FROM review_images WHERE user_id = ? AND image_id = ?').bind(userId, imageId).first();
  return json({ url: reviewImageUrl(origin, saved?.token ?? token) });
}

async function handleReviewImageGet(env, token) {
  const row = await env.DB.prepare('SELECT mime, data FROM review_images WHERE token = ?').bind(token).first();
  if (!row) return new Response('Not found', { status: 404 });
  const bytes = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
  // Cada imagem tem endereço próprio, que nunca muda de conteúdo
  return new Response(bytes, { headers: { 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}

// ---------- Arquivos grandes (GIF e vídeo de fundo) ----------
// O arquivo vai direto do app para a guarda de arquivos da VPS. Aqui só sai o bilhete assinado que autoriza o envio
// e fica anotado quem tem arquivo lá (stored_media), para apagar junto com a conta.

// null quando falta o endereço (MEDIA_STORE_URL) ou o segredo (MEDIA_SECRET): o app segue como antes, sem GIF grande nem vídeo
function mediaStore(env) {
  if (typeof env.MEDIA_SECRET !== 'string' || env.MEDIA_SECRET.length < 32) return null;
  let url;
  try {
    url = new URL(env.MEDIA_STORE_URL);
  } catch {
    return null;
  }
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) return null;
  // MEDIA_STORE: a guarda no mesmo processo (server.mjs e testes), no formato de um service binding
  return { origin: url.origin, secret: env.MEDIA_SECRET, fetch: (request) => (env.MEDIA_STORE ? env.MEDIA_STORE.fetch(request) : fetch(request)) };
}

async function handleUploadTicket(request, env, auth, kind) {
  if (!STORE_KINDS.includes(kind)) throw new HttpError(404, 'not_found');
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  const store = mediaStore(env);
  if (!store) throw new HttpError(501, 'no_store');
  const body = await readJson(request, 1_000);
  const mime = typeof body?.mime === 'string' && STORE_MIME.test(body.mime) ? body.mime : null;
  const size = Number.isInteger(body?.size) && body.size > 0 ? body.size : null;
  if (!mime || !size) throw new HttpError(400, 'invalid_media');
  if (size > MAX_STORE_BYTES) throw new HttpError(413, 'too_large');
  const expiresAt = Date.now() + UPLOAD_TICKET_TTL_MS;
  await env.DB.batch([
    // O arquivo da VPS toma o lugar da imagem que estava aqui
    env.DB.prepare('DELETE FROM media WHERE user_id = ? AND kind = ?').bind(auth.user.id, kind),
    env.DB.prepare(
      'INSERT INTO stored_media (user_id, kind, purge, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT (user_id, kind) DO UPDATE SET purge = 0, updated_at = excluded.updated_at'
    ).bind(auth.user.id, kind, nowIso())
  ]);
  const ticket = await signTicket(store.secret, { a: 'put', u: auth.user.id, k: kind, e: expiresAt, m: MAX_STORE_BYTES });
  return json({ uploadUrl: `${store.origin}/media/upload`, ticket, maxBytes: MAX_STORE_BYTES, expiresAt: new Date(expiresAt).toISOString() });
}

async function sendPurge(store, userId, kind) {
  try {
    const ticket = await signTicket(store.secret, { a: 'del', u: userId, k: kind, e: Date.now() + PURGE_TICKET_TTL_MS });
    const request = new Request(`${store.origin}/media/purge`, { method: 'POST', headers: { Authorization: `Bearer ${ticket}` }, signal: AbortSignal.timeout(PURGE_TIMEOUT_MS) });
    return (await store.fetch(request)).ok;
  } catch {
    return false;
  }
}

// Apaga da VPS o arquivo da pessoa (um tipo, ou todos quando a conta é apagada).
// Se a VPS não confirmar, o pedido fica anotado (purge = 1) e é repetido de hora em hora.
async function purgeStored(env, userId, kind) {
  const store = mediaStore(env);
  if (!store || (kind && !STORE_KINDS.includes(kind))) return;
  const filter = kind ? 'user_id = ? AND kind = ?' : 'user_id = ?';
  const args = kind ? [userId, kind] : [userId];
  const { results } = await env.DB.prepare(`SELECT kind FROM stored_media WHERE ${filter}`).bind(...args).all();
  if (!results.length) return;
  if (await sendPurge(store, userId, kind ?? '*')) await env.DB.prepare(`DELETE FROM stored_media WHERE ${filter}`).bind(...args).run();
  else await env.DB.prepare(`UPDATE stored_media SET purge = 1, updated_at = ? WHERE ${filter}`).bind(nowIso(), ...args).run();
}

export async function retryPurges(env) {
  const store = env.DB ? mediaStore(env) : null;
  if (!store) return 0;
  const { results } = await env.DB.prepare('SELECT user_id, kind FROM stored_media WHERE purge = 1 ORDER BY updated_at LIMIT ?').bind(MAX_PURGE_RETRIES).all();
  let done = 0;
  for (const row of results) {
    if (!(await sendPurge(store, row.user_id, row.kind))) break;   // VPS ainda fora do ar: fica para a próxima hora
    await env.DB.prepare('DELETE FROM stored_media WHERE user_id = ? AND kind = ? AND purge = 1').bind(row.user_id, row.kind).run();
    done++;
  }
  return done;
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
    env.DB.prepare('INSERT INTO view_links (token, owner_id, expires_at) VALUES (?, ?, ?)').bind(token, ownerId, later(VIEW_LINK_TTL_MS)),
    env.DB.prepare('INSERT INTO view_viewers (token, viewer_id) VALUES (?, ?)').bind(token, auth.user.id),
    env.DB.prepare('DELETE FROM view_viewers WHERE token NOT IN (SELECT token FROM view_links)')
  ]);
  return json({ url: `${origin}/v1/view/${token}` });
}

// A mesma política da página (que também vem no <meta>), agora no cabeçalho: vale antes de qualquer HTML ser lido.
// A página só fala com este servidor (curtidas e comentários pelo link) e não envia formulários.
// Vídeo só da Steam e da guarda de arquivos do Lazulium (o vídeo de fundo que a pessoa escolheu).
// Imagem só da Steam, IGDB, SteamGridDB, RetroAchievements e do próprio Lazulium: endereço de outro lugar
// na vitrine não revela o IP de quem abre.
export const PAGE_IMG_SRC =
  "'self' data: https://*.steamstatic.com https://steamcdn-a.akamaihd.net https://*.steamusercontent.com https://images.igdb.com https://*.steamgriddb.com https://*.retroachievements.org";

function pageCsp(env) {
  const store = mediaStore(env);
  const extra = store ? ` ${store.origin}` : '';
  const media = `https://*.steamstatic.com${extra}`;
  return `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src ${PAGE_IMG_SRC}${extra}; media-src ${media}; connect-src 'self'; base-uri 'none'; form-action 'none'`;
}

function pageHeaders(env) {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': pageCsp(env),
    'Cross-Origin-Opener-Policy': 'same-origin'
  };
}
const UNAVAILABLE_PAGE =
  '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0b1020;color:#cbd5e1;display:grid;place-items:center;height:100vh;margin:0">Este perfil não está disponível agora.';

// JSON dentro de <script>: "<" e separadores de linha escapados para nenhum texto do perfil fechar a tag
export const scriptSafeJson = (text) => text.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

async function handleView(env, token) {
  const link = await env.DB.prepare('SELECT owner_id, expires_at FROM view_links WHERE token = ?').bind(token).first();
  const owner = link && link.expires_at > nowIso() ? await env.DB.prepare('SELECT settings FROM users WHERE id = ?').bind(link.owner_id).first() : null;
  const showcase = owner && parseSettings(owner.settings).shareProfile ? await env.DB.prepare('SELECT data FROM showcases WHERE user_id = ?').bind(link.owner_id).first() : null;
  if (!showcase || !env.PROFILE_PAGE) return new Response(UNAVAILABLE_PAGE, { status: 404, headers: pageHeaders(env) });
  const csp = pageCsp(env);
  // Alinha o <meta> ao cabeçalho para que o navegador não bloqueie o vídeo vindo de MEDIA_STORE_URL
  const page = env.PROFILE_PAGE.replace(
    /<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`
  );
  const viewer = await env.DB.prepare('SELECT viewer_id FROM view_viewers WHERE token = ?').bind(token).first();
  const social = viewer ? { token, viewerId: viewer.viewer_id, ownerId: link.owner_id } : null;
  const inline = `<script>window.LAZULIUM_PROFILE = ${scriptSafeJson(showcase.data)};${social ? ` window.LAZULIUM_SOCIAL = ${scriptSafeJson(JSON.stringify(social))};` : ''}</script>`;
  return new Response(page.replace('</head>', `${inline}\n</head>`), { headers: pageHeaders(env) });
}

// ---------- Listas em grupo ----------

async function requireGroupListAccess(env, listId, userId, { ownerOnly = false } = {}) {
  const list = await env.DB.prepare('SELECT * FROM group_lists WHERE id = ?').bind(listId).first();
  if (!list) throw new HttpError(404, 'not_found');
  if (list.owner_id !== userId) {
    const member = await env.DB.prepare('SELECT 1 FROM group_list_members WHERE list_id = ? AND user_id = ?').bind(listId, userId).first();
    if (!member || !(await areFriends(env, list.owner_id, userId))) throw new HttpError(404, 'not_found');
    if (ownerOnly) throw new HttpError(403, 'forbidden');
  }
  return list;
}

async function buildGroupListViews(env, lists) {
  if (lists.length === 0) return [];
  const listIds = lists.map((l) => l.id);
  const ownerIds = [...new Set(lists.map((l) => l.owner_id))];
  const listPh = listIds.map(() => '?').join(',');
  const ownerPh = ownerIds.map(() => '?').join(',');

  const [ownersRes, membersRes, itemsRes, friendSets] = await Promise.all([
    env.DB.prepare(`SELECT * FROM users WHERE id IN (${ownerPh})`).bind(...ownerIds).all(),
    env.DB.prepare(
      `SELECT m.list_id, m.added_at, u.* FROM group_list_members m JOIN users u ON u.id = m.user_id
       WHERE m.list_id IN (${listPh}) ORDER BY m.added_at ASC`
    ).bind(...listIds).all(),
    env.DB.prepare(
      `SELECT i.*, u.id AS u_id, u.custom_name AS u_custom_name, u.steam_name AS u_steam_name, u.steam_avatar AS u_steam_avatar
       FROM group_list_items i LEFT JOIN users u ON u.id = i.added_by
       WHERE i.list_id IN (${listPh}) ORDER BY i.position ASC, i.added_at ASC`
    ).bind(...listIds).all(),
    Promise.all(ownerIds.map(async (id) => [id, new Set(await friendIds(env, id))]))
  ]);

  const ownersById = new Map(ownersRes.results.map((u) => [u.id, publicUser(u)]));
  const friendsByOwner = new Map(friendSets);
  const membersByList = new Map();
  for (const row of membersRes.results) {
    const listMembers = membersByList.get(row.list_id) ?? [];
    listMembers.push(row);
    membersByList.set(row.list_id, listMembers);
  }
  const itemsByList = new Map();
  for (const row of itemsRes.results) {
    const listItems = itemsByList.get(row.list_id) ?? [];
    listItems.push({
      titleKey: row.title_key,
      steamKey: row.steam_key ?? null,
      title: row.title,
      coverUrl: row.cover_url ?? null,
      position: row.position,
      addedBy: row.u_id
        ? { id: row.u_id, name: row.u_custom_name || row.u_steam_name || 'Jogador', avatarUrl: row.u_steam_avatar || null }
        : null,
      addedAt: row.added_at
    });
    itemsByList.set(row.list_id, listItems);
  }

  return lists.map((l) => {
    const allowedFriends = friendsByOwner.get(l.owner_id) ?? new Set();
    const members = (membersByList.get(l.id) ?? []).filter((m) => allowedFriends.has(m.id)).map((m) => publicUser(m));
    return {
      id: l.id,
      owner: ownersById.get(l.owner_id) ?? { id: l.owner_id, name: 'Jogador', avatarUrl: null },
      title: l.title,
      description: l.description,
      ranked: Boolean(l.ranked),
      members,
      items: itemsByList.get(l.id) ?? [],
      createdAt: l.created_at,
      updatedAt: l.updated_at
    };
  });
}

async function buildGroupListView(env, list) {
  return (await buildGroupListViews(env, [list]))[0];
}

async function handleGroupListsCollection(request, env, auth) {
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT l.* FROM group_lists l
       WHERE l.owner_id = ?1 OR EXISTS (SELECT 1 FROM group_list_members m WHERE m.list_id = l.id AND m.user_id = ?1)
       ORDER BY l.updated_at DESC`
    )
      .bind(auth.user.id)
      .all();
    const myFriends = new Set(await friendIds(env, auth.user.id));
    const visible = results.filter((l) => l.owner_id === auth.user.id || myFriends.has(l.owner_id));
    return json({ lists: await buildGroupListViews(env, visible) });
  }
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed');

  const body = await readJson(request, 20_000);
  const owned = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_lists WHERE owner_id = ?').bind(auth.user.id).first();
  if ((owned?.n ?? 0) >= MAX_GROUP_LISTS_OWNED) throw new HttpError(400, 'too_many_lists');

  const title = cleanText(body?.title, MAX_LIST_TITLE);
  if (!title) throw new HttpError(400, 'invalid_title');
  const description = cleanMultiline(body?.description, MAX_LIST_DESCRIPTION);
  const ranked = body?.ranked ? 1 : 0;

  const rawMembers = body?.memberIds === undefined ? [] : Array.isArray(body.memberIds) ? body.memberIds : null;
  if (rawMembers === null) throw new HttpError(400, 'invalid_request');
  const memberIds = [];
  const seenMembers = new Set();
  for (const id of rawMembers) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, 'invalid_request');
    if (id !== auth.user.id && !seenMembers.has(id)) {
      seenMembers.add(id);
      memberIds.push(id);
    }
  }
  if (memberIds.length > MAX_GROUP_LIST_MEMBERS) throw new HttpError(400, 'too_many_members');
  if (memberIds.length > 0) {
    const myFriends = new Set(await friendIds(env, auth.user.id));
    for (const id of memberIds) {
      if (!myFriends.has(id)) throw new HttpError(400, 'not_friends');
    }
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  const stmts = [
    env.DB.prepare('INSERT INTO group_lists (id, owner_id, title, description, ranked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, auth.user.id, title, description, ranked, now, now)
  ];
  for (const memberId of memberIds) {
    stmts.push(env.DB.prepare('INSERT INTO group_list_members (list_id, user_id, added_at) VALUES (?, ?, ?)').bind(id, memberId, now));
  }
  await env.DB.batch(stmts);
  const created = await env.DB.prepare('SELECT * FROM group_lists WHERE id = ?').bind(id).first();
  return json({ list: await buildGroupListView(env, created) }, 201);
}

async function handleGroupListDetail(request, env, auth, listId) {
  if (request.method === 'GET') {
    const list = await requireGroupListAccess(env, listId, auth.user.id);
    return json({ list: await buildGroupListView(env, list) });
  }
  if (request.method === 'PATCH') {
    const list = await requireGroupListAccess(env, listId, auth.user.id, { ownerOnly: true });
    const body = await readJson(request, 5_000);
    if (!body || typeof body !== 'object') throw new HttpError(400, 'invalid_request');
    let title = list.title;
    let description = list.description;
    let ranked = list.ranked;
    if ('title' in body) {
      title = cleanText(body.title, MAX_LIST_TITLE);
      if (!title) throw new HttpError(400, 'invalid_title');
    }
    if ('description' in body) description = cleanMultiline(body.description, MAX_LIST_DESCRIPTION);
    if ('ranked' in body) ranked = body.ranked ? 1 : 0;
    const now = nowIso();
    await env.DB.prepare('UPDATE group_lists SET title = ?, description = ?, ranked = ?, updated_at = ? WHERE id = ?')
      .bind(title, description, ranked, now, listId)
      .run();
    const fresh = await env.DB.prepare('SELECT * FROM group_lists WHERE id = ?').bind(listId).first();
    return json({ list: await buildGroupListView(env, fresh) });
  }
  if (request.method === 'DELETE') {
    const list = await requireGroupListAccess(env, listId, auth.user.id, { ownerOnly: true });
    await env.DB.batch([
      env.DB.prepare('DELETE FROM group_list_items WHERE list_id = ?').bind(listId),
      env.DB.prepare('DELETE FROM group_list_members WHERE list_id = ?').bind(listId),
      env.DB.prepare("DELETE FROM reactions WHERE owner_id = ? AND kind = 'list' AND target = ?").bind(list.owner_id, listId),
      env.DB.prepare("DELETE FROM comments WHERE owner_id = ? AND kind = 'list' AND target = ?").bind(list.owner_id, listId),
      env.DB.prepare('DELETE FROM group_lists WHERE id = ?').bind(listId)
    ]);
    return json({ deleted: true, id: listId });
  }
  throw new HttpError(405, 'method_not_allowed');
}

async function handleGroupListMembers(request, env, auth, listId, memberUserId) {
  if (!memberUserId && request.method === 'POST') {
    const list = await requireGroupListAccess(env, listId, auth.user.id, { ownerOnly: true });
    const body = await readJson(request, 5_000);
    const rawIds = Array.isArray(body?.userIds) ? body.userIds : body?.userId ? [body.userId] : null;
    if (!rawIds || rawIds.length === 0) throw new HttpError(400, 'invalid_request');
    const candidateIds = [];
    const seen = new Set();
    for (const id of rawIds) {
      if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, 'invalid_request');
      if (id !== list.owner_id && !seen.has(id)) {
        seen.add(id);
        candidateIds.push(id);
      }
    }
    if (candidateIds.length === 0) return json({ list: await buildGroupListView(env, list) });
    const myFriends = new Set(await friendIds(env, list.owner_id));
    for (const id of candidateIds) {
      if (!myFriends.has(id)) throw new HttpError(400, 'not_friends');
    }
    const existingRows = await env.DB.prepare('SELECT user_id FROM group_list_members WHERE list_id = ?').bind(listId).all();
    const existingSet = new Set(existingRows.results.map((r) => r.user_id));
    const toAdd = candidateIds.filter((id) => !existingSet.has(id));
    if (existingSet.size + toAdd.length > MAX_GROUP_LIST_MEMBERS) throw new HttpError(400, 'too_many_members');
    if (toAdd.length > 0) {
      const now = nowIso();
      await env.DB.batch([
        ...toAdd.map((id) => env.DB.prepare('INSERT OR IGNORE INTO group_list_members (list_id, user_id, added_at) VALUES (?, ?, ?)').bind(listId, id, now)),
        env.DB.prepare('UPDATE group_lists SET updated_at = ? WHERE id = ?').bind(now, listId)
      ]);
    }
    const fresh = await env.DB.prepare('SELECT * FROM group_lists WHERE id = ?').bind(listId).first();
    return json({ list: await buildGroupListView(env, fresh) });
  }
  if (memberUserId && request.method === 'DELETE') {
    const list = await requireGroupListAccess(env, listId, auth.user.id);
    if (memberUserId === list.owner_id) throw new HttpError(400, 'cannot_remove_owner');
    if (auth.user.id !== list.owner_id && memberUserId !== auth.user.id) throw new HttpError(403, 'forbidden');
    const now = nowIso();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM group_list_members WHERE list_id = ? AND user_id = ?').bind(listId, memberUserId),
      env.DB.prepare('UPDATE group_lists SET updated_at = ? WHERE id = ?').bind(now, listId)
    ]);
    if (memberUserId === auth.user.id) return json({ left: true, id: listId, list: null });
    const fresh = await env.DB.prepare('SELECT * FROM group_lists WHERE id = ?').bind(listId).first();
    return json({ left: false, id: listId, list: await buildGroupListView(env, fresh) });
  }
  throw new HttpError(405, 'method_not_allowed');
}

async function handleGroupListGames(request, env, auth, listId, rawTitleKey) {
  if (!rawTitleKey && request.method === 'POST') {
    await requireGroupListAccess(env, listId, auth.user.id);
    const body = await readJson(request, 5_000);
    const title = cleanText(body?.title, MAX_TITLE);
    const titleKey = typeof body?.titleKey === 'string' && TITLE_KEY.test(body.titleKey) ? body.titleKey : null;
    if (!title || !titleKey) throw new HttpError(400, 'invalid_game');
    const steamKey = typeof body?.steamKey === 'string' && STEAM_KEY.test(body.steamKey) ? body.steamKey : null;
    const coverUrl = typeof body?.coverUrl === 'string' && COVER_URL.test(body.coverUrl) ? body.coverUrl : null;
    const now = nowIso();

    const existing = await env.DB.prepare('SELECT 1 FROM group_list_items WHERE list_id = ? AND title_key = ?').bind(listId, titleKey).first();
    if (existing) {
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE group_list_items SET steam_key = COALESCE(steam_key, ?), cover_url = COALESCE(cover_url, ?) WHERE list_id = ? AND title_key = ?'
        ).bind(steamKey, coverUrl, listId, titleKey),
        env.DB.prepare('UPDATE group_lists SET updated_at = ? WHERE id = ?').bind(now, listId)
      ]);
    } else {
      const stats = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS max_pos FROM group_list_items WHERE list_id = ?')
        .bind(listId)
        .first();
      if ((stats?.n ?? 0) >= MAX_GROUP_LIST_GAMES) throw new HttpError(400, 'list_full');
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO group_list_items (list_id, title_key, steam_key, title, cover_url, position, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(listId, titleKey, steamKey, title, coverUrl, (stats?.max_pos ?? -1) + 1, auth.user.id, now),
        env.DB.prepare('UPDATE group_lists SET updated_at = ? WHERE id = ?').bind(now, listId)
      ]);
    }
    const fresh = await env.DB.prepare('SELECT * FROM group_lists WHERE id = ?').bind(listId).first();
    return json({ list: await buildGroupListView(env, fresh) });
  }
  if (rawTitleKey && request.method === 'DELETE') {
    let titleKey;
    try {
      titleKey = decodeURIComponent(rawTitleKey);
    } catch {
      throw new HttpError(400, 'invalid_target');
    }
    if (!TITLE_KEY.test(titleKey)) throw new HttpError(400, 'invalid_target');
    await requireGroupListAccess(env, listId, auth.user.id);
    const now = nowIso();
    await env.DB.prepare('DELETE FROM group_list_items WHERE list_id = ? AND title_key = ?').bind(listId, titleKey).run();
    const { results } = await env.DB.prepare('SELECT title_key FROM group_list_items WHERE list_id = ? ORDER BY position ASC, added_at ASC')
      .bind(listId)
      .all();
    await env.DB.batch([
      ...results.map((r, i) => env.DB.prepare('UPDATE group_list_items SET position = ? WHERE list_id = ? AND title_key = ?').bind(i, listId, r.title_key)),
      env.DB.prepare('UPDATE group_lists SET updated_at = ? WHERE id = ?').bind(now, listId)
    ]);
    const fresh = await env.DB.prepare('SELECT * FROM group_lists WHERE id = ?').bind(listId).first();
    return json({ list: await buildGroupListView(env, fresh) });
  }
  throw new HttpError(405, 'method_not_allowed');
}

async function handleGroupListOrder(request, env, auth, listId) {
  if (request.method !== 'PUT') throw new HttpError(405, 'method_not_allowed');
  await requireGroupListAccess(env, listId, auth.user.id);
  const body = await readJson(request, 20_000);
  if (!Array.isArray(body?.titleKeys)) throw new HttpError(400, 'invalid_request');
  const { results } = await env.DB.prepare('SELECT title_key FROM group_list_items WHERE list_id = ? ORDER BY position ASC, added_at ASC')
    .bind(listId)
    .all();
  const existing = new Set(results.map((r) => r.title_key));
  const ordered = [];
  const seen = new Set();
  for (const key of body.titleKeys) {
    if (typeof key === 'string' && existing.has(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  // Preserva no fim os jogos que outro amigo acabou de adicionar durante o arrasto
  for (const r of results) {
    if (!seen.has(r.title_key)) ordered.push(r.title_key);
  }
  const now = nowIso();
  await env.DB.batch([
    ...ordered.map((key, i) => env.DB.prepare('UPDATE group_list_items SET position = ? WHERE list_id = ? AND title_key = ?').bind(i, listId, key)),
    env.DB.prepare('UPDATE group_lists SET updated_at = ? WHERE id = ?').bind(now, listId)
  ]);
  const fresh = await env.DB.prepare('SELECT * FROM group_lists WHERE id = ?').bind(listId).first();
  return json({ list: await buildGroupListView(env, fresh) });
}

// ---------- Roteamento ----------

// Limite por conta, além do limite por IP: várias contas atrás do mesmo IP não se atrapalham,
// e uma conta em vários IPs não escapa. Sem a ligação (testes, servidor antigo) não limita.
async function limitedBy(binding, key) {
  if (!binding) return false;
  const { success } = await binding.limit({ key });
  return !success;
}

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
  const reviewImageGet = path.match(/^\/v1\/review-images\/([A-Za-z0-9_-]{32})$/);
  if (reviewImageGet && request.method === 'GET') return handleReviewImageGet(env, reviewImageGet[1]);
  const view = path.match(/^\/v1\/view\/([A-Za-z0-9_-]{20,64})$/);
  if (view && request.method === 'GET') return handleView(env, view[1]);
  const viewSocial = path.match(/^\/v1\/view\/([A-Za-z0-9_-]{20,64})\/(summary|thread|like|comments)(?:\/([0-9a-f-]{36}))?$/);
  if (viewSocial) {
    if (await isRateLimited(request, env, `view:${viewSocial[1]}`)) return json({ error: 'rate_limited' }, 429);
    const { viewerId, ownerId } = await viewerOf(env, viewSocial[1]);
    if (request.method !== 'GET' && (await limitedBy(env.USER_LIMITER, `w:${viewerId}`))) return json({ error: 'rate_limited' }, 429);
    return handleReactions(request, url, env, viewerId, viewSocial[2], viewSocial[3], ownerId);
  }
  if (await isRateLimited(request, env)) return json({ error: 'rate_limited' }, 429);
  if (path === '/v1/auth/exchange' && request.method === 'POST') return handleExchange(request, env);

  const auth = await authenticate(request, env);
  if (path === '/v1/auth/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(auth.tokenHash).run();
    return json({ ok: true });
  }
  if (request.method !== 'GET' && (await limitedBy(env.USER_LIMITER, `w:${auth.user.id}`))) return json({ error: 'rate_limited' }, 429);
  if (path === '/v1/me') return handleMe(request, env, auth);
  if (path === '/v1/me/activities') return handleActivities(request, env, auth);
  if (path === '/v1/me/activities/delete' && request.method === 'POST') return handleActivityDelete(request, env, auth);
  if (path === '/v1/me/now-playing') return handleNowPlaying(request, env, auth);
  if (path === '/v1/me/summary') return handleSummary(request, env, auth);
  if (path === '/v1/me/showcase') return handleShowcase(request, env, auth);
  if (path === '/v1/me/sync') return handleSync(request, env, auth);
  if (path === '/v1/me/presence') return handlePresence(request, env, auth);
  if (path === '/v1/me/library') return handleLibrary(request, env, auth);
  const reviewImages = path.match(/^\/v1\/me\/review-images(?:\/([^/]+))?$/);
  if (reviewImages) return handleReviewImages(request, env, auth, reviewImages[1] ?? null, url.origin);
  if (path === '/v1/me/poll') return handlePoll(request, url, env, auth);
  if (path === '/v1/me/notifications' && request.method === 'GET') return handleNotifications(url, env, auth);
  const social = path.match(/^\/v1\/social\/(summary|thread|like|comments)(?:\/([0-9a-f-]{36}))?$/);
  if (social) return handleReactions(request, url, env, auth.user.id, social[1], social[2]);
  if (path === '/v1/games/friends' && request.method === 'GET') return handleGameFriends(url, env, auth);
  if (path === '/v1/calls' && request.method === 'POST') return handleCallCreate(request, env, auth);
  if (path === '/v1/calls' && request.method === 'GET') return handleCalls(env, auth);
  const callAnswer = path.match(/^\/v1\/calls\/([0-9a-f-]{36})\/(answer|cancel)$/);
  if (callAnswer?.[2] === 'answer' && request.method === 'POST') return handleCallAnswer(request, env, auth, callAnswer[1]);
  if (callAnswer?.[2] === 'cancel' && request.method === 'POST') return handleCallCancel(env, auth, callAnswer[1]);
  const mediaTicket = path.match(/^\/v1\/me\/media\/([a-z]+)\/upload$/);
  if (mediaTicket) return handleUploadTicket(request, env, auth, mediaTicket[1]);
  const mediaPut = path.match(/^\/v1\/me\/media\/([a-z]+)$/);
  if (mediaPut) return handleMediaUpload(request, env, auth, mediaPut[1], url.origin);
  if (path === '/v1/friends/invite') return handleInvite(request, env, auth);
  if (path === '/v1/friends/accept') return handleAccept(request, env, auth);
  if (path === '/v1/friends') return handleFriends(request, env, auth);
  if (path === '/v1/friends/blocked' && request.method === 'GET') return handleBlockedList(env, auth);
  const unblock = path.match(/^\/v1\/friends\/blocked\/([0-9a-f-]{36})$/);
  if (unblock && request.method === 'DELETE') return handleUnblock(env, auth, unblock[1]);
  const friendAction = path.match(/^\/v1\/friends\/([0-9a-f-]{36})\/(mute|block)$/);
  if (friendAction?.[2] === 'mute') return handleMute(request, env, auth, friendAction[1]);
  if (friendAction?.[2] === 'block' && request.method === 'POST') return handleBlock(env, auth, friendAction[1]);
  const friendMatch = path.match(/^\/v1\/friends\/([0-9a-f-]{36})$/);
  if (friendMatch) return handleFriends(request, env, auth, friendMatch[1]);
  if (path === '/v1/feed' && request.method === 'GET') return handleFeed(url, env, auth);
  const userMatch = path.match(/^\/v1\/users\/([0-9a-f-]{36})$/);
  if (userMatch && request.method === 'GET') return handleUser(env, auth, userMatch[1], url.origin);
  const viewLink = path.match(/^\/v1\/users\/([0-9a-f-]{36})\/view$/);
  if (viewLink && request.method === 'POST') return handleViewLink(env, auth, viewLink[1], url.origin);
  const userGames = path.match(/^\/v1\/users\/([0-9a-f-]{36})\/games$/);
  if (userGames && request.method === 'GET') return handleUserGames(env, auth, userGames[1]);
  if (path === '/v1/group-lists') return handleGroupListsCollection(request, env, auth);
  const groupList = path.match(/^\/v1\/group-lists\/([0-9a-f-]{36})$/);
  if (groupList) return handleGroupListDetail(request, env, auth, groupList[1]);
  const groupMembers = path.match(/^\/v1\/group-lists\/([0-9a-f-]{36})\/members(?:\/([0-9a-f-]{36}))?$/);
  if (groupMembers) return handleGroupListMembers(request, env, auth, groupMembers[1], groupMembers[2]);
  const groupGames = path.match(/^\/v1\/group-lists\/([0-9a-f-]{36})\/games(?:\/([^/]+))?$/);
  if (groupGames) return handleGroupListGames(request, env, auth, groupGames[1], groupGames[2]);
  const groupOrder = path.match(/^\/v1\/group-lists\/([0-9a-f-]{36})\/order$/);
  if (groupOrder) return handleGroupListOrder(request, env, auth, groupOrder[1]);
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
  },
  // De hora em hora (gatilho no wrangler.toml; no server.mjs, um setInterval)
  async scheduled(_event, env) {
    await retryPurges(env);
    await env.DB.prepare('DELETE FROM calls WHERE created_at < ?').bind(new Date(Date.now() - CALL_TTL_MS).toISOString()).run();
    await env.DB.prepare('DELETE FROM friend_mutes WHERE until IS NOT NULL AND until < ?').bind(nowIso()).run();
  }
};
