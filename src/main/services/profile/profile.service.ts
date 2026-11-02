import { Game } from '@shared/types/game';
import { AchievementsSyncResult, PlayerProfile, ProfileAchievement, ProfileGame } from '@shared/types/profile';
import { db } from '../../database/db';
import { achievementsService } from '../achievements/achievements.service';
import { fetchSteamPersona } from '../accounts/steam-account.service';

const TOP_GAMES = 6;
const TOP_RARE_ACHIEVEMENTS = 8;
const SYNC_DELAY_MS = 400;             // Espaço entre jogos para não estourar limites das APIs
const AVATAR_CACHE_MS = 6 * 60 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toProfileGame(game: Game): ProfileGame {
  return {
    id: game.id,
    title: game.title,
    platform: game.platform,
    coverUrl: game.media?.coverUrl,
    playtimeSeconds: game.totalPlaytimeSeconds ?? 0,
    lastPlayedAt: game.lastPlayedAt
  };
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
      url = xml.match(/<avatarMedium><!\[CDATA\[([^\]]+)\]\]><\/avatarMedium>/)?.[1];
    } catch {
      // Offline: perfil sem avatar
    }
    this.avatar = { steamId, url, fetchedAt: Date.now() };
    return url;
  }

  async build(): Promise<PlayerProfile> {
    const settings = db.getSettings();
    const games = db.getGames().filter((g) => !g.isHidden);
    const played = games.filter((g) => (g.totalPlaytimeSeconds ?? 0) > 0);

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
    for (const game of games) {
      const data = db.getGameAchievements(game.id);
      if (!data || data.total === 0) continue;
      gamesWithAchievementData++;
      achievementsUnlocked += data.unlocked;
      achievementsTotal += data.total;
      if (data.unlocked === data.total) perfectGames++;
      for (const a of data.items) {
        if (!a.unlocked || typeof a.globalPercent !== 'number') continue;
        rare.push({
          gameId: game.id,
          gameTitle: game.title,
          name: a.name,
          description: a.description,
          iconUrl: a.iconUrl,
          globalPercent: a.globalPercent,
          unlockedAt: a.unlockedAt
        });
      }
    }

    const steamId = settings.steamUserId;
    const displayName = settings.steamPersonaName || (steamId ? await fetchSteamPersona(steamId) : undefined) || settings.retroAchievementsUser || 'Jogador';

    return {
      schema: 'lazulium-profile/1',
      generatedAt: new Date().toISOString(),
      displayName,
      avatarUrl: steamId ? await this.steamAvatar(steamId) : undefined,
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

  // Para a futura página web: só URLs públicas (artes em cache local não existem fora deste PC)
  toExportable(profile: PlayerProfile): PlayerProfile {
    const publicUrl = (url?: string) => (url && /^https:\/\//.test(url) ? url : undefined);
    const mapGame = (g: ProfileGame) => ({ ...g, coverUrl: publicUrl(g.coverUrl) });
    return {
      ...profile,
      mostPlayed: profile.mostPlayed.map(mapGame),
      recentlyPlayed: profile.recentlyPlayed.map(mapGame),
      favorites: profile.favorites.map(mapGame),
      rarestAchievements: profile.rarestAchievements.map((a) => ({ ...a, iconUrl: publicUrl(a.iconUrl) ?? '' }))
    };
  }
}

export const profileService = new ProfileService();
