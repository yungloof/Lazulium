import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, Trophy, X } from 'lucide-react';
import { CeremonyEvent, CeremonyKind } from '@shared/types/ipc';
import { useCeremonyStore, vibrateGamepadForCeremony } from '../../stores/useCeremonyStore';
import { useGamepadStore } from '../../stores/useGamepadStore';
import { useUiStore } from '../../stores/useUiStore';
import { navAudio } from '../../utils/navigationAudio';
import { GameCover } from '../journal/CoverCard';
import { buttonClass, iconButtonClass } from '../ui';

const DISPLAY_MS = 6500;
const CALM_DISPLAY_MS = 7500;

interface KindCopy {
  badge: string;
  headline: (event: CeremonyEvent) => string;
  subline: (event: CeremonyEvent) => string;
  Icon: React.FC<{ className?: string }>;
}

const KIND_COPY: Record<CeremonyKind, KindCopy> = {
  achievement: {
    badge: 'Conquista desbloqueada',
    headline: (e) =>
      e.extraCount ? `${e.achievementName ?? 'Nova conquista'} (+${e.extraCount})` : e.achievementName ?? 'Nova conquista',
    subline: (e) => (e.achievementDescription ? `${e.gameTitle} · ${e.achievementDescription}` : e.gameTitle),
    Icon: Trophy
  },
  finished: {
    badge: 'Jogo zerado',
    headline: (e) => e.gameTitle,
    subline: () => 'Mais uma jornada fechada no seu Diário.',
    Icon: CheckCircle2
  },
  perfect: {
    badge: '100% concluído',
    headline: (e) => e.gameTitle,
    subline: () => 'Todas as conquistas completas.',
    Icon: Award
  }
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Celebrates newly unlocked achievements, finished ("Zerado") games, and 100% completion.
 * Uses deep-blue @theme accents without harsh flashing and switches to calm styling under prefers-reduced-motion.
 */
export const CeremonyOverlay: React.FC = () => {
  const active = useCeremonyStore((s) => s.active);
  const queuedCount = useCeremonyStore((s) => s.queue.length);
  const dismissActive = useCeremonyStore((s) => s.dismissActive);
  const hasGamepad = useGamepadStore((s) => !!s.gamepad?.connected);
  const view = useUiStore((s) => s.view);
  const selectedGameId = useUiStore((s) => s.selectedGameId);
  const calm = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(false);

  useEffect(() => setHovered(false), [active?.id]);

  // Som e vibração ocorrem uma vez na entrada de cada cerimônia
  useEffect(() => {
    if (!active) return;
    if (active.kind === 'achievement') navAudio.playAchievement();
    else navAudio.playCeremonyComplete();
    vibrateGamepadForCeremony(active.kind, calm);
  }, [active?.id, active?.kind, calm]);

  useEffect(() => {
    if (!active || hovered) return;
    const timer = setTimeout(dismissActive, calm ? CALM_DISPLAY_MS : DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [active, calm, hovered, dismissActive]);

  if (!active) return null;

  const copy = KIND_COPY[active.kind];
  const Icon = copy.Icon;
  const alreadyViewingGame = view === 'game' && selectedGameId === active.gameId;

  const openGame = () => {
    useUiStore.getState().closeModal();
    useUiStore.getState().openGameId(active.gameId);
    dismissActive();
  };

  return (
    <div
      className={`fixed inset-x-0 z-[60] flex justify-center px-4 pointer-events-none ${hasGamepad ? 'bottom-16' : 'bottom-6'}`}
      aria-live="polite"
    >
      <section
        role="status"
        data-ceremony-kind={active.kind}
        data-calm={String(calm)}
        aria-label={`${copy.badge}: ${copy.headline(active)}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={`pointer-events-auto relative overflow-hidden w-[min(480px,calc(100vw-2rem))] rounded-2xl border backdrop-blur-md ${
          calm
            ? 'bg-slate-900/95 border-indigo-400/25 shadow-lg shadow-black/50'
            : 'bg-slate-900/95 border-indigo-400/40 shadow-[0_0_48px_-10px_rgba(74,128,255,0.45)] animate-rise-in'
        }`}
      >
        {/* Brilho azul ambiente suave das cores @theme (sem piscar) */}
        {!calm && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -left-10 w-56 h-56 rounded-full bg-indigo-500/20 blur-2xl"
          />
        )}
        <div
          aria-hidden="true"
          className={`pointer-events-none h-0.5 w-full ${
            calm ? 'bg-indigo-500/35' : 'bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-400'
          }`}
        />

        <div className="relative flex items-center gap-4 p-4">
          <div
            className={`flex-shrink-0 w-14 aspect-[2/3] rounded-lg overflow-hidden bg-slate-950 border ${
              calm ? 'border-indigo-400/25' : 'border-indigo-400/45 shadow-md shadow-indigo-500/25'
            }`}
          >
            <GameCover src={active.coverUrl} title={active.gameTitle} gameId={active.gameId} compact />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
              <Icon className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400" />
              <span>{copy.badge}</span>
              {queuedCount > 0 && <span className="text-slate-400 font-medium">· +{queuedCount} na fila</span>}
            </div>

            <div className="flex items-center gap-2 min-w-0">
              {active.kind === 'achievement' && active.achievementIconUrl && (
                <img
                  src={active.achievementIconUrl}
                  alt=""
                  className="w-6 h-6 rounded border border-indigo-400/30 flex-shrink-0 object-cover"
                />
              )}
              <p className="text-sm font-bold text-white truncate">{copy.headline(active)}</p>
            </div>

            <p className="text-xs text-slate-300 line-clamp-2 leading-snug">{copy.subline(active)}</p>

            <div className="pt-1 flex items-center gap-2">
              {!alreadyViewingGame && (
                <button type="button" onClick={openGame} className={buttonClass('primary', 'sm')}>
                  Ver jogo
                </button>
              )}
              {queuedCount > 0 && (
                <button type="button" onClick={dismissActive} className={buttonClass('secondary', 'sm')}>
                  Próxima
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={dismissActive}
            className={`${iconButtonClass} self-start -m-1`}
            aria-label="Fechar cerimônia"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
};
