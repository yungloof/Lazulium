import { create } from 'zustand';
import { GameList, GameListInput } from '@shared/types/lists';

interface ListsState {
  lists: GameList[];
  load: () => Promise<void>;
  save: (input: GameListInput) => Promise<GameList | undefined>;
  remove: (id: string) => Promise<void>;
}

export const useListsStore = create<ListsState>((set) => ({
  lists: [],
  load: async () => {
    set({ lists: (await window.electronAPI?.getGameLists()) ?? [] });
  },
  save: async (input) => {
    const saved = await window.electronAPI?.saveGameList(input);
    if (saved) set((state) => ({ lists: state.lists.some((l) => l.id === saved.id) ? state.lists.map((l) => (l.id === saved.id ? saved : l)) : [saved, ...state.lists] }));
    return saved;
  },
  remove: async (id) => {
    await window.electronAPI?.deleteGameList(id);
    set((state) => ({ lists: state.lists.filter((l) => l.id !== id) }));
  }
}));
