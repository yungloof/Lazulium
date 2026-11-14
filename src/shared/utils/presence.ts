import { CallSettings, FriendPresence, PresenceStatus, isFriendOnline } from '../types/social';

// Regras do status (como no Discord) e de como uma chamada de amigo chega. Puras: o main aplica, os testes conferem.

export const PRESENCE_STATUSES: readonly PresenceStatus[] = ['online', 'away', 'dnd', 'invisible'];

export const PRESENCE_LABEL: Record<PresenceStatus | 'offline', string> = {
  online: 'Disponível',
  away: 'Ausente',
  dnd: 'Não perturbar',
  invisible: 'Invisível',
  offline: 'Off-line'
};

export const PRESENCE_HINT: Partial<Record<PresenceStatus, string>> = {
  dnd: 'Sem notificações na área de trabalho; chamadas chegam sem tela doida',
  invisible: 'Você vai aparecer Off-line'
};

// Prazos do submenu: ms (null = até você mudar)
export const PRESENCE_DURATIONS: readonly { label: string; ms: number | null }[] = [
  { label: 'Por 15 minutos', ms: 15 * 60_000 },
  { label: 'Por 1 hora', ms: 60 * 60_000 },
  { label: 'Por 8 horas', ms: 8 * 60 * 60_000 },
  { label: 'Por 24 horas', ms: 24 * 60 * 60_000 },
  { label: 'Por 3 dias', ms: 3 * 24 * 60 * 60_000 },
  { label: 'Para sempre', ms: null }
];

// PC parado (sem teclado e mouse) por 10 min: Ausente automático
export const AUTO_AWAY_IDLE_SECONDS = 10 * 60;

export const PRESENCE_SETTING_KEYS = { status: 'presenceStatus', until: 'presenceUntil' } as const;

export function parsePresenceStatus(value: unknown): PresenceStatus {
  return PRESENCE_STATUSES.includes(value as PresenceStatus) ? (value as PresenceStatus) : 'online';
}

export interface PresenceContext {
  idleSeconds: number;       // Tempo sem teclado e mouse
  locked: boolean;           // Tela do Windows bloqueada
  gameRunning: boolean;      // Com jogo aberto o controle não conta como uso do PC: não vira Ausente
}

// O que vale agora: prazo vencido volta para Disponível; Disponível vira Ausente com o PC parado
export function effectivePresence(
  chosen: PresenceStatus,
  until: string | undefined,
  context: PresenceContext,
  now = Date.now()
): { status: PresenceStatus; auto: boolean; expired: boolean } {
  const expired = !!until && Date.parse(until) <= now;
  const base = expired ? 'online' : chosen;
  if (base === 'online' && !context.gameRunning && (context.locked || context.idleSeconds >= AUTO_AWAY_IDLE_SECONDS)) {
    return { status: 'away', auto: true, expired };
  }
  return { status: base, auto: false, expired };
}

// Como um amigo aparece: off-line quando o app dele está fechado (ou ele está invisível)
export function friendPresence(friend: { presence?: FriendPresence; lastSeenAt?: string }, now = Date.now()): FriendPresence {
  if (friend.presence === 'offline' || !isFriendOnline(friend.lastSeenAt, now)) return 'offline';
  return friend.presence ?? 'online';
}

// ---------- Chamar pra call ----------

export const CALL_SETTING_KEYS = { alert: 'callAlert', volume: 'callVolume', whilePlaying: 'callWhilePlaying', openDiscord: 'callOpenDiscord' } as const;
export const DEFAULT_CALL_SETTINGS: CallSettings = { alert: 'chaos', volume: 80, whilePlaying: false, openDiscord: true };
export const CALL_CHAOS_SECONDS = 9;

export function parseCallSettings(settings: Record<string, string | undefined> | undefined): CallSettings {
  const alert = settings?.[CALL_SETTING_KEYS.alert];
  const volume = Number(settings?.[CALL_SETTING_KEYS.volume]);
  const flag = (key: string, fallback: boolean) => (settings?.[key] === 'true' ? true : settings?.[key] === 'false' ? false : fallback);
  return {
    alert: alert === 'chaos' || alert === 'notify' || alert === 'off' ? alert : DEFAULT_CALL_SETTINGS.alert,
    volume: settings?.[CALL_SETTING_KEYS.volume] !== undefined && Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : DEFAULT_CALL_SETTINGS.volume,
    whilePlaying: flag(CALL_SETTING_KEYS.whilePlaying, DEFAULT_CALL_SETTINGS.whilePlaying),
    openDiscord: flag(CALL_SETTING_KEYS.openDiscord, DEFAULT_CALL_SETTINGS.openDiscord)
  };
}

// chaos: tela doida e música · notify: notificação do Windows · quiet: só um aviso no app · decline: responde "ocupado" sozinho
export type CallDelivery = 'chaos' | 'notify' | 'quiet' | 'decline';

export function decideCallDelivery(settings: CallSettings, context: { presence: PresenceStatus; gameRunning: boolean; missed: boolean }): CallDelivery {
  if (settings.alert === 'off') return 'decline';
  if (context.missed) return 'quiet';
  // Não perturbar: a chamada fica esperando no app, sem barulho
  if (context.presence === 'dnd') return 'quiet';
  if (settings.alert === 'notify') return 'notify';
  // Por cima de jogo em tela cheia a janela pode minimizar o jogo: só notifica, a não ser que a pessoa peça
  if (context.gameRunning && !settings.whilePlaying) return 'notify';
  return 'chaos';
}

// Resposta de quem você chamou, como aparece no aviso
export const CALL_ANSWER_TEXT: Record<'yes' | 'no' | 'busy', string> = {
  yes: 'Tô indo pra call! 🎧',
  no: 'Agora não dá',
  busy: 'Está ocupado e não recebe chamadas agora'
};
