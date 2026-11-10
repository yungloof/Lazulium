import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, RefreshCw } from 'lucide-react';
import { YearReview, YearReviewGame } from '@shared/types/profile';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { Button, Modal, Skeleton, focusRing } from './ui';
import { GameCover } from './journal/CoverCard';
import { formatNumber } from './journal/format';
import { rarity } from './profile/parts';

interface YearReviewModalProps {
  onClose: () => void;
  onSelectGame: (gameId: string) => void;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const GameRow: React.FC<{ game: YearReviewGame; rank?: number; detail: string; onSelect: () => void }> = ({ game, rank, detail, onSelect }) => (
  <li>
    <button type="button" onClick={onSelect} className={`w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-slate-800/60 transition-colors ${focusRing}`}>
      {rank !== undefined && <span className="w-5 text-center font-display text-lg text-slate-500 tabular-nums">{rank}</span>}
      <span className="w-10 aspect-[2/3] flex-shrink-0 overflow-hidden rounded-sm bg-slate-800">
        <GameCover src={game.coverUrl} title={game.title} compact />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-white truncate">{game.title}</span>
        <span className="block text-xs text-slate-400">{detail}</span>
      </span>
    </button>
  </li>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</h3>;

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

  const tiles = review
    ? [
        { label: 'Conquistas', value: formatNumber(review.achievementsUnlocked), accent: true },
        { label: 'Jogos zerados', value: formatNumber(review.finishedGames.length) },
        { label: 'Jogados por último no ano', value: formatNumber(review.gamesPlayed) },
        { label: 'Capturas de tela', value: formatNumber(review.screenshots) }
      ]
    : [];
  // Datas zeradas (1970) vêm de conquistas sem data real: não viram um ano para escolher
  const years = review?.availableYears.filter((y) => y >= 1990) ?? [];
  const rarest = review?.rarestAchievement;
  const rarestTone = rarest ? rarity(rarest.globalPercent) : null;

  return (
    <Modal title={`Retrospectiva ${review?.year ?? ''}`} icon={<CalendarDays className="w-4 h-4 text-indigo-400" />} size="lg" onClose={onClose} bodyClassName="p-6 space-y-6">
      {error ? (
        <div className="py-10 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-7 h-7 text-amber-400/80" />
          <p className="text-sm text-slate-300">Não deu para montar a retrospectiva: {error}</p>
          <Button icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </Button>
        </div>
      ) : !review ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : (
        <>
          {years.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Escolher ano">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYear(y)}
                  aria-pressed={y === review.year}
                  className={`h-8 px-3 rounded-full border text-[13px] tabular-nums transition-colors ${y === review.year ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'} ${focusRing}`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3">
            {tiles.map((t) => (
              <div key={t.label} className="relative overflow-hidden px-5 py-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <dd className={`font-display text-4xl leading-none tabular-nums ${t.accent ? 'text-indigo-300' : 'text-white'}`}>{t.value}</dd>
                <dt className="mt-2 text-xs text-slate-400">{t.label}</dt>
              </div>
            ))}
          </dl>

          {(review.bestMonth || rarest) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {review.bestMonth && (
                <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-400/20">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200/80">Melhor mês</p>
                  <p className="mt-1 font-display text-2xl text-white capitalize">{MONTHS[review.bestMonth.month]}</p>
                  <p className="text-xs text-slate-400">{formatNumber(review.bestMonth.achievements)} conquistas</p>
                </div>
              )}
              {rarest && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-400/20">
                  {rarest.iconUrl && <img src={rarest.iconUrl} alt="" loading="lazy" className="w-12 h-12 flex-shrink-0 rounded-md ring-2 ring-amber-400/60" />}
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/80">{rarestTone?.label ?? 'Mais rara'}</p>
                    <p className="text-sm text-white truncate">{rarest.name}</p>
                    <p className="text-xs leading-snug text-slate-400">
                      {rarest.gameTitle} · só {rarest.globalPercent.toLocaleString('pt-BR')}% dos jogadores têm
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {review.topGames.length > 0 && (
              <section>
                <SectionTitle>Onde você mais conquistou</SectionTitle>
                <ul>
                  {review.topGames.map((g, i) => (
                    <GameRow key={g.id} game={g} rank={i + 1} detail={`${g.achievements} conquistas`} onSelect={() => onSelectGame(g.id)} />
                  ))}
                </ul>
              </section>
            )}
            {review.finishedGames.length > 0 && (
              <section>
                <SectionTitle>Zerados</SectionTitle>
                <ul>
                  {review.finishedGames.map((g) => (
                    <GameRow key={g.id} game={g} detail={g.rating ? `Nota ${String(g.rating).replace('.', ',')} de 5` : 'Sem nota'} onSelect={() => onSelectGame(g.id)} />
                  ))}
                </ul>
              </section>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500">
            A Steam guarda só o total de horas, não por ano. Aqui entram datas reais: conquistas, capturas e o campo “Terminei em” do registro.
            {review.trackedSeconds >= 3600 && ` O Lazulium registrou ${Math.round(review.trackedSeconds / 3600).toLocaleString('pt-BR')} h de sessões neste ano.`}
          </p>
        </>
      )}
    </Modal>
  );
};
