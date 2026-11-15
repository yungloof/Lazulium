import { create } from 'zustand';
import { CreateGroupListInput, GroupList, UpdateGroupListInput } from '@shared/types/social';

interface GroupListsState {
  lists: GroupList[];
  load: () => Promise<GroupList[]>;
  reloadOne: (listId: string) => Promise<GroupList | null>;
  create: (input: CreateGroupListInput) => Promise<GroupList | undefined>;
  update: (listId: string, input: UpdateGroupListInput) => Promise<GroupList | undefined>;
  remove: (listId: string) => Promise<void>;
  addMember: (listId: string, userId: string) => Promise<GroupList | undefined>;
  removeMember: (listId: string, userId: string) => Promise<{ left: boolean; list: GroupList | null } | undefined>;
  addGame: (listId: string, gameId: string) => Promise<GroupList | undefined>;
  removeGame: (listId: string, titleKey: string) => Promise<GroupList | undefined>;
  reorder: (listId: string, titleKeys: string[]) => Promise<GroupList | undefined>;
  clear: () => void;
}

export const useGroupListsStore = create<GroupListsState>((set) => {
  const upsert = (list: GroupList) =>
    set((state) => ({
      lists: state.lists.some((l) => l.id === list.id) ? state.lists.map((l) => (l.id === list.id ? list : l)) : [list, ...state.lists]
    }));

  return {
    lists: [],
    load: async () => {
      const lists = (await window.electronAPI?.socialGetGroupLists()) ?? [];
      set({ lists });
      return lists;
    },
    reloadOne: async (listId) => {
      const list = await window.electronAPI?.socialGetGroupList(listId);
      if (list) upsert(list);
      return list ?? null;
    },
    create: async (input) => {
      const list = await window.electronAPI?.socialCreateGroupList(input);
      if (list) upsert(list);
      return list;
    },
    update: async (listId, input) => {
      const list = await window.electronAPI?.socialUpdateGroupList(listId, input);
      if (list) upsert(list);
      return list;
    },
    remove: async (listId) => {
      await window.electronAPI?.socialDeleteGroupList(listId);
      set((state) => ({ lists: state.lists.filter((l) => l.id !== listId) }));
    },
    addMember: async (listId, userId) => {
      const list = await window.electronAPI?.socialAddGroupListMember(listId, userId);
      if (list) upsert(list);
      return list;
    },
    removeMember: async (listId, userId) => {
      const res = await window.electronAPI?.socialRemoveGroupListMember(listId, userId);
      if (!res) return undefined;
      if (res.left) set((state) => ({ lists: state.lists.filter((l) => l.id !== listId) }));
      else if (res.list) upsert(res.list);
      return res;
    },
    addGame: async (listId, gameId) => {
      const list = await window.electronAPI?.socialAddGroupListGame(listId, gameId);
      if (list) upsert(list);
      return list;
    },
    removeGame: async (listId, titleKey) => {
      const list = await window.electronAPI?.socialRemoveGroupListGame(listId, titleKey);
      if (list) upsert(list);
      return list;
    },
    reorder: async (listId, titleKeys) => {
      const list = await window.electronAPI?.socialReorderGroupListGames(listId, titleKeys);
      if (list) upsert(list);
      return list;
    },
    clear: () => set({ lists: [] })
  };
});
