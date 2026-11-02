import { GamePlatform } from './game';

export interface ProfileGame {
  id: string;
  title: string;
  platform: GamePlatform;
  coverUrl?: string;
  playtimeSeconds: number;
  lastPlayedAt?: string;
}

export interface ProfileAchievement {
  gameId: string;
  gameTitle: string;
  name: string;
  description: string;
  iconUrl: string;
  globalPercent: number;            // % de jogadores que têm (menor = mais rara)
  unlockedAt?: string;
}

export interface PlayerProfile {
  schema: 'lazulium-profile/1';     // Versão do formato (exportação para web/site)
  generatedAt: string;
  displayName: string;
  avatarUrl?: string;
  totals: {
    games: number;
    playedGames: number;
    playtimeSeconds: number;
    favorites: number;
    achievementsUnlocked: number;
    achievementsTotal: number;
    perfectGames: number;            // 100% das conquistas
    gamesWithAchievementData: number;
  };
  byPlatform: { platform: GamePlatform; games: number; playtimeSeconds: number }[];
  mostPlayed: ProfileGame[];
  recentlyPlayed: ProfileGame[];
  favorites: ProfileGame[];
  rarestAchievements: ProfileAchievement[];
}

export interface AchievementsSyncResult {
  synced: number;
  failed: number;
}
