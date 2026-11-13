import { create } from 'zustand';
import { CategoryRule, GameCategory, SteamCollectionsImportResult } from '@shared/types/categories';

// Categorias da biblioteca. Toda mudança devolve a lista inteira do main, já na ordem.
// Erros sobem para quem chamou (a janela mostra a mensagem).

interface CategoriesState {
  categories: GameCategory[];
  load: () => Promise<void>;
  create: (name: string, gameIds?: string[], rule?: CategoryRule) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  updateRule: (id: string, rule: CategoryRule) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  setGames: (id: string, gameIds: string[], member: boolean) => Promise<void>;
  importSteam: () => Promise<SteamCollectionsImportResult | undefined>;
}

export const useCategoriesStore = create<CategoriesState>((set) => {
  const apply = (categories: GameCategory[] | undefined) => {
    if (categories) set({ categories });
  };
  return {
    categories: [],
    load: async () => apply(await window.electronAPI?.getGameCategories()),
    create: async (name, gameIds, rule) => apply(await window.electronAPI?.createGameCategory(name, gameIds, rule)),
    rename: async (id, name) => apply(await window.electronAPI?.renameGameCategory(id, name)),
    updateRule: async (id, rule) => apply(await window.electronAPI?.updateGameCategoryRule(id, rule)),
    remove: async (id) => apply(await window.electronAPI?.deleteGameCategory(id)),
    reorder: async (ids) => apply(await window.electronAPI?.reorderGameCategories(ids)),
    setGames: async (id, gameIds, member) => apply(await window.electronAPI?.setGameCategoryGames(id, gameIds, member)),
    importSteam: async () => {
      const result = await window.electronAPI?.importSteamCollections();
      if (result) apply(result.categories);
      return result;
    }
  };
});
