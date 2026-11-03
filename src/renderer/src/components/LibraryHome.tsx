import React, { useMemo, useRef, useState } from 'react';
import { Clock, Dices, EyeOff, Gamepad2, Layers, Play, Search } from 'lucide-react';
import { Game } from '@shared/types/game';
import { GameCard } from './GameCard';
import { pickSuggestion } from '../utils/suggestGame';

interface LibraryHomeProps {
  games: Game[];                    // Já filtrados por plataforma/busca
  isFiltered: boolean;              // Busca ou filtro ativo (esconde "Jogados recentemente")
  onOpenGame: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onContextMenu?: (game: Game, e: React.MouseEvent) => void;
  onSkipSuggestion: (game: Game) => void;
}

// Largura mínima de cada capa por densidade: a grade preenche a linha com quantas couberem
type GridDensity = 'compact' | 'normal' | 'large';
const GRID_DENSITY: Record<GridDensity, { label: string; minWidth: number; gap: number }> = {
  compact: { label: 'Compacto', minWidth: 112, gap: 10 },
  normal: { label: 'Padrão', minWidth: 140, gap: 14 },
  large: { label: 'Grande', minWidth: 190, gap: 18 }
};
const DENSITY_STORAGE_KEY = 'lazulium.gridDensity';
const RECENT_COUNT = 8;

function loadDensity(): GridDensity {
  try {
    const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
    return saved && saved in GRID_DENSITY ? (saved as GridDensity) : 'normal';
  } catch {
    return 'normal';
  }
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

export const LibraryHome: React.FC<LibraryHomeProps> = ({
  games,
  isFiltered,
  onOpenGame,
  onToggleFavorite,
  onContextMenu,
  onSkipSuggestion
}) => {
  const [density, setDensity] = useState<GridDensity>(loadDensity);
  const [suggestionRoll, setSuggestionRoll] = useState(0);

  const changeDensity = (next: GridDensity) => {
    setDensity(next);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      // Preferência só desta sessão
    }
  };

  const recent = useMemo(
    () =>
      games
        .filter((g) => g.lastPlayedAt)
        .sort((a, b) => b.lastPlayedAt!.localeCompare(a.lastPlayedAt!))
        .slice(0, RECENT_COUNT),
    [games]
  );

  const playing = useMemo(() => games.filter((g) => g.log?.status === 'playing'), [games]);

  // A sugestão só muda quando pedem outra (ou quando a atual sai da lista), não a cada atualização da biblioteca
  const suggestionRef = useRef<{ roll: number; gameId: string } | null>(null);
  const suggestion = useMemo(() => {
    const previous = suggestionRef.current;
    const candidate = previous?.roll === suggestionRoll ? games.find((g) => g.id === previous.gameId && !g.skipSuggestions) : undefined;
    const next = candidate ? pickSuggestion([candidate]) : pickSuggestion(games, previous?.gameId);
    suggestionRef.current = next ? { roll: suggestionRoll, gameId: next.game.id } : null;
    return next;
  }, [games, suggestionRoll]);

  return (
    <div className="px-8 py-6 space-y-7">
      {!isFiltered && (playing.length > 0 || suggestion) && (
        <section>
          <h2 className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Gamepad2 className="w-3.5 h-3.5 text-indigo-400" /> O que jogar agora
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {playing.map((game) => (
              <button
                key={game.id}
                onClick={() => onOpenGame(game)}
                title={game.title}
                className={`flex-shrink-0 w-[300px] flex items-center gap-3 p-3 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-indigo-400 transition-colors text-left ${focusRing}`}
              >
                {game.media?.coverUrl ? <img src={game.media.coverUrl} alt="" loading="lazy" className="w-14 aspect-[2/3] object-contain flex-shrink-0" /> : <span className="w-14 aspect-[2/3] bg-slate-800 flex-shrink-0" />}
                <span className="min-w-0">
                  <span className="block text-sm text-white truncate">{game.title}</span>
                  <span className="block mt-0.5 text-xs text-emerald-300">Jogando</span>
                  <span className="block mt-0.5 text-xs text-slate-400">{((game.totalPlaytimeSeconds ?? 0) / 3600).toFixed(1).replace('.', ',')} h até agora</span>
                </span>
              </button>
            ))}
            {suggestion && (
              <div className="flex-shrink-0 w-[420px] flex items-center gap-3 p-3 rounded-lg bg-slate-900/70 border border-slate-800">
                {suggestion.game.media?.coverUrl ? <img src={suggestion.game.media.coverUrl} alt="" loading="lazy" className="w-14 aspect-[2/3] object-contain flex-shrink-0" /> : <span className="w-14 aspect-[2/3] bg-slate-800 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate" title={suggestion.game.title}>{suggestion.game.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400 truncate">{suggestion.reason}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button onClick={() => onOpenGame(suggestion.game)} className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white ${focusRing}`}>
                      <Play className="w-3 h-3" /> Abrir
                    </button>
                    <button onClick={() => setSuggestionRoll((n) => n + 1)} className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 ${focusRing}`}>
                      <Dices className="w-3 h-3" /> Outro
                    </button>
                    <button onClick={() => onSkipSuggestion(suggestion.game)} title="Não sugerir este de novo" aria-label="Não sugerir este de novo" className={`p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 ${focusRing}`}>
                      <EyeOff className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {!isFiltered && recent.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Clock className="w-3.5 h-3.5 text-indigo-400" /> Jogados recentemente
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {recent.map((game) => (
              <button
                key={game.id}
                onClick={() => onOpenGame(game)}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    onContextMenu(game, e);
                  }
                }}
                className={`group relative flex-shrink-0 w-[300px] aspect-[96/31] rounded-lg overflow-hidden bg-slate-900 border border-slate-800 hover:border-indigo-400 transition-colors text-left ${focusRing}`}
                title={game.title}
              >
                {game.media?.heroUrl || game.media?.coverUrl ? (
                  <img
                    src={game.media.heroUrl || game.media.coverUrl}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : null}
                <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <span className="absolute left-3 bottom-2 right-3">
                  <span className="block text-sm font-bold text-white truncate drop-shadow">{game.title}</span>
                  <span className="block text-[10px] text-slate-300">
                    {new Date(game.lastPlayedAt!).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Layers className="w-3.5 h-3.5 text-indigo-400" /> {isFiltered ? 'Resultados' : 'Todos os jogos'} ({games.length})
          </h2>
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-900/80 border border-slate-800" role="group" aria-label="Tamanho das capas">
            {(Object.keys(GRID_DENSITY) as GridDensity[]).map((d) => (
              <button
                key={d}
                onClick={() => changeDensity(d)}
                aria-pressed={density === d}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${focusRing} ${
                  density === d ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {GRID_DENSITY[d].label}
              </button>
            ))}
          </div>
        </div>

        {games.length > 0 ? (
          <div
            className="grid pb-6"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${GRID_DENSITY[density].minWidth}px, 1fr))`,
              gap: GRID_DENSITY[density].gap
            }}
          >
            {games.map((game, index) => (
              <GameCard
                key={game.id}
                game={game}
                navStart={isFiltered && index === 0}
                onSelect={onOpenGame}
                onToggleFavorite={onToggleFavorite}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 rounded-lg border border-slate-800/60">
            <Search className="w-10 h-10 text-slate-600 mb-3" />
            <h3 className="text-sm font-semibold text-slate-300">Nenhum jogo encontrado</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Tente ajustar a busca ou o filtro, ou clique em &quot;Escanear&quot; para detectar jogos instalados.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
