import { create } from 'zustand';
import { Game, GamePlatform } from '@shared/types/game';
import { GameLaunchStatus } from '@shared/types/ipc';

// Plataforma, favoritos, uma categoria do jogador (category:<id>) ou o que ficou fora de todas
export type LibraryFilter = 'all' | GamePlatform | 'favorites' | 'uncategorized' | `category:${string}`;

interface LibraryState {
  games: Game[];
  selectedGameId: string | null;
  activeFilter: LibraryFilter;
  searchQuery: string;
  isScanning: boolean;
  isSyncingAchievements: boolean;
  achievementsSyncError: string | null;
  achievementsSyncDone: boolean;    // Já buscou nesta execução: quem não tem conquistas não recebe o convite de novo
  launchStatuses: Record<string, GameLaunchStatus>; // Apenas jogos iniciando/rodando
  isLoaded: boolean;                // A primeira leitura da biblioteca terminou (antes disso a tela mostra o esqueleto)

  // Actions
  setGames: (games: Game[]) => void;
  setIsLoaded: (loaded: boolean) => void;
  setSelectedGameId: (id: string | null) => void;
  setActiveFilter: (filter: LibraryFilter) => void;
  setSearchQuery: (query: string) => void;
  setIsScanning: (scanning: boolean) => void;
  setIsSyncingAchievements: (syncing: boolean) => void;
  setAchievementsSyncError: (error: string | null) => void;
  setAchievementsSyncDone: (done: boolean) => void;
  toggleFavoriteLocal: (id: string) => void;
  applyGameStatus: (status: GameLaunchStatus) => void;
  upsertGameLocal: (game: Game) => void;
  upsertGamesLocal: (games: Game[]) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  games: [],
  selectedGameId: null,
  activeFilter: 'all',
  searchQuery: '',
  isScanning: false,
  isSyncingAchievements: false,
  achievementsSyncError: null,
  achievementsSyncDone: false,
  launchStatuses: {},
  isLoaded: false,

  setGames: (games) => set({ games }),
  setIsLoaded: (isLoaded) => set({ isLoaded }),
  setSelectedGameId: (id) => set({ selectedGameId: id }),
  setActiveFilter: (activeFilter) => set({ activeFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsScanning: (isScanning) => set({ isScanning }),
  setIsSyncingAchievements: (isSyncingAchievements) => set({ isSyncingAchievements }),
  setAchievementsSyncError: (achievementsSyncError) => set({ achievementsSyncError }),
  setAchievementsSyncDone: (achievementsSyncDone) => set({ achievementsSyncDone }),
  toggleFavoriteLocal: (id) =>
    set((state) => ({
      games: state.games.map((g) => (g.id === id ? { ...g, isFavorite: !g.isFavorite } : g))
    })),
  // Várias atualizações de uma vez (scan): uma única renderização
  upsertGamesLocal: (updates) =>
    set((state) => {
      const byId = new Map(updates.map((g) => [g.id, g]));
      const games = state.games.map((g) => {
        const update = byId.get(g.id);
        if (!update) return g;
        byId.delete(g.id);
        return { ...update, isRunning: g.isRunning };
      });
      return { games: [...games, ...byId.values()] };
    }),
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
