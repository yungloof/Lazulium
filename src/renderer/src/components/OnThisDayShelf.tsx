import React, { memo, useEffect, useState } from 'react';
import { CheckCircle2, Clock, History, MessageSquareQuote, Play, Star, Trophy } from 'lucide-react';
import { OnThisDayKind, OnThisDayMemory } from '@shared/types/profile';
import { useLibraryStore } from '../stores/useLibraryStore';
import { openContextMenu, openGame } from '../utils/gameActions';
import { GameCover } from './journal/CoverCard';
import { formatDay, formatHours } from './journal/format';
import { SectionHeader, focusRing } from './ui';

const KIND_META: Record<OnThisDayKind, { badge: string; icon: React.ComponentType<{ className?: string }> }> = {
  completed: { badge: '100%', icon: Trophy },
  finished: { badge: 'Zerado', icon: CheckCircle2 },
  'first-session': { badge: 'Primeira sessão', icon: Play },
  started: { badge: 'Começou', icon: Play },
  reviewed: { badge: 'Resenha', icon: MessageSquareQuote },
  rated: { badge: 'Avaliação', icon: Star },
  played: { badge: 'Sessão', icon: Clock }
};

export function formatMemoryHeadline(memory: Pick<OnThisDayMemory, 'kind' | 'gameTitle' | 'yearsAgo'>): string {
  const years = memory.yearsAgo === 1 ? '1 ano' : `${memory.yearsAgo} anos`;
  switch (memory.kind) {
    case 'completed':
      return `Há ${years} você fez 100% em ${memory.gameTitle}`;
    case 'finished':
      return `Há ${years} você zerou ${memory.gameTitle}`;
    case 'first-session':
      return `Sua primeira sessão de ${memory.gameTitle} foi hoje (há ${years})`;
    case 'started':
      return `Há ${years} você começou ${memory.gameTitle}`;
    case 'reviewed':
      return `Há ${years} você escreveu sobre ${memory.gameTitle}`;
    case 'rated':
      return `Há ${years} você avaliou ${memory.gameTitle}`;
    case 'played':
      return `Há ${years} você jogou ${memory.gameTitle}`;
  }
}

const MemoryCard = memo<{ memory: OnThisDayMemory }>(({ memory }) => {
  const [shotFailed, setShotFailed] = useState(false);
  const { badge, icon: BadgeIcon } = KIND_META[memory.kind];
  const screenshot = !shotFailed ? memory.screenshotThumbUrl ?? memory.screenshotUrl : undefined;

  return (
    <button
      type="button"
      data-game-id={memory.gameId}
      onClick={() => openGame({ id: memory.gameId })}
      onContextMenu={(e) => {
        const game = useLibraryStore.getState().gamesById.get(memory.gameId);
        if (game) openContextMenu(game, e);
      }}
      className={`group min-w-0 flex flex-col gap-3 p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-indigo-400/50 hover:bg-slate-900 transition-colors text-left ${focusRing}`}
    >
      <div className="flex items-start gap-3">
        <span className="w-12 aspect-[2/3] flex-shrink-0 overflow-hidden rounded-md bg-slate-800 border border-slate-700/60 flex items-center justify-center">
          <GameCover src={memory.coverUrl} title={memory.gameTitle} gameId={memory.gameId} compact />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 font-medium">
              <BadgeIcon className="w-3 h-3" />
              {badge}
            </span>
            <span>{formatDay(memory.date, 'long')}</span>
          </div>

          <p className="mt-1.5 text-sm font-medium leading-snug text-slate-100 group-hover:text-white line-clamp-2">
            {formatMemoryHeadline(memory)}
          </p>

          {(memory.rating !== undefined || (memory.playtimeSeconds ?? 0) >= 60) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xs text-slate-400 tabular-nums">
              {memory.rating !== undefined && (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {memory.rating.toFixed(1).replace('.', ',')}
                </span>
              )}
              {(memory.playtimeSeconds ?? 0) >= 60 && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  {formatHours(memory.playtimeSeconds)} neste dia
                </span>
              )}
            </div>
          )}
        </div>

        {screenshot && (
          <span className="w-28 aspect-video flex-shrink-0 overflow-hidden rounded-md bg-slate-950 border border-slate-700/70">
            <img
              src={screenshot}
              alt={`Captura de ${memory.gameTitle}`}
              loading="lazy"
              decoding="async"
              onError={() => setShotFailed(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </span>
        )}
      </div>

      {memory.reviewExcerpt && (
        <blockquote className="pl-2.5 border-l-2 border-indigo-400/50 text-xs italic text-slate-300 line-clamp-2">
          “{memory.reviewExcerpt}”
        </blockquote>
      )}
    </button>
  );
});
MemoryCard.displayName = 'MemoryCard';

export const OnThisDayShelf: React.FC = () => {
  const games = useLibraryStore((s) => s.games);
  const [memories, setMemories] = useState<OnThisDayMemory[]>([]);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      ?.getOnThisDayMemories()
      .then((list) => {
        if (!cancelled) setMemories(list);
      })
      .catch(() => {
        if (!cancelled) setMemories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [games]);

  if (memories.length === 0) return null;

  return (
    <section data-on-this-day aria-label="Neste dia">
      <SectionHeader icon={History} title="Neste dia" count={memories.length} />
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
        {memories.map((memory) => (
          <MemoryCard key={memory.id} memory={memory} />
        ))}
      </div>
    </section>
  );
};
