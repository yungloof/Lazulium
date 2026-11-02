import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Layers, Search } from 'lucide-react';
import { Game } from '@shared/types/game';
import { GameCard } from './GameCard';

interface LibraryHomeProps {
  games: Game[];                    // Já filtrados por plataforma/busca
  focusedIndex: number;
  isFiltered: boolean;              // Busca ou filtro ativo (esconde "Jogados recentemente")
  onFocusIndex: (index: number) => void;
  onOpenGame: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onColumnsChange: (columns: number) => void;
  onContextMenu?: (game: Game, e: React.MouseEvent) => void;
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
  focusedIndex,
  isFiltered,
  onFocusIndex,
  onOpenGame,
  onToggleFavorite,
  onColumnsChange,
  onContextMenu
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [density, setDensity] = useState<GridDensity>(loadDensity);

  const changeDensity = (next: GridDensity) => {
    setDensity(next);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      // Preferência só desta sessão
    }
  };

  // Colunas reais da grade (auto-fill): a navegação por controle/setas precisa saber o que fica "abaixo"
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const { minWidth, gap } = GRID_DENSITY[density];
    const update = () => onColumnsChange(Math.max(1, Math.floor((el.clientWidth + gap) / (minWidth + gap))));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [density, games.length > 0, onColumnsChange]);

  const recent = useMemo(
    () =>
      games
        .filter((g) => g.lastPlayedAt)
        .sort((a, b) => b.lastPlayedAt!.localeCompare(a.lastPlayedAt!))
        .slice(0, RECENT_COUNT),
    [games]
  );

  return (
    <div className="px-8 py-6 space-y-7">
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
            ref={gridRef}
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
                isFocused={index === focusedIndex}
                onSelect={(g) => {
                  onFocusIndex(index);
                  onOpenGame(g);
                }}
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
