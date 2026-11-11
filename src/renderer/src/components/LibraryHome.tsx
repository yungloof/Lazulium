import React, { memo, useDeferredValue, useMemo, useRef, useState } from 'react';
import { ChevronDown, Clock, Cpu, Dices, EyeOff, FilterX, Gamepad2, Layers, Loader2, Play, Plus, RefreshCw, Search, Sparkles } from 'lucide-react';
import { Game } from '@shared/types/game';
import { LOG_STATUS } from './GameLogFields';
import { GameCard } from './GameCard';
import { Select, SelectOption } from './Select';
import { pickSuggestion } from '../utils/suggestGame';
import { useLibraryStore } from '../stores/useLibraryStore';
import { GRID_DENSITY, GridDensity, LibrarySort, LibraryStatusFilter, useLibraryViewStore } from '../stores/useLibraryViewStore';
import { useUiStore } from '../stores/useUiStore';
import { sortLibrary, useFilteredGames } from '../hooks/useLibraryGames';
import { useGridColumns } from '../hooks/useGridColumns';
import { formatLastPlayed, formatPlaytimeShort } from '../utils/format';
import { launchGame, openContextMenu, openGame, scanLibraries, skipSuggestion } from '../utils/gameActions';
import { Button, EmptyState, SectionHeader, Skeleton, compactSelectClass, focusRing, segmentClass, segmentedClass } from './ui';

export type { LibrarySort, LibraryStatusFilter } from '../stores/useLibraryViewStore';

const SORT_OPTIONS: SelectOption<LibrarySort>[] = [
  { value: 'title', label: 'Nome' },
  { value: 'recent', label: 'Jogados por último' },
  { value: 'hours', label: 'Mais jogados' },
  { value: 'added', label: 'Adicionados por último' },
  { value: 'rating', label: 'Melhor nota' }
];

const STATUS_OPTIONS: SelectOption<LibraryStatusFilter>[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'unplayed', label: 'Nunca jogados' },
  ...LOG_STATUS.map((s) => ({ value: s.id as LibraryStatusFilter, label: s.label, dot: s.dot }))
];

const MINI_CARD_WIDTH = 280;

// --- Prateleira "Continuar jogando": o último jogo em destaque e os anteriores ao lado ---

const FeaturedTile = memo<{ game: Game; span: number }>(({ game, span }) => {
  const [heroFailed, setHeroFailed] = useState(false);
  const state = useLibraryStore((s) => s.launchStatuses[game.id]?.state);
  const hero = !heroFailed ? game.media?.heroUrl : undefined;
  const canPlay = !game.manualEntry && game.isInstalled !== false;

  return (
    <div
      data-game-id={game.id}
      tabIndex={0}
      role="button"
      aria-label={`Continuar: ${game.title}`}
      onClick={() => openGame(game)}
      onContextMenu={(e) => openContextMenu(game, e)}
      title={game.title}
      style={{ gridColumn: `span ${span}` }}
      className="group min-w-0 flex flex-col cursor-pointer rounded-lg focus:outline-none"
    >
      <div
        data-cover
        className="relative flex-1 min-h-[160px] overflow-hidden rounded-lg bg-slate-900 ring-1 ring-slate-800 shadow-md shadow-black/30 transition-[transform,box-shadow] duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/50 group-hover:ring-slate-600"
      >
        {hero ? (
          <img src={hero} alt="" decoding="async" onError={() => setHeroFailed(true)} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : game.media?.coverUrl ? (
          <img src={game.media.coverUrl} alt="" decoding="async" className="absolute inset-0 w-full h-full object-cover blur-xl scale-125 opacity-60" />
        ) : null}
        <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />
        <span className="absolute left-4 right-4 bottom-4 flex items-end justify-between gap-3">
          <span className="min-w-0">
            {game.media?.logoUrl ? (
              <img src={game.media.logoUrl} alt="" decoding="async" className="max-h-16 max-w-[70%] object-contain object-left drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]" />
            ) : (
              <span className="block font-display text-xl font-bold leading-tight text-white drop-shadow line-clamp-2">{game.title}</span>
            )}
            <span className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-200">
              <Clock className="w-3 h-3" /> {formatLastPlayed(game.lastPlayedAt)}
              <span className="text-slate-400">·</span>
              {formatPlaytimeShort(game.totalPlaytimeSeconds, game.lastPlayedAt)}
            </span>
          </span>
          {canPlay && state !== 'running' && (
            <button
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                void launchGame(game);
              }}
              aria-label={`Jogar ${game.title}`}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-bold shadow-lg shadow-black/40 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> JOGAR
            </button>
          )}
          {state === 'running' && (
            <span className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Jogando
            </span>
          )}
        </span>
      </div>
      <h3 data-cover-title className="mt-2 text-[13px] font-medium leading-tight text-slate-100 truncate">
        Continuar de onde parou
      </h3>
      <p className="mt-1 text-[11px] text-slate-400 truncate">{game.title}</p>
    </div>
  );
});
FeaturedTile.displayName = 'FeaturedTile';

