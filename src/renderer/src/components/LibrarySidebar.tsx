import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Gamepad2, Home, Search, Star } from 'lucide-react';
import { Game, GamePlatform } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';

export type LibraryFilter = 'all' | GamePlatform | 'favorites';

interface LibrarySidebarProps {
  games: Game[];                    // Já filtrados por plataforma/busca
  filters: { id: LibraryFilter; label: string }[];
  activeFilter: LibraryFilter;
  onFilterChange: (filter: LibraryFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  selectedGameId?: string;
  isHome: boolean;
  onHome: () => void;
  onOpenGame: (game: Game) => void;
  onLaunchGame: (game: Game) => void;
  onContextMenu?: (game: Game, e: React.MouseEvent) => void;
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400';
const COLLAPSED_STORAGE_KEY = 'lazulium.sidebarCollapsed';
const SIDEBAR_WIDTH_KEY = 'lazulium.sidebarWidth';
const DEFAULT_WIDTH = 288;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;

const GROUP_LABEL: Record<GamePlatform, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG Galaxy',
  riot: 'Riot Games',
  xbox: 'Xbox',
  emulator: 'Emuladores',
  standalone: 'Outros PC'
};
const GROUP_ORDER: GamePlatform[] = ['steam', 'standalone', 'emulator', 'gog', 'epic', 'riot', 'xbox'];

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function loadWidth(): number {
  try {
    const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (!isNaN(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH) return saved;
  } catch {
    // ignore
  }
  return DEFAULT_WIDTH;
}

const GameIcon: React.FC<{ game: Game }> = ({ game }) => {
  const [failed, setFailed] = useState(false);
  const src = game.media?.iconUrl || game.media?.coverUrl;
  if (!src || failed) {
    return (
      <span className="w-5 h-5 rounded-sm bg-slate-800 flex items-center justify-center flex-shrink-0">
        <Gamepad2 className="w-3 h-3 text-slate-500" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`w-5 h-5 rounded-sm flex-shrink-0 ${game.media?.iconUrl ? 'object-contain' : 'object-cover object-top'}`}
    />
  );
};

const GameRow: React.FC<{
  game: Game;
  selected: boolean;
  onOpen: () => void;
  onLaunch: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}> = ({ game, selected, onOpen, onLaunch, onContextMenu }) => {
  const state = useLibraryStore((s) => s.launchStatuses[game.id]?.state);
  const hasPlaytime = (game.totalPlaytimeSeconds ?? 0) >= 60;

  return (
    <button
      onClick={onOpen}
      onDoubleClick={onLaunch}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(e);
        }
      }}
      title={`${game.title} — clique duplo para jogar, botão direito para opções`}
      className={`w-full flex items-center gap-2.5 pl-5 pr-3 py-1 text-left text-[13px] transition-colors ${focusRing} ${
        selected
          ? 'bg-indigo-500/25 text-white'
          : state === 'running'
            ? 'text-emerald-300 hover:bg-slate-800/70'
            : hasPlaytime
              ? 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-300'
      }`}
    >
      <GameIcon game={game} />
      <span className="truncate flex-1">{game.title}</span>
      {state === 'running' && <span className="text-[10px] font-semibold text-emerald-400 flex-shrink-0">Jogando</span>}
      {state === 'launching' && <span className="text-[10px] text-slate-400 flex-shrink-0">Iniciando</span>}
    </button>
  );
};

export const LibrarySidebar: React.FC<LibrarySidebarProps> = ({
  games,
  filters,
  activeFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  searchInputRef,
  selectedGameId,
  isHome,
  onHome,
  onOpenGame,
  onLaunchGame,
  onContextMenu
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [width, setWidth] = useState<number>(loadWidth);

  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setWidth(nextWidth);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      const finalDelta = upEvent.clientX - startX;
      const finalWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + finalDelta));
      try {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(finalWidth));
      } catch {
        // ignore
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Preferência só desta sessão
      }
      return next;
    });

  // Favoritos no topo, depois um grupo por plataforma (como as categorias da Steam), em ordem alfabética
  const groups = useMemo(() => {
    const byTitle = (a: Game, b: Game) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
    const result: { key: string; label: string; games: Game[]; favorite?: boolean }[] = [];
    const favorites = games.filter((g) => g.isFavorite).sort(byTitle);
    if (favorites.length > 0 && activeFilter !== 'favorites') {
      result.push({ key: 'favorites', label: 'Favoritos', games: favorites, favorite: true });
    }
    for (const platform of GROUP_ORDER) {
      const list = games.filter((g) => g.platform === platform).sort(byTitle);
      if (list.length > 0) result.push({ key: platform, label: GROUP_LABEL[platform], games: list });
    }
    return result;
  }, [games, activeFilter]);

  return (
    <aside
      style={{ width: `${width}px` }}
      className="relative flex-shrink-0 flex flex-col bg-[#0b0d14] border-r border-slate-800/80 min-h-0 select-none"
    >
      {/* Alça de redimensionamento da lista lateral (220px a 420px) */}
      <div
        onPointerDown={handleResizeStart}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors z-20"
        title="Arrastar para redimensionar lista lateral"
      />

      <div className="p-2.5 space-y-2 border-b border-slate-800/80">
        <button
          onClick={onHome}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${focusRing} ${
            isHome ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Home className="w-3.5 h-3.5" /> Início da biblioteca
        </button>
        <select
          value={activeFilter}
          onChange={(e) => onFilterChange(e.target.value as LibraryFilter)}
          className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-indigo-500"
          aria-label="Filtrar por plataforma"
        >
          {filters.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar na biblioteca"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-1.5" aria-label="Jogos">
        {groups.length === 0 && <p className="px-4 py-6 text-xs text-slate-500 text-center">Nenhum jogo encontrado.</p>}
        {groups.map((group) => {
          // Buscando, mostra tudo aberto para não esconder resultados
          const isCollapsed = !searchQuery.trim() && collapsed[group.key];
          return (
            <section key={group.key}>
              <button
                onClick={() => toggleGroup(group.key)}
                className={`w-full flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 ${focusRing}`}
              >
                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {group.favorite && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                {group.label}
                <span className="font-medium text-slate-600">({group.games.length})</span>
              </button>
              {!isCollapsed &&
                group.games.map((game) => (
                  <GameRow
                    key={`${group.key}-${game.id}`}
                    game={game}
                    selected={!isHome && game.id === selectedGameId}
                    onOpen={() => onOpenGame(game)}
                    onLaunch={() => onLaunchGame(game)}
                    onContextMenu={(e) => onContextMenu?.(game, e)}
                  />
                ))}
            </section>
          );
        })}
      </nav>
    </aside>
  );
};
