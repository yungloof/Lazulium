import React, { useEffect } from 'react';
import { AppHeader } from './components/shell/AppHeader';
import { MainView } from './components/shell/MainView';
import { AppModals } from './components/shell/AppModals';
import { NoticeStack } from './components/shell/NoticeStack';
import { prefetchAll } from './components/shell/lazy';
import { GamepadGuide } from './components/GamepadGuide';
import { useAppEvents } from './hooks/useAppEvents';
import { useShellControls } from './hooks/useShellControls';
import { useFilterGuard } from './hooks/useLibraryGames';
import { useLibraryStore } from './stores/useLibraryStore';

// Casca do app: barra do topo, área principal, avisos e janelas.
// O estado mora nos stores (useUiStore, useLibraryStore, useLibraryViewStore); cada peça lê só o que usa.
export const App: React.FC = () => {
  useAppEvents();
  useShellControls();
  useFilterGuard();

  // Com a biblioteca na tela, as outras páginas e janelas descem em segundo plano
  const isLoaded = useLibraryStore((s) => s.isLoaded);
  useEffect(() => {
    if (isLoaded) prefetchAll();
  }, [isLoaded]);

  return (
    <div className="flex flex-col h-screen w-screen bg-steam-bg text-slate-100 overflow-hidden">
      <AppHeader />
      <MainView />
      {/* Guia de controles (só com controle conectado) */}
      <GamepadGuide />
      <NoticeStack />
      <AppModals />
    </div>
  );
};