const ContinueShelf: React.FC<{ recent: Game[] }> = ({ recent }) => {
  const density = useLibraryViewStore((s) => s.density);
  const { minWidth, gap } = GRID_DENSITY[density];
  const [ref, columns] = useGridColumns<HTMLDivElement>(minWidth, gap);
  const featuredSpan = Math.min(2, Math.max(1, columns));
  const others = columns > featuredSpan ? recent.slice(1, 1 + columns - featuredSpan) : [];

  return (
    <section>
      <SectionHeader icon={Clock} title="Continuar jogando" />
      <div ref={ref} className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`, gap }}>
        {columns > 0 && (
          <>
            <FeaturedTile key={recent[0].id} game={recent[0]} span={featuredSpan} />
            {others.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </>
        )}
      </div>
    </section>
  );
};

// --- "O que jogar agora": quem está com status Jogando e uma sugestão da biblioteca ---

const PlayingCard = memo<{ game: Game }>(({ game }) => (
  <button
    onClick={() => openGame(game)}
    onContextMenu={(e) => openContextMenu(game, e)}
    title={game.title}
    className={`group min-w-0 flex items-center gap-3 p-3 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-slate-600 hover:bg-slate-900 transition-colors text-left ${focusRing}`}
  >
    <span className="w-12 aspect-[2/3] flex-shrink-0 overflow-hidden rounded-md bg-slate-800 flex items-center justify-center">
      {game.media?.coverUrl ? <img src={game.media.coverUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain" /> : <Gamepad2 className="w-4 h-4 text-slate-500" />}
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-medium text-slate-100 group-hover:text-white truncate">{game.title}</span>
      <span className="mt-1 flex items-center gap-1.5 text-xs text-emerald-300">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Jogando
      </span>
      <span className="block mt-0.5 text-xs text-slate-400 tabular-nums">{(game.totalPlaytimeSeconds ?? 0) >= 60 ? `${formatPlaytimeShort(game.totalPlaytimeSeconds, game.lastPlayedAt)} até agora` : 'Sem horas registradas ainda'}</span>
    </span>
  </button>
));
PlayingCard.displayName = 'PlayingCard';

const NowPlaying: React.FC<{ games: Game[] }> = ({ games }) => {
  const [roll, setRoll] = useState(0);
  const [ref, columns] = useGridColumns<HTMLDivElement>(MINI_CARD_WIDTH, 16);
  const playing = useMemo(() => games.filter((g) => g.log?.status === 'playing'), [games]);

  // A sugestão só muda quando pedem outra (ou quando a atual sai da lista), não a cada atualização da biblioteca
  const suggestionRef = useRef<{ roll: number; gameId: string } | null>(null);
  const suggestion = useMemo(() => {
    const previous = suggestionRef.current;
    const candidate = previous?.roll === roll ? games.find((g) => g.id === previous.gameId && !g.skipSuggestions) : undefined;
    const next = candidate ? pickSuggestion([candidate]) : pickSuggestion(games, previous?.gameId);
    suggestionRef.current = next ? { roll, gameId: next.game.id } : null;
    return next;
  }, [games, roll]);

  if (playing.length === 0 && !suggestion) return null;
  const room = Math.max(1, columns) - (suggestion ? 1 : 0);

  return (
    <section>
      <SectionHeader icon={Sparkles} title="O que jogar agora" />
      <div ref={ref} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}>
        {columns > 0 &&
          playing.slice(0, room).map((game) => <PlayingCard key={game.id} game={game} />)}
        {columns > 0 && suggestion && (
          <div className="min-w-0 flex items-center gap-3 p-3 rounded-lg bg-gradient-to-br from-indigo-500/15 to-slate-900/70 border border-indigo-400/25">
            <span className="w-12 aspect-[2/3] flex-shrink-0 overflow-hidden rounded-md bg-slate-800 flex items-center justify-center">
              {suggestion.game.media?.coverUrl ? (
                <img src={suggestion.game.media.coverUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain" />
              ) : (
                <Gamepad2 className="w-4 h-4 text-slate-500" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Sugestão</p>
              <p className="text-sm font-medium text-slate-100 truncate" title={suggestion.game.title}>
                {suggestion.game.title}
              </p>
              <p className="text-xs text-slate-400 truncate">{suggestion.reason}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <Button variant="primary" onClick={() => openGame(suggestion.game)} className="!px-2.5 !py-1">
                  <Play className="w-3 h-3" /> Abrir
                </Button>
                <Button onClick={() => setRoll((n) => n + 1)} className="!px-2.5 !py-1">
                  <Dices className="w-3 h-3" /> Outro
                </Button>
                <Button onClick={() => skipSuggestion(suggestion.game)} title="Não sugerir este de novo" aria-label="Não sugerir este de novo" className="!p-1.5">
                  <EyeOff className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

// --- Grade de todos os jogos ---

const GridToolbar: React.FC = () => {
  const sort = useLibraryViewStore((s) => s.sort);
  const setSort = useLibraryViewStore((s) => s.setSort);
  const statusFilter = useLibraryViewStore((s) => s.statusFilter);
  const setStatusFilter = useLibraryViewStore((s) => s.setStatusFilter);
  const density = useLibraryViewStore((s) => s.density);
  const setDensity = useLibraryViewStore((s) => s.setDensity);
  return (
    <>
      <Select value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} ariaLabel="Filtrar por status" className={compactSelectClass}>
        {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label}
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </Select>
      <Select value={sort} options={SORT_OPTIONS} onChange={setSort} ariaLabel="Ordenar a biblioteca" className={compactSelectClass}>
        {SORT_OPTIONS.find((o) => o.value === sort)?.label}
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </Select>
      <div className={segmentedClass} role="group" aria-label="Tamanho das capas">
        {(Object.keys(GRID_DENSITY) as GridDensity[]).map((d) => (
          <button key={d} onClick={() => setDensity(d)} aria-pressed={density === d} className={segmentClass(density === d)}>
            {GRID_DENSITY[d].label}
          </button>
        ))}
      </div>
    </>
  );
};

const GridSkeleton: React.FC<{ count?: number }> = ({ count = 18 }) => {
  const density = useLibraryViewStore((s) => s.density);
  const { minWidth, gap } = GRID_DENSITY[density];
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[2/3] rounded-lg" />
          <Skeleton className="mt-2 h-3 w-3/4" />
          <Skeleton className="mt-1.5 h-2.5 w-1/3" />
        </div>
      ))}
    </div>
  );
};

const LoadingHome: React.FC = () => (
  <div className="px-8 py-7 space-y-9">
    <span role="status" className="sr-only">
      Carregando a biblioteca
    </span>
    <div>
      <Skeleton className="w-44 h-5 mb-4" />
      <Skeleton className="h-[240px] rounded-lg" />
    </div>
    <div>
      <Skeleton className="w-36 h-5 mb-4" />
      <GridSkeleton />
    </div>
  </div>
);

// Biblioteca vazia: primeira abertura ou nada detectado
const EmptyLibrary: React.FC = () => {
  const isScanning = useLibraryStore((s) => s.isScanning);
  const openModal = useUiStore((s) => s.openModal);
  if (isScanning) {
    return (
      <EmptyState
        icon={Loader2}
        title="Procurando seus jogos"
        description="Steam, Epic, GOG, Xbox, Riot e emuladores. Leva poucos segundos e as capas chegam logo depois."
        className="[&_svg]:animate-spin"
      />
    );
  }
  return (
    <EmptyState
      icon={Gamepad2}
      title="Sua biblioteca está vazia"
      description="O Lazulium encontra os jogos instalados da Steam, Epic, GOG, Xbox e Riot. Jogos soltos e emuladores você adiciona aqui também."
      actions={
        <>
          <Button variant="primary" size="md" data-nav-start onClick={() => void scanLibraries()}>
            <RefreshCw className="w-3.5 h-3.5" /> Procurar jogos
          </Button>
          <Button size="md" onClick={() => openModal({ kind: 'addGame' })}>
            <Plus className="w-3.5 h-3.5" /> Adicionar jogo
          </Button>
          <Button size="md" onClick={() => openModal({ kind: 'emulators' })}>
            <Cpu className="w-3.5 h-3.5" /> Emuladores
          </Button>
        </>
      }
    />
  );
};

export const LibraryHome: React.FC = () => {
  const isLoaded = useLibraryStore((s) => s.isLoaded);
  const hasAnyGame = useLibraryStore((s) => s.games.length > 0);
  const activeFilter = useLibraryStore((s) => s.activeFilter);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const sort = useLibraryViewStore((s) => s.sort);
  const statusFilter = useLibraryViewStore((s) => s.statusFilter);
  const density = useLibraryViewStore((s) => s.density);
  // A grade acompanha a digitação da busca sem travar o campo
  const deferredQuery = useDeferredValue(searchQuery);
  const filtered = useFilteredGames(deferredQuery);
  const games = useMemo(() => sortLibrary(filtered, sort, statusFilter), [filtered, sort, statusFilter]);
  const isFiltered = activeFilter !== 'all' || !!deferredQuery.trim() || statusFilter !== 'all';

  const recent = useMemo(
    () =>
      isFiltered
        ? []
        : filtered
            .filter((g) => g.lastPlayedAt && !g.isSoftware)
            .sort((a, b) => b.lastPlayedAt!.localeCompare(a.lastPlayedAt!))
            .slice(0, 12),
    [filtered, isFiltered]
  );

  if (!isLoaded) return <LoadingHome />;
  if (!hasAnyGame) {
    return (
      <div className="min-h-full flex items-center justify-center px-8">
        <EmptyLibrary />
      </div>
    );
  }

  const clearFilters = () => {
    const library = useLibraryStore.getState();
    library.setSearchQuery('');
    library.setActiveFilter('all');
    useLibraryViewStore.getState().setStatusFilter('all');
  };

  const { minWidth, gap } = GRID_DENSITY[density];

  return (
    <div className="px-8 py-7 space-y-10 animate-fade-in">
      {recent.length > 0 && <ContinueShelf recent={recent} />}

      {!isFiltered && <NowPlaying games={filtered} />}

      <section>
        <SectionHeader
          icon={isFiltered ? Search : Layers}
          title={deferredQuery.trim() ? `Resultados para “${deferredQuery.trim()}”` : isFiltered ? 'Resultados' : 'Todos os jogos'}
          count={games.length}
          actions={<GridToolbar />}
        />

        {games.length > 0 ? (
          <div className="grid pb-6" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap }}>
            {games.map((game, index) => (
              <GameCard key={game.id} game={game} navStart={isFiltered && index === 0} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30">
            <EmptyState
              icon={FilterX}
              title="Nenhum jogo encontrado"
              description={
                deferredQuery.trim()
                  ? 'Confira o nome ou tente as iniciais. Jogos não instalados também aparecem na busca.'
                  : 'Nenhum jogo combina com estes filtros. Se instalou algo agora, use Escanear no topo.'
              }
              actions={
                <Button variant="primary" size="md" data-nav-start onClick={clearFilters}>
                  <FilterX className="w-3.5 h-3.5" /> Limpar busca e filtros
                </Button>
              }
              compact
            />
          </div>
        )}
      </section>
    </div>
  );
};
