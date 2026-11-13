import type { MouseEvent } from 'react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useUiStore } from '../stores/useUiStore';
import { useCategoriesStore } from '../stores/useCategoriesStore';
import { ipcErrorMessage } from './ipcErrorMessage';

// Ações sobre jogos usadas em várias telas. São funções fixas (não mudam a cada render),
// então as capas memorizadas não precisam renderizar de novo por causa delas.

const warn = (err: unknown) => useUiStore.getState().showNotice({ text: ipcErrorMessage(err), tone: 'warn' });

export function openGame(game: Pick<Game, 'id'>): void {
  useUiStore.getState().openGameId(game.id);
}

export async function launchGame(game: Pick<Game, 'id'>): Promise<void> {
  try {
    await window.electronAPI?.launchGame(game.id);
  } catch (err) {
    console.error('Error launching game:', err);
  }
}

export function stopGame(game: Pick<Game, 'id'>): void {
  void window.electronAPI?.stopGame(game.id);
}

export async function toggleFavorite(id: string): Promise<void> {
  useLibraryStore.getState().toggleFavoriteLocal(id);
  try {
    await window.electronAPI?.toggleFavorite(id);
  } catch (err) {
    console.error('Error toggling favorite:', err);
  }
}

export async function scanLibraries(): Promise<void> {
  const library = useLibraryStore.getState();
  if (library.isScanning) return;
  library.setIsScanning(true);
  try {
    const result = await window.electronAPI?.scanAllLibraries();
    if (result?.games) {
      useLibraryStore.getState().setGames(result.games);
      useUiStore.getState().setScanSummary(result);
      // Jogo que mudou de instalação ou saiu de vez leva (ou tira) a categoria junto
      void useCategoriesStore.getState().load().catch(() => undefined);
    }
  } catch (err) {
    console.error('Scan error:', err);
  } finally {
    useLibraryStore.getState().setIsScanning(false);
  }
}

export function openGameFolder(game: Pick<Game, 'id'>): void {
  window.electronAPI?.openGameFolder(game.id).catch(warn);
}

export function skipSuggestion(game: Pick<Game, 'id'>): void {
  window.electronAPI
    ?.updateGame(game.id, { skipSuggestions: true })
    .then((updated) => useLibraryStore.getState().upsertGameLocal(updated))
    .catch(warn);
}

export async function hideGame(game: Game): Promise<void> {
  try {
    const updated = await window.electronAPI?.updateGame(game.id, { isHidden: true });
    if (updated) useLibraryStore.getState().upsertGameLocal(updated);
    const ui = useUiStore.getState();
    if (ui.selectedGameId === game.id && ui.view === 'game') ui.goHome();
    useUiStore.getState().showNotice({
      text: `${game.title} foi ocultado. Fica em Configurações → Jogos ocultos.`,
      tone: 'ok',
      action: {
        label: 'Desfazer',
        run: () => {
          useUiStore.getState().dismissNotice();
          window.electronAPI
            ?.updateGame(game.id, { isHidden: false })
            .then((restored) => useLibraryStore.getState().upsertGameLocal(restored))
            .catch(warn);
        }
      }
    });
  } catch (err) {
    warn(err);
  }
}

// Só registro feito à mão: jogo detectado nunca é apagado, no máximo ocultado
export function askDeleteEntry(game: Game): void {
  useUiStore.getState().showNotice({
    text: `Apagar o registro de ${game.title}? A resenha e a nota dele somem.`,
    tone: 'warn',
    action: {
      label: 'Apagar',
      run: () => {
        useUiStore.getState().dismissNotice();
        window.electronAPI
          ?.deleteGame(game.id)
          .then(() => {
            const library = useLibraryStore.getState();
            library.setGames(library.games.filter((g) => g.id !== game.id));
            void useCategoriesStore.getState().load().catch(() => undefined);
            useUiStore.getState().goHome();
          })
          .catch(warn);
      }
    }
  });
}

// Botão direito numa capa ou linha: o menu abre onde o mouse está
export function openContextMenu(game: Pick<Game, 'id'>, e: MouseEvent): void {
  e.preventDefault();
  useUiStore.getState().setContextMenu({ gameId: game.id, x: e.clientX, y: e.clientY });
}

export async function addToSteam(game: Game): Promise<void> {
  const ui = useUiStore.getState();
  try {
    const result = await window.electronAPI?.addSteamShortcut(game.id);
    if (result?.ok) {
      ui.showNotice({
        text: `${game.title} adicionado à Steam com as artes configuradas. Reinicie a Steam para carregar o atalho.`,
        tone: 'ok'
      });
    } else {
      ui.showNotice({
        text: `Não foi possível adicionar à Steam: ${result?.error || 'erro desconhecido'}`,
        tone: 'warn'
      });
    }
  } catch (err) {
    warn(err);
  }
}
