import { create } from 'zustand';
import { GameLogStatus } from '@shared/types/game';

// Preferências de exibição da biblioteca (lembradas entre execuções, menos o filtro de status)

export type LibrarySort = 'title' | 'recent' | 'hours' | 'added' | 'rating';
export type LibraryStatusFilter = 'all' | 'unplayed' | GameLogStatus;
export type GridDensity = 'compact' | 'normal' | 'large';

const SORT_KEY = 'lazulium.librarySort';
const SHOW_REMOVED_KEY = 'lazulium.showRemoved';
const DENSITY_KEY = 'lazulium.gridDensity';

const SORTS: LibrarySort[] = ['title', 'recent', 'hours', 'added', 'rating'];
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
  showRemoved: boolean;
  density: GridDensity;
  setSort: (sort: LibrarySort) => void;
  setStatusFilter: (filter: LibraryStatusFilter) => void;
  setShowRemoved: (show: boolean) => void;
  setDensity: (density: GridDensity) => void;
}

const savedSort = read(SORT_KEY) as LibrarySort | null;
const savedDensity = read(DENSITY_KEY) as GridDensity | null;

export const useLibraryViewStore = create<LibraryViewState>((set) => ({
  sort: savedSort && SORTS.includes(savedSort) ? savedSort : 'title',
  statusFilter: 'all',
  showRemoved: read(SHOW_REMOVED_KEY) === 'true',
  density: savedDensity && DENSITIES.includes(savedDensity) ? savedDensity : 'normal',
  setSort: (sort) => {
    write(SORT_KEY, sort);
    set({ sort });
  },
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setShowRemoved: (showRemoved) => {
    write(SHOW_REMOVED_KEY, String(showRemoved));
    set({ showRemoved });
  },
  setDensity: (density) => {
    write(DENSITY_KEY, density);
    set({ density });
  }
}));

// Largura mínima de cada capa por densidade: a grade preenche a linha com quantas couberem
export const GRID_DENSITY: Record<GridDensity, { label: string; minWidth: number; gap: number }> = {
  compact: { label: 'Compacto', minWidth: 112, gap: 12 },
  normal: { label: 'Padrão', minWidth: 144, gap: 16 },
  large: { label: 'Grande', minWidth: 190, gap: 20 }
};
