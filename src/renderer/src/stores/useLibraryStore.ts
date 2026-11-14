import { create } from 'zustand';
import { Game, GamePlatform } from '@shared/types/game';
import { GameLaunchStatus } from '@shared/types/ipc';
import { EMPTY_EDITION_PREFS, EditionPrefs, foldEditions } from '@shared/utils/editions';

// Plataforma, favoritos, uma categoria do jogador (category:<id>) ou o que ficou fora de todas
export type LibraryFilter = 'all' | GamePlatform | 'favorites' | 'uncategorized' | `category:${string}`;

interface LibraryState {
  rawGames: Game[];                 // Como vêm do main: um registro por loja
  games: Game[];                    // Para a tela: o mesmo jogo em lojas diferentes vira um só (foldEditions)
  primaryOf: Map<string, string>;   // Id de qualquer loja de um jogo juntado -> id do card
  gamesById: Map<string, Game>;     // Id de qualquer registro (inclusive das outras lojas) -> jogo da tela
  editionPrefs: EditionPrefs;
  selectedGameId: string | null;
  activeFilter: LibraryFilter;
  searchQuery: string;
  isScanning: boolean;
  isSyncingAchievements: boolean;
  achievementsSyncError: string | null;
  achievementsSyncDone: boolean;    // Já buscou nesta execução: quem não tem conquistas não recebe o convite de novo
  launchStatuses: Record<string, GameLaunchStatus>; // Apenas jogos iniciando/rodando (pelo id da loja e pelo do card)
  isLoaded: boolean;                // A primeira leitura da biblioteca terminou (antes disso a tela mostra o esqueleto)

  // Actions
  setGames: (games: Game[]) => void;
  setEditionPrefs: (prefs: EditionPrefs) => void;
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
  removeGameLocal: (id: string) => void;
}

// Recalcula a lista da tela a partir dos registros brutos
const withRaw = (rawGames: Game[], prefs: EditionPrefs) => {
  const { games, primaryOf } = foldEditions(rawGames, prefs);
  const gamesById = new Map(games.map((g) => [g.id, g]));
  // Listas e categorias antigas podem guardar o id da outra loja: ele leva ao mesmo card
  for (const [id, primaryId] of primaryOf) if (id !== primaryId) gamesById.set(id, gamesById.get(primaryId)!);
  return { rawGames, games, primaryOf, gamesById };
};

export const useLibraryStore = create<LibraryState>((set) => ({
  rawGames: [],
  games: [],
  primaryOf: new Map(),
  gamesById: new Map(),
  editionPrefs: EMPTY_EDITION_PREFS,
  selectedGameId: null,
  activeFilter: 'all',
  searchQuery: '',
  isScanning: false,
  isSyncingAchievements: false,
  achievementsSyncError: null,
  achievementsSyncDone: false,
  launchStatuses: {},
  isLoaded: false,

  setGames: (games) => set((state) => withRaw(games, state.editionPrefs)),
  setEditionPrefs: (editionPrefs) => set((state) => ({ editionPrefs, ...withRaw(state.rawGames, editionPrefs) })),
  setIsLoaded: (isLoaded) => set({ isLoaded }),
  // Abrir a loja de um jogo juntado abre o card dele
  setSelectedGameId: (id) => set((state) => ({ selectedGameId: id ? (state.primaryOf.get(id) ?? id) : null })),
  setActiveFilter: (activeFilter) => set({ activeFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsScanning: (isScanning) => set({ isScanning }),
  setIsSyncingAchievements: (isSyncingAchievements) => set({ isSyncingAchievements }),
  setAchievementsSyncError: (achievementsSyncError) => set({ achievementsSyncError }),
  setAchievementsSyncDone: (achievementsSyncDone) => set({ achievementsSyncDone }),
  toggleFavoriteLocal: (id) =>
    set((state) => withRaw(state.rawGames.map((g) => (g.id === id ? { ...g, isFavorite: !g.isFavorite } : g)), state.editionPrefs)),
  // Várias atualizações de uma vez (scan): uma única renderização
  upsertGamesLocal: (updates) =>
    set((state) => {
      const byId = new Map(updates.map((g) => [g.id, g]));
      const games = state.rawGames.map((g) => {
        const update = byId.get(g.id);
        if (!update) return g;
        byId.delete(g.id);
        return { ...update, isRunning: g.isRunning };
      });
      return withRaw([...games, ...byId.values()], state.editionPrefs);
    }),
  upsertGameLocal: (game) =>
    set((state) => {
      const exists = state.rawGames.some((g) => g.id === game.id);
      const games = exists ? state.rawGames.map((g) => (g.id === game.id ? { ...game, isRunning: g.isRunning } : g)) : [...state.rawGames, game];
      return withRaw(games, state.editionPrefs);
    }),
  removeGameLocal: (id) => set((state) => withRaw(state.rawGames.filter((g) => g.id !== id), state.editionPrefs)),
  applyGameStatus: (status) =>
    set((state) => {
      const launchStatuses = { ...state.launchStatuses };
      // O card do jogo juntado mostra o status da loja que está rodando
      const ids = [status.gameId, state.primaryOf.get(status.gameId)].filter((id): id is string => !!id);
      for (const id of new Set(ids)) {
        if (status.state === 'stopped') delete launchStatuses[id];
        else launchStatuses[id] = status;
      }

      const games = state.rawGames.map((g) => {
        if (g.id !== status.gameId) return g;
        // Ao encerrar, o main envia o registro com o playtime já atualizado
        const base = status.game ? { ...status.game, isFavorite: g.isFavorite } : g;
        return { ...base, isRunning: status.isRunning };
      });
      return { launchStatuses, ...withRaw(games, state.editionPrefs) };
    })
}));
