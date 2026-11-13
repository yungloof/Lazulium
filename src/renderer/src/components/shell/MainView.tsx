import React, { Suspense, useLayoutEffect, useRef } from 'react';
import { Game } from '@shared/types/game';
import { Screenshot } from '@shared/types/screenshots';
import { AppView, useUiStore } from '../../stores/useUiStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { openGame } from '../../utils/gameActions';
import { ErrorBoundary, PageCrash } from '../ErrorBoundary';
import { LibraryHome } from '../LibraryHome';
import { LibrarySidebar } from '../LibrarySidebar';
import { FocusOnReady } from './FocusOnReady';
import { PageSkeleton } from './PageSkeleton';
import { FriendProfilePage, FriendsPage, GalleryPage, GamePage, JournalPage, ListsPage, ProfilePage, WishlistPage } from './lazy';

// Funções fixas passadas às páginas (não mudam a cada render)
const openSettings = () => useUiStore.getState().openModal({ kind: 'settings' });
const openList = (listId?: string) => useUiStore.getState().openList(listId);
const setOpenListId = (listId?: string) => useUiStore.getState().setOpenListId(listId);
const editPlaytime = (game: Game) => useUiStore.getState().openModal({ kind: 'playtime', gameId: game.id });
const openGameById = (id: string) => {
  if (useLibraryStore.getState().games.some((g) => g.id === id)) useUiStore.getState().openGameId(id);
};
const openShots = (gameId: string, shot?: Screenshot) => {
  if (useLibraryStore.getState().games.some((g) => g.id === gameId)) useUiStore.getState().openModal({ kind: 'screenshots', gameId, screenshotId: shot?.id });
};

const PageContent: React.FC<{ view: AppView }> = ({ view }) => {
  const openListId = useUiStore((s) => s.openListId);
  const openFriendId = useUiStore((s) => s.openFriendId);
  const screenshotsVersion = useUiStore((s) => s.screenshotsVersion);
  const selectedGameId = useUiStore((s) => s.selectedGameId);
  // A página acompanha o store (horas, favorito, execução) sem cópia própria do jogo
  const selectedGame = useLibraryStore((s) => (view === 'game' && selectedGameId ? s.games.find((g) => g.id === selectedGameId) : undefined));

  switch (view) {
    case 'gallery':
      return <GalleryPage version={screenshotsVersion} onOpenGallery={openShots} />;
    case 'wishlist':
      return <WishlistPage />;
    case 'friends':
      return <FriendsPage />;
    case 'friend':
      return openFriendId ? <FriendProfilePage key={openFriendId} friendId={openFriendId} /> : <FriendsPage />;
    case 'lists':
      return <ListsPage openListId={openListId} onOpenList={setOpenListId} onOpenGame={openGame} />;
    case 'journal':
      return <JournalPage onOpenGame={openGame} onEditPlaytime={editPlaytime} />;
    case 'profile':
      return <ProfilePage onOpenSettings={openSettings} onSelectGame={openGameById} onOpenList={openList} />;
    case 'game':
      return selectedGame ? <GamePage key={selectedGame.id} game={selectedGame} /> : <LibraryHome />;
    default:
      return <LibraryHome />;
  }
};

// Área principal: lista lateral (na biblioteca) e a página da aba atual
export const MainView: React.FC = () => {
  const view = useUiStore((s) => s.view);
  const selectedGameId = useUiStore((s) => s.selectedGameId);
  const scrollToken = useUiStore((s) => s.scrollToken);
  const mainRef = useRef<HTMLElement>(null);
  const homeScroll = useRef(0);
  const lastView = useRef<AppView>(view);

  // Trocar de tela começa do topo; voltar da página de um jogo devolve a grade onde estava
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const cameFromGame = lastView.current === 'game' && view === 'home';
    main.scrollTo({ top: cameFromGame ? homeScroll.current : 0 });
    lastView.current = view;
  }, [scrollToken, view]);

  const isLibrary = view === 'home' || view === 'game';

  return (
    <div className="flex-1 flex min-h-0">
      {isLibrary && <LibrarySidebar />}
      <main
        ref={mainRef}
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative"
        onScroll={view === 'home' ? (e) => (homeScroll.current = e.currentTarget.scrollTop) : undefined}
      >
        <ErrorBoundary key={view === 'game' ? `game-${selectedGameId}` : view} fallback={(reset) => <PageCrash onReset={reset} />}>
          <Suspense fallback={<PageSkeleton variant={view === 'game' ? 'game' : 'page'} />}>
            <FocusOnReady key={`${view}-${selectedGameId}`} gameId={view === 'home' ? selectedGameId ?? undefined : undefined} />
            <PageContent view={view} />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
};
