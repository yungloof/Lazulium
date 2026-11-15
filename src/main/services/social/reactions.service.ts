import {
  ReactionSummary,
  ReactionTarget,
  ReactionThread,
  SocialNotification,
  SocialNotifications,
  SocialNotificationsEvent
} from '@shared/types/social';
import { NotificationStore, emptyNotificationStore, mergeNotifications, notificationText, unreadCount } from '@shared/utils/notifications';
import { db } from '../../database/db';
import { notify } from '../../app-shell';
import { SOCIAL_SETTING_KEYS, socialService } from './social.service';

// Curtidas e comentários em resenhas e listas, e os avisos de quando alguém reage ao que é seu.
// O servidor decide quem pode ver (o dono e os amigos dele); aqui só se pede e se guarda o que chegou.

export const REACTIONS_NOTIFY_SETTING = 'socialNotifyReactions';
const SUMMARY_BATCH = 100;
const UUID = /^[0-9a-f-]{36}$/;

const toServer = (t: ReactionTarget) => ({ owner: t.owner, kind: t.kind, target: t.target });

class ReactionsService {
  private polling = false;
  private listener: (event: SocialNotificationsEvent) => void = () => {};

  setListener(listener: (event: SocialNotificationsEvent) => void): void {
    this.listener = listener;
  }

  // ---------- Curtir e comentar ----------

  async summary(targets: ReactionTarget[]): Promise<Record<string, ReactionSummary>> {
    if (!socialService.isConnected() || targets.length === 0) return {};
    const result: Record<string, ReactionSummary> = {};
    for (let i = 0; i < targets.length; i += SUMMARY_BATCH) {
      const { items } = await socialService.api<{ items: Record<string, ReactionSummary> }>('POST', '/v1/social/summary', {
        targets: targets.slice(i, i + SUMMARY_BATCH).map(toServer)
      });
      Object.assign(result, items);
    }
    return result;
  }

  thread(t: ReactionTarget): Promise<ReactionThread> {
    const query = new URLSearchParams({ owner: t.owner, kind: t.kind, target: t.target });
    return socialService.api<ReactionThread>('GET', `/v1/social/thread?${query}`);
  }

  setLike(t: ReactionTarget, like: boolean): Promise<ReactionSummary> {
    return socialService.api<ReactionSummary>('POST', '/v1/social/like', { ...toServer(t), like, title: t.title });
  }

  addComment(t: ReactionTarget, text: string): Promise<ReactionThread> {
    return socialService.api<ReactionThread>('POST', '/v1/social/comments', { ...toServer(t), text, title: t.title });
  }

  deleteComment(commentId: string): Promise<ReactionThread> {
    if (!UUID.test(commentId)) throw new Error('Comentário inválido.');
    return socialService.api<ReactionThread>('DELETE', `/v1/social/comments/${commentId}`);
  }

  // ---------- Avisos ----------

  private load(): NotificationStore | null {
    const userId = socialService.getStatus().user?.id;
    if (!userId) return null;
    try {
      const stored = JSON.parse(db.getSettings()[SOCIAL_SETTING_KEYS.notifications] || 'null') as NotificationStore | null;
      // Outra conta neste PC: começa do zero
      if (stored && stored.userId === userId && Array.isArray(stored.items)) return stored;
    } catch {
      // Guardado estragado: busca de novo
    }
    return emptyNotificationStore(userId);
  }

  private save(store: NotificationStore): void {
    db.setSetting(SOCIAL_SETTING_KEYS.notifications, JSON.stringify(store));
  }

  private view(store: NotificationStore | null): SocialNotifications {
    return store ? { items: store.items, unread: unreadCount(store) } : { items: [], unread: 0 };
  }

  getNotifications(): SocialNotifications {
    return this.view(this.load());
  }

  markRead(): SocialNotifications {
    const store = this.load();
    if (!store) return this.view(null);
    const next = { ...store, readAt: store.items[0]?.at ?? store.readAt ?? new Date().toISOString() };
    this.save(next);
    const view = this.view(next);
    this.listener({ state: view, fresh: [] });
    return view;
  }

  // Desde quando pedir os avisos (undefined: os últimos 14 dias); null: sem conta, não pede
  pollSince(): string | undefined | null {
    if (!socialService.isConnected()) return null;
    const store = this.load();
    return store ? store.lastAt || undefined : null;
  }

  // Avisos que chegaram pela consulta (a única ou a rota antiga /v1/me/notifications)
  receive(items: SocialNotification[] | undefined): void {
    const store = this.load();
    if (!store) return;
    const { store: next, fresh } = mergeNotifications(store, Array.isArray(items) ? items : []);
    this.save(next);
    if (fresh.length === 0 && next.lastAt === store.lastAt) return;
    const wanted = db.getSettings()[REACTIONS_NOTIFY_SETTING] !== 'false';
    const texts = wanted ? fresh.slice(0, 3).map(notificationText) : [];
    if (texts.length > 0) notify('Lazulium', fresh.length === 1 ? texts[0] : `${texts[0]} e mais ${fresh.length - 1} ${fresh.length === 2 ? 'aviso' : 'avisos'}`);
    this.listener({ state: this.view(next), fresh: texts });
  }

  // Rota antiga, para servidor sem a consulta única
  async poll(): Promise<void> {
    const since = this.pollSince();
    if (this.polling || since === null) return;
    this.polling = true;
    try {
      const query = since ? `?since=${encodeURIComponent(since)}` : '';
      const { items } = await socialService.api<{ items: SocialNotification[] }>('GET', `/v1/me/notifications${query}`);
      this.receive(items);
    } catch (err) {
      console.warn('[Reactions] Não foi possível buscar os avisos:', err instanceof Error ? err.message : err);
    } finally {
      this.polling = false;
    }
  }
}

export const reactionsService = new ReactionsService();
