import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import { YearReview, YearReviewGame } from '@shared/types/profile';
import { useGamepadStore } from '../stores/useGamepadStore';
import { detectGamepadFamily, getGamepadBindings } from '../utils/gamepadGlyphs';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { isNavActive } from '../utils/spatialNav';
import {
  MONTH_NAMES,
  buildYearReviewSlides,
  drawYearReviewCard,
  formatReviewDuration,
  hasYearReviewActivity
} from '../utils/yearReviewStory';
import { Button, Modal, Skeleton, focusRing } from './ui';
import { GameCover } from './journal/CoverCard';
import { formatNumber } from './journal/format';
import { rarity } from './profile/parts';

interface YearReviewModalProps {
  onClose: () => void;
  onSelectGame: (gameId: string) => void;
}

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const GameRow: React.FC<{ game: YearReviewGame; rank?: number; detail: string; onSelect: () => void }> = ({
  game,
  rank,
  detail,
  onSelect
}) => (
  <li>
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-slate-800/60 motion-safe:transition-colors ${focusRing}`}
    >
      {rank !== undefined && <span className="w-5 text-center font-display text-lg text-slate-500 tabular-nums">{rank}</span>}
      <span className="w-10 aspect-[2/3] flex-shrink-0 overflow-hidden rounded-sm bg-slate-800">
        <GameCover src={game.coverUrl} title={game.title} compact />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-white truncate">{game.title}</span>
        <span className="block text-xs text-slate-400">{detail}</span>
      </span>
    </button>
  </li>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</h3>
);

export const YearReviewModal: React.FC<YearReviewModalProps> = ({ onClose, onSelectGame }) => {
  const [year, setYear] = useState<number | undefined>();
  const [review, setReview] = useState<YearReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<{ kind: 'ok' | 'info' | 'err'; text: string } | null>(null);

  const markerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const prevBtnRef = useRef<HTMLButtonElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  const gamepad = useGamepadStore((s) => s.gamepad);
  const shoulderBinding = useMemo(() => {
    const family = detectGamepadFamily(gamepad?.connected ? gamepad.id : undefined);
    return getGamepadBindings(family).extra.find((item) => item.id === 'filters')?.keyLabel ?? 'LB / RB';
  }, [gamepad]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSaveNote(null);
    window.electronAPI
      ?.getYearReview(year)
      .then((next) => {
        if (cancelled) return;
        setReview(next);
        setSlideIndex(0);
      })
      .catch((err) => !cancelled && setError(ipcErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [year, attempt]);

  const slides = useMemo(() => (review ? buildYearReviewSlides(review) : []), [review]);
  const safeIndex = slides.length > 0 ? Math.min(slideIndex, slides.length - 1) : 0;
  const currentSlide = slides[safeIndex];

  const stepSlide = useCallback(
    (delta: number) => {
      if (slides.length === 0) return;
      setSlideIndex((prev) => Math.max(0, Math.min(slides.length - 1, prev + delta)));
      setSaveNote(null);
    },
    [slides.length]
  );

  // Recebe LB/RB do controle (useShellControls) enquanto este modal está ativo
  useEffect(() => {
    const overlay = markerRef.current?.closest('.fixed.inset-0, [data-nav-scope]');
    if (!overlay) return;
    const onOverlayStep = (event: Event) => {
      const detail = (event as CustomEvent<{ step?: number }>).detail;
      if (typeof detail?.step === 'number') stepSlide(detail.step);
    };
    overlay.addEventListener('lazulium:overlay-step', onOverlayStep);
    return () => overlay.removeEventListener('lazulium:overlay-step', onOverlayStep);
  }, [stepSlide, !!review]);

  // Atalhos de teclado complementares (PageUp/PageDown e [ / ]) sem atrapalhar as setas do controle
  useEffect(() => {
    if (!review) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PageDown' || e.key === ']') {
        e.preventDefault();
        stepSlide(1);
      } else if (e.key === 'PageUp' || e.key === '[') {
        e.preventDefault();
        stepSlide(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [review, stepSlide]);

  // Mantém foco válido quando uma tela muda (evita prender foco em botão que sumiu ou ficou desabilitado)
  useEffect(() => {
    if (!currentSlide) return;
    const frame = requestAnimationFrame(() => {
      const overlay = markerRef.current?.closest('.fixed.inset-0, [data-nav-scope]');
      const active = document.activeElement as HTMLElement | null;
      const validFocus = active && active !== document.body && !(active as HTMLButtonElement).disabled && overlay?.contains(active);
      if (validFocus || (!isNavActive() && active && active !== document.body && !(active as HTMLButtonElement).disabled)) return;
      if (currentSlide.id === 'card' && saveBtnRef.current) saveBtnRef.current.focus();
      else if (nextBtnRef.current && !nextBtnRef.current.disabled) nextBtnRef.current.focus();
      else prevBtnRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [currentSlide?.id, safeIndex]);

  // Desenha o cartão final localmente no canvas do PC
  useEffect(() => {
    if (!review || currentSlide?.id !== 'card' || !canvasRef.current) return;
    drawYearReviewCard(canvasRef.current, review);
  }, [review, currentSlide?.id]);

  const handleSaveCard = async () => {
    if (!review || !canvasRef.current || saving) return;
    drawYearReviewCard(canvasRef.current, review);
    const dataUrl = canvasRef.current.toDataURL('image/png');
    setSaving(true);
    setSaveNote(null);
    try {
      if (window.electronAPI?.saveYearReviewImage) {
        const savedPath = await window.electronAPI.saveYearReviewImage(dataUrl, review.year);
        if (savedPath) setSaveNote({ kind: 'ok', text: `Imagem salva em ${savedPath}` });
        else setSaveNote({ kind: 'info', text: 'Salvamento cancelado.' });
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `lazulium-retrospectiva-${review.year}.png`;
        link.click();
        setSaveNote({ kind: 'ok', text: `Download iniciado: lazulium-retrospectiva-${review.year}.png` });
      }
    } catch (err) {
      setSaveNote({ kind: 'err', text: ipcErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  // Datas zeradas (1970) vêm de conquistas sem data real: não viram um ano para escolher
  const years = review?.availableYears.filter((y) => y >= 1990) ?? [];
  const rarest = review?.rarestAchievement;
  const rarestTone = rarest ? rarity(rarest.globalPercent) : null;
  const monthly = review?.monthlyAchievements ?? new Array<number>(12).fill(0);
  const maxMonthCount = Math.max(1, ...monthly);

  const tiles = review
    ? [
        { label: 'Conquistas desbloqueadas', value: formatNumber(review.achievementsUnlocked), accent: true },
        { label: 'Jogos zerados', value: formatNumber(review.finishedGames.length) },
        { label: 'Jogados por último no ano', value: formatNumber(review.gamesPlayed) },
        { label: 'Capturas de tela', value: formatNumber(review.screenshots) }
      ]
    : [];

  const toolbar = review ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Etapas da retrospectiva">
        {slides.map((slide, idx) => {
          const active = idx === safeIndex;
          const visited = idx < safeIndex;
          return (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-current={active ? 'step' : undefined}
              data-story-step={slide.id}
              onClick={() => {
                setSlideIndex(idx);
                setSaveNote(null);
              }}
              className={`h-7 px-2.5 rounded-md text-xs font-medium motion-safe:transition-colors ${
                active
                  ? 'bg-indigo-600 text-white'
                  : visited
                    ? 'bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
              } ${focusRing}`}
            >
              {idx + 1}. {slide.label}
            </button>
          );
        })}
      </div>

      {years.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Escolher ano">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              aria-pressed={y === review.year}
              className={`h-7 px-2.5 rounded-full border text-xs tabular-nums motion-safe:transition-colors ${
                y === review.year
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
              } ${focusRing}`}
            >
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  ) : undefined;

  const isLastSlide = slides.length > 0 && safeIndex === slides.length - 1;

  const footer = review ? (
    <div className="w-full flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-400">
        {gamepad?.connected ? (
          <>
            <span className="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-medium text-slate-200">
              {shoulderBinding}
            </span>
            troca de tela
          </>
        ) : (
          <>Tela {safeIndex + 1} de {slides.length}</>
        )}
      </p>
      <div className="flex items-center gap-2 ml-auto">
        <Button
          ref={prevBtnRef}
          variant="secondary"
          icon={<ChevronLeft className="w-3.5 h-3.5" />}
          disabled={safeIndex === 0}
          onClick={() => stepSlide(-1)}
          data-story-prev
        >
          Anterior
        </Button>
        {isLastSlide ? (
          <Button variant="primary" onClick={onClose} data-story-finish>
            Concluir
          </Button>
        ) : (
          <Button ref={nextBtnRef} variant="primary" onClick={() => stepSlide(1)} data-story-next>
            <span>Próxima</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  ) : undefined;

  return (
    <Modal
      title={`Retrospectiva ${review?.year ?? ''}`}
      subtitle={currentSlide ? `${currentSlide.title} · ${safeIndex + 1} de ${slides.length}` : undefined}
      icon={<CalendarDays className="w-4 h-4 text-indigo-400" />}
      size="xl"
      toolbar={toolbar}
      footer={footer}
      onClose={onClose}
      bodyClassName="p-6"
    >
      <div ref={markerRef} data-story-slide={currentSlide?.id ?? 'loading'}>
        {error ? (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="w-7 h-7 text-amber-400/80" />
            <p className="text-sm text-slate-300">Não deu para montar a retrospectiva: {error}</p>
            <Button icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => setAttempt((n) => n + 1)}>
              Tentar de novo
            </Button>
          </div>
        ) : !review || !currentSlide ? (
          <div className="space-y-4" aria-busy="true">
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-36 rounded-xl" />
          </div>
        ) : (
          <>
            {currentSlide.id === 'overview' && (
              <div className="space-y-5">
                {review.playerName && (
                  <p className="text-sm text-slate-300">
                    Resumo local de <span className="font-semibold text-white">{review.playerName}</span> em {review.year}.
                  </p>
                )}

                <dl className="grid grid-cols-2 gap-3">
                  {tiles.map((t) => (
                    <div
                      key={t.label}
                      className={`px-5 py-4 rounded-xl border ${
                        t.accent ? 'bg-indigo-500/10 border-indigo-400/30' : 'bg-slate-900/70 border-slate-800'
                      }`}
                    >
                      <dd className={`font-display text-4xl leading-none tabular-nums ${t.accent ? 'text-indigo-300' : 'text-white'}`}>
                        {t.value}
                      </dd>
                      <dt className="mt-2 text-xs text-slate-400">{t.label}</dt>
                    </div>
                  ))}
                </dl>

                {!hasYearReviewActivity(review) ? (
                  <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-sm text-slate-400">
                    Ainda não há conquistas, capturas ou sessões datadas em {review.year}. Você pode conferir outros anos acima ou gerar o cartão mesmo assim na etapa final.
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-400">
                    A Steam guarda só o total geral de horas. Aqui entram datas reais do seu PC: conquistas, capturas e o campo “Terminei em” do Diário.
                    {review.trackedSeconds >= 60 && ` O Lazulium registrou ${formatReviewDuration(review.trackedSeconds)} em sessões neste ano.`}
                  </p>
                )}
              </div>
            )}

            {currentSlide.id === 'rhythm' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {review.bestMonth && (
                    <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-400/25">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200/80">Melhor mês em conquistas</p>
                      <p className="mt-1 font-display text-2xl text-white capitalize">{MONTH_NAMES[review.bestMonth.month]}</p>
                      <p className="text-xs text-slate-300">{formatNumber(review.bestMonth.achievements)} conquistas desbloqueadas</p>
                    </div>
                  )}
                  <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sessões registradas pelo app</p>
                    <p className="mt-1 font-display text-2xl text-white tabular-nums">{formatReviewDuration(review.trackedSeconds)}</p>
                    <p className="text-xs text-slate-400">Contabilizadas quando abertas pelo Lazulium em {review.year}</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                  <SectionTitle>Conquistas mês a mês</SectionTitle>
                  <div className="grid grid-cols-12 gap-2 items-end h-36 pt-4">
                    {monthly.map((count, idx) => {
                      const heightPct = count > 0 ? Math.max(12, Math.round((count / maxMonthCount) * 100)) : 4;
                      const isPeak = review.bestMonth?.month === idx && count > 0;
                      return (
                        <div key={MONTH_SHORT[idx]} className="flex flex-col items-center justify-end h-full gap-1.5">
                          <span className="text-[10px] tabular-nums text-slate-400">{count > 0 ? count : ''}</span>
                          <div className="w-full flex-1 flex items-end">
                            <div
                              title={`${MONTH_NAMES[idx]}: ${count} conquistas`}
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-t-sm motion-safe:transition-all ${
                                isPeak ? 'bg-indigo-400' : count > 0 ? 'bg-indigo-600/80' : 'bg-slate-800'
                              }`}
                            />
                          </div>
                          <span className={`text-[10px] ${isPeak ? 'text-indigo-200 font-semibold' : 'text-slate-500'}`}>
                            {MONTH_SHORT[idx]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {currentSlide.id === 'games' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {review.topGames.length > 0 && (
                  <section>
                    <SectionTitle>Onde você mais conquistou</SectionTitle>
                    <ul className="space-y-1">
                      {review.topGames.map((g, i) => (
                        <GameRow
                          key={g.id}
                          game={g}
                          rank={i + 1}
                          detail={`${g.achievements} ${g.achievements === 1 ? 'conquista' : 'conquistas'}`}
                          onSelect={() => onSelectGame(g.id)}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                {(review.topPlayedGames?.length ?? 0) > 0 && (
                  <section>
                    <SectionTitle>Mais jogados pelo Lazulium</SectionTitle>
                    <ul className="space-y-1">
                      {review.topPlayedGames!.map((g, i) => (
                        <GameRow
                          key={g.id}
                          game={g}
                          rank={i + 1}
                          detail={formatReviewDuration(g.seconds)}
                          onSelect={() => onSelectGame(g.id)}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {currentSlide.id === 'finished' && (
              <div>
                <SectionTitle>
                  {formatNumber(review.finishedGames.length)} {review.finishedGames.length === 1 ? 'jogo zerado' : 'jogos zerados'} em {review.year}
                </SectionTitle>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {review.finishedGames.map((g) => (
                    <GameRow
                      key={g.id}
                      game={g}
                      detail={g.rating ? `Nota ${String(g.rating).replace('.', ',')} de 5` : 'Sem nota'}
                      onSelect={() => onSelectGame(g.id)}
                    />
                  ))}
                </ul>
              </div>
            )}

            {currentSlide.id === 'rarest' && rarest && (
              <div className="py-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-6 rounded-xl bg-amber-500/10 border border-amber-400/25">
                  {rarest.iconUrl && (
                    <img
                      src={rarest.iconUrl}
                      alt=""
                      className="w-20 h-20 flex-shrink-0 rounded-xl ring-2 ring-amber-400/60 object-cover bg-slate-900"
                    />
                  )}
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-200/90">
                      {rarestTone?.label ?? 'Conquista mais rara'}
                    </p>
                    <h3 className="font-display text-2xl text-white break-words">{rarest.name}</h3>
                    <p className="text-sm text-slate-300">{rarest.gameTitle}</p>
                    <p className="text-xs text-slate-400">
                      Apenas {rarest.globalPercent.toLocaleString('pt-BR')}% dos jogadores desbloquearam esta conquista.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {currentSlide.id === 'card' && (
              <div className="space-y-4">
                <canvas
                  ref={canvasRef}
                  width={1200}
                  height={675}
                  aria-label={`Cartão visual da retrospectiva ${review.year}`}
                  className="w-full aspect-video rounded-xl border border-slate-700/80 bg-[#09090b] shadow-lg shadow-black/40"
                />

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                    <ShieldCheck className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    Imagem montada localmente no seu PC — nada vai para servidores.
                  </p>
                  <Button
                    ref={saveBtnRef}
                    variant="primary"
                    size="md"
                    icon={<Download className="w-4 h-4" />}
                    loading={saving}
                    onClick={handleSaveCard}
                    data-story-save
                  >
                    Salvar imagem no PC
                  </Button>
                </div>

                {saveNote && (
                  <p
                    role="status"
                    className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                      saveNote.kind === 'ok'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : saveNote.kind === 'err'
                          ? 'bg-red-500/10 border-red-500/30 text-red-300'
                          : 'bg-slate-800/70 border-slate-700 text-slate-300'
                    }`}
                  >
                    {saveNote.kind === 'ok' && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                    <span className="break-all">{saveNote.text}</span>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
