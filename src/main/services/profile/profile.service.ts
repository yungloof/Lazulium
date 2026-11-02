import { Game } from '@shared/types/game';
import {
  AchievementsSyncResult,
  PlayerProfile,
  ProfileAchievement,
  ProfileGame,
  ProfileScreenshot
} from '@shared/types/profile';
import { db } from '../../database/db';
import { achievementsService } from '../achievements/achievements.service';
import { fetchSteamPersona } from '../accounts/steam-account.service';
import { screenshotsService } from '../metadata/screenshots.service';
import { readSteamProfileStats, SteamAppStats } from '../scanners/steam-scanner.service';

const TOP_GAMES = 6;
const TOP_RARE_ACHIEVEMENTS = 8;
const TOP_RECENT_ACHIEVEMENTS = 10;
const TOP_SCREENSHOTS = 8;
const SCREENSHOT_SOURCE_GAMES = 8;     // Jogos (mais recentes) consultados para a vitrine de capturas
const RECENT_WINDOW_MS = 14 * 86_400_000;
const SYNC_DELAY_MS = 400;             // Espaço entre jogos para não estourar limites das APIs
const AVATAR_CACHE_MS = 6 * 60 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Chave do jogo no localconfig.vdf: AppID da Steam ou appid do atalho em int32 com sinal
function steamStatsKey(game: Game): string | undefined {
  if (game.platform === 'steam') return game.platformGameId;
  const shortcut = game.id.match(/^steam-shortcut-(\d+)$/)?.[1];
  return shortcut ? String(Number(shortcut) | 0) : undefined;
}

class ProfileService {
  private avatar?: { steamId: string; url?: string; fetchedAt: number };
  private syncing = false;

  // Avatar público do perfil Steam (XML da comunidade, sem chave)
  private async steamAvatar(steamId: string): Promise<string | undefined> {
    if (this.avatar?.steamId === steamId && Date.now() - this.avatar.fetchedAt < AVATAR_CACHE_MS) return this.avatar.url;
    let url: string | undefined;
    try {
      const xml = await (await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, { signal: AbortSignal.timeout(10_000) })).text();
      url = xml.match(/<avatarFull><!\[CDATA\[([^\]]+)\]\]><\/avatarFull>/)?.[1] ?? xml.match(/<avatarMedium><!\[CDATA\[([^\]]+)\]\]><\/avatarMedium>/)?.[1];
    } catch {
      // Offline: perfil sem avatar
    }
    this.avatar = { steamId, url, fetchedAt: Date.now() };
    return url;
  }

  // Horas das últimas 2 semanas: o maior entre o que a Steam registrou e as sessões do Lazulium
  private recentSeconds(game: Game, steamStats: Map<string, SteamAppStats>, since: number): number {
    const key = steamStatsKey(game);
    const steam = key ? steamStats.get(key)?.recentSeconds ?? 0 : 0;
    const tracked = db
      .getPlaytimeSessions(game.id)
      .filter((s) => new Date(s.endedAt).getTime() >= since)
      .reduce((sum, s) => sum + s.durationSeconds, 0);
    return Math.max(steam, tracked);
  }

  async build(): Promise<PlayerProfile> {
    const settings = db.getSettings();
    const games = db.getGames().filter((g) => !g.isHidden);
    const played = games.filter((g) => (g.totalPlaytimeSeconds ?? 0) > 0);
    const since = Date.now() - RECENT_WINDOW_MS;
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
        recentSeconds: this.recentSeconds(game, steamStats, since) || undefined,
        achievementsUnlocked: achievements?.total ? achievements.unlocked : undefined,
        achievementsTotal: achievements?.total || undefined
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
    const rare: ProfileAchievement[] = [];
    const unlocked: PlayerProfile['recentAchievements'] = [];
    for (const game of games) {
      const data = db.getGameAchievements(game.id);
      if (!data || data.total === 0) continue;
      gamesWithAchievementData++;
      achievementsUnlocked += data.unlocked;
      achievementsTotal += data.total;
      if (data.unlocked === data.total) perfectGames++;
      for (const a of data.items) {
        if (!a.unlocked) continue;
        const base = { gameId: game.id, gameTitle: game.title, name: a.name, description: a.description, iconUrl: a.iconUrl, unlockedAt: a.unlockedAt };
        if (a.unlockedAt) unlocked.push({ ...base, globalPercent: a.globalPercent });
        if (typeof a.globalPercent === 'number') rare.push({ ...base, globalPercent: a.globalPercent });
      }
    }

    // Jogados nas últimas 2 semanas (pela data da última sessão ou por horas recentes registradas)
    const recentGames = games
      .map(toProfileGame)
      .filter((g) => (g.lastPlayedAt && new Date(g.lastPlayedAt).getTime() >= since) || (g.recentSeconds ?? 0) > 0)
      .sort((a, b) => (b.recentSeconds ?? 0) - (a.recentSeconds ?? 0) || (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''));

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

    const steamId = settings.steamUserId;
    const displayName =
      settings.steamPersonaName || (steamId ? await fetchSteamPersona(steamId) : undefined) || settings.retroAchievementsUser || 'Jogador';

    return {
      schema: 'lazulium-profile/1',
      generatedAt: new Date().toISOString(),
      displayName,
      avatarUrl: steamId ? await this.steamAvatar(steamId) : undefined,
      steamLevel: steamId ? playerLevel : undefined,
      recentPlaytimeSeconds: recentGames.reduce((sum, g) => sum + (g.recentSeconds ?? 0), 0),
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

  // Busca conquistas de todos os jogos já jogados (respeita o cache de 6h de cada jogo)
  async syncAllAchievements(): Promise<AchievementsSyncResult> {
    if (this.syncing) throw new Error('A sincronização de conquistas já está em andamento.');
    this.syncing = true;
    let synced = 0;
    let failed = 0;
    try {
      const candidates = db
        .getGames()
        .filter((g) => (g.platform === 'steam' || g.platform === 'emulator') && (g.totalPlaytimeSeconds ?? 0) > 0);
      for (const game of candidates) {
        try {
          const result = await achievementsService.getAchievements(game.id, false);
          if (result && result.total > 0) synced++;
        } catch {
          failed++;
        }
        await sleep(SYNC_DELAY_MS);
      }
    } finally {
      this.syncing = false;
    }
    return { synced, failed };
  }

  // Para a página web: só URLs públicas (artes e capturas locais não existem fora deste PC)
  toExportable(profile: PlayerProfile): PlayerProfile {
    const publicUrl = (url?: string) => (url && /^https:\/\//.test(url) ? url : undefined);
    const mapGame = (g: ProfileGame) => ({ ...g, coverUrl: publicUrl(g.coverUrl), heroUrl: publicUrl(g.heroUrl) });
    return {
      ...profile,
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
