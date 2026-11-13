import { create } from 'zustand';
import { GameLogStatus, GamePlatform } from '@shared/types/game';

// Preferências de exibição da biblioteca (lembradas entre execuções, menos os filtros da barra)

export type LibrarySort = 'title' | 'recent' | 'hours' | 'added' | 'rating' | 'released';
export type LibraryStatusFilter = 'all' | 'unplayed' | GameLogStatus;
export type GridDensity = 'compact' | 'normal' | 'large';
export type SidebarGrouping = 'platform' | 'category';

const SORT_KEY = 'lazulium.librarySort';
const SHOW_REMOVED_KEY = 'lazulium.showRemoved';
const DENSITY_KEY = 'lazulium.gridDensity';
const GROUPING_KEY = 'lazulium.sidebarGrouping';

const SORTS: LibrarySort[] = ['title', 'recent', 'hours', 'added', 'rating', 'released'];
const DENSITIES: GridDensity[] = ['compact', 'normal', 'large'];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferência só desta sessão
  }
}

interface LibraryViewState {
  sort: LibrarySort;
  statusFilter: LibraryStatusFilter;
  platformFilter: 'all' | GamePlatform;
  genreFilter: string;
  seriesFilter: string;
  yearFilter: string;
  showRemoved: boolean;
  density: GridDensity;
  sidebarGrouping: SidebarGrouping | null; // null: ainda não escolheu (categorias assim que existir uma)
  setSort: (sort: LibrarySort) => void;
  setStatusFilter: (filter: LibraryStatusFilter) => void;
  setPlatformFilter: (filter: 'all' | GamePlatform) => void;
  setGenreFilter: (filter: string) => void;
  setSeriesFilter: (filter: string) => void;
  setYearFilter: (filter: string) => void;
  resetAttributeFilters: () => void;
  setShowRemoved: (show: boolean) => void;
  setDensity: (density: GridDensity) => void;
  setSidebarGrouping: (grouping: SidebarGrouping) => void;
}

const savedSort = read(SORT_KEY) as LibrarySort | null;
const savedDensity = read(DENSITY_KEY) as GridDensity | null;
const savedGrouping = read(GROUPING_KEY);

export const useLibraryViewStore = create<LibraryViewState>((set) => ({
  sort: savedSort && SORTS.includes(savedSort) ? savedSort : 'title',
  statusFilter: 'all',
  platformFilter: 'all',
  genreFilter: 'all',
  seriesFilter: 'all',
  yearFilter: 'all',
  showRemoved: read(SHOW_REMOVED_KEY) === 'true',
  density: savedDensity && DENSITIES.includes(savedDensity) ? savedDensity : 'normal',
  setSort: (sort) => {
    write(SORT_KEY, sort);
    set({ sort });
  },
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setPlatformFilter: (platformFilter) => set({ platformFilter }),
  setGenreFilter: (genreFilter) => set({ genreFilter }),
  setSeriesFilter: (seriesFilter) => set({ seriesFilter }),
  setYearFilter: (yearFilter) => set({ yearFilter }),
  resetAttributeFilters: () => set({ statusFilter: 'all', platformFilter: 'all', genreFilter: 'all', seriesFilter: 'all', yearFilter: 'all' }),
  setShowRemoved: (showRemoved) => {
    write(SHOW_REMOVED_KEY, String(showRemoved));
    set({ showRemoved });
  },
  setDensity: (density) => {
    write(DENSITY_KEY, density);
    set({ density });
  },
  sidebarGrouping: savedGrouping === 'platform' || savedGrouping === 'category' ? savedGrouping : null,
  setSidebarGrouping: (sidebarGrouping) => {
    write(GROUPING_KEY, sidebarGrouping);
    set({ sidebarGrouping });
  }
}));

// Largura mínima de cada capa por densidade: a grade preenche a linha com quantas couberem
export const GRID_DENSITY: Record<GridDensity, { label: string; minWidth: number; gap: number }> = {
  compact: { label: 'Compacto', minWidth: 112, gap: 12 },
  normal: { label: 'Padrão', minWidth: 144, gap: 16 },
  large: { label: 'Grande', minWidth: 190, gap: 20 }
};
