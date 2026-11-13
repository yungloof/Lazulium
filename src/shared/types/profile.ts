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
  recentAchievementIcons?: { name: string; iconUrl: string }[]; // Últimas conquistas neste jogo
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

export type ProfileSectionId = 'artwork' | 'featured' | 'reviews' | 'lists' | 'achievements' | 'activity' | 'screenshots' | 'mostPlayed';

export type ProfileBackgroundMode = 'steam' | 'game' | 'file' | 'none';
export type ProfileMediaKind = 'avatar' | 'background' | 'artwork';

// Página pública do perfil (GitHub Pages)
export type ProfileWebLink = 'new-repo' | 'pages-settings' | 'page' | 'steam-privacy';
export interface ProfileWebStatus {
  repoUrl?: string;
  pageUrl?: string;
  lastPublishedAt?: string;
}

// Só na exportação: o que a página pública mostra além das estatísticas. Sempre URLs públicas.
export interface ProfileWebExtras {
  bio?: string;
  background?: { imageUrl?: string; videoUrl?: string };
  avatarFrameUrl?: string;
  showcaseArt?: { title?: string; imageUrl: string };
  favoriteBadge?: { name: string; detail: string; iconUrl: string };
  badges?: { name: string; iconUrl: string }[];
}

// Perfil público da Steam (sem chave de API); os arquivos ficam guardados para funcionar offline
export interface SteamProfileIdentity {
  steamId: string;
  fetchedAt: number;
  personaName?: string;
  avatarUrl?: string;
  isPrivate?: boolean;              // Perfil privado ou só para amigos: a Steam esconde quase tudo
  realName?: string;
  location?: string;
  flagUrl?: string;
  summary?: string;
  memberSince?: string;
  state?: 'online' | 'in-game' | 'offline';
  background?: { imageUrl?: string; videoUrl?: string };
  avatarFrameUrl?: string;
  showcaseArt?: { title: string; imageUrl: string };
  favoriteBadge?: { name: string; detail: string; iconUrl: string };
  badges?: { name: string; iconUrl: string }[];
  counts?: Record<string, number>;  // Contadores da página, pelo rótulo em inglês ("games", "badges"...)
  recentHours?: number;             // Total das últimas 2 semanas segundo a Steam
  recentByAppId?: Record<string, number>; // Horas das últimas 2 semanas dos jogos que a Steam lista
}

// O que o jogador escolhe no próprio perfil
export interface ProfileCustom {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;               // Imagem escolhida (lazulium-media://profile/...)
  realName?: string;                // Vazio = o da Steam
  location?: string;                // Vazio = o da Steam
  backgroundMode?: ProfileBackgroundMode; // Ausente = o fundo da Steam, se houver
  backgroundUrl?: string;           // Imagem ou vídeo escolhido (modo 'file')
  bannerGameId?: string;            // Arte de um jogo como fundo (modo 'game')
  artworkUrl?: string;              // Arte em destaque escolhida; vazio = a vitrine da Steam
  artworkCaption?: string;
  hideAvatarFrame?: boolean;
  featuredGameIds?: string[];
  featuredAchievementKeys?: string[]; // "<gameId>|<achievement.id>"
  sections?: ProfileSectionId[];    // Ordem das seções visíveis (ausente = todas)
  sectionsVersion?: number;         // Seções novas entram em perfis salvos antes delas
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

export interface YearReviewGame {
  id: string;
  title: string;
  coverUrl?: string;
  rating?: number;
  achievements?: number;            // Conquistas desbloqueadas no ano
}

export interface YearReview {
  year: number;
  availableYears: number[];         // Do mais novo para o mais antigo
  achievementsUnlocked: number;
  bestMonth?: { month: number; achievements: number }; // 0 = janeiro
  rarestAchievement?: { name: string; iconUrl: string; gameTitle: string; globalPercent: number };
  topGames: YearReviewGame[];       // Mais conquistas no ano
  finishedGames: YearReviewGame[];  // "Terminei em" dentro do ano
  gamesPlayed: number;              // Jogos cuja última sessão foi no ano
  screenshots: number;
  trackedSeconds: number;           // Só sessões abertas pelo Lazulium
}

export interface PlayerProfile {
  schema: 'lazulium-profile/1';     // Versão do formato (exportação para web/site)
  generatedAt: string;
  displayName: string;
  avatarUrl?: string;
  steamLevel?: number;
  custom: ProfileCustom;
  steam?: SteamProfileIdentity;
  background?: { imageUrl?: string; videoUrl?: string };
  web?: ProfileWebExtras;           // Só na exportação
  featuredGames: ProfileGame[];
  featuredAchievements: ProfileUnlockedAchievement[];
  achievementChoices: ProfileUnlockedAchievement[]; // Mais raras primeiro, para o editor
  activityByDay: Record<string, number>; // AAAA-MM-DD -> sessões, conquistas e capturas do dia
  recentPlaytimeSeconds: number;    // Últimas 2 semanas: total da Steam + sessões de jogos fora dela
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
  steamAchievementsHidden?: number; // Jogos cujas conquistas a Steam escondeu por privacidade (só na tela do app)
  mostPlayed: ProfileGame[];
  recentlyPlayed: ProfileGame[];
  favorites: ProfileGame[];
  rarestAchievements: ProfileAchievement[];
}

export interface AchievementsSyncResult {
  synced: number;
  failed: number;
  privateGames: number;             // Jogos que a Steam não mostrou por privacidade ("Detalhes do jogo" privado)
  reason?: string;                  // Motivo principal quando algum jogo falha (ex: limite 429, sem conexão)
}
