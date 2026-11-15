import { ActivityKind } from './activity';
import { GameLogStatus } from './game';

// Conta Lazulium (2.0): amigos, "jogando agora" e feed. Servidor em server/social.

// O app aberto fala com o servidor a cada 90 s e o servidor grava o "visto" a cada 3 min: visto há menos de 5 min = app aberto
export const FRIEND_ONLINE_WINDOW_MS = 5 * 60_000;

export const isFriendOnline = (lastSeenAt: string | undefined, now = Date.now()): boolean =>
  !!lastSeenAt && now - Date.parse(lastSeenAt) < FRIEND_ONLINE_WINDOW_MS;

export interface SocialUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastSeenAt?: string;
  presence?: FriendPresence;        // Servidor antigo não manda: vale o lastSeenAt
}

// Status escolhido (como no Discord). Invisível: os amigos te veem off-line, sem o jogo que está aberto
export type PresenceStatus = 'online' | 'away' | 'dnd' | 'invisible';
// O que se vê de um amigo
export type FriendPresence = 'online' | 'away' | 'dnd' | 'offline';

export interface PresenceState {
  chosen: PresenceStatus;           // O que a pessoa escolheu
  until?: string;                   // Volta para Disponível nesse horário (ISO)
  effective: PresenceStatus;        // O que vale agora (Ausente automático com o PC parado)
  auto: boolean;                    // effective veio do Ausente automático
}

// ---------- Chamar pra call (no Discord) ----------
// Não é ligação: é o aviso de que a pessoa está te chamando pra call no Discord, alto o bastante para quem está longe do PC.

export type CallAnswer = 'yes' | 'no' | 'busy';
// Como uma chamada chega: tela doida com música, só notificação ou recusada sozinha (o amigo vê "ocupado")
export type CallAlertMode = 'chaos' | 'notify' | 'off';

export interface CallSettings {
  alert: CallAlertMode;
  volume: number;                   // 0 a 100
  whilePlaying: boolean;            // Tela doida mesmo com jogo aberto (por cima de jogo em tela cheia pode minimizar o jogo)
  openDiscord: boolean;             // "Tô indo!" abre o Discord
}

export interface IncomingCall {
  id: string;
  from: SocialUser;
  createdAt: string;
  missed: boolean;                  // Chegou tarde (app estava fechado): vira aviso, sem tela doida
}

export interface CallAnswerNotice {
  id: string;
  user: SocialUser;
  answer: CallAnswer;
  answeredAt: string;
}

// main -> renderer
export type CallEvent =
  | { kind: 'incoming'; call: IncomingCall; how: 'chaos' | 'notify' | 'quiet' }
  | { kind: 'answered'; callId: string; answer: CallAnswer }   // Respondida (na tela doida ou no app)
  | { kind: 'answer'; notice: CallAnswerNotice };               // Resposta de quem você chamou

// O que a pessoa escolhe mostrar aos amigos (tudo vale só para amigos)
export interface SocialSettings {
  shareProfile: boolean;            // Vitrine do perfil (a mesma página do perfil web)
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

// Página do jogo: um amigo que jogou, com o que ele deixa ver (cada campo some com a chave de privacidade dele)
export interface FriendGameAchievements {
  source: 'steam' | 'retroachievements';
  unlocked: number;
  total: number;
  ids?: Record<string, number>;     // Conquistas dele: id -> segundos Unix de quando (0 = sem data)
}

export interface GameFriend {
  user: SocialUser;
  playingNow: boolean;
  title: string;
  coverUrl?: string | null;
  playtimeSeconds?: number;
  lastPlayedAt?: string;
  status?: GameLogStatus;
  rating?: number;
  review?: string;
  reviewAt?: string;
  achievements?: FriendGameAchievements;
  titleKey?: string;                // t:<nome>: chave da resenha para curtir e comentar (servidor antigo não manda)
}

// Aba Comparar: a biblioteca resumida de um amigo (sem resenha nem lista de conquistas)
export interface FriendLibraryGame {
  titleKey: string;
  steamKey?: string;
  title: string;
  coverUrl: string | null;
  playtimeSeconds?: number;
  lastPlayedAt?: string;
  status?: GameLogStatus;
  rating?: number;
  achievements?: FriendGameAchievements;
}

// Aba Comparar: jogos que vocês dois têm, com os números de cada um lado a lado
export interface FriendCompareGame {
  gameId: string;                   // O seu card (abre a página do jogo)
  title: string;
  mine: { playtimeSeconds: number; status?: GameLogStatus; rating?: number; achievements?: FriendGameAchievements };
  theirs: FriendLibraryGame;
}

export interface FriendComparison {
  common: FriendCompareGame[];
  friendGames: number;              // Quantos jogos com atividade o amigo mostra
  hidden?: boolean;                 // O amigo escondeu a vitrine
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

// ---------- Curtidas e comentários ----------

// Resenha de um jogo (target = t:<nome>) ou lista (target = id). Só o dono e os amigos dele veem e reagem
export type ReactionKind = 'review' | 'list';

export interface ReactionTarget {
  owner: string;                    // Id da conta Lazulium de quem escreveu a resenha ou fez a lista
  kind: ReactionKind;
  target: string;
  title?: string;                   // Nome do jogo ou da lista, para o aviso de quem recebe
}

export interface ReactionSummary {
  likes: number;
  liked: boolean;
  comments: number;
}

export interface ReactionComment {
  id: string;
  user: SocialUser;
  text: string;
  createdAt: string;
}

// O número de comentários é comments.length (até 200)
export interface ReactionThread extends Omit<ReactionSummary, 'comments'> {
  likers: SocialUser[];             // Os 20 mais recentes
  comments: ReactionComment[];
}

// Avisos: curtiram ou comentaram algo seu, ou responderam onde você comentou
export interface SocialNotification {
  type: 'like' | 'comment' | 'reply';
  kind: ReactionKind;
  target: string;
  owner: string;
  title: string | null;
  user: SocialUser;
  at: string;
  id?: string;                      // Do comentário
  text?: string;
  ownerName?: string;               // Resposta: de quem é a resenha ou lista
}

export interface SocialNotifications {
  items: SocialNotification[];
  unread: number;
}

// Chegou aviso novo: a lista toda e o texto dos novos (para o aviso dentro do app)
export interface SocialNotificationsEvent {
  state: SocialNotifications;
  fresh: string[];
}

// ---------- Listas em grupo ----------

export interface GroupListItem {
  titleKey: string;
  steamKey: string | null;
  title: string;
  coverUrl: string | null;
  position: number;
  addedBy: SocialUser | null;
  addedAt: string;
}

export interface GroupList {
  id: string;
  owner: SocialUser;
  title: string;
  description: string;
  ranked: boolean;
  members: SocialUser[];
  items: GroupListItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupListInput {
  title: string;
  description?: string;
  ranked?: boolean;
  memberIds?: string[];
}

export interface UpdateGroupListInput {
  title?: string;
  description?: string;
  ranked?: boolean;
}
