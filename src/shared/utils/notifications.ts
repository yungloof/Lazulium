import { SocialNotification } from '../types/social';

// Texto de um aviso de curtida ou comentário ("Ana curtiu sua resenha de Hades")
const quote = (text?: string) => {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean ? `: "${clean.length > 80 ? `${clean.slice(0, 79)}…` : clean}"` : '';
};

export function notificationText(n: SocialNotification): string {
  const who = n.user.name;
  const thing = n.kind === 'review' ? (n.title ? `resenha de ${n.title}` : 'resenha') : n.title ? `lista ${n.title}` : 'lista';
  if (n.type === 'like') return `${who} curtiu sua ${thing}`;
  if (n.type === 'comment') return `${who} comentou na sua ${thing}${quote(n.text)}`;
  // O dono respondeu na resenha/lista dele, onde você tinha comentado
  if (n.user.id === n.owner) return `${who} respondeu na ${n.kind === 'review' ? `resenha${n.title ? ` de ${n.title}` : ''}` : `lista${n.title ? ` ${n.title}` : ''}`}${quote(n.text)}`;
  const owner = n.ownerName ?? 'um amigo';
  const where = n.kind === 'review' ? `na resenha de ${owner}${n.title ? ` sobre ${n.title}` : ''}` : `na lista ${n.title ? `${n.title} ` : ''}de ${owner}`;
  return `${who} também comentou ${where}${quote(n.text)}`;
}

// A mesma curtida desfeita e refeita vira um aviso só
export const notificationId = (n: SocialNotification): string =>
  n.type === 'like' ? `like|${n.kind}|${n.target}|${n.user.id}` : `${n.type}|${n.id ?? `${n.target}|${n.user.id}|${n.at}`}`;

// O que fica guardado no PC: os últimos avisos, o mais novo já visto e até onde foi lido
export interface NotificationStore {
  userId: string;
  items: SocialNotification[];
  lastAt: string | null;            // null: nunca buscou (a primeira busca não vira notificação do Windows)
  readAt: string | null;
}

export const MAX_STORED_NOTIFICATIONS = 50;

export const emptyNotificationStore = (userId: string): NotificationStore => ({ userId, items: [], lastAt: null, readAt: null });

export function mergeNotifications(store: NotificationStore, incoming: SocialNotification[]): { store: NotificationStore; fresh: SocialNotification[] } {
  const known = new Set(store.items.map(notificationId));
  const fresh = store.lastAt === null ? [] : incoming.filter((n) => n.at > store.lastAt! && !known.has(notificationId(n)));
  const byId = new Map(store.items.map((n) => [notificationId(n), n]));
  for (const n of incoming) {
    const id = notificationId(n);
    const old = byId.get(id);
    if (!old || n.at > old.at) byId.set(id, n);
  }
  const items = [...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_STORED_NOTIFICATIONS);
  const newest = items[0]?.at ?? null;
  const lastAt = newest && (!store.lastAt || newest > store.lastAt) ? newest : (store.lastAt ?? new Date(0).toISOString());
  return { store: { ...store, items, lastAt }, fresh };
}

export const unreadCount = (store: NotificationStore): number => store.items.filter((n) => !store.readAt || n.at > store.readAt).length;
