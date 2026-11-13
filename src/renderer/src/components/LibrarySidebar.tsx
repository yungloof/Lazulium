import React, { memo, useDeferredValue, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Gamepad2, Home, Plus, Search, Settings2, Star, X } from 'lucide-react';
import { Game, GamePlatform } from '@shared/types/game';
import { Select } from './Select';
import { useLibraryStore } from '../stores/useLibraryStore';
import { SidebarGrouping, useLibraryViewStore } from '../stores/useLibraryViewStore';
import { useCategoriesStore } from '../stores/useCategoriesStore';
import { useUiStore } from '../stores/useUiStore';
import { compareByTitle, LibraryFilter, UNCATEGORIZED_LABEL, useFilteredGames, useVisibleFilters } from '../hooks/useLibraryGames';
import { launchGame, openContextMenu, openGame } from '../utils/gameActions';
import { PLATFORM_GROUP } from '../utils/platform';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { isGameDrag, readGameDrag, startGameDrag } from '../utils/dragGame';
import { Skeleton, compactInputClass, compactSelectClass, focusRing, focusRingInset, iconButtonClass, segmentClass, segmentedClass } from './ui';

export type { LibraryFilter } from '../hooks/useLibraryGames';

const COLLAPSED_STORAGE_KEY = 'lazulium.sidebarCollapsed';
const SIDEBAR_WIDTH_KEY = 'lazulium.sidebarWidth';
const DEFAULT_WIDTH = 288;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;

const GROUPINGS: { id: SidebarGrouping; label: string }[] = [
  { id: 'category', label: 'Categorias' },
  { id: 'platform', label: 'Plataformas' }
];

interface SidebarGroup {
  key: string;
  label: string;
  games: Game[];
  favorite?: boolean;
  categoryId?: string;              // Grupo de uma categoria do jogador: aceita jogos arrastados
  uncategorized?: boolean;          // Soltar aqui tira o jogo da categoria de onde ele veio
}

const openCategories = () => useUiStore.getState().openModal({ kind: 'categories' });

const GROUP_ORDER: GamePlatform[] = ['steam', 'standalone', 'emulator', 'gog', 'epic', 'riot', 'xbox', 'battlenet', 'ea', 'ubisoft'];

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
    // Sem armazenamento: largura padrão
  }
  return DEFAULT_WIDTH;
}

const GameIcon: React.FC<{ game: Game }> = ({ game }) => {
  const src = game.media?.iconUrl || game.media?.coverUrl;
  // Guarda qual URL falhou: trocar a arte (nova URL) volta a mostrar a imagem
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) {
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
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={`w-5 h-5 rounded-sm flex-shrink-0 ${game.media?.iconUrl ? 'object-contain' : 'object-cover object-top'}`}
    />
  );
};

