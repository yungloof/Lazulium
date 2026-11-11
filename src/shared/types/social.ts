import { ActivityKind } from './activity';

// Conta Lazulium (2.0): amigos, "jogando agora" e feed. Servidor em server/social.

export interface SocialUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastSeenAt?: string;
}

// O que a pessoa escolhe mostrar aos amigos (tudo vale só para amigos)
export interface SocialSettings {
  shareActivity: boolean;           // Chave geral do feed
  sharePlaytime: boolean;           // "Jogou X por 2 h" e horas no perfil
  shareAchievements: boolean;
  shareReviews: boolean;            // Notas e resenhas
  shareNowPlaying: boolean;
}

export interface SocialNowPlaying {
  gameKey: string;
  gameTitle: string;
  coverUrl: string | null;
  since: string;
}

export interface SocialFriend extends SocialUser {
  nowPlaying: SocialNowPlaying | null;
}

export interface SocialActivity {
  id: string;
  kind: ActivityKind;
  gameKey: string;
  gameTitle: string;
  coverUrl: string | null;
  at: string;
  rating?: number;
  count?: number;
  seconds?: number;
  text?: string;
}

export interface SocialFeedItem extends SocialActivity {
  user: SocialUser;
}

export interface SocialProfileGame {
  gameKey: string;
  title: string;
  coverUrl: string | null;
  playtimeSeconds: number;
  rating: number | null;
}

export interface SocialSummary {
  totals: { games: number; playtimeSeconds: number; achievementsUnlocked: number; perfectGames: number; finishedGames: number };
  topGames: SocialProfileGame[];
  updatedAt?: string;
}

export interface SocialFriendProfile {
  user: SocialUser;
  nowPlaying: SocialNowPlaying | null;
  summary: SocialSummary | null;
  activities: SocialActivity[];
}

export interface SocialInvite {
  code: string;
  expiresAt: string;
}

export interface SocialStatus {
  connected: boolean;
  user?: SocialUser;
  settings?: SocialSettings;
  lastSyncAt?: string;
  syncError?: string;
}
