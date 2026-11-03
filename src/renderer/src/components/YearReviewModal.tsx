import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, Loader2, RefreshCw, X } from 'lucide-react';
import { YearReview, YearReviewGame } from '@shared/types/profile';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';

interface YearReviewModalProps {
  onClose: () => void;
  onSelectGame: (gameId: string) => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const GameRow: React.FC<{ game: YearReviewGame; detail: string; onSelect: () => void }> = ({ game, detail, onSelect }) => (
  <li>
    <button onClick={onSelect} className={`w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-slate-800/70 ${focusRing}`}>
      {game.coverUrl ? <img src={game.coverUrl} alt="" loading="lazy" className="w-10 aspect-[2/3] object-contain flex-shrink-0" /> : <span className="w-10 aspect-[2/3] bg-slate-800 flex-shrink-0" />}
      <span className="min-w-0">
        <span className="block text-sm text-white truncate">{game.title}</span>
        <span className="block text-xs text-slate-400">{detail}</span>
      </span>
    </button>
  </li>
);

export const YearReviewModal: React.FC<YearReviewModalProps> = ({ onClose, onSelectGame }) => {
  const [year, setYear] = useState<number | undefined>();
  const [review, setReview] = useState<YearReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    window.electronAPI
      ?.getYearReview(year)
      .then((next) => !cancelled && setReview(next))
      .catch((err) => !cancelled && setError(ipcErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [year, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tiles = review
    ? [
        { label: 'Conquistas', value: review.achievementsUnlocked.toLocaleString('pt-BR') },
        { label: 'Jogos zerados', value: review.finishedGames.length.toLocaleString('pt-BR') },
        { label: 'Jogados por último neste ano', value: review.gamesPlayed.toLocaleString('pt-BR') },
        { label: 'Capturas de tela', value: review.screenshots.toLocaleString('pt-BR') }
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg bg-steam-panel border border-slate-800 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <h2 className="flex items-center gap-2 text-base text-white">
            <CalendarDays className="w-4 h-4 text-indigo-400" /> Retrospectiva {review?.year ?? ''}
          </h2>
          <button onClick={onClose} aria-label="Fechar" className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {error ? (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="w-7 h-7 text-amber-400/80" />
              <p className="text-sm text-slate-300">{error}</p>
              <button onClick={() => setAttempt((n) => n + 1)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
                <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
              </button>
            </div>
          ) : !review ? (
            <p className="py-10 flex items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Montando o seu ano...
            </p>
          ) : (
            <>
              {review.availableYears.length > 1 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Escolher ano">
                  {review.availableYears.map((y) => (
                    <button
                      key={y}
                      onClick={() => setYear(y)}
                      aria-pressed={y === review.year}
                      className={`px-3 py-1 rounded-full border text-[13px] transition-colors ${y === review.year ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'} ${focusRing}`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}

              <dl className="grid grid-cols-2 gap-3">
                {tiles.map((t) => (
                  <div key={t.label} className="px-4 py-3 rounded-lg bg-slate-900/50">
                    <dd className="text-2xl font-light text-white">{t.value}</dd>
                    <dt className="mt-0.5 text-xs text-slate-400">{t.label}</dt>
                  </div>
                ))}
              </dl>

              {(review.bestMonth || review.rarestAchievement) && (
                <div className="space-y-2 text-sm text-slate-300">
                  {review.bestMonth && (
                    <p>
                      Seu melhor mês foi <span className="text-white">{MONTHS[review.bestMonth.month]}</span>, com {review.bestMonth.achievements.toLocaleString('pt-BR')} conquistas.
                    </p>
                  )}
                  {review.rarestAchievement && (
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/50">
                      {review.rarestAchievement.iconUrl && <img src={review.rarestAchievement.iconUrl} alt="" loading="lazy" className="w-10 h-10 flex-shrink-0" />}
                      <p className="min-w-0 text-xs text-slate-400">
                        Conquista mais rara: <span className="text-white">{review.rarestAchievement.name}</span> em {review.rarestAchievement.gameTitle}. Só {review.rarestAchievement.globalPercent.toLocaleString('pt-BR')}% dos jogadores têm.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {review.topGames.length > 0 && (
                <section>
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Onde você mais conquistou</h3>
                  <ul>
                    {review.topGames.map((g) => (
                      <GameRow key={g.id} game={g} detail={`${g.achievements} conquistas`} onSelect={() => onSelectGame(g.id)} />
                    ))}
                  </ul>
                </section>
              )}

              {review.finishedGames.length > 0 && (
                <section>
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Zerados</h3>
                  <ul>
                    {review.finishedGames.map((g) => (
                      <GameRow key={g.id} game={g} detail={g.rating ? `Nota ${String(g.rating).replace('.', ',')} de 5` : 'Sem nota'} onSelect={() => onSelectGame(g.id)} />
                    ))}
                  </ul>
                </section>
              )}

              <p className="text-[11px] leading-relaxed text-slate-500">
                A Steam guarda só o total de horas, não por ano. Aqui entram datas reais: conquistas, capturas e o campo "Terminei em" do registro.
                {review.trackedSeconds >= 3600 && ` O Lazulium registrou ${Math.round(review.trackedSeconds / 3600).toLocaleString('pt-BR')} h de sessões neste ano.`}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
