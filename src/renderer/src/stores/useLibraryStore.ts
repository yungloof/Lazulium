import { create } from 'zustand';
import { Game, GamePlatform } from '@shared/types/game';

interface LibraryState {
  games: Game[];
  selectedGameId: string | null;
  activeFilter: 'all' | GamePlatform | 'favorites';
  searchQuery: string;
  isScanning: boolean;
  uiMode: 'desktop' | 'big-picture';
  
  // Actions
  setGames: (games: Game[]) => void;
  setSelectedGameId: (id: string | null) => void;
  setActiveFilter: (filter: 'all' | GamePlatform | 'favorites') => void;
  setSearchQuery: (query: string) => void;
  setIsScanning: (scanning: boolean) => void;
  setUiMode: (mode: 'desktop' | 'big-picture') => void;
  toggleFavoriteLocal: (id: string) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  games: [],
  selectedGameId: null,
  activeFilter: 'all',
  searchQuery: '',
  isScanning: false,
  uiMode: 'desktop',

  setGames: (games) => set({ games }),
  setSelectedGameId: (id) => set({ selectedGameId: id }),
  setActiveFilter: (activeFilter) => set({ activeFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsScanning: (isScanning) => set({ isScanning }),
  setUiMode: (uiMode) => set({ uiMode }),
  toggleFavoriteLocal: (id) =>
    set((state) => ({
      games: state.games.map((g) => (g.id === id ? { ...g, isFavorite: !g.isFavorite } : g))
    }))
}));
