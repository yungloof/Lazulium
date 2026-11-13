import { useEffect } from 'react';
import { useGamepad } from './useGamepad';
import { useVisibleFilters } from './useLibraryGames';
import { useLibraryStore } from '../stores/useLibraryStore';
import { SECTION_ORDER, selectAnyOverlay, useUiStore } from '../stores/useUiStore';
import { closeTopOverlay, focusedGameId, focusStart, isFocusTarget, isNavActive, topOverlay } from '../utils/spatialNav';
import { toggleFavorite } from '../utils/gameActions';

const isTextField = (el: EventTarget | null) => {
  const target = el as HTMLElement | null;
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
};

// Controle, atalhos de teclado e "voltar": o mapa de comandos da casca do app
export function useShellControls(): void {
  const filters = useVisibleFilters();
  const view = useUiStore((s) => s.view);
  const anyOverlay = useUiStore(selectAnyOverlay);
  const activeFilter = useLibraryStore((s) => s.activeFilter);

  const stepFilter = (step: number) => {
    const { view: current, goHome } = useUiStore.getState();
    if (topOverlay() || (current !== 'home' && current !== 'game')) return;
    const library = useLibraryStore.getState();
    const index = filters.findIndex((f) => f.id === library.activeFilter);
    library.setActiveFilter(filters[(index + step + filters.length) % filters.length].id);
    if (current === 'game') goHome();
  };

  const stepSection = (step: number) => {
    if (topOverlay()) return;
    const { view: current, setView } = useUiStore.getState();
    const section = current === 'friend' ? 'friends' : current;
    const index = section === 'game' ? 0 : SECTION_ORDER.indexOf(section as (typeof SECTION_ORDER)[number]);
    setView(SECTION_ORDER[(index + step + SECTION_ORDER.length) % SECTION_ORDER.length]);
  };

  // O direcional anda pelo que está na tela e o A age sobre o item focado (useGamepad)
  useGamepad({
    onBack: () => {
      const ui = useUiStore.getState();
      const library = useLibraryStore.getState();
      if (ui.contextMenu) ui.setContextMenu(null);
      else if (closeTopOverlay()) return;
      else if (ui.view === 'friend') ui.setView('friends');
      else if (ui.view !== 'home') ui.goHome();
      else if (library.searchQuery) library.setSearchQuery('');
    },
    onToggleFavorite: () => {
      if (topOverlay()) return;
      const ui = useUiStore.getState();
      const target = focusedGameId() ?? (ui.view === 'game' ? ui.selectedGameId : null);
      if (target && useLibraryStore.getState().games.some((g) => g.id === target)) void toggleFavorite(target);
    },
    onNextFilter: () => stepFilter(1),
    onPrevFilter: () => stepFilter(-1),
    onNextSection: () => stepSection(1),
    onPrevSection: () => stepSection(-1),
    onSearch: () => {
      if (topOverlay()) return;
      const input = document.querySelector<HTMLInputElement>('[data-library-search]');
      input?.focus();
      input?.select();
    },
    onMenu: () => {
      const ui = useUiStore.getState();
      const settingsOpen = ui.modal?.kind === 'settings';
      if (topOverlay() && !settingsOpen) return;
      if (settingsOpen) ui.closeModal();
      else ui.openModal({ kind: 'settings' });
    }
  });

  // Quem usa o controle não fica sem foco ao trocar de tela: abre no botão principal e volta para o jogo de onde saiu.
  // Páginas carregadas sob demanda pedem o foco de novo ao aparecer (FocusOnReady).
  useEffect(() => {
    if (!isNavActive()) return;
    const frame = requestAnimationFrame(() => {
      // Janela que fechou já devolveu o foco a quem a abriu: não pula para o botão principal
      const active = document.activeElement;
      const scope = topOverlay() ?? document.querySelector('main');
      if (isFocusTarget(active) && scope?.contains(active)) return;
      focusStart(view === 'home' ? useUiStore.getState().selectedGameId ?? undefined : undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [view, anyOverlay, activeFilter]);

  // Ctrl+K: busca rápida de qualquer lugar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const ui = useUiStore.getState();
        ui.setQuickSearchOpen(!ui.quickSearchOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Voltar como num navegador: botão "voltar" do mouse, Alt+← ou Backspace (fora de campos de texto)
  useEffect(() => {
    if (view === 'home' || anyOverlay) return;
    const goHome = () => useUiStore.getState().goHome();
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) goHome();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextField(e.target)) return;
      if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        goHome();
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [view, anyOverlay]);
}
