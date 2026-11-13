import { useEffect, useMemo } from 'react';
import { Game, GamePlatform } from '@shared/types/game';
import { GameCategory } from '@shared/types/categories';
import { isGameInCategory } from '@shared/utils/categories';
import { LibraryFilter, useLibraryStore } from '../stores/useLibraryStore';
import { useCategoriesStore } from '../stores/useCategoriesStore';
import { LibrarySort, LibraryStatusFilter, useLibraryViewStore } from '../stores/useLibraryViewStore';

export type { LibraryFilter } from '../stores/useLibraryStore';

export interface LibraryAttributeFilters {
  platform?: 'all' | GamePlatform;
  genre?: string;
  series?: string;
  year?: string;
}

export const LIBRARY_FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: 'Todos os jogos' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic Games' },
  { id: 'gog', label: 'GOG Galaxy' },
  { id: 'emulator', label: 'Emuladores' },
  { id: 'riot', label: 'Riot' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'battlenet', label: 'Battle.net' },
  { id: 'ea', label: 'EA App' },
  { id: 'ubisoft', label: 'Ubisoft Connect' },
  { id: 'standalone', label: 'Outros PC' }
];

const CATEGORY_PREFIX = 'category:';
export const UNCATEGORIZED_LABEL = 'Sem categoria';

export const categoryFilter = (categoryId: string): LibraryFilter => `${CATEGORY_PREFIX}${categoryId}`;
export const categoryIdOf = (filter: LibraryFilter): string | null => (filter.startsWith(CATEGORY_PREFIX) ? filter.slice(CATEGORY_PREFIX.length) : null);

// Texto estável com as plataformas presentes: favoritar um jogo não recria a lista de filtros
const platformsKey = (games: Game[]): string => {
  const found = new Set<string>();
  for (const game of games) found.add(game.platform);
  return [...found].sort().join(',');
};

// Só oferece filtros de plataformas que têm jogos; as categorias do jogador vêm logo depois dos favoritos
export function useVisibleFilters(): { id: LibraryFilter; label: string }[] {
  const key = useLibraryStore((s) => platformsKey(s.games));
  const categories = useCategoriesStore((s) => s.categories);
  return useMemo(() => {
    const present = key.split(',');
    const [all, favorites, ...platforms] = LIBRARY_FILTERS;
    return [
      all,
      favorites,
      ...categories.map((c) => ({ id: categoryFilter(c.id), label: c.name })),
      ...(categories.length > 0 ? [{ id: 'uncategorized' as const, label: UNCATEGORIZED_LABEL }] : []),
      ...platforms.filter((f) => present.includes(f.id))
    ];
  }, [key, categories]);
}

// O filtro de uma plataforma que saiu da biblioteca (ou de uma categoria apagada) volta para "Todos"
export function useFilterGuard(): void {
  const filters = useVisibleFilters();
  const activeFilter = useLibraryStore((s) => s.activeFilter);
  const hasGames = useLibraryStore((s) => s.games.length > 0);
  const setActiveFilter = useLibraryStore((s) => s.setActiveFilter);
  useEffect(() => {
    if (hasGames && activeFilter !== 'all' && !filters.some((f) => f.id === activeFilter)) setActiveFilter('all');
  }, [filters, activeFilter, hasGames, setActiveFilter]);
}

export function filterGames(games: Game[], filter: LibraryFilter, query: string, showRemoved: boolean, categories: GameCategory[] = []): Game[] {
  const q = query.trim().toLowerCase();
  const categoryId = categoryIdOf(filter);
  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) ?? null : null;
  const checkUncategorized = filter === 'uncategorized';
  return games.filter((game) => {
    if (game.isHidden) return false;
    // Desinstalados saem das listas (seguem no Diário), mas aparecem ao buscar pelo nome
    if (game.isInstalled === false && !showRemoved && !q) return false;
    if (categoryId) {
      if (!selectedCategory || !isGameInCategory(game, selectedCategory)) return false;
    } else if (checkUncategorized) {
      if (categories.some((c) => isGameInCategory(game, c))) return false;
    } else if (filter === 'favorites') {
      if (!game.isFavorite) return false;
    } else if (filter !== 'all' && game.platform !== filter) return false;
    if (q) {
      return (
        game.title.toLowerCase().includes(q) ||
        game.tags?.some((t) => t.toLowerCase().includes(q)) ||
        game.genres?.some((g) => g.toLowerCase().includes(q)) ||
        Boolean(game.series && game.series.toLowerCase().includes(q))
      );
    }
    return true;
  });
}

// Jogos do filtro/busca atuais (lista lateral e base da grade)
export function useFilteredGames(query: string): Game[] {
  const games = useLibraryStore((s) => s.games);
  const activeFilter = useLibraryStore((s) => s.activeFilter);
  const showRemoved = useLibraryViewStore((s) => s.showRemoved);
  const categories = useCategoriesStore((s) => s.categories);
  // Só os filtros de categoria dependem delas: mexer numa categoria não refaz a grade de "Todos os jogos"
  const relevantCategories = activeFilter === 'uncategorized' || categoryIdOf(activeFilter) ? categories : undefined;
  return useMemo(() => filterGames(games, activeFilter, query, showRemoved, relevantCategories), [games, activeFilter, query, showRemoved, relevantCategories]);
}

const byTitle = (a: Game, b: Game) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });

const COMPARE: Record<LibrarySort, (a: Game, b: Game) => number> = {
  title: byTitle,
  recent: (a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '') || byTitle(a, b),
  hours: (a, b) => (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0) || byTitle(a, b),
  added: (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || byTitle(a, b),
  rating: (a, b) => (b.log?.rating ?? 0) - (a.log?.rating ?? 0) || byTitle(a, b),
  released: (a, b) => (b.releaseYear ?? -1) - (a.releaseYear ?? -1) || byTitle(a, b)
};

export function matchesYearFilter(releaseYear: number | undefined, yearFilter?: string): boolean {
  if (!yearFilter || yearFilter === 'all') return true;
  if (releaseYear === undefined) return false;
  if (yearFilter === 'older') return releaseYear < 1990;
  const decade = /^(\d{4})s$/.exec(yearFilter);
  if (decade) {
    const start = Number(decade[1]);
    return releaseYear >= start && releaseYear < start + 10;
  }
  return /^\d{4}$/.test(yearFilter) ? releaseYear === Number(yearFilter) : true;
}

export function sortLibrary(games: Game[], sort: LibrarySort, status: LibraryStatusFilter, attrs?: LibraryAttributeFilters): Game[] {
  const platform = attrs?.platform && attrs.platform !== 'all' ? attrs.platform : undefined;
  const genre = attrs?.genre && attrs.genre !== 'all' ? attrs.genre.toLowerCase() : undefined;
  const series = attrs?.series && attrs.series !== 'all' ? attrs.series.toLowerCase() : undefined;
  const year = attrs?.year && attrs.year !== 'all' ? attrs.year : undefined;

  return games
    .filter((g) => {
      if (status !== 'all' && !(status === 'unplayed' ? (g.totalPlaytimeSeconds ?? 0) < 60 : g.log?.status === status)) return false;
      if (platform && g.platform !== platform) return false;
      if (genre && !g.genres?.some((item) => item.toLowerCase() === genre)) return false;
      if (series && g.series?.toLowerCase() !== series) return false;
      if (year && !matchesYearFilter(g.releaseYear, year)) return false;
      return true;
    })
    .sort(COMPARE[sort]);
}

export { byTitle as compareByTitle };
