import React, { Suspense } from 'react';
import { Game } from '@shared/types/game';
import { AppModal, useUiStore } from '../../stores/useUiStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { openGame, scanLibraries } from '../../utils/gameActions';
import { ErrorBoundary } from '../ErrorBoundary';
import { GameContextMenuHost } from '../GameContextMenu';
import { QuickSearch } from '../QuickSearch';
import { FocusOnReady } from './FocusOnReady';
import { ModalFallback } from './PageSkeleton';
import {
  AchievementsPanel,
  AddCustomGameModal,
  AddToListModal,
  ArtworkPicker,
  EmulatorSettings,
  GameCategoriesModal,
  LaunchOptionsModal,
  ManageCategoriesModal,
  PlaytimeEditor,
  RenameGameModal,
  SaveBackupPanel,
  ScreenshotsPanel,
  SettingsModal,
  WelcomeModal,
  WhatsNewModal
} from './lazy';

const close = () => useUiStore.getState().closeModal();
const openSettings = () => useUiStore.getState().openModal({ kind: 'settings' });
const rescan = () => void scanLibraries();

const onGameAdded = (game: Game) => {
  const library = useLibraryStore.getState();
  library.setGames([...library.games, game]);
  openGame(game);
};
const onScanComplete = (games: Game[]) => useLibraryStore.getState().setGames(games);

const closeAchievements = () => {
  close();
  useUiStore.getState().bumpAchievements();
};
const closeScreenshots = () => {
  close();
  useUiStore.getState().bumpScreenshots();
};

const ModalContent: React.FC<{ modal: AppModal }> = ({ modal }) => {
  const game = useLibraryStore((s) => ('gameId' in modal ? s.games.find((g) => g.id === modal.gameId) : undefined));

  switch (modal.kind) {
    case 'settings':
      return <SettingsModal onClose={close} />;
    case 'emulators':
      return <EmulatorSettings onClose={close} onConfigChanged={rescan} />;
    case 'addGame':
      return <AddCustomGameModal onClose={close} onGameAdded={onGameAdded} onScanComplete={onScanComplete} />;
    case 'categories':
      return <ManageCategoriesModal onClose={close} />;
    case 'whatsNew':
      return <WhatsNewModal onClose={close} afterUpdate={modal.afterUpdate} />;
  }
  if (!game) return null;
  switch (modal.kind) {
    case 'artwork':
      return <ArtworkPicker game={game} onClose={close} onOpenSettings={openSettings} />;
    case 'achievements':
      return <AchievementsPanel game={game} onClose={closeAchievements} onOpenSettings={openSettings} />;
    case 'saves':
      return <SaveBackupPanel game={game} onClose={close} onOpenSettings={openSettings} />;
    case 'screenshots':
      return <ScreenshotsPanel key={`${game.id}-${modal.screenshotId ?? ''}`} game={game} initialScreenshotId={modal.screenshotId} onClose={closeScreenshots} />;
    case 'playtime':
      return <PlaytimeEditor game={game} onClose={close} />;
    case 'addToList':
      return <AddToListModal game={game} onClose={close} />;
    case 'gameCategories':
      return <GameCategoriesModal game={game} onClose={close} />;
    case 'rename':
      return <RenameGameModal game={game} onClose={close} />;
    case 'launchOptions':
      return <LaunchOptionsModal game={game} onClose={close} />;
    default:
      return null;
  }
};

const finishWelcome = () => {
  useUiStore.getState().setWelcomeOpen(false);
  void window.electronAPI?.setSetting('onboardingDone', 'true');
};

const Welcome: React.FC = () => {
  const games = useLibraryStore((s) => s.games);
  const isScanning = useLibraryStore((s) => s.isScanning);
  return <WelcomeModal games={games} isScanning={isScanning} onFinish={finishWelcome} />;
};

// Uma janela que falha ao abrir só fecha, sem derrubar a tela de trás
const modalCrash = () => {
  setTimeout(close);
  return null;
};

// Janelas, busca rápida e menu de contexto, por cima de qualquer tela
export const AppModals: React.FC = () => {
  const modal = useUiStore((s) => s.modal);
  const welcomeOpen = useUiStore((s) => s.welcomeOpen);
  const quickSearchOpen = useUiStore((s) => s.quickSearchOpen);
  const contextMenu = useUiStore((s) => s.contextMenu);

  return (
    <>
      {welcomeOpen && (
        <Suspense fallback={<ModalFallback />}>
          <FocusOnReady overlay />
          <Welcome />
        </Suspense>
      )}

      {modal && (
        <ErrorBoundary key={modal.kind} fallback={modalCrash}>
          <Suspense fallback={<ModalFallback />}>
            <FocusOnReady key={modal.kind} overlay />
            <ModalContent modal={modal} />
          </Suspense>
        </ErrorBoundary>
      )}

      {quickSearchOpen && <QuickSearch onClose={() => useUiStore.getState().setQuickSearchOpen(false)} />}

      {contextMenu && <GameContextMenuHost menu={contextMenu} />}
    </>
  );
};
