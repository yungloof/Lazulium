import React, { useEffect, useState } from 'react';
import { CheckCircle2, Flag, Gamepad2, MessageSquareText, PlayCircle, Star, Trophy, XCircle } from 'lucide-react';
import { ActivityEvent, ActivityKind } from '@shared/types/activity';
import { formatLastPlayed, formatPlaytimeShort } from '../../utils/format';
import { focusRing } from '../ui';

const TIMELINE_ROWS = 12;

export const ACTIVITY_ICON: Record<ActivityKind, React.ReactNode> = {
  played: <Gamepad2 className="w-3.5 h-3.5 text-indigo-300" />,
  started: <PlayCircle className="w-3.5 h-3.5 text-sky-300" />,
  finished: <Flag className="w-3.5 h-3.5 text-emerald-300" />,
  completed: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />,
  perfect: <Trophy className="w-3.5 h-3.5 text-amber-300" />,
  achievements: <Trophy className="w-3.5 h-3.5 text-indigo-300" />,
  rated: <Star className="w-3.5 h-3.5 text-amber-300" />,
  reviewed: <MessageSquareText className="w-3.5 h-3.5 text-sky-300" />,
  dropped: <XCircle className="w-3.5 h-3.5 text-slate-400" />
};

const stars = (rating?: number) => (rating ? `${String(rating).replace('.', ',')} ${rating === 1 ? 'estrela' : 'estrelas'}` : '');

// Também usado no feed dos amigos (mesmos campos)
export type DescribableActivity = Pick<ActivityEvent, 'kind' | 'gameTitle' | 'rating' | 'count' | 'seconds'>;

export function describeActivity(e: DescribableActivity): React.ReactNode {
  const title = <span className="font-semibold text-slate-100">{e.gameTitle}</span>;
  switch (e.kind) {
    case 'played':
      return <>Jogou {title} por {formatPlaytimeShort(e.seconds)}</>;
    case 'started':
      return <>Começou {title}</>;
    case 'finished':
      return <>Zerou {title}</>;
    case 'completed':
      return <>Marcou {title} como 100%</>;
    case 'perfect':
      return <>Fez todas as conquistas de {title}</>;
    case 'achievements':
      return <>{e.count === 1 ? 'Desbloqueou 1 conquista' : `Desbloqueou ${e.count} conquistas`} em {title}</>;
    case 'rated':
      return <>Deu {stars(e.rating)} para {title}</>;
    case 'reviewed':
      return <>Escreveu sobre {title}</>;
    case 'dropped':
      return <>Largou {title}</>;
  }
}

// Linha do tempo do perfil: o que você fez, em qualquer loja. Na 2.0 é o que os amigos vão ver no feed.
export const ActivityTimeline: React.FC<{ onSelectGame: (gameId: string) => void }> = ({ onSelectGame }) => {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);

  useEffect(() => {
    let alive = true;
    window.electronAPI
      ?.getRecentActivity(TIMELINE_ROWS)
      .then((list) => alive && setEvents(list))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, []);

  if (!events || events.length === 0) return null;
  return (
    <div className="mt-4 pt-4 border-t border-slate-700/40">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Linha do tempo</h4>
      <ol className="space-y-0.5">
        {events.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onSelectGame(e.gameId)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800/50 ${focusRing}`}
            >
              <span className="w-6 h-6 rounded-md bg-slate-800/80 flex items-center justify-center flex-shrink-0">{ACTIVITY_ICON[e.kind]}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{describeActivity(e)}</span>
              <span className="text-xs text-slate-500 flex-shrink-0">{formatLastPlayed(e.at)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
};
