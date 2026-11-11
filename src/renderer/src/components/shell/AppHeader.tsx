import React from 'react';
import { Cpu, Plus, RefreshCw, Search, Settings } from 'lucide-react';
import { TitleBar } from '../TitleBar';
import { AppView, useUiStore } from '../../stores/useUiStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { scanLibraries } from '../../utils/gameActions';
import { focusRing } from '../ui';
import { UpdateIndicator } from './UpdateIndicator';

const TABS: { label: string; view: AppView }[] = [
  { label: 'Biblioteca', view: 'home' },
  { label: 'Diário', view: 'journal' },
  { label: 'Listas', view: 'lists' },
  { label: 'Desejos', view: 'wishlist' },
  { label: 'Capturas', view: 'gallery' },
  { label: 'Amigos', view: 'friends' },
  { label: 'Perfil', view: 'profile' }
];

const actionButton = `w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 active:bg-slate-800/70 transition-colors ${focusRing}`;

// Barra do topo: marca, seções, busca e ações da biblioteca
export const AppHeader: React.FC = () => {
  const view = useUiStore((s) => s.view);
  const isScanning = useLibraryStore((s) => s.isScanning);

  const goTo = (target: AppView) => {
    const ui = useUiStore.getState();
    if (target === 'home') ui.goHome();
    else if (target === 'lists') ui.openList(undefined);
    else ui.setView(target);
  };
  const openModal = useUiStore.getState().openModal;

  return (
    <TitleBar>
      <nav className="titlebar-no-drag h-full flex items-center" aria-label="Seções">
        {TABS.map((tab) => {
          const active = tab.view === 'home' ? view === 'home' || view === 'game' : view === tab.view;
          return (
            <button
              key={tab.view}
              onClick={() => goTo(tab.view)}
              aria-current={active ? 'page' : undefined}
              className={`relative px-2.5 xl:px-3.5 h-12 text-sm transition-colors ${focusRing} ${active ? 'text-white font-semibold' : 'text-slate-400 hover:text-slate-100'}`}
            >
              {tab.label}
              <span
                className={`absolute left-2.5 right-2.5 xl:left-3.5 xl:right-3.5 bottom-0 h-0.5 rounded-full bg-indigo-400 transition-[opacity,transform] duration-200 ${
                  active ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-50'
                }`}
              />
            </button>
          );
        })}
      </nav>
      <div className="titlebar-no-drag flex items-center gap-1 flex-shrink-0">
        <UpdateIndicator />
        <button
          onClick={() => useUiStore.getState().setQuickSearchOpen(true)}
          title="Buscar jogo (Ctrl+K)"
          aria-label="Buscar jogo"
          className={`flex items-center gap-2 h-8 px-2.5 xl:w-48 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-colors ${focusRing}`}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Buscar jogo</span>
          <kbd className="hidden xl:inline ml-auto px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-sans text-slate-400">Ctrl K</kbd>
        </button>
        <button
          onClick={() => void scanLibraries()}
          disabled={isScanning}
          title="Procurar jogos instalados"
          aria-label={isScanning ? 'Escaneando a biblioteca' : 'Escanear a biblioteca'}
          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-70 transition-colors ${focusRing}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-indigo-400' : ''}`} />
          <span className="hidden xl:inline">{isScanning ? 'Escaneando...' : 'Escanear'}</span>
        </button>
        <button onClick={() => openModal({ kind: 'emulators' })} title="Emuladores" aria-label="Emuladores" className={actionButton}>
          <Cpu className="w-4 h-4" />
        </button>
        <button onClick={() => openModal({ kind: 'addGame' })} title="Adicionar jogo" aria-label="Adicionar jogo" className={actionButton}>
          <Plus className="w-4 h-4" />
        </button>
        <button onClick={() => openModal({ kind: 'settings' })} title="Configurações" aria-label="Configurações" className={actionButton}>
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </TitleBar>
  );
};
