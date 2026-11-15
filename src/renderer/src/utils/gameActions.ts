import type { MouseEvent } from 'react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useUiStore } from '../stores/useUiStore';
import { useCategoriesStore } from '../stores/useCategoriesStore';
import { ipcErrorMessage } from './ipcErrorMessage';
import { EDITION_SETTING_KEYS, editionIds, editionKey, launchEdition } from '@shared/utils/editions';

// Ações sobre jogos usadas em várias telas. São funções fixas (não mudam a cada render),
// então as capas memorizadas não precisam renderizar de novo por causa delas.

const warn = (err: unknown) => useUiStore.getState().showNotice({ text: ipcErrorMessage(err), tone: 'warn' });

export function openGame(game: Pick<Game, 'id'>): void {
  useUiStore.getState().openGameId(game.id);
}

// Jogo em mais de uma loja: abre pela escolhida (ou pela instalada jogada por último)
function editionToOpen(game: Pick<Game, 'id' | 'editions'>): string {
  const library = useLibraryStore.getState();
  const card = library.gamesById.get(game.id) ?? game;
  return launchEdition(card, library.editionPrefs.preferred[card.id]);
}

export async function launchGame(game: Pick<Game, 'id' | 'editions'>): Promise<void> {
  try {
    await window.electronAPI?.launchGame(editionToOpen(game));
  } catch (err) {
    console.error('Error launching game:', err);
  }
}

export function stopGame(game: Pick<Game, 'id' | 'editions'>): void {
  // Encerra a loja que está rodando (o status do card é o espelho dela)
  const library = useLibraryStore.getState();
  const card = library.gamesById.get(game.id) ?? game;
  const running = editionIds(card).find((id) => library.launchStatuses[id] && id !== card.id) ?? library.launchStatuses[card.id]?.gameId ?? card.id;
  void window.electronAPI?.stopGame(running);
}

// Loja escolhida para abrir um jogo juntado
export function setPreferredEdition(cardId: string, editionId: string): void {
  const library = useLibraryStore.getState();
  const preferred = { ...library.editionPrefs.preferred, [cardId]: editionId };
  library.setEditionPrefs({ ...library.editionPrefs, preferred });
  window.electronAPI?.setSetting(EDITION_SETTING_KEYS.preferred, JSON.stringify(preferred)).catch(warn);
}

// Juntou dois jogos que não são o mesmo: separa de vez (ou junta de novo)
export function setEditionsSplit(game: Pick<Game, 'title' | 'detectedTitle' | 'platform' | 'manualEntry' | 'isHidden'>, split: boolean): void {
  const key = editionKey(game);
  if (!key) return;
  const library = useLibraryStore.getState();
  const keys = new Set(library.editionPrefs.split);
  if (split) keys.add(key);
  else keys.delete(key);
  const next = [...keys];
  library.setEditionPrefs({ ...library.editionPrefs, split: next });
  window.electronAPI?.setSetting(EDITION_SETTING_KEYS.split, JSON.stringify(next)).catch(warn);
}

export async function toggleFavorite(id: string): Promise<void> {
  const library = useLibraryStore.getState();
  // Jogo juntado é favorito se qualquer loja for: desfavoritar (ou favoritar) vale para todas
  const card = library.gamesById.get(id);
  const target = !(card?.isFavorite ?? false);
  const ids = card ? editionIds(card).filter((editionId) => (library.rawGames.find((g) => g.id === editionId)?.isFavorite ?? false) !== target) : [id];
  for (const editionId of ids) library.toggleFavoriteLocal(editionId);
  try {
    for (const editionId of ids) await window.electronAPI?.toggleFavorite(editionId);
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

export function openGameFolder(game: Pick<Game, 'id' | 'editions'>): void {
  window.electronAPI?.openGameFolder(editionToOpen(game)).catch(warn);
}

export function skipSuggestion(game: Pick<Game, 'id'>): void {
  window.electronAPI
    ?.updateGame(game.id, { skipSuggestions: true })
    .then((updated) => useLibraryStore.getState().upsertGameLocal(updated))
    .catch(warn);
}

export async function hideGame(game: Game): Promise<void> {
  try {
    // Jogo juntado some por inteiro: ocultar só uma loja faria a outra aparecer sozinha
    const ids = editionIds(game);
    const api = window.electronAPI;
    if (!api) return;
    const updated = await Promise.all(ids.map((id) => api.updateGame(id, { isHidden: true })));
    useLibraryStore.getState().upsertGamesLocal(updated);
    const ui = useUiStore.getState();
    if (ui.selectedGameId === game.id && ui.view === 'game') ui.goHome();
    useUiStore.getState().showNotice({
      text: `${game.title} foi ocultado. Fica em Configurações → Jogos ocultos.`,
      tone: 'ok',
      action: {
        label: 'Desfazer',
        run: () => {
          useUiStore.getState().dismissNotice();
          Promise.all(ids.map((id) => api.updateGame(id, { isHidden: false })))
            .then((restored) => useLibraryStore.getState().upsertGamesLocal(restored))
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
            useLibraryStore.getState().removeGameLocal(game.id);
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

// Botão View/Select do controle: abre o menu ancorado perto do cartão focado
export function openContextMenuForElement(gameId: string, anchor?: HTMLElement | null): void {
  const rect = anchor?.getBoundingClientRect();
  const x = rect ? Math.round(rect.left + Math.min(rect.width * 0.55, 160)) : Math.round(window.innerWidth / 2 - 120);
  const y = rect ? Math.round(rect.top + Math.min(rect.height * 0.35, 80)) : Math.round(window.innerHeight / 3);
  useUiStore.getState().setContextMenu({ gameId, x, y });
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
