import React, { useEffect, useState } from 'react';
import { Bell, Heart, MessageCircle } from 'lucide-react';
import { SocialNotification } from '@shared/types/social';
import { notificationId, notificationText } from '@shared/utils/notifications';
import { titleKey } from '@shared/utils/title-key';
import { useGroupListsStore } from '../../stores/useGroupListsStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useReactionsStore } from '../../stores/useReactionsStore';
import { useUiStore } from '../../stores/useUiStore';
import { focusRing } from '../ui';
import { Avatar } from './parts';
import { formatAgo } from './Reactions';

// Aba Amigos: quem curtiu ou comentou suas resenhas e listas, e quem respondeu onde você comentou.
// Abrir a aba marca como lido; os que eram novos ficam destacados até sair dela.

const SHOWN = 6;

// Leva ao lugar do aviso: seu jogo, sua lista, lista em grupo ou o perfil do amigo (resposta na resenha/lista dele)
function openNotification(n: SocialNotification, me: string | null): void {
  const ui = useUiStore.getState();
  if (n.owner !== me) {
    if (n.kind === 'list') {
      if (useGroupListsStore.getState().lists.some((l) => l.id === n.target)) return ui.openList(n.target);
      void useGroupListsStore
        .getState()
        .reloadOne(n.target)
        .then((list) => (list ? ui.openList(n.target) : ui.openFriend(n.owner)))
        .catch(() => ui.openFriend(n.owner));
      return;
    }
    return ui.openFriend(n.owner);
  }
  if (n.kind === 'list') return ui.openList(n.target);
  const game = useLibraryStore.getState().games.find((g) => `t:${titleKey(g.title)}` === n.target);
  if (game) ui.openGameId(game.id);
  else ui.setView('journal');
}

export const NotificationsBox: React.FC = () => {
  const me = useReactionsStore((s) => s.me);
  const notifications = useReactionsStore((s) => s.notifications);
  const [showAll, setShowAll] = useState(false);
  // Os que estavam sem ler enquanto a aba está aberta ficam destacados
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!notifications || notifications.unread === 0) return;
    const unread = notifications.items.slice(0, notifications.unread).map(notificationId);
    setFresh((prev) => new Set([...prev, ...unread]));
    void window.electronAPI
      ?.socialMarkNotificationsRead()
      .then((n) => useReactionsStore.getState().setNotifications(n))
      .catch(() => undefined);
  }, [notifications]);

  if (!notifications || notifications.items.length === 0) return null;
  const items = showAll ? notifications.items : notifications.items.slice(0, SHOWN);

  return (
    <section className="rounded-xl bg-slate-900/50 border border-slate-800/90 p-3">
      <h3 className="flex items-center gap-1.5 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Bell className="w-3.5 h-3.5" /> Avisos
      </h3>
      <ul>
        {items.map((n) => {
          const id = notificationId(n);
          const isNew = fresh.has(id);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => openNotification(n, me)}
                className={`w-full flex items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-slate-800/50 ${isNew ? 'bg-indigo-500/10' : ''} ${focusRing}`}
              >
                <span className="relative flex-shrink-0">
                  <Avatar user={n.user} size="sm" />
                  <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-slate-900 ${n.type === 'like' ? 'bg-rose-500' : 'bg-indigo-500'}`}>
                    {n.type === 'like' ? <Heart className="w-2.5 h-2.5 fill-white text-white" /> : <MessageCircle className="w-2.5 h-2.5 text-white" />}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-snug text-slate-200 line-clamp-3 break-words">{notificationText(n)}</span>
                  <span className={`block mt-0.5 text-[11px] ${isNew ? 'text-indigo-300 font-semibold' : 'text-slate-500'}`}>{formatAgo(n.at)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {notifications.items.length > SHOWN && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className={`mt-1 ml-1 text-[11px] font-semibold text-indigo-300 hover:text-white rounded-sm px-1 ${focusRing}`}>
          {showAll ? 'Mostrar menos' : `Ver todos os ${notifications.items.length}`}
        </button>
      )}
    </section>
  );
};
