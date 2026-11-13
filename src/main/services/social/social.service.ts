import { createHash, randomBytes } from 'crypto';
import { createReadStream } from 'fs';
import { extname, join } from 'path';
import { readFile, stat } from 'fs/promises';
import { Readable } from 'stream';
import { app, nativeImage, shell } from 'electron';
import { PlayerProfile, ProfileGame } from '@shared/types/profile';
import { profileService } from '../profile/profile.service';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { ActivityEvent } from '@shared/types/activity';
import { Game } from '@shared/types/game';
import {
  SocialActivity,
  SocialFeedItem,
  SocialFriend,
  SocialFriendProfile,
  SocialInvite,
  SocialSettings,
  SocialStatus,
  SocialSummary,
  SocialUser
} from '@shared/types/social';
import { db } from '../../database/db';
import { HttpError, describeError, httpRequest, statusError } from '../metadata/http';
import { getRecentActivity } from '../profile/activity.service';
import { ArtworkServerUnavailable, fetchIgdbArtwork } from '../metadata/igdb-artwork.service';
import { notify } from '../../app-shell';

// Conta Lazulium: entra com a Steam (verificado no servidor), manda a linha do tempo para os amigos
// e mostra o feed deles. Opcional: sem conta, nada sai do PC. Servidor em server/social.

const SOCIAL_SERVER_URL = 'https://lazulium-social.yungloof.workers.dev';
export const socialServerUrl = () => (process.env.LAZULIUM_SOCIAL_URL ?? SOCIAL_SERVER_URL).replace(/\/+$/, '');

export const SOCIAL_SETTING_KEYS = {
  token: 'socialToken',               // Cifrado pelo Windows (SECRET_SETTING_KEYS)
  profile: 'socialProfile',           // Usuário e escolhas de privacidade, para abrir sem internet
  lastPushAt: 'socialLastPushAt',
  lastSyncAt: 'socialLastSyncAt',
  showcaseHash: 'socialShowcaseHash',
  media: 'socialMedia'                // { avatar: { hash, url }, ... } das imagens já enviadas
} as const;
// Fora do token: o renderer pode ler e mudar
export const SOCIAL_NOTIFY_SETTING = 'socialNotifyPlaying';

const LOGIN_TIMEOUT_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const SYNC_INTERVAL_MS = 10 * 60_000;
const SYNC_DEBOUNCE_MS = 20_000;
const NOW_PLAYING_KEEPALIVE_MS = 5 * 60_000;
const PUSH_OVERLAP_MS = 2 * 24 * 60 * 60 * 1000;  // "Jogou" é agrupado por dia e cresce: reenvia os últimos dias
const FIRST_PUSH_DAYS = 60;
const MAX_PUSH = 200;
const TOP_GAMES = 12;
const LOCAL_PROFILE_MEDIA = /^lazulium-media:\/\/profile\/((avatar|background|artwork)-[a-z0-9]+\.(png|jpe?g|webp|gif|webm|mp4))$/i;
const VIDEO_MIME: Record<string, string> = { '.webm': 'video/webm', '.mp4': 'video/mp4' };
const MAX_GIF_BYTES = 1_100_000;       // Até ~1,1 MB vai direto no banco do servidor; GIF maior e vídeo vão na VPS
const MAX_STORE_BYTES = 50 * 1024 * 1024;
const LARGE_UPLOAD_TIMEOUT_MS = 15 * 60_000;
const MEDIA_MAX_WIDTH = { avatar: 256, background: 1920, artwork: 1280 } as const;
type MediaKind = keyof typeof MEDIA_MAX_WIDTH;
const MAX_FRIEND_COVER_LOOKUPS = 30;   // Capas de jogos de amigos conferidas por vez
const MAX_COVER_LOOKUPS = 15;          // Capas padrão buscadas por sincronização (o resto vai nas próximas)
const FRIENDS_POLL_MS = Number(process.env.LAZULIUM_SOCIAL_POLL_MS) || 90_000;   // A variável só serve para testes
const STEAM_COVER = (appId: string) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
const PUBLIC_COVER = /^https:\/\/(cdn\.cloudflare\.steamstatic\.com|shared\.[a-z.]*steamstatic\.com|steamcdn-a\.akamaihd\.net|images\.igdb\.com|cdn2\.steamgriddb\.com)\//i;

