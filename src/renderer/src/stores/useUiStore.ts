import { create } from 'zustand';
import { ScanResult } from '@shared/types/ipc';

// Estado da casca do app: tela atual, jogo aberto, janelas, menu e avisos.
// Antes tudo isso morava no App.tsx e descia por props.

export type AppView = 'home' | 'game' | 'profile' | 'journal' | 'gallery' | 'lists' | 'wishlist' | 'friends' | 'friend';

// Ordem das seções no LT/RT do controle (a página do jogo conta como a biblioteca)
export const SECTION_ORDER = ['home', 'journal', 'lists', 'wishlist', 'gallery', 'friends', 'profile'] as const;

export type GameModalKind =
  | 'artwork'
  | 'achievements'
  | 'saves'
  | 'screenshots'
  | 'playtime'
  | 'addToList'
  | 'gameCategories'
  | 'rename'
  | 'launchOptions'
  | 'shareCard';

export interface NavEntry {
  view: AppView;
  selectedGameId: string | null;
  openListId?: string;
  openFriendId?: string;
}

const MAX_NAV_HISTORY = 20;

const sameNavEntry = (a: NavEntry, b: NavEntry): boolean =>
  a.view === b.view && a.selectedGameId === b.selectedGameId && a.openListId === b.openListId && a.openFriendId === b.openFriendId;

const navSnapshot = (s: Pick<UiState, 'view' | 'selectedGameId' | 'openListId' | 'openFriendId'>): NavEntry => ({
  view: s.view,
  selectedGameId: s.selectedGameId,
  openListId: s.openListId,
  openFriendId: s.openFriendId
});

const nextHistory = (s: UiState, target: NavEntry): NavEntry[] => {
  const current = navSnapshot(s);
  if (sameNavEntry(current, target)) return s.history;
  const last = s.history[s.history.length - 1];
  if (last && sameNavEntry(last, current)) return s.history;
  return [...s.history, current].slice(-MAX_NAV_HISTORY);
};

export type AppModal =
  | { kind: 'settings' | 'emulators' | 'addGame' | 'categories' }
  | { kind: 'whatsNew'; afterUpdate?: boolean }
  // A janela guarda o jogo dela: abrir pelo menu de outro jogo não troca a página que está por trás
  | { kind: GameModalKind; gameId: string; screenshotId?: string };

export interface AppNotice {
  id: number;
  text: string;
  tone: 'ok' | 'warn';
  action?: { label: string; run: () => void };
}

export interface ContextMenuState {
  gameId: string;
  x: number;
  y: number;
}

interface UiState {
  view: AppView;
  selectedGameId: string | null;
  openListId?: string;
  openFriendId?: string;            // Perfil de amigo aberto em página inteira (view 'friend')
  history: NavEntry[];
  scrollToken: number;              // Muda quando a tela deve voltar ao topo (mesma tela também)
  modal: AppModal | null;
  quickSearchOpen: boolean;
  welcomeOpen: boolean;
  contextMenu: ContextMenuState | null;
  notice: AppNotice | null;
  scanSummary: ScanResult | null;
  isOnline: boolean;
  screenshotsVersion: number;       // Capturas mudaram (recarrega prévias)
  achievementsVersion: number;      // Conquistas mudaram (recarrega o resumo da página do jogo)

  setView: (view: AppView) => void;
  goHome: () => void;
  goBack: () => boolean;
  openGameId: (gameId: string) => void;
  openList: (listId?: string) => void;
  openFriend: (friendId: string) => void;
  setOpenListId: (listId?: string) => void;
  openModal: (modal: AppModal) => void;
  closeModal: () => void;
  setQuickSearchOpen: (open: boolean) => void;
  setWelcomeOpen: (open: boolean) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
  showNotice: (notice: Omit<AppNotice, 'id'>) => void;
  dismissNotice: () => void;
  setScanSummary: (summary: ScanResult | null) => void;
  setIsOnline: (online: boolean) => void;
  bumpScreenshots: () => void;
  bumpAchievements: () => void;
}

let noticeId = 0;

export const useUiStore = create<UiState>((set, get) => ({
  view: 'home',
  selectedGameId: null,
  openListId: undefined,
  openFriendId: undefined,
  history: [],
  scrollToken: 0,
  modal: null,
  quickSearchOpen: false,
  welcomeOpen: false,
  contextMenu: null,
  notice: null,
  scanSummary: null,
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  screenshotsVersion: 0,
  achievementsVersion: 0,

  setView: (view) =>
    set((s) => ({
      view,
      history: nextHistory(s, { ...navSnapshot(s), view }),
      scrollToken: s.scrollToken + 1
    })),
  goHome: () =>
    set((s) => ({
      view: 'home',
      history: nextHistory(s, { ...navSnapshot(s), view: 'home' }),
      scrollToken: s.scrollToken + 1
    })),
  goBack: () => {
    const s = get();
    if (s.history.length === 0) return false;
    const prev = s.history[s.history.length - 1];
    set({
      view: prev.view,
      selectedGameId: prev.selectedGameId,
      openListId: prev.openListId,
      openFriendId: prev.openFriendId,
      history: s.history.slice(0, -1),
      scrollToken: s.scrollToken + 1
    });
    return true;
  },
  openGameId: (gameId) =>
    set((s) => ({
      view: 'game',
      selectedGameId: gameId,
      history: nextHistory(s, { ...navSnapshot(s), view: 'game', selectedGameId: gameId }),
      scrollToken: s.scrollToken + 1
    })),
  openList: (openListId) =>
    set((s) => ({
      view: 'lists',
      openListId,
      history: nextHistory(s, { ...navSnapshot(s), view: 'lists', openListId }),
      scrollToken: s.scrollToken + 1
    })),
  openFriend: (openFriendId) =>
    set((s) => ({
      view: 'friend',
      openFriendId,
      history: nextHistory(s, { ...navSnapshot(s), view: 'friend', openFriendId }),
      scrollToken: s.scrollToken + 1
    })),
  setOpenListId: (openListId) => set({ openListId }),
  openModal: (modal) => set({ modal, contextMenu: null }),
  closeModal: () => set({ modal: null }),
  setQuickSearchOpen: (quickSearchOpen) => set({ quickSearchOpen }),
  setWelcomeOpen: (welcomeOpen) => set({ welcomeOpen }),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  showNotice: (notice) => set({ notice: { ...notice, id: ++noticeId } }),
  dismissNotice: () => set({ notice: null }),
  setScanSummary: (scanSummary) => set({ scanSummary }),
  setIsOnline: (isOnline) => set({ isOnline }),
  bumpScreenshots: () => set((s) => ({ screenshotsVersion: s.screenshotsVersion + 1 })),
  bumpAchievements: () => set((s) => ({ achievementsVersion: s.achievementsVersion + 1 }))
}));

// Qualquer janela, menu ou busca por cima da tela
export const selectAnyOverlay = (s: UiState): boolean => !!s.modal || s.quickSearchOpen || s.welcomeOpen || !!s.contextMenu;
