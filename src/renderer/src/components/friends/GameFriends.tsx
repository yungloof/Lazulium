import React, { useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { GameAchievements } from '@shared/types/achievements';
import { GameFriend } from '@shared/types/social';
import { friendPresence } from '@shared/utils/presence';
import { useUiStore } from '../../stores/useUiStore';
import { formatLastPlayed, formatPlaytimeShort } from '../../utils/format';
import { LOG_STATUS, Stars } from '../GameLogFields';
import { focusRing } from '../ui';
import { PresenceAvatar } from './presence';
import { ReactionBar } from './Reactions';

// Página do jogo: os amigos que jogaram, com horas, status do Diário, nota, resenha e conquistas.
// Cada pedaço só aparece se o amigo deixou ver (as chaves de privacidade dele valem no servidor).

const SHOWN = 5;

const statusOf = (id?: string) => LOG_STATUS.find((s) => s.id === id);

// Conquistas lado a lado: a barra dele e, quando a lista é a mesma, um traço com a sua
const AchievementBar: React.FC<{ friend: GameFriend; mine: GameAchievements | null }> = ({ friend, mine }) => {
  const theirs = friend.achievements!;
  const percent = Math.round((theirs.unlocked / theirs.total) * 100);
  const same = mine && mine.source === theirs.source && mine.total === theirs.total ? mine : null;
  const myPercent = same ? Math.round((same.unlocked / same.total) * 100) : null;
  return (
    <div className="mt-1.5" title={same ? `${friend.user.name}: ${theirs.unlocked} de ${theirs.total} · você: ${same.unlocked}` : `${theirs.unlocked} de ${theirs.total} conquistas`}>
      <div className="relative h-1 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${percent}%` }} />
        {myPercent !== null && <span className="absolute top-0 h-full w-0.5 bg-indigo-300" style={{ left: `calc(${myPercent}% - 1px)` }} aria-hidden />}
      </div>
      <p className="mt-1 text-[11px] text-slate-400 tabular-nums">
        <span className="text-amber-300">{theirs.unlocked}</span>/{theirs.total} conquistas
        {same && (
          <span className="text-slate-500">
            {' · '}
            {theirs.unlocked === same.unlocked ? 'empatado com você' : theirs.unlocked > same.unlocked ? `${theirs.unlocked - same.unlocked} a mais que você` : `${same.unlocked - theirs.unlocked} a menos que você`}
          </span>
        )}
      </p>
    </div>
  );
};

const FriendRow: React.FC<{ friend: GameFriend; mine: GameAchievements | null }> = ({ friend, mine }) => {
  const [expanded, setExpanded] = useState(false);
  const status = statusOf(friend.status);
  const presence = friendPresence(friend.user);
  const details = [
    friend.playtimeSeconds !== undefined ? formatPlaytimeShort(friend.playtimeSeconds, friend.lastPlayedAt) : null,
    friend.lastPlayedAt && !friend.playingNow ? `jogou ${formatLastPlayed(friend.lastPlayedAt).toLowerCase()}` : null
  ].filter(Boolean);
  const longReview = (friend.review?.length ?? 0) > 180;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => useUiStore.getState().openFriend(friend.user.id)}
          title={`Abrir o perfil de ${friend.user.name}`}
          className={`flex-shrink-0 rounded-lg ${focusRing}`}
        >
          <PresenceAvatar user={friend.user} status={presence} size="sm" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => useUiStore.getState().openFriend(friend.user.id)}
              className={`min-w-0 truncate text-sm font-semibold text-slate-100 hover:text-white hover:underline rounded-sm ${focusRing}`}
            >
              {friend.user.name}
            </button>
            {friend.rating ? <Stars value={friend.rating} size="w-3 h-3" /> : null}
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
            {friend.playingNow && (
              <span className="flex items-center gap-1 font-semibold text-emerald-300">
                <Gamepad2 className="w-3 h-3" /> Jogando agora
              </span>
            )}
            {status && (
              <span className="flex items-center gap-1 text-slate-200">
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} aria-hidden /> {status.label}
              </span>
            )}
            {details.map((text, i) => (
              <span key={i} className="tabular-nums">
                {(friend.playingNow || status || i > 0) && <span className="text-slate-600">· </span>}
                {text}
              </span>
            ))}
          </p>
          {friend.achievements && <AchievementBar friend={friend} mine={mine} />}
          {friend.review && (
            <div className="mt-2">
              <p className={`text-xs leading-relaxed text-slate-300 whitespace-pre-line border-l-2 border-slate-700 pl-2.5 ${expanded ? '' : 'line-clamp-3'}`}>{friend.review}</p>
              {longReview && (
                <button type="button" onClick={() => setExpanded((v) => !v)} className={`mt-1 text-[11px] font-semibold text-indigo-300 hover:text-white rounded-sm px-1 ${focusRing}`}>
                  {expanded ? 'Mostrar menos' : 'Ler a resenha toda'}
                </button>
              )}
            </div>
          )}
          {friend.titleKey && (friend.review || friend.rating) && (
            <ReactionBar target={{ owner: friend.user.id, kind: 'review', target: friend.titleKey, title: friend.title }} className="mt-2" />
          )}
        </div>
      </div>
    </li>
  );
};

export const GameFriendsList: React.FC<{ friends: GameFriend[]; mine: GameAchievements | null }> = ({ friends, mine }) => {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? friends : friends.slice(0, SHOWN);
  return (
    <>
      <ul className="divide-y divide-slate-800/80">
        {shown.map((friend) => (
          <FriendRow key={friend.user.id} friend={friend} mine={mine} />
        ))}
      </ul>
      {friends.length > SHOWN && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className={`mt-3 text-[11px] font-semibold text-indigo-300 hover:text-white rounded-sm px-1 ${focusRing}`}>
          {showAll ? 'Mostrar menos' : `Ver todos os ${friends.length}`}
        </button>
      )}
    </>
  );
};

// Resumo para o título do cartão: "3 amigos · média 4,2"
export function friendsSummary(friends: GameFriend[]): string {
  const rated = friends.filter((f) => f.rating);
  const average = rated.length ? rated.reduce((sum, f) => sum + f.rating!, 0) / rated.length : null;
  const count = `${friends.length} ${friends.length === 1 ? 'amigo' : 'amigos'}`;
  return average !== null && rated.length >= 2 ? `${count} · média ${average.toFixed(1).replace('.', ',')}` : count;
}
