import { useEffect, useMemo } from 'react';
import { Game, GamePlatform } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { LibrarySort, LibraryStatusFilter, useLibraryViewStore } from '../stores/useLibraryViewStore';

export type LibraryFilter = 'all' | GamePlatform | 'favorites';

export const LIBRARY_FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: 'Todos os jogos' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic Games' },
  { id: 'gog', label: 'GOG Galaxy' },
  { id: 'emulator', label: 'Emuladores' },
  { id: 'riot', label: 'Riot' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'standalone', label: 'Outros PC' }
];

// Texto estável com as plataformas presentes: favoritar um jogo não recria a lista de filtros
const platformsKey = (games: Game[]): string => {
  const found = new Set<string>();
  for (const game of games) found.add(game.platform);
  return [...found].sort().join(',');
};

// Só oferece filtros de plataformas que têm jogos
export function useVisibleFilters(): { id: LibraryFilter; label: string }[] {
  const key = useLibraryStore((s) => platformsKey(s.games));
  return useMemo(() => {
    const present = key.split(',');
    return LIBRARY_FILTERS.filter((f) => f.id === 'all' || f.id === 'favorites' || present.includes(f.id));
  }, [key]);
}

// O filtro de uma plataforma que saiu da biblioteca volta para "Todos"
export function useFilterGuard(): void {
  const filters = useVisibleFilters();
  const activeFilter = useLibraryStore((s) => s.activeFilter);
  const hasGames = useLibraryStore((s) => s.games.length > 0);
  const setActiveFilter = useLibraryStore((s) => s.setActiveFilter);
  useEffect(() => {
    if (hasGames && activeFilter !== 'all' && !filters.some((f) => f.id === activeFilter)) setActiveFilter('all');
  }, [filters, activeFilter, hasGames, setActiveFilter]);
}

export function filterGames(games: Game[], filter: LibraryFilter, query: string, showRemoved: boolean): Game[] {
  const q = query.trim().toLowerCase();
  return games.filter((game) => {
    if (game.isHidden) return false;
    // Desinstalados saem das listas (seguem no Diário), mas aparecem ao buscar pelo nome
    if (game.isInstalled === false && !showRemoved && !q) return false;
    if (filter === 'favorites' && !game.isFavorite) return false;
    if (filter !== 'all' && filter !== 'favorites' && game.platform !== filter) return false;
    if (q) return game.title.toLowerCase().includes(q) || game.tags?.some((t) => t.toLowerCase().includes(q));
    return true;
  });
}

// Jogos da plataforma/busca atuais (lista lateral e base da grade)
export function useFilteredGames(query: string): Game[] {
  const games = useLibraryStore((s) => s.games);
  const activeFilter = useLibraryStore((s) => s.activeFilter);
  const showRemoved = useLibraryViewStore((s) => s.showRemoved);
  return useMemo(() => filterGames(games, activeFilter, query, showRemoved), [games, activeFilter, query, showRemoved]);
}

const byTitle = (a: Game, b: Game) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });

const COMPARE: Record<LibrarySort, (a: Game, b: Game) => number> = {
  title: byTitle,
  recent: (a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '') || byTitle(a, b),
  hours: (a, b) => (b.totalPlaytimeSeconds ?? 0) - (a.totalPlaytimeSeconds ?? 0) || byTitle(a, b),
  added: (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || byTitle(a, b),
  rating: (a, b) => (b.log?.rating ?? 0) - (a.log?.rating ?? 0) || byTitle(a, b)
};

export function sortLibrary(games: Game[], sort: LibrarySort, status: LibraryStatusFilter): Game[] {
  return games
    .filter((g) => status === 'all' || (status === 'unplayed' ? (g.totalPlaytimeSeconds ?? 0) < 60 : g.log?.status === status))
    .sort(COMPARE[sort]);
}

export { byTitle as compareByTitle };
