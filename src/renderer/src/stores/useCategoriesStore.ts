import { create } from 'zustand';
import { GameCategory } from '@shared/types/categories';

// Categorias da biblioteca. Toda mudança devolve a lista inteira do main, já na ordem.
// Erros sobem para quem chamou (a janela mostra a mensagem).

interface CategoriesState {
  categories: GameCategory[];
  load: () => Promise<void>;
  create: (name: string, gameIds?: string[]) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  setGames: (id: string, gameIds: string[], member: boolean) => Promise<void>;
}

export const useCategoriesStore = create<CategoriesState>((set) => {
  const apply = (categories: GameCategory[] | undefined) => {
    if (categories) set({ categories });
  };
  return {
    categories: [],
    load: async () => apply(await window.electronAPI?.getGameCategories()),
    create: async (name, gameIds) => apply(await window.electronAPI?.createGameCategory(name, gameIds)),
    rename: async (id, name) => apply(await window.electronAPI?.renameGameCategory(id, name)),
    remove: async (id) => apply(await window.electronAPI?.deleteGameCategory(id)),
    reorder: async (ids) => apply(await window.electronAPI?.reorderGameCategories(ids)),
    setGames: async (id, gameIds, member) => apply(await window.electronAPI?.setGameCategoryGames(id, gameIds, member))
  };
});