// Linha memorizada: favoritar ou atualizar um jogo só redesenha a linha dele
const GameRow = memo<{ game: Game; selected: boolean; categoryId?: string }>(({ game, selected, categoryId }) => {
  const state = useLibraryStore((s) => s.launchStatuses[game.id]?.state);
  const hasPlaytime = (game.totalPlaytimeSeconds ?? 0) >= 60;
  const removed = game.isInstalled === false;

  return (
    <button
      onClick={() => openGame(game)}
      onDoubleClick={() => void launchGame(game)}
      onContextMenu={(e) => openContextMenu(game, e)}
      draggable
      onDragStart={(e) => startGameDrag(e, game.id, categoryId)}
      aria-current={selected ? 'page' : undefined}
      title={`${game.title} — clique duplo para jogar, botão direito para opções`}
      className={`group relative w-[calc(100%-0.75rem)] mx-1.5 flex items-center gap-2.5 pl-3.5 pr-2.5 py-[5px] rounded-md text-left text-[13px] transition-colors ${focusRingInset} ${
        selected
          ? 'bg-indigo-500/20 text-white'
          : state === 'running'
            ? 'text-emerald-300 hover:bg-slate-800/70'
            : hasPlaytime && !removed
              ? 'text-slate-200 hover:bg-slate-800/70 hover:text-white'
              : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
      }`}
    >
      {selected && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-indigo-400" />}
      <span className={removed ? 'opacity-50 grayscale' : undefined}>
        <GameIcon game={game} />
      </span>
      <span className="truncate flex-1">{game.title}</span>
      {state === 'running' && (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Jogando
        </span>
      )}
      {state === 'launching' && <span className="text-[10px] text-slate-400 flex-shrink-0">Iniciando</span>}
    </button>
  );
});
GameRow.displayName = 'GameRow';

const SidebarSkeleton: React.FC = () => (
  <div className="px-3 py-2 space-y-2.5" aria-hidden="true">
    <Skeleton className="w-24 h-3 mt-2" />
    {Array.from({ length: 14 }, (_, i) => (
      <div key={i} className="flex items-center gap-2.5">
        <Skeleton className="w-5 h-5 rounded-sm" />
        <Skeleton className="h-3.5" style={{ width: `${45 + ((i * 37) % 45)}%` }} />
      </div>
    ))}
  </div>
);

export const LibrarySidebar: React.FC = () => {
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery);
  const activeFilter = useLibraryStore((s) => s.activeFilter);
  const setActiveFilter = useLibraryStore((s) => s.setActiveFilter);
  const isLoaded = useLibraryStore((s) => s.isLoaded);
  const showRemoved = useLibraryViewStore((s) => s.showRemoved);
  const setShowRemoved = useLibraryViewStore((s) => s.setShowRemoved);
  const view = useUiStore((s) => s.view);
  const selectedGameId = useUiStore((s) => s.selectedGameId);
  const filters = useVisibleFilters();
  // A lista acompanha a digitação sem travar o campo
  const deferredQuery = useDeferredValue(searchQuery);
  const games = useFilteredGames(deferredQuery);
  const isHome = view === 'home';

  const categories = useCategoriesStore((s) => s.categories);
  const savedGrouping = useLibraryViewStore((s) => s.sidebarGrouping);
  const setSidebarGrouping = useLibraryViewStore((s) => s.setSidebarGrouping);
  // Quem ainda não escolheu passa a ver por categoria assim que cria a primeira
  const grouping: SidebarGrouping = savedGrouping ?? (categories.length > 0 ? 'category' : 'platform');
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [width, setWidth] = useState<number>(loadWidth);

  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const clampWidth = (x: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + x - startX));

    const onPointerMove = (moveEvent: PointerEvent) => setWidth(clampWidth(moveEvent.clientX));
    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      try {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clampWidth(upEvent.clientX)));
      } catch {
        // Preferência só desta sessão
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

  const searching = !!searchQuery.trim();

  // Favoritos no topo; depois as categorias do jogador (e o que sobrou em "Sem categoria") ou um grupo por plataforma
  const groups = useMemo(() => {
    const result: SidebarGroup[] = [];
    const sorted = [...games].sort(compareByTitle);
    const favorites = sorted.filter((g) => g.isFavorite);
    if (favorites.length > 0 && activeFilter !== 'favorites') {
      result.push({ key: 'favorites', label: 'Favoritos', games: favorites, favorite: true });
    }
    if (grouping === 'platform') {
      for (const platform of GROUP_ORDER) {
        const list = sorted.filter((g) => g.platform === platform);
        if (list.length > 0) result.push({ key: platform, label: PLATFORM_GROUP[platform], games: list });
      }
      return result;
    }
    // Categoria vazia só aparece com a biblioteca inteira à vista: serve de destino para arrastar
    const showEmpty = activeFilter === 'all' && !searching;
    const categorized = new Set<string>();
    for (const category of categories) {
      const ids = new Set(category.gameIds);
      for (const id of ids) categorized.add(id);
      const list = sorted.filter((g) => ids.has(g.id));
      if (list.length > 0 || showEmpty) result.push({ key: `category:${category.id}`, label: category.name, games: list, categoryId: category.id });
    }
    const rest = sorted.filter((g) => !categorized.has(g.id));
    if (rest.length > 0) result.push({ key: 'uncategorized', label: UNCATEGORIZED_LABEL, games: rest, uncategorized: true });
    return result;
  }, [games, activeFilter, grouping, categories, searching]);

  // Soltar numa categoria põe o jogo nela (ele continua nas outras); soltar em "Sem categoria" tira da categoria de onde veio
  const handleDrop = (group: SidebarGroup, e: React.DragEvent) => {
    setDropTarget(null);
    const drag = readGameDrag(e);
    if (!drag) return;
    e.preventDefault();
    const store = useCategoriesStore.getState();
    const title = useLibraryStore.getState().games.find((g) => g.id === drag.gameId)?.title ?? 'O jogo';
    const ui = useUiStore.getState();
    const task = group.categoryId
      ? group.categoryId === drag.fromCategoryId || store.categories.find((c) => c.id === group.categoryId)?.gameIds.includes(drag.gameId)
        ? null
        : store.setGames(group.categoryId, [drag.gameId], true).then(() => ui.showNotice({ text: `${title} entrou em ${group.label}.`, tone: 'ok' }))
      : drag.fromCategoryId
        ? store.setGames(drag.fromCategoryId, [drag.gameId], false)
        : null;
    task?.catch((err) => ui.showNotice({ text: ipcErrorMessage(err), tone: 'warn' }));
  };

  const acceptsDrop = (group: SidebarGroup) => !!group.categoryId || !!group.uncategorized;

  return (
    <aside
      style={{ width: `clamp(${MIN_WIDTH - 12}px, 25vw, ${width}px)` }}
      className="relative flex-shrink-0 flex flex-col bg-steam-sidebar border-r border-slate-800/80 min-h-0 select-none"
      aria-label="Biblioteca"
    >
      {/* Alça de redimensionamento da lista lateral (220px a 420px) */}
      <div
        onPointerDown={handleResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Largura da lista de jogos"
        className="absolute top-0 -right-px w-1.5 h-full cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors z-20"
        title="Arrastar para redimensionar a lista"
      />

      <div className="p-3 space-y-2 border-b border-slate-800/80">
        <button
          onClick={() => useUiStore.getState().goHome()}
          aria-current={isHome ? 'page' : undefined}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${focusRing} ${
            isHome ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
          }`}
        >
          <Home className="w-3.5 h-3.5" /> Início da biblioteca
        </button>
        <Select
          value={activeFilter}
          options={filters.map((f) => ({ value: f.id, label: f.label }))}
          onChange={(f: LibraryFilter) => setActiveFilter(f)}
          ariaLabel="Filtrar a biblioteca"
          className={`${compactSelectClass} w-full justify-between !text-xs !py-2`}
        >
          {filters.find((f) => f.id === activeFilter)?.label}
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </Select>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            data-library-search
            type="text"
            placeholder="Buscar na biblioteca"
            aria-label="Buscar na biblioteca"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`${compactInputClass} !py-2 pl-8 ${searching ? 'pr-8' : ''}`}
          />
          {searching && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Limpar busca"
              title="Limpar busca"
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 ${focusRing}`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 px-0.5 pt-0.5 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer select-none transition-colors">
          <input
            type="checkbox"
            checked={showRemoved}
            onChange={(e) => setShowRemoved(e.target.checked)}
            className={`w-3.5 h-3.5 accent-indigo-500 rounded-sm ${focusRing}`}
          />
          Mostrar não instalados
        </label>
        <div className="flex items-center gap-1.5 pt-0.5">
          <div className={`${segmentedClass} flex-1`} role="group" aria-label="Agrupar a lista por">
            {GROUPINGS.map((option) => (
              <button key={option.id} onClick={() => setSidebarGrouping(option.id)} aria-pressed={grouping === option.id} className={`${segmentClass(grouping === option.id)} flex-1 text-center`}>
                {option.label}
              </button>
            ))}
          </div>
          <button onClick={openCategories} title="Organizar categorias" aria-label="Organizar categorias" className={iconButtonClass}>
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto pb-3" aria-label="Jogos">
        {!isLoaded ? (
          <SidebarSkeleton />
        ) : groups.length === 0 && !(grouping === 'category' && !searching && activeFilter === 'all') ? (
          <div className="px-4 py-8 text-center space-y-2">
            <p className="text-xs text-slate-400">{searching ? `Nada com “${searchQuery.trim()}”.` : 'Nenhum jogo neste filtro.'}</p>
            {(searching || activeFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
                className={`text-xs font-semibold text-indigo-300 hover:text-white rounded-sm ${focusRing}`}
              >
                Ver todos os jogos
              </button>
            )}
          </div>
        ) : (
          <>
            {groups.map((group) => {
              // Buscando, mostra tudo aberto para não esconder resultados
              const isCollapsed = !searching && collapsed[group.key];
              const droppable = acceptsDrop(group);
              const isDropTarget = dropTarget === group.key;
              return (
                <section
                  key={group.key}
                  onDragOver={
                    droppable
                      ? (e) => {
                          if (!isGameDrag(e)) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = group.categoryId ? 'copy' : 'move';
                          if (dropTarget !== group.key) setDropTarget(group.key);
                        }
                      : undefined
                  }
                  onDragLeave={
                    droppable
                      ? (e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget((current) => (current === group.key ? null : current));
                        }
                      : undefined
                  }
                  onDrop={droppable ? (e) => handleDrop(group, e) : undefined}
                  className={isDropTarget ? 'rounded-lg bg-indigo-500/10 ring-1 ring-inset ring-indigo-400/60' : undefined}
                >
                  <button
                    onClick={() => toggleGroup(group.key)}
                    onContextMenu={
                      group.categoryId
                        ? (e) => {
                            e.preventDefault();
                            openCategories();
                          }
                        : undefined
                    }
                    aria-expanded={!isCollapsed}
                    title={group.categoryId ? `${group.label} — botão direito para organizar as categorias` : undefined}
                    className={`sticky top-0 z-10 w-full flex items-center gap-1.5 px-3 pt-3 pb-1.5 backdrop-blur-sm text-[11px] font-bold uppercase tracking-wider text-left text-slate-400 hover:text-slate-200 transition-colors ${
                      isDropTarget ? 'bg-transparent' : 'bg-steam-sidebar/95'
                    } ${focusRingInset}`}
                  >
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
                    {group.favorite && <Star className="w-3 h-3 flex-shrink-0 text-amber-400 fill-amber-400" />}
                    <span className="truncate">{group.label}</span>
                    <span className="font-medium text-slate-500 tabular-nums">{group.games.length}</span>
                  </button>
                  {!isCollapsed && group.games.length > 0 && (
                    <div className="space-y-px">
                      {group.games.map((game) => (
                        <GameRow key={`${group.key}-${game.id}`} game={game} selected={!isHome && game.id === selectedGameId} categoryId={group.categoryId} />
                      ))}
                    </div>
                  )}
                  {!isCollapsed && group.games.length === 0 && <p className="px-4 pb-1.5 text-[11px] text-slate-500">Arraste jogos para cá.</p>}
                </section>
              );
            })}
            {grouping === 'category' && !searching && (
              <div className="px-3 pt-3 space-y-2">
                {categories.length === 0 && (
                  <p className="text-[11px] leading-relaxed text-slate-400">Crie categorias para arrumar a biblioteca do seu jeito: por gênero, por série, o que jogar com a galera.</p>
                )}
                <button
                  onClick={openCategories}
                  className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-700 text-[11px] font-semibold text-slate-400 hover:text-white hover:border-slate-500 transition-colors ${focusRing}`}
                >
                  <Plus className="w-3.5 h-3.5" /> Nova categoria
                </button>
              </div>
            )}
          </>
        )}
      </nav>
    </aside>
  );
};