const SERVER_ERRORS: Record<string, string> = {
  invalid_code: 'Esse login expirou. Tente entrar de novo.',
  invite_not_found: 'Código não encontrado ou vencido. Peça um novo.',
  own_invite: 'Esse código é seu. Mande para outra pessoa.',
  invalid_name: 'O nome precisa ter pelo menos 2 letras.',
  rate_limited: 'Muitos pedidos seguidos. Espere um minuto e tente de novo.',
  not_found: 'Não encontrado. Talvez vocês não sejam mais amigos.',
  not_configured: 'O servidor da conta Lazulium ainda não está no ar.'
};

const CALLBACK_PAGE = `<!doctype html><meta charset="utf-8"><title>Lazulium</title>
<body style="font-family:system-ui;background:#0b1020;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2>{TITLE}</h2><p>Você já pode fechar esta aba e voltar ao Lazulium.</p></div>`;

interface CachedProfile {
  user: SocialUser;
  settings: SocialSettings;
}

// Mesma regra do servidor (server/igdb-proxy normalizeTitle): o mesmo jogo em lojas diferentes vira a mesma chave
export function gameKeyOf(game: Pick<Game, 'platform' | 'platformGameId' | 'title'>): string | null {
  if (game.platform === 'steam' && game.platformGameId && /^\d{1,10}$/.test(game.platformGameId)) return `steam:${game.platformGameId}`;
  const normalized = game.title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 120);
  return normalized ? `t:${normalized}` : null;
}

// Só endereço público: a capa guardada no PC (lazulium-media://) não abre no PC do amigo
const steamAppIdOf = (game: Game) => (game.platform === 'steam' && game.platformGameId && /^\d{1,10}$/.test(game.platformGameId) ? game.platformGameId : undefined);

export function publicCoverOf(game: Game): string | null {
  const appId = steamAppIdOf(game);
  // Steam: a capa conferida (jogos novos não têm o endereço antigo) ou, até conferir, o endereço padrão
  if (appId) return game.media?.publicCoverUrl && PUBLIC_COVER.test(game.media.publicCoverUrl) ? game.media.publicCoverUrl : STEAM_COVER(appId);
  for (const url of [game.media?.coverSourceUrl, game.media?.coverUrl, game.media?.publicCoverUrl]) if (url && PUBLIC_COVER.test(url)) return url;
  return null;
}

class SocialService {
  private cancelLogin: (() => void) | undefined;
  private syncTimer: NodeJS.Timeout | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;
  private keepAlive: NodeJS.Timeout | undefined;
  private syncing = false;
  private syncError: string | undefined;
  private gifRefused = false;            // Servidor ainda sem GIF: não insiste a cada sincronização
  private storeUnavailable = false;      // Servidor ainda sem guarda de arquivos na VPS: não insiste na mesma sessão
  private playing: { gameId: string; since: string } | undefined;
  private listener: (status: SocialStatus) => void = () => {};
  private friendListener: (text: string) => void = () => {};
  private coverMisses = new Set<string>();
  private friendCovers = new Map<string, string | null>();
  private friendsPlaying: Map<string, string> | undefined;   // amigo -> jogo; undefined = ainda não leu (não avisa na primeira leitura)

  setFriendPlayingListener(listener: (text: string) => void): void {
    this.friendListener = listener;
  }

  setStatusListener(listener: (status: SocialStatus) => void): void {
    this.listener = listener;
  }

  init(): void {
    this.syncTimer = setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
    this.syncTimer.unref();
    if (this.token()) setTimeout(() => void this.sync(), 20_000).unref();
    setInterval(() => void this.watchFriends(), FRIENDS_POLL_MS).unref();
  }

  private token(): string | undefined {
    return db.getSettings()[SOCIAL_SETTING_KEYS.token] || undefined;
  }

  private cached(): CachedProfile | undefined {
    try {
      const raw = db.getSettings()[SOCIAL_SETTING_KEYS.profile];
      return raw ? (JSON.parse(raw) as CachedProfile) : undefined;
    } catch {
      return undefined;
    }
  }

  private saveProfile(profile: CachedProfile): void {
    db.setSetting(SOCIAL_SETTING_KEYS.profile, JSON.stringify(profile));
  }

  getStatus(): SocialStatus {
    const cached = this.cached();
    if (!this.token() || !cached) return { connected: false };
    return {
      connected: true,
      user: cached.user,
      settings: cached.settings,
      lastSyncAt: db.getSettings()[SOCIAL_SETTING_KEYS.lastSyncAt] || undefined,
      syncError: this.syncError
    };
  }

  private publish(): void {
    this.listener(this.getStatus());
  }

  private clearLocal(): void {
    for (const key of Object.values(SOCIAL_SETTING_KEYS)) db.setSetting(key, '');
    this.syncError = undefined;
    this.gifRefused = false;
    this.storeUnavailable = false;
    this.publish();
  }

