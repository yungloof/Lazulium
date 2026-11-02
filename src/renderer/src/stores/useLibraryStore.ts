import { create } from 'zustand';
import { Game, GamePlatform } from '@shared/types/game';
import { GameLaunchStatus } from '@shared/types/ipc';

interface LibraryState {
  games: Game[];
  selectedGameId: string | null;
  activeFilter: 'all' | GamePlatform | 'favorites';
  searchQuery: string;
  isScanning: boolean;
  launchStatuses: Record<string, GameLaunchStatus>; // Apenas jogos iniciando/rodando
  
  // Actions
  setGames: (games: Game[]) => void;
  setSelectedGameId: (id: string | null) => void;
  setActiveFilter: (filter: 'all' | GamePlatform | 'favorites') => void;
  setSearchQuery: (query: string) => void;
  setIsScanning: (scanning: boolean) => void;
  toggleFavoriteLocal: (id: string) => void;
  applyGameStatus: (status: GameLaunchStatus) => void;
  upsertGameLocal: (game: Game) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  games: [],
  selectedGameId: null,
  activeFilter: 'all',
  searchQuery: '',
  isScanning: false,
  launchStatuses: {},

  setGames: (games) => set({ games }),
  setSelectedGameId: (id) => set({ selectedGameId: id }),
  setActiveFilter: (activeFilter) => set({ activeFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsScanning: (isScanning) => set({ isScanning }),
  toggleFavoriteLocal: (id) =>
    set((state) => ({
      games: state.games.map((g) => (g.id === id ? { ...g, isFavorite: !g.isFavorite } : g))
    })),
  upsertGameLocal: (game) =>
    set((state) => {
      const exists = state.games.some((g) => g.id === game.id);
      return {
        games: exists
          ? state.games.map((g) => (g.id === game.id ? { ...game, isRunning: g.isRunning } : g))
          : [...state.games, game]
      };
    }),
  applyGameStatus: (status) =>
    set((state) => {
      const launchStatuses = { ...state.launchStatuses };
      if (status.state === 'stopped') delete launchStatuses[status.gameId];
      else launchStatuses[status.gameId] = status;

      const games = state.games.map((g) => {
        if (g.id !== status.gameId) return g;
        // Ao encerrar, o main envia o registro com o playtime já atualizado
        const base = status.game ? { ...status.game, isFavorite: g.isFavorite } : g;
        return { ...base, isRunning: status.isRunning };
      });
      return { launchStatuses, games };
    })
}));
