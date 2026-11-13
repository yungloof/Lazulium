import { app } from 'electron';
import { copyFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { extname, join } from 'path';
import { Game, isJournalEntry } from '@shared/types/game';
import { mediaUrl } from '../metadata/media-cache.service';
import {
  AchievementsSyncResult,
  PlayerProfile,
  ProfileAchievement,
  ProfileCustom,
  ProfileGame,
  ProfileMediaKind,
  ProfileReview,
  ProfileScreenshot,
  ProfileSectionId,
  ProfileUnlockedAchievement,
  SteamProfileIdentity
} from '@shared/types/profile';
import { db } from '../../database/db';
import { achievementsService } from '../achievements/achievements.service';
import { screenshotsService } from '../metadata/screenshots.service';
import { readSteamProfileStats, SteamAppStats } from '../scanners/steam-scanner.service';
import { steamProfileService } from './steam-profile.service';
import { isBetaTester } from '@shared/constants/beta-testers';
import { describeError, logBackgroundFailure, sleep } from '../metadata/http';

const MAX_ACHIEVEMENT_CHOICES = 300;
const MAX_RATINGS = 300;                // Jogos avaliados na página do perfil
const MAX_REVIEW_TEXT = 6000;           // Por resenha
const MAX_RATINGS_TEXT_TOTAL = 450_000; // Texto de todas as resenhas juntas (a vitrine no servidor tem teto de tamanho)
const MAX_FEATURED_GAMES = 12;
const MAX_FEATURED_ACHIEVEMENTS = 12;
const SECTION_IDS: ProfileSectionId[] = ['artwork', 'activity', 'featured', 'reviews', 'lists', 'achievements', 'screenshots', 'mostPlayed'];
const SECTIONS_VERSION = 3;             // 2: seção da arte em destaque; 3: resenhas e listas
const ACTIVITY_DAYS = 100;
const AUTO_SYNC_SETTING = 'achievementsAutoSyncAt';
const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Conquistas privadas na Steam: a pessoa costuma abrir logo depois, então tenta de novo antes do dia inteiro
const PRIVATE_RETRY_MS = 3 * 60 * 60 * 1000;

// Seções novas entram em perfis salvos antes delas; o editor pode tirar
function withNewSections(sections: ProfileSectionId[], version: number): ProfileSectionId[] {
  let next = sections;
  if (version < 2) next = ['artwork', ...next.filter((s) => s !== 'artwork')];
  if (version < 3) {
    const added = (['reviews', 'lists'] as ProfileSectionId[]).filter((s) => !next.includes(s));
    const after = next.indexOf('featured') + 1;
    next = [...next.slice(0, after), ...added, ...next.slice(after)];
  }
  return next;
}

const MIN_REAL_DATE_MS = Date.UTC(1990, 0, 1);
const isRealDate = (iso?: string): iso is string => !!iso && Date.parse(iso) >= MIN_REAL_DATE_MS;
const localDayKey =(date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const MAX_BACKGROUND_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_PROFILE_IMAGE_BYTES = 30 * 1024 * 1024;
const LOCAL_PROFILE_MEDIA = /^lazulium-media:\/\/profile\/(avatar|background|artwork)-[a-z0-9]+\.(png|jpe?g|webp|gif|webm|mp4)$/;
const VIDEO_FILE = /\.(webm|mp4)$/i;
const TOP_GAMES = 6;
const TOP_GAME_ACHIEVEMENT_ICONS = 6;
const TOP_RARE_ACHIEVEMENTS = 8;
const TOP_RECENT_ACHIEVEMENTS = 10;
const TOP_SCREENSHOTS = 8;
const SCREENSHOT_SOURCE_GAMES = 8;     // Jogos (mais recentes) consultados para a vitrine de capturas
const RECENT_WINDOW_MS = 14 * 86_400_000;
const SYNC_DELAY_MS = 450;             // Espaço entre jogos para não estourar limites das APIs
const SYNC_CAUTIOUS_DELAY_MS = 750;    // Ritmo reduzido após encontrar limite de pedidos (429)
const RATE_LIMIT_COOLDOWN_MS = [10_000, 20_000, 35_000]; // Espera escalonada quando a Steam devolve 429
const MAX_RATE_LIMIT_PAUSES = 6;       // Evita loop infinito de pausas numa sincronização longa
const MAX_CONSECUTIVE_TRANSIENT_FAILURES = 8; // Sem rede ou com a Steam fora, interrompe cedo em vez de tentar a biblioteca toda
const MAX_FAILURE_LOGS = 5;

const isRateLimitWarning = (warning?: string): boolean => Boolean(warning && /\b429\b|limite|pedidos demais/i.test(warning));

// Chave do jogo no localconfig.vdf: AppID da Steam ou appid do atalho em int32 com sinal
function steamStatsKey(game: Game): string | undefined {
  if (game.platform === 'steam') return game.platformGameId;
  const shortcut = game.id.match(/^steam-shortcut-(\d+)$/)?.[1];
  return shortcut ? String(Number(shortcut) | 0) : undefined;
}

class ProfileService {
  private syncingPromise?: Promise<AchievementsSyncResult>;

  private trackedSeconds(game: Game, since: number): number {
    return db
      .getPlaytimeSessions(game.id)
      .filter((s) => new Date(s.endedAt).getTime() >= since)
      .reduce((sum, s) => sum + s.durationSeconds, 0);
  }

  // Horas das últimas 2 semanas. Playtime2wks do localconfig.vdf não é confiável: fica desatualizado em jogos
  // parados há semanas e, nos atalhos não-Steam, repete o total. Vale a página pública; fora dela, as sessões do app.
  private recentSeconds(game: Game, steamStats: Map<string, SteamAppStats>, since: number, publicHours?: Record<string, number>): number {
    const tracked = this.trackedSeconds(game, since);
    if (game.platform !== 'steam') return tracked;
    const listed = publicHours?.[game.platformGameId ?? ''];
    if (listed !== undefined) return Math.max(listed * 3600, tracked);
    const local = steamStats.get(game.platformGameId ?? '');
    const inWindow = local?.lastPlayedAt && new Date(local.lastPlayedAt).getTime() >= since ? local.recentSeconds ?? 0 : 0;
    // A Steam lista os mais jogados: quem ficou de fora jogou no máximo o mesmo que o último da lista
    const ceiling = publicHours && Object.keys(publicHours).length > 0 ? Math.min(...Object.values(publicHours)) * 3600 : Infinity;
    return Math.max(Math.min(inWindow, ceiling), tracked);
  }

  private resolveBackground(custom: ProfileCustom, steam: SteamProfileIdentity | undefined, gameArt?: string): PlayerProfile['background'] {
    const mode = custom.backgroundMode ?? (steam?.background ? 'steam' : 'game');
    if (mode === 'none') return undefined;
    if (mode === 'steam') return steam?.background ?? (gameArt ? { imageUrl: gameArt } : undefined);
    if (mode === 'file' && custom.backgroundUrl) return VIDEO_FILE.test(custom.backgroundUrl) ? { videoUrl: custom.backgroundUrl } : { imageUrl: custom.backgroundUrl };
    return gameArt ? { imageUrl: gameArt } : undefined;
  }

  async build(): Promise<PlayerProfile> {
    achievementsService.refreshLocal();
    const settings = db.getSettings();
    const games = db.getGames().filter((g) => !g.isHidden);
    const played = games.filter((g) => (g.totalPlaytimeSeconds ?? 0) > 0);
    const since = Date.now() - RECENT_WINDOW_MS;
    const steamId = settings.steamUserId;
    const steamIdentity = steamId && /^7656\d{13}$/.test(steamId) ? await steamProfileService.get(steamId) : undefined;
    const { stats: steamStats, playerLevel } = await readSteamProfileStats().catch(() => ({
      stats: new Map<string, SteamAppStats>(),
      playerLevel: undefined
    }));

    const toProfileGame = (game: Game): ProfileGame => {
      const achievements = db.getGameAchievements(game.id);
      return {
        id: game.id,
        title: game.title,
        platform: game.platform,
        coverUrl: game.media?.coverUrl,
        heroUrl: game.media?.heroUrl,
        playtimeSeconds: game.totalPlaytimeSeconds ?? 0,
        lastPlayedAt: game.lastPlayedAt,
        recentSeconds: this.recentSeconds(game, steamStats, since, steamIdentity?.recentByAppId) || undefined,
        achievementsUnlocked: achievements?.total ? achievements.unlocked : undefined,
        achievementsTotal: achievements?.total || undefined,
        recentAchievementIcons: achievements?.items
          .filter((a) => a.unlocked && a.iconUrl)
          .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
          .slice(0, TOP_GAME_ACHIEVEMENT_ICONS)
          .map((a) => ({ name: a.name, iconUrl: a.iconUrl }))
      };
    };

    const platforms = new Map<Game['platform'], { games: number; playtimeSeconds: number }>();
    for (const g of games) {
      const entry = platforms.get(g.platform) ?? { games: 0, playtimeSeconds: 0 };
      entry.games++;
      entry.playtimeSeconds += g.totalPlaytimeSeconds ?? 0;
      platforms.set(g.platform, entry);
    }

    let achievementsUnlocked = 0;
    let achievementsTotal = 0;
    let perfectGames = 0;
    let gamesWithAchievementData = 0;
    let steamAchievementsHidden = 0;
    const rare: ProfileAchievement[] = [];
    const unlocked: PlayerProfile['recentAchievements'] = [];
    const choices: ProfileUnlockedAchievement[] = [];
    for (const game of games) {
      const data = db.getGameAchievements(game.id);
      if (data?.warning?.startsWith('Perfil da Steam privado')) steamAchievementsHidden++;
      if (!data || data.total === 0 || data.source === 'lazulium') continue;
      gamesWithAchievementData++;
      achievementsUnlocked += data.unlocked;
      achievementsTotal += data.total;
      if (data.unlocked === data.total) perfectGames++;
      for (const a of data.items) {
        if (!a.unlocked) continue;
        const base = { gameId: game.id, gameTitle: game.title, name: a.name, description: a.description, iconUrl: a.iconUrl, unlockedAt: a.unlockedAt };
        choices.push({ key: `${game.id}|${a.id}`, gameId: game.id, gameTitle: game.title, name: a.name, description: a.description, iconUrl: a.iconUrl, globalPercent: a.globalPercent });
        // Data zerada ou inválida (1970) não entra em "recentes" nem no mapa de atividade
        if (isRealDate(a.unlockedAt)) unlocked.push({ ...base, globalPercent: a.globalPercent });
        if (typeof a.globalPercent === 'number') rare.push({ ...base, globalPercent: a.globalPercent });
      }
    }

    // Jogados nas últimas 2 semanas (pela data da última sessão ou por horas recentes registradas)
    const recentGames = games
      .map(toProfileGame)
      .filter((g) => (g.lastPlayedAt && new Date(g.lastPlayedAt).getTime() >= since) || (g.recentSeconds ?? 0) > 0)
      .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '') || (b.recentSeconds ?? 0) - (a.recentSeconds ?? 0));

    // Vitrine: capturas mais novas dos jogos jogados por último
    const screenshotSources = [...games]
      .filter((g) => g.lastPlayedAt)
      .sort((a, b) => b.lastPlayedAt!.localeCompare(a.lastPlayedAt!))
      .slice(0, SCREENSHOT_SOURCE_GAMES);
    const screenshots: ProfileScreenshot[] = [];
    for (const game of screenshotSources) {
      try {
        for (const shot of await screenshotsService.list(game)) {
          screenshots.push({ gameId: game.id, gameTitle: game.title, url: shot.url, thumbUrl: shot.thumbUrl, takenAt: shot.takenAt });
        }
      } catch {
        // Fonte de capturas indisponível: segue com os outros jogos
      }
    }

    const activityByDay: Record<string, number> = {};
    const activityStart = Date.now() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000;
    const countActivity = (iso?: string) => {
      const date = iso ? new Date(iso) : null;
      if (!date || date.getTime() < activityStart) return;
      const key = localDayKey(date);
      activityByDay[key] = (activityByDay[key] ?? 0) + 1;
    };
    for (const game of games) {
      for (const session of db.getPlaytimeSessions(game.id)) countActivity(session.startedAt);
    }
    unlocked.forEach((a) => countActivity(a.unlockedAt));
    screenshots.forEach((s) => countActivity(s.takenAt));

    const displayName =
      settings.steamPersonaName || steamIdentity?.personaName || settings.retroAchievementsUser || 'Jogador';

    const saved = db.getProfileCustom();
    const custom: ProfileCustom =
      saved.sections && (saved.sectionsVersion ?? 1) < SECTIONS_VERSION ? { ...saved, sections: withNewSections(saved.sections, saved.sectionsVersion ?? 1) } : saved;
    const byId = new Map(games.map((g) => [g.id, g]));
    const choicesByKey = new Map(choices.map((c) => [c.key, c]));
    const bannerGame = custom.bannerGameId ? byId.get(custom.bannerGameId) : undefined;

    return {
      schema: 'lazulium-profile/1',
      generatedAt: new Date().toISOString(),
      displayName: custom.displayName?.trim() || displayName,
      avatarUrl: custom.avatarUrl || steamIdentity?.avatarUrl,
      custom,
      steam: steamIdentity,
      background: this.resolveBackground(custom, steamIdentity, bannerGame?.media?.heroUrl ?? bannerGame?.media?.coverUrl ?? recentGames.find((g) => g.heroUrl)?.heroUrl),
      featuredGames: (custom.featuredGameIds ?? []).flatMap((id) => {
        const game = byId.get(id);
        return game ? [toProfileGame(game)] : [];
      }),
      featuredAchievements: (custom.featuredAchievementKeys ?? []).flatMap((key) => {
        const item = choicesByKey.get(key);
        return item ? [item] : [];
      }),
      achievementChoices: [...choices]
        .sort((a, b) => (a.globalPercent ?? 101) - (b.globalPercent ?? 101))
        .slice(0, MAX_ACHIEVEMENT_CHOICES),
      steamLevel: steamId ? playerLevel : undefined,
      betaTester: isBetaTester(steamId) || undefined,
      activityByDay,
      recentPlaytimeSeconds:
        steamIdentity?.recentHours !== undefined
          ? steamIdentity.recentHours * 3600 + games.filter((g) => g.platform !== 'steam').reduce((sum, g) => sum + this.trackedSeconds(g, since), 0)
          : recentGames.reduce((sum, g) => sum + (g.recentSeconds ?? 0), 0),
      recentGames,
      recentAchievements: unlocked.sort((a, b) => b.unlockedAt!.localeCompare(a.unlockedAt!)).slice(0, TOP_RECENT_ACHIEVEMENTS),
      screenshots: screenshots.sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, TOP_SCREENSHOTS),
      totals: {
        games: games.length,
        playedGames: played.length,
        playtimeSeconds: games.reduce((sum, g) => sum + (g.totalPlaytimeSeconds ?? 0), 0),
        favorites: games.filter((g) => g.isFavorite).length,
        achievementsUnlocked,
        achievementsTotal,
        perfectGames,
        gamesWithAchievementData
      },
      steamAchievementsHidden,
      byPlatform: [...platforms.entries()]
        .map(([platform, v]) => ({ platform, ...v }))
        .sort((a, b) => b.playtimeSeconds - a.playtimeSeconds || b.games - a.games),
      mostPlayed: [...played].sort((a, b) => b.totalPlaytimeSeconds - a.totalPlaytimeSeconds).slice(0, TOP_GAMES).map(toProfileGame),
      recentlyPlayed: games
        .filter((g) => g.lastPlayedAt)
        .sort((a, b) => b.lastPlayedAt!.localeCompare(a.lastPlayedAt!))
        .slice(0, TOP_GAMES)
        .map(toProfileGame),
      favorites: games.filter((g) => g.isFavorite).map(toProfileGame),
      rarestAchievements: rare.sort((a, b) => a.globalPercent - b.globalPercent).slice(0, TOP_RARE_ACHIEVEMENTS)
    };
  }

  saveCustom(input: ProfileCustom): ProfileCustom {
    const text = (value: string | undefined, max: number) => value?.trim().slice(0, max) || undefined;
    // Só arquivos que o próprio app copiou; nada de caminhos vindos do renderer
    const localMedia = (url?: string) => (url && LOCAL_PROFILE_MEDIA.test(url) ? url : undefined);
    const custom: ProfileCustom = {
      displayName: text(input.displayName, 60),
      realName: text(input.realName, 60),
      location: text(input.location, 60),
      bio: text(input.bio, 2000),
      avatarUrl: localMedia(input.avatarUrl),
      backgroundMode: input.backgroundMode && ['steam', 'game', 'file', 'none'].includes(input.backgroundMode) ? input.backgroundMode : undefined,
      backgroundUrl: localMedia(input.backgroundUrl),
      artworkUrl: localMedia(input.artworkUrl),
      artworkCaption: text(input.artworkCaption, 120),
      hideAvatarFrame: input.hideAvatarFrame || undefined,
      bannerGameId: input.bannerGameId && db.getGameById(input.bannerGameId) ? input.bannerGameId : undefined,
      featuredGameIds: (input.featuredGameIds ?? []).filter((id) => db.getGameById(id)).slice(0, MAX_FEATURED_GAMES),
      featuredAchievementKeys: (input.featuredAchievementKeys ?? []).slice(0, MAX_FEATURED_ACHIEVEMENTS),
      sections: input.sections?.filter((s) => SECTION_IDS.includes(s)),
      sectionsVersion: SECTIONS_VERSION
    };
    db.setProfileCustom(custom);
    void this.removeUnusedMedia(custom);
    return custom;
  }

  // Copia o arquivo escolhido; só vale para o perfil quando o jogador salvar
  async importMedia(kind: ProfileMediaKind, sourcePath: string): Promise<string> {
    const ext = extname(sourcePath).toLowerCase();
    const isVideo = VIDEO_FILE.test(ext);
    if (isVideo && kind !== 'background') throw new Error('Escolha uma imagem PNG, JPG, WEBP ou GIF.');
    if (!isVideo && !/^\.(png|jpe?g|webp|gif)$/.test(ext)) {
      throw new Error(kind === 'background' ? 'Escolha uma imagem (PNG, JPG, WEBP, GIF) ou um vídeo (WEBM, MP4).' : 'Escolha uma imagem PNG, JPG, WEBP ou GIF.');
    }
    const size = (await stat(sourcePath)).size;
    if (isVideo && size > MAX_BACKGROUND_VIDEO_BYTES) throw new Error('Esse vídeo é grande demais: escolha um de até 200 MB.');
    if (!isVideo && size > MAX_PROFILE_IMAGE_BYTES) throw new Error('Essa imagem é grande demais: escolha uma de até 30 MB.');
    const dir = join(app.getPath('userData'), 'profile');
    await mkdir(dir, { recursive: true });
    const file = `${kind}-${Date.now().toString(36)}${ext}`;
    await copyFile(sourcePath, join(dir, file));
    return mediaUrl('profile', file);
  }

  // Arquivos trocados ou escolhidos e cancelados
  private async removeUnusedMedia(custom: ProfileCustom): Promise<void> {
    const dir = join(app.getPath('userData'), 'profile');
    const used = new Set([custom.avatarUrl, custom.backgroundUrl, custom.artworkUrl]);
    for (const file of await readdir(dir).catch(() => [] as string[])) {
      if (/^(avatar|background|artwork)-/.test(file) && !used.has(mediaUrl('profile', file))) await unlink(join(dir, file)).catch(() => undefined);
    }
  }

  // Mantém conquistas e jogos 100% em dia sem depender do botão Atualizar
  syncInBackground(): void {
    achievementsService.applyPerfectGames();
    const last = Number(db.getSettings()[AUTO_SYNC_SETTING] ?? 0);
    if (Date.now() - last < AUTO_SYNC_INTERVAL_MS) return;
    this.syncAllAchievements()
      .then((result) => {
        if (result.failed === 0) db.setSetting(AUTO_SYNC_SETTING, String(result.privateGames ? Date.now() - AUTO_SYNC_INTERVAL_MS + PRIVATE_RETRY_MS : Date.now()));
        console.log(`[Conquistas] Atualização automática: ${result.synced} jogos, ${result.failed} falhas`);
      })
      .catch((err) => logBackgroundFailure('[Conquistas] Atualização automática falhou:', err));
  }

  // Busca conquistas de todos os jogos já jogados (respeita o cache de 6h de cada jogo)
  async syncAllAchievements(): Promise<AchievementsSyncResult> {
    if (this.syncingPromise) return this.syncingPromise;
    this.syncingPromise = (async () => {
      let synced = 0;
      let failed = 0;
      let privateGames = 0;
      let consecutiveFailures = 0;
      let consecutiveRateLimits = 0;
      let totalRateLimitPauses = 0;
      let rateLimitedBefore = false;
      let loggedFailures = 0;
      let firstReason: string | undefined;

      const recordFailure = (game: Game, reason?: string) => {
        const clean = reason?.trim() || undefined;
        if (!firstReason && clean) firstReason = clean;
        if (loggedFailures < MAX_FAILURE_LOGS) {
          loggedFailures++;
          console.warn(`[Conquistas] Falha em "${game.title}" (${game.id}): ${clean ?? 'erro temporário'}`);
        }
      };

      try {
        const candidates = db
          .getGames()
          // Todo jogo tem conquistas. Da Steam só os jogados (o histórico da conta é longo); dos outros, os que estão no PC ou no Diário
          .filter((g) => !g.isHidden && (g.platform === 'steam' ? (g.totalPlaytimeSeconds ?? 0) > 0 : g.isInstalled !== false || (g.totalPlaytimeSeconds ?? 0) > 0 || isJournalEntry(g)));
        for (let i = 0; i < candidates.length; i++) {
          const game = candidates[i];
          const prevCached = db.getGameAchievements(game.id);
          let touchedNetwork = true;
          try {
            const result = await achievementsService.getAchievements(game.id, false);
            const hitCache = Boolean(
              prevCached &&
                !prevCached.retryable &&
                !prevCached.warning &&
                result &&
                !result.retryable &&
                result.syncedAt === prevCached.syncedAt
            );
            touchedNetwork = result?.source !== 'lazulium' && !hitCache;

            if (result?.retryable) {
              const rateLimited = isRateLimitWarning(result.warning);
              if (rateLimited && consecutiveRateLimits < RATE_LIMIT_COOLDOWN_MS.length && totalRateLimitPauses < MAX_RATE_LIMIT_PAUSES) {
                const cooldown = RATE_LIMIT_COOLDOWN_MS[consecutiveRateLimits];
                consecutiveRateLimits++;
                totalRateLimitPauses++;
                rateLimitedBefore = true;
                firstReason ??= result.warning?.trim();
                console.warn(`[Conquistas] Steam limitou pedidos (429) em "${game.title}" (${i + 1}/${candidates.length}); aguardando ${cooldown / 1000}s...`);
                await sleep(cooldown);
                i--;
                continue;
              }
              if (!rateLimited) consecutiveRateLimits = 0;
              failed++;
              consecutiveFailures++;
              recordFailure(game, result.warning);
            } else {
              consecutiveRateLimits = 0;
              // Marcos são calculados aqui mesmo: não provam que a rede voltou (sem internet, a biblioteca mista seguiria até o fim)
              if (result?.source !== 'lazulium') consecutiveFailures = 0;
              if (result && result.total > 0) synced++;
              if (result?.warning?.startsWith('Perfil da Steam privado')) privateGames++;
            }
          } catch (err) {
            consecutiveRateLimits = 0;
            failed++;
            consecutiveFailures++;
            recordFailure(game, describeError(err));
          }

          if (consecutiveFailures >= MAX_CONSECUTIVE_TRANSIENT_FAILURES || consecutiveRateLimits >= RATE_LIMIT_COOLDOWN_MS.length) {
            const remaining = candidates.length - (i + 1);
            failed += remaining;
            console.warn(
              `[Conquistas] Sincronização interrompida em ${i + 1}/${candidates.length} após falhas seguidas (${firstReason ?? 'sem detalhe'}). Restantes: ${remaining}.`
            );
            break;
          }

          // Só pausa quando houve ida à rede (cache local e marcos não gastam limite de API)
          if (touchedNetwork && i < candidates.length - 1) await sleep(rateLimitedBefore ? SYNC_CAUTIOUS_DELAY_MS : SYNC_DELAY_MS);
        }
      } finally {
        this.syncingPromise = undefined;
      }

      if (failed > 0) {
        console.warn(`[Conquistas] Resumo: ${synced} sincronizado(s), ${failed} falha(s), ${privateGames} privado(s). Motivo: ${firstReason ?? 'não informado'}`);
      }
      return { synced, failed, privateGames, ...(failed > 0 && firstReason ? { reason: firstReason } : {}) };
    })();
    return this.syncingPromise;
  }

  // Para a página web: só URLs públicas (artes e capturas locais não existem fora deste PC)
  // Jogos com nota ou resenha, do mais recente ao mais antigo. O texto das resenhas tem teto por resenha e no total
  // para a página (e a vitrine no servidor) não ficarem enormes.
  private exportableRatings(): ProfileReview[] {
    let textBudget = MAX_RATINGS_TEXT_TOTAL;
    return db
      .getGames()
      .filter((g) => !g.isHidden && (g.log?.rating || g.log?.review?.trim()))
      .map((g) => ({ game: g, date: g.log?.finishedOn ?? g.updatedAt.slice(0, 10) }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_RATINGS)
      .map(({ game, date }) => {
        const full = game.log?.review?.trim();
        const review = full ? full.slice(0, Math.min(MAX_REVIEW_TEXT, textBudget)) || undefined : undefined;
        if (review) textBudget -= review.length;
        return {
          id: game.id,
          title: game.title,
          coverUrl: game.media?.coverUrl && game.media.coverUrl.startsWith('https://') ? game.media.coverUrl : undefined,
          platform: game.manualPlatform ?? game.platform,
          rating: game.log?.rating,
          status: game.log?.status,
          playtimeSeconds: game.totalPlaytimeSeconds ?? 0,
          date,
          review
        };
      });
  }

  toExportable(profile: PlayerProfile): PlayerProfile {
    const publicUrl = (url?: string) => (url && /^https:\/\//.test(url) ? url : undefined);
    const mapGame = (g: ProfileGame) => ({ ...g, coverUrl: publicUrl(g.coverUrl), heroUrl: publicUrl(g.heroUrl) });
    // Arquivos do perfil Steam pelo endereço original (na tela do app são as cópias locais).
    // Nome real, país e o steamId ficam de fora de propósito.
    const { custom } = profile;
    const steam = profile.steam && db.getSteamProfileCache();
    const mode = custom.backgroundMode ?? (steam?.background ? 'steam' : 'game');
    const gameBackground = publicUrl(custom.bannerGameId ? db.getGameById(custom.bannerGameId)?.media?.heroUrl : undefined) ?? profile.recentGames.map((g) => publicUrl(g.heroUrl)).find(Boolean);
    return {
      ...profile,
      avatarUrl: publicUrl(profile.avatarUrl) ?? steam?.avatarUrl,
      steam: undefined,
      background: undefined,
      custom: { bio: custom.bio },
      web: {
        bio: custom.bio || steam?.summary,
        background: mode === 'steam' ? steam?.background : mode === 'game' && gameBackground ? { imageUrl: gameBackground } : undefined,
        avatarFrameUrl: custom.hideAvatarFrame ? undefined : steam?.avatarFrameUrl,
        showcaseArt: !custom.artworkUrl && steam?.showcaseArt ? { ...steam.showcaseArt, title: custom.artworkCaption || steam.showcaseArt.title } : undefined,
        favoriteBadge: steam?.favoriteBadge,
        badges: steam?.badges
      },
      ratings: this.exportableRatings(),
      achievementChoices: [],
      activityByDay: {},
      steamAchievementsHidden: undefined,
      featuredGames: profile.featuredGames.map(mapGame),
      featuredAchievements: profile.featuredAchievements.map((a) => ({ ...a, iconUrl: publicUrl(a.iconUrl) ?? '' })),
      recentGames: profile.recentGames.map(mapGame),
      mostPlayed: profile.mostPlayed.map(mapGame),
      recentlyPlayed: profile.recentlyPlayed.map(mapGame),
      favorites: profile.favorites.map(mapGame),
      screenshots: [],
      recentAchievements: profile.recentAchievements.map((a) => ({ ...a, iconUrl: publicUrl(a.iconUrl) ?? '' })),
      rarestAchievements: profile.rarestAchievements.map((a) => ({ ...a, iconUrl: publicUrl(a.iconUrl) ?? '' }))
    };
  }
}

export const profileService = new ProfileService();