  private async api<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const token = this.token();
    if (auth && !token) throw new Error('Entre na conta Lazulium primeiro.');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (auth) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await httpRequest(`${socialServerUrl()}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        timeoutMs: REQUEST_TIMEOUT_MS,
        retries: method === 'GET' ? 1 : 0,
        service: 'o servidor do Lazulium'
      });
    } catch (err) {
      throw new Error(describeError(err));
    }
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (res.status === 401 && auth) {
      // Sessão vencida ou conta apagada em outro PC
      this.clearLocal();
      throw new Error('Sua sessão da conta Lazulium terminou. Entre de novo.');
    }
    if (!res.ok || !data) {
      const code = data?.error ?? '';
      throw new HttpError(SERVER_ERRORS[code] ?? `O servidor do Lazulium não respondeu como esperado (erro ${res.status}).`, 'status', res.status);
    }
    return data;
  }

  // ---------- Login ----------

  login(): Promise<SocialStatus> {
    this.cancelLogin?.();
    const state = randomBytes(24).toString('base64url');
    return new Promise((resolvePromise, rejectPromise) => {
      let server: Server | undefined;
      let timer: NodeJS.Timeout | undefined;
      const finish = (err: Error | null, status?: SocialStatus) => {
        clearTimeout(timer);
        server?.close();
        this.cancelLogin = undefined;
        if (err) rejectPromise(err);
        else resolvePromise(status!);
      };
      this.cancelLogin = () => finish(new Error('Login anterior cancelado.'));

      server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== '/' || url.searchParams.get('state') !== state) {
          res.writeHead(404).end();
          return;
        }
        const page = (title: string) => res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(CALLBACK_PAGE.replace('{TITLE}', title));
        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        if (error || !code) {
          page(error === 'cancelled' ? 'Login cancelado' : 'Não foi possível confirmar o login');
          finish(new Error(error === 'cancelled' ? 'Login cancelado.' : 'A Steam não confirmou o login. Tente de novo.'));
          return;
        }
        try {
          const result = await this.api<{ token: string; user: SocialUser; settings: SocialSettings }>('POST', '/v1/auth/exchange', { code, state }, false);
          db.setSetting(SOCIAL_SETTING_KEYS.token, result.token);
          this.saveProfile({ user: result.user, settings: result.settings });
          db.setSetting(SOCIAL_SETTING_KEYS.lastPushAt, '');
          page('Conta Lazulium conectada');
          this.publish();
          finish(null, this.getStatus());
          void this.sync();
        } catch (err) {
          page('Não foi possível confirmar o login');
          finish(err as Error);
        }
      });
      server.on('error', (err) => finish(err));
      server.listen(0, '127.0.0.1', () => {
        const port = (server!.address() as AddressInfo).port;
        timer = setTimeout(() => finish(new Error('Tempo esgotado esperando o login na Steam.')), LOGIN_TIMEOUT_MS);
        const start = `${socialServerUrl()}/v1/auth/steam/start?${new URLSearchParams({ port: String(port), state })}`;
        shell.openExternal(start).catch((err) => finish(err));
      });
    });
  }

  async logout(): Promise<SocialStatus> {
    await this.api('POST', '/v1/auth/logout').catch(() => undefined);
    this.clearLocal();
    return this.getStatus();
  }

  async deleteAccount(): Promise<SocialStatus> {
    await this.api('DELETE', '/v1/me');
    this.clearLocal();
    return this.getStatus();
  }

  async updateAccount(changes: { name?: string | null; settings?: Partial<SocialSettings> }): Promise<SocialStatus> {
    const body: Record<string, unknown> = {};
    if (changes.name !== undefined) body.name = changes.name;
    if (changes.settings) body.settings = changes.settings;
    const result = await this.api<CachedProfile>('PATCH', '/v1/me', body);
    this.saveProfile({ user: result.user, settings: result.settings });
    this.publish();
    if (changes.settings) this.scheduleSync();
    return this.getStatus();
  }

  // ---------- Amigos e feed ----------

  createInvite = () => this.api<SocialInvite>('POST', '/v1/friends/invite');

  async acceptInvite(code: string): Promise<SocialUser> {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 8) throw new Error('O código tem 8 letras e números.');
    return (await this.api<{ friend: SocialUser }>('POST', '/v1/friends/accept', { code: clean })).friend;
  }

  async removeFriend(friendId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/.test(friendId)) throw new Error('Amigo inválido.');
    await this.api('DELETE', `/v1/friends/${friendId}`);
  }

  async getFriends(): Promise<SocialFriend[]> {
    const friends = (await this.api<{ friends: SocialFriend[] }>('GET', '/v1/friends')).friends;
    const playing = friends.flatMap((f) => (f.nowPlaying ? [f.nowPlaying] : []));
    await this.fillFriendCovers(playing.map((p) => ({ ...p, title: p.gameTitle })), playing);
    return friends;
  }

  async getFeed(before?: string): Promise<SocialFeedItem[]> {
    const query = new URLSearchParams({ limit: '30' });
    if (before && !Number.isNaN(Date.parse(before))) query.set('before', before);
    const items = (await this.api<{ items: SocialFeedItem[] }>('GET', `/v1/feed?${query}`)).items;
    await this.fillFriendCovers(items.map((i) => ({ ...i, title: i.gameTitle })), items);
    return items;
  }

  async getFriendProfile(friendId: string): Promise<SocialFriendProfile> {
    if (!/^[0-9a-f-]{36}$/.test(friendId)) throw new Error('Amigo inválido.');
    const profile = await this.api<SocialFriendProfile>('GET', `/v1/users/${friendId}`);
    await this.fillFriendCovers(profile.activities.map((a) => ({ ...a, title: a.gameTitle })), profile.activities);
    if (profile.summary) await this.fillFriendCovers(profile.summary.topGames);
    if (profile.nowPlaying) await this.fillFriendCovers([{ ...profile.nowPlaying, title: profile.nowPlaying.gameTitle }], [profile.nowPlaying]);
    return profile;
  }

  // Capa que não abre no PC de quem vê: o amigo mandou sem capa (versão antiga, capa só no PC dele) ou mandou
  // o endereço padrão da Steam, que lançamentos novos não têm. Usa a capa deste PC para o mesmo jogo, confere a
  // da Steam e, sem nada, a padrão do IGDB. Fica na memória enquanto o app está aberto.
  private async fillFriendCovers(items: { gameKey: string; title: string; coverUrl: string | null }[], targets: { coverUrl: string | null }[] = items): Promise<void> {
    const needsCheck = (i: { gameKey: string; coverUrl: string | null }) => {
      const appId = i.gameKey.match(/^steam:(\d+)$/)?.[1];
      return appId ? !i.coverUrl || i.coverUrl === STEAM_COVER(appId) : !i.coverUrl;
    };
    const pending = [...new Set(items.filter(needsCheck).map((i) => i.gameKey))].filter((key) => !this.friendCovers.has(key)).slice(0, MAX_FRIEND_COVER_LOOKUPS);
    if (pending.length) {
      const mine = new Map(db.getGames().map((g) => [gameKeyOf(g), g]));
      await Promise.all(
        pending.map(async (key) => {
          const appId = key.match(/^steam:(\d+)$/)?.[1];
          const own = mine.get(key);
          let cover: string | null = own ? (appId ? own.media?.publicCoverUrl ?? null : publicCoverOf(own)) : null;
          if (!cover && appId) {
            const head = await httpRequest(STEAM_COVER(appId), { method: 'HEAD', timeoutMs: REQUEST_TIMEOUT_MS }).catch(() => null);
            if (!head) return; // sem conexão: tenta de novo na próxima vez
            if (head.ok) cover = STEAM_COVER(appId);
          }
          if (!cover) {
            const title = items.find((i) => i.gameKey === key)!.title;
            try {
              cover = (await fetchIgdbArtwork({ title } as Game))?.cover ?? null;
            } catch {
              return;
            }
          }
          this.friendCovers.set(key, cover);
        })
      );
    }
    items.forEach((item, index) => {
      const cover = needsCheck(item) ? this.friendCovers.get(item.gameKey) : undefined;
      if (cover) targets[index].coverUrl = cover;
    });
  }

  // "Fulano começou a jogar X": compara quem está jogando agora com a leitura anterior
  private async watchFriends(): Promise<void> {
    if (!this.token() || db.getSettings()[SOCIAL_NOTIFY_SETTING] === 'false') {
      this.friendsPlaying = undefined;
      return;
    }
    let friends: SocialFriend[];
    try {
      friends = await this.getFriends();
    } catch {
      return;
    }
    const current = new Map(friends.filter((f) => f.nowPlaying).map((f) => [f.id, f.nowPlaying!.gameKey]));
    if (this.friendsPlaying) {
      for (const friend of friends) {
        if (!friend.nowPlaying || this.friendsPlaying.get(friend.id) === friend.nowPlaying.gameKey) continue;
        const text = `${friend.name} começou a jogar ${friend.nowPlaying.gameTitle}`;
        notify('Lazulium', text);
        this.friendListener(text);
      }
    }
    this.friendsPlaying = current;
  }

  // Jogo sem capa pública (capa escolhida no PC, emulador, avulso): procura a capa padrão no IGDB e guarda
  private async resolvePublicCovers(gameIds: string[]): Promise<void> {
    let lookups = 0;
    for (const id of new Set(gameIds)) {
      if (lookups >= MAX_COVER_LOOKUPS) break;
      const game = db.getGameById(id);
      const appId = game ? steamAppIdOf(game) : undefined;
      if (!game || this.coverMisses.has(id) || (appId ? game.media?.publicCoverUrl : publicCoverOf(game))) continue;
      lookups++;
      try {
        let cover: string | undefined;
        // Steam: confere se o endereço padrão existe (lançamentos novos só têm endereços com código)
        if (appId) {
          const head = await httpRequest(STEAM_COVER(appId), { method: 'HEAD', timeoutMs: REQUEST_TIMEOUT_MS }).catch(() => null);
          if (head?.ok) cover = STEAM_COVER(appId);
          else if (!head) throw new ArtworkServerUnavailable('sem conexão');
        }
        cover ??= (await fetchIgdbArtwork(game))?.cover;
        const fresh = cover ? db.getGameById(id) : null;
        if (cover && fresh) db.upsertGame({ ...fresh, media: { ...fresh.media, publicCoverUrl: cover } });
        else this.coverMisses.add(id);
      } catch (err) {
        if (err instanceof ArtworkServerUnavailable) break;
        this.coverMisses.add(id);
      }
    }
  }

  // ---------- Envio ----------

  // Mudou algo (sessão terminou, Diário salvo): manda logo, mas agrupando mudanças seguidas
  scheduleSync(): void {
    if (!this.token()) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.sync(), SYNC_DEBOUNCE_MS);
    this.debounceTimer.unref();
  }

  private toWire(event: ActivityEvent, game: Game, settings: SocialSettings): SocialActivity | null {
    const gameKey = gameKeyOf(game);
    if (!gameKey) return null;
    if (event.kind === 'played' && !settings.sharePlaytime) return null;
    if ((event.kind === 'achievements' || event.kind === 'perfect') && !settings.shareAchievements) return null;
    if ((event.kind === 'rated' || event.kind === 'reviewed') && !settings.shareReviews) return null;
    return {
      id: event.id,
      kind: event.kind,
      gameKey,
      gameTitle: game.title,
      coverUrl: publicCoverOf(game),
      at: event.at,
      rating: event.rating,
      count: event.count,
      seconds: event.seconds,
      text: event.text?.slice(0, 2000)
    };
  }

  private topGames(): Game[] {
    return db
      .getGames()
      .filter((g) => !g.isHidden && (g.totalPlaytimeSeconds ?? 0) > 0)
      .sort((a, b) => (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0))
      .slice(0, TOP_GAMES);
  }

  private buildSummary(settings: SocialSettings): SocialSummary {
    const games = db.getGames().filter((g) => !g.isHidden);
    let achievementsUnlocked = 0;
    let perfectGames = 0;
    for (const game of games) {
      const data = db.getGameAchievements(game.id);
      if (!data || data.total === 0 || data.source === 'lazulium') continue;
      achievementsUnlocked += data.unlocked;
      if (data.unlocked >= data.total) perfectGames++;
    }
    const top = this.topGames();
    return {
      totals: {
        games: games.length,
        playtimeSeconds: settings.sharePlaytime ? games.reduce((sum, g) => sum + (g.totalPlaytimeSeconds ?? 0), 0) : 0,
        achievementsUnlocked: settings.shareAchievements ? achievementsUnlocked : 0,
        perfectGames: settings.shareAchievements ? perfectGames : 0,
        finishedGames: games.filter((g) => g.log?.status === 'finished' || g.log?.status === 'completed').length
      },
      topGames: top.slice(0, TOP_GAMES).flatMap((g) => {
        const gameKey = gameKeyOf(g);
        return gameKey
          ? [{ gameKey, title: g.title, coverUrl: publicCoverOf(g), playtimeSeconds: settings.sharePlaytime ? g.totalPlaytimeSeconds ?? 0 : 0, rating: settings.shareReviews ? g.log?.rating ?? null : null }]
          : [];
      })
    };
  }

  async sync(): Promise<SocialStatus> {
    const cached = this.cached();
    if (!this.token() || !cached || this.syncing) return this.getStatus();
    this.syncing = true;
    try {
      // As escolhas podem ter mudado em outro PC
      const me = await this.api<CachedProfile>('GET', '/v1/me');
      this.saveProfile(me);
      const settings = me.settings;
      if (settings.shareActivity) {
        const lastPush = Date.parse(db.getSettings()[SOCIAL_SETTING_KEYS.lastPushAt] || '');
        const since = Number.isNaN(lastPush) ? Date.now() - FIRST_PUSH_DAYS * 86_400_000 : lastPush - PUSH_OVERLAP_MS;
        const recent = getRecentActivity(MAX_PUSH).filter((e) => Date.parse(e.at) >= since);
        await this.resolvePublicCovers(recent.map((e) => e.gameId));
        const games = new Map(db.getGames().map((g) => [g.id, g]));
        const events = recent
          .flatMap((e) => {
            const game = games.get(e.gameId);
            const wire = game ? this.toWire(e, game, settings) : null;
            return wire ? [wire] : [];
          });
        const startedAt = new Date().toISOString();
        if (events.length) await this.api('POST', '/v1/me/activities', { events });
        db.setSetting(SOCIAL_SETTING_KEYS.lastPushAt, startedAt);
      }
      if (settings.shareProfile) await this.pushShowcase(settings);
      await this.resolvePublicCovers(this.topGames().map((g) => g.id));
      await this.api('PUT', '/v1/me/summary', this.buildSummary(settings));
      db.setSetting(SOCIAL_SETTING_KEYS.lastSyncAt, new Date().toISOString());
      this.syncError = undefined;
    } catch (err) {
      this.syncError = (err as Error).message;
      console.warn('[Social] Falha ao sincronizar:', this.syncError);
    } finally {
      this.syncing = false;
      this.publish();
    }
    return this.getStatus();
  }

  // ---------- Vitrine ----------

  private readMediaCache(): Partial<Record<MediaKind, { hash: string; url: string }>> {
    try {
      return JSON.parse(db.getSettings()[SOCIAL_SETTING_KEYS.media] || '{}');
    } catch {
      return {};
    }
  }

  private writeMediaCache(cache: Partial<Record<MediaKind, { hash: string; url: string }>>): void {
    db.setSetting(SOCIAL_SETTING_KEYS.media, JSON.stringify(cache));
  }

  private fileSha1(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const digest = createHash('sha1');
      const stream = createReadStream(path);
      stream.on('data', (chunk) => digest.update(chunk));
      stream.on('end', () => resolve(digest.digest('hex')));
      stream.on('error', reject);
    });
  }

  private allowedUploadUrl(uploadUrl: string): boolean {
    try {
      const target = new URL(uploadUrl);
      if (target.protocol === 'https:') return true;
      const apiHost = new URL(socialServerUrl()).hostname;
      const isLocal = (h: string) => h === '127.0.0.1' || h === 'localhost';
      return target.protocol === 'http:' && isLocal(target.hostname) && isLocal(apiHost);
    } catch {
      return false;
    }
  }

  private resolveLocalMedia(kind: MediaKind, localUrl: string | undefined): { path: string; ext: string } | undefined {
    const match = localUrl?.match(LOCAL_PROFILE_MEDIA);
    if (!match || match[2].toLowerCase() !== kind) return undefined;
    const file = match[1];
    return { path: join(app.getPath('userData'), 'profile', file), ext: extname(file).toLowerCase() };
  }

  private async uploadImageAsJpeg(kind: MediaKind, path: string): Promise<string | undefined> {
    let image = nativeImage.createFromPath(path);
    if (image.isEmpty()) return undefined;
    if (image.getSize().width > MEDIA_MAX_WIDTH[kind]) image = image.resize({ width: MEDIA_MAX_WIDTH[kind], quality: 'good' });
    return this.sendMedia(kind, 'image/jpeg', image.toJPEG(kind === 'avatar' ? 88 : 80));
  }

  private async uploadSmallGif(kind: MediaKind, path: string): Promise<string | undefined> {
    if (this.gifRefused) return undefined;
    const original = await readFile(path).catch(() => undefined);
    if (!original || original.length > MAX_GIF_BYTES) return undefined;
    try {
      return await this.sendMedia(kind, 'image/gif', original);
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 400)) throw err;
      this.gifRefused = true;
      return undefined;
    }
  }

  // Imagem escolhida no perfil (arquivo do PC) -> versão reduzida em JPEG (ou GIF pequeno animado). Só reenvia quando muda.
  private async uploadProfileImage(kind: MediaKind, localUrl: string | undefined): Promise<string | undefined> {
    const media = this.resolveLocalMedia(kind, localUrl);
    if (!media || media.ext in VIDEO_MIME) return undefined;
    if (media.ext === '.gif') {
      const gif = await this.uploadSmallGif(kind, media.path);
      if (gif) return gif;
    }
    return this.uploadImageAsJpeg(kind, media.path);
  }

  // Fundo personalizado: até ~1,1 MB de GIF vai direto no servidor social; GIF maior e vídeo até 50 MB vão para a VPS com bilhete assinado.
  private async uploadProfileBackground(localUrl: string | undefined): Promise<{ imageUrl?: string; videoUrl?: string } | undefined> {
    const media = this.resolveLocalMedia('background', localUrl);
    if (!media) return undefined;
    const info = await stat(media.path).catch(() => undefined);
    if (!info?.isFile() || info.size <= 0) return undefined;

    const videoMime = VIDEO_MIME[media.ext];
    if (videoMime) {
      if (info.size > MAX_STORE_BYTES || this.storeUnavailable) return undefined;
      const hash = await this.fileSha1(media.path);
      const url = await this.sendLargeMedia('background', videoMime, media.path, info.size, hash);
      return url ? { videoUrl: url } : undefined;
    }

    if (media.ext === '.gif') {
      if (info.size <= MAX_GIF_BYTES) {
        const gif = await this.uploadSmallGif('background', media.path);
        if (gif) return { imageUrl: gif };
      } else if (info.size <= MAX_STORE_BYTES && !this.storeUnavailable) {
        const hash = await this.fileSha1(media.path);
        const url = await this.sendLargeMedia('background', 'image/gif', media.path, info.size, hash);
        if (url) return { imageUrl: url };
      }
    }

    const fallback = await this.uploadImageAsJpeg('background', media.path);
    return fallback ? { imageUrl: fallback } : undefined;
  }

  private async sendMedia(kind: MediaKind, mime: string, bytes: Buffer): Promise<string> {
    const hash = createHash('sha1').update(bytes).digest('hex');
    const cache = this.readMediaCache();
    if (cache[kind]?.hash === hash) return cache[kind]!.url;
    const { url } = await this.api<{ url: string }>('PUT', `/v1/me/media/${kind}`, { mime, data: bytes.toString('base64') });
    this.writeMediaCache({ ...this.readMediaCache(), [kind]: { hash, url } });
    return url;
  }

  private async sendLargeMedia(kind: 'background', mime: string, path: string, size: number, hash: string): Promise<string | undefined> {
    const cache = this.readMediaCache();
    if (cache[kind]?.hash === hash) return cache[kind]!.url;
    let ticket: { uploadUrl: string; ticket: string };
    try {
      ticket = await this.api<{ uploadUrl: string; ticket: string }>('POST', `/v1/me/media/${kind}/upload`, { mime, size });
    } catch (err) {
      if (err instanceof HttpError && (err.status === 501 || err.status === 404)) {
        this.storeUnavailable = true;
        return undefined;
      }
      if (err instanceof HttpError && (err.status === 413 || err.status === 400)) return undefined;
      throw err;
    }
    if (!ticket?.ticket || !this.allowedUploadUrl(ticket.uploadUrl)) {
      throw new Error('O servidor do Lazulium respondeu um endereço de mídia inválido.');
    }
    let res: Response;
    try {
      res = await httpRequest(ticket.uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ticket.ticket}`,
          'Content-Type': mime,
          'Content-Length': String(size),
          Accept: 'application/json'
        },
        body: Readable.toWeb(createReadStream(path)) as unknown as BodyInit,
        duplex: 'half',
        timeoutMs: LARGE_UPLOAD_TIMEOUT_MS,
        service: 'o servidor de mídia do Lazulium'
      });
    } catch (err) {
      throw new Error(describeError(err));
    }
    if (res.status === 413 || res.status === 507 || res.status === 400) {
      await res.body?.cancel().catch(() => undefined);
      return undefined;
    }
    const data = (await res.json().catch(() => null)) as { url?: string } | null;
    if (!res.ok || !data?.url || !this.allowedUploadUrl(data.url)) {
      throw statusError(res.status || 502, 'o servidor de mídia do Lazulium');
    }
    this.writeMediaCache({ ...this.readMediaCache(), [kind]: { hash, url: data.url } });
    return data.url;
  }

  private async clearMedia(kind: MediaKind): Promise<void> {
    const cache = this.readMediaCache();
    if (!cache[kind]) return;
    try {
      await this.api('DELETE', `/v1/me/media/${kind}`);
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 404)) throw err;
    }
    delete cache[kind];
    this.writeMediaCache(cache);
  }

  // O mesmo perfil da página web, com as imagens escolhidas e as capas públicas dos jogos
  private async pushShowcase(settings: SocialSettings): Promise<void> {
    const built = await profileService.build();
    const showcase: PlayerProfile = profileService.toExportable(built);
    const custom = built.custom;
    // Horas escondidas na vitrine também, se a pessoa desligou "Horas jogadas"
    const withCover = (g: ProfileGame): ProfileGame => {
      const hours = settings.sharePlaytime ? g : { ...g, playtimeSeconds: 0 };
      if (hours.coverUrl) return hours;
      const game = db.getGameById(g.id);
      return { ...hours, coverUrl: (game && publicCoverOf(game)) || undefined };
    };
    if (!settings.sharePlaytime) {
      showcase.totals = { ...showcase.totals, playtimeSeconds: 0 };
      showcase.recentPlaytimeSeconds = 0;
    }
    for (const key of ['featuredGames', 'recentGames', 'mostPlayed', 'recentlyPlayed', 'favorites'] as const) {
      showcase[key] = showcase[key].map(withCover);
    }
    const web = { ...showcase.web };
    const avatar = await this.uploadProfileImage('avatar', custom.avatarUrl);
    if (avatar) showcase.avatarUrl = avatar;
    else await this.clearMedia('avatar');
    const background = custom.backgroundMode === 'file' ? await this.uploadProfileBackground(custom.backgroundUrl) : undefined;
    if (background) web.background = background;
    else await this.clearMedia('background');
    const artwork = await this.uploadProfileImage('artwork', custom.artworkUrl);
    if (artwork) web.showcaseArt = { title: custom.artworkCaption, imageUrl: artwork };
    else await this.clearMedia('artwork');
    showcase.web = web;
    showcase.generatedAt = '';
    const body = JSON.stringify(showcase);
    const hash = createHash('sha1').update(body).digest('hex');
    if (db.getSettings()[SOCIAL_SETTING_KEYS.showcaseHash] === hash) return;
    await this.api('PUT', '/v1/me/showcase', { ...showcase, generatedAt: new Date().toISOString() });
    db.setSetting(SOCIAL_SETTING_KEYS.showcaseHash, hash);
  }

  // Link de 30 minutos para ver a vitrine de um amigo; null quando ele escondeu ou ainda não enviou
  async getFriendShowcaseUrl(friendId: string): Promise<{ url: string | null; reason?: 'hidden' | 'not_sent' }> {
    if (!/^[0-9a-f-]{36}$/.test(friendId)) throw new Error('Amigo inválido.');
    const result = await this.api<{ url: string | null; reason?: 'hidden' | 'not_sent' }>('POST', `/v1/users/${friendId}/view`);
    // A moldura só abre a página de vitrine do próprio servidor social, nunca outro endereço que viesse na resposta
    const url = typeof result?.url === 'string' && result.url.startsWith(`${socialServerUrl()}/v1/view/`) && !/[\s"'<>\\]/.test(result.url) ? result.url : null;
    return { url, reason: url ? undefined : (result?.reason ?? 'not_sent') };
  }

  // ---------- Jogando agora ----------

  onGameStatus(gameId: string, running: boolean, startTime?: string): void {
    if (!this.token()) return;
    clearInterval(this.keepAlive);
    if (!running) {
      if (this.playing?.gameId === gameId) {
        this.playing = undefined;
        void this.api('DELETE', '/v1/me/now-playing').catch(() => undefined);
      }
      this.scheduleSync();
      return;
    }
    const game = db.getGameById(gameId);
    const gameKey = game ? gameKeyOf(game) : null;
    if (!game || !gameKey || !this.cached()?.settings.shareNowPlaying) return;
    this.playing = { gameId, since: startTime ?? new Date().toISOString() };
    const send = () =>
      void this.api('PUT', '/v1/me/now-playing', { gameKey, gameTitle: game.title, coverUrl: publicCoverOf(db.getGameById(gameId) ?? game), since: this.playing?.since }).catch((err) =>
        console.warn('[Social] Jogando agora:', (err as Error).message)
      );
    void this.resolvePublicCovers([gameId]).finally(send);
    this.keepAlive = setInterval(send, NOW_PLAYING_KEEPALIVE_MS);
    this.keepAlive.unref();
  }
}

export const socialService = new SocialService();
