import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { FriendCompareGame, FriendComparison, FriendGameAchievements } from '@shared/types/social';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useUiStore } from '../../stores/useUiStore';
import { formatPlaytimeShort } from '../../utils/format';
import { LOG_STATUS } from '../GameLogFields';
import { Skeleton, focusRing } from '../ui';

// Aba Comparar: os jogos que vocês dois têm, com horas, conquistas e nota de cada um, lado a lado.
// Em cima de cada célula é você (azul), embaixo o amigo (verde).

const SHOWN = 12;
const GRID = 'grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_4.5rem] items-center gap-x-4';

const hours = (seconds?: number) => (seconds === undefined ? '—' : seconds < 60 ? '—' : formatPlaytimeShort(seconds));
const achievementsText = (a?: FriendGameAchievements) => (a ? `${a.unlocked}/${a.total}` : '—');
const ratingText = (rating?: number) => (rating ? String(rating).replace('.', ',') : '—');
const statusLabel = (id?: string) => LOG_STATUS.find((s) => s.id === id)?.label;

// Duas linhas: você e o amigo; quem está na frente fica em destaque
const Pair: React.FC<{ mine: string; theirs: string; lead?: 'mine' | 'theirs' | null; star?: boolean }> = ({ mine, theirs, lead, star }) => (
  <div className="text-xs tabular-nums leading-5">
    <p className={`flex items-center gap-1 ${lead === 'mine' ? 'font-semibold text-indigo-200' : 'text-indigo-300/80'}`}>
      {star && mine !== '—' && <Star className="w-3 h-3 fill-current" />}
      {mine}
    </p>
    <p className={`flex items-center gap-1 ${lead === 'theirs' ? 'font-semibold text-emerald-200' : 'text-emerald-300/80'}`}>
      {star && theirs !== '—' && <Star className="w-3 h-3 fill-current" />}
      {theirs}
    </p>
  </div>
);

const leadOf = (a?: number, b?: number): 'mine' | 'theirs' | null => (a === undefined || b === undefined || a === b ? null : a > b ? 'mine' : 'theirs');

const Row: React.FC<{ item: FriendCompareGame }> = ({ item }) => {
  const cover = useLibraryStore((s) => s.gamesById.get(item.gameId)?.media?.coverUrl);
  const { mine, theirs } = item;
  const sameList = !!mine.achievements && !!theirs.achievements && mine.achievements.source === theirs.achievements.source && mine.achievements.total === theirs.achievements.total;
  const statuses = [statusLabel(mine.status) && `você: ${statusLabel(mine.status)}`, statusLabel(theirs.status) && `amigo: ${statusLabel(theirs.status)}`].filter(Boolean);
  return (
    <li className={`${GRID} py-2.5`}>
      <button
        type="button"
        onClick={() => useUiStore.getState().openGameId(item.gameId)}
        title={`Abrir ${item.title}`}
        className={`flex items-center gap-3 min-w-0 text-left rounded-md group ${focusRing}`}
      >
        <span className="w-9 h-12 flex-shrink-0 rounded-md overflow-hidden bg-slate-800 ring-1 ring-slate-800">
          {cover && <img src={cover} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-100 group-hover:text-white group-hover:underline">{item.title}</span>
          {statuses.length > 0 && <span className="block truncate text-[11px] text-slate-500">{statuses.join(' · ')}</span>}
        </span>
      </button>
      <Pair mine={hours(mine.playtimeSeconds)} theirs={hours(theirs.playtimeSeconds)} lead={leadOf(mine.playtimeSeconds, theirs.playtimeSeconds)} />
      <Pair
        mine={achievementsText(mine.achievements)}
        theirs={achievementsText(theirs.achievements)}
        lead={sameList ? leadOf(mine.achievements!.unlocked, theirs.achievements!.unlocked) : null}
      />
      <Pair mine={ratingText(mine.rating)} theirs={ratingText(theirs.rating)} star />
    </li>
  );
};

export const FriendCompare: React.FC<{ friendId: string; friendName: string }> = ({ friendId, friendName }) => {
  const [data, setData] = useState<FriendComparison | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    window.electronAPI
      ?.socialCompareGames(friendId)
      .then((result) => alive && setData(result))
      .catch(() => alive && setFailed(true)); // Servidor antigo ou sem internet: a seção só não aparece
    return () => {
      alive = false;
    };
  }, [friendId]);

  if (failed || data?.hidden) return null;
  if (!data)
    return (
      <section className="space-y-2" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </section>
    );
  // O amigo ainda não mandou a biblioteca (app antigo): nada a comparar
  if (data.friendGames === 0) return null;

  const shown = showAll ? data.common : data.common.slice(0, SHOWN);
  return (
    <section>
      <h3 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Em comum
        <span className="normal-case tracking-normal font-normal text-slate-500">
          {data.common.length === 0 ? 'nenhum jogo ainda' : data.common.length === 1 ? '1 jogo' : `${data.common.length} jogos`}
        </span>
      </h3>
      {data.common.length > 0 && (
        <div className="rounded-xl bg-slate-900/50 border border-slate-800/90 px-4 py-2">
          <div className={`${GRID} pb-2 border-b border-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-500`}>
            <span className="flex items-center gap-3 normal-case tracking-normal text-[11px] font-semibold">
              <span className="flex items-center gap-1.5 text-indigo-300">
                <span className="w-2 h-2 rounded-full bg-indigo-400" aria-hidden /> Você
              </span>
              <span className="flex items-center gap-1.5 text-emerald-300 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" aria-hidden /> <span className="truncate">{friendName}</span>
              </span>
            </span>
            <span>Horas</span>
            <span>Conquistas</span>
            <span>Nota</span>
          </div>
          <ul className="divide-y divide-slate-800/60">
            {shown.map((item) => (
              <Row key={item.gameId} item={item} />
            ))}
          </ul>
          {data.common.length > SHOWN && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className={`my-2 text-[11px] font-semibold text-indigo-300 hover:text-white rounded-sm px-1 ${focusRing}`}>
              {showAll ? 'Mostrar menos' : `Ver todos os ${data.common.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
};
