import { GamePlatform } from './game';

export interface ProfileGame {
  id: string;
  title: string;
  platform: GamePlatform;
  coverUrl?: string;
  heroUrl?: string;
  playtimeSeconds: number;
  lastPlayedAt?: string;
  recentSeconds?: number;           // Últimas 2 semanas (Steam + sessões do Lazulium)
  achievementsUnlocked?: number;    // Do cache de conquistas, quando sincronizado
  achievementsTotal?: number;
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

export interface ProfileScreenshot {
  gameId: string;
  gameTitle: string;
  url: string;                      // lazulium-media:// (só no app; removido na exportação)
  thumbUrl: string;
  takenAt: string;
}

export type ProfileSectionId = 'featured' | 'achievements' | 'activity' | 'screenshots' | 'mostPlayed';

// O que o jogador escolhe no próprio perfil
export interface ProfileCustom {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;               // Imagem escolhida (lazulium-media://profile/...)
  bannerGameId?: string;            // Banner: arte de um jogo à escolha
  featuredGameIds?: string[];
  featuredAchievementKeys?: string[]; // "<gameId>|<achievement.id>"
  sections?: ProfileSectionId[];    // Ordem das seções visíveis (ausente = todas)
}

export interface ProfileUnlockedAchievement {
  key: string;
  gameId: string;
  gameTitle: string;
  name: string;
  description: string;
  iconUrl: string;
  globalPercent?: number;
}

export interface PlayerProfile {
  schema: 'lazulium-profile/1';     // Versão do formato (exportação para web/site)
  generatedAt: string;
  displayName: string;
  avatarUrl?: string;
  steamLevel?: number;
  custom: ProfileCustom;
  bannerUrl?: string;
  featuredGames: ProfileGame[];
  featuredAchievements: ProfileUnlockedAchievement[];
  achievementChoices: ProfileUnlockedAchievement[]; // Mais raras primeiro, para o editor
  recentPlaytimeSeconds: number;    // Soma das últimas 2 semanas
  recentGames: ProfileGame[];       // Jogados nas últimas 2 semanas
  recentAchievements: (Omit<ProfileAchievement, 'globalPercent'> & { globalPercent?: number })[];
  screenshots: ProfileScreenshot[];
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
