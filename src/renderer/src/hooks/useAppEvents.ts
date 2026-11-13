import { useEffect } from 'react';
import { Game } from '@shared/types/game';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useCategoriesStore } from '../stores/useCategoriesStore';
import { useUiStore } from '../stores/useUiStore';
import { ipcErrorMessage } from '../utils/ipcErrorMessage';
import { scanLibraries } from '../utils/gameActions';
import { isNewerVersion } from '@shared/utils/version';

const GAME_UPDATE_BATCH_MS = 120;
const ASK_STATUS_AFTER_SECONDS = 10 * 60;

const titleOf = (gameId: string, fallback?: string) => fallback ?? useLibraryStore.getState().games.find((g) => g.id === gameId)?.title ?? 'Jogo';

// Tudo que chega do processo principal: biblioteca, execução, capturas, backups, rede e bandeja
export function useAppEvents(): void {
  // Carrega a biblioteca; na primeira execução (biblioteca vazia) faz um scan automático
  useEffect(() => {
    const library = useLibraryStore.getState();
    useCategoriesStore
      .getState()
      .load()
      .catch((err) => console.error('Failed to load categories:', err));
    (async () => {
      try {
        const loaded = await window.electronAPI?.getGames();
        if (loaded && loaded.length > 0) {
          library.setGames(loaded);
          library.setIsLoaded(true);
        } else {
          library.setIsLoaded(true);
          await scanLibraries();
        }
      } catch (err) {
        console.error('Failed to load games:', err);
        library.setIsLoaded(true);
      }
    })();
  }, []);

  // Primeira execução (sem conta Steam conectada): boas-vindas com as contas.
  // Depois de uma atualização: as novidades da versão nova, uma vez só.
  useEffect(() => {
    Promise.all([window.electronAPI?.getSettings(), window.electronAPI?.getAccountsStatus(), window.electronAPI?.getAppInfo()])
      .then(([settings, accounts, info]) => {
        const firstRun = settings?.onboardingDone !== 'true' && !accounts?.steam.connected;
        if (firstRun) useUiStore.getState().setWelcomeOpen(true);
        const version = info?.version;
        const seen = settings?.lastSeenVersion;
        if (!version || seen === version) return;
        void window.electronAPI?.setSetting('lastSeenVersion', version);
        // Sem registro = veio da 1.0, que ainda não guardava a versão vista
        if (!firstRun && (!seen || isNewerVersion(version, seen))) useUiStore.getState().openModal({ kind: 'whatsNew', afterUpdate: true });
      })
      .catch(() => undefined);
  }, []);

  // Sem internet: tudo local segue funcionando; serviços online voltam sozinhos
  useEffect(() => {
    const goOnline = () => {
      useUiStore.getState().setIsOnline(true);
      window.electronAPI?.notifyNetworkOnline();
    };
    const goOffline = () => useUiStore.getState().setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Menu da bandeja do sistema (a janela pode ter sido recriada só para executar a ação)
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onTrayAction((action) => {
      if (action === 'scan') void scanLibraries();
    });
    window.electronAPI?.rendererReady();
    return () => unsubscribe?.();
  }, []);

  // Eventos de execução vindos do monitor de processos
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGameStatusChanged((status) => {
      useLibraryStore.getState().applyGameStatus(status);
      if (status.state !== 'stopped') return;

      const { showNotice, dismissNotice } = useUiStore.getState();
      const title = titleOf(status.gameId, status.game?.title);
      if (status.error) {
        showNotice({ text: `${title}: ${status.error}`, tone: 'warn' });
      } else if (status.sessionSeconds) {
        const minutes = Math.max(1, Math.round(status.sessionSeconds / 60));
        const idleMin = status.idleSeconds ? Math.round(status.idleSeconds / 60) : 0;
        const idleText = idleMin > 0 ? ` (${idleMin} min ausente descontados)` : '';
        const played = useLibraryStore.getState().games.find((g) => g.id === status.gameId);
        // Sessão de verdade em jogo sem status: um clique para entrar no Diário
        const askStatus = played && !played.log?.status && status.sessionSeconds >= ASK_STATUS_AFTER_SECONDS;
        showNotice({
          text: `${title}: sessão de ${minutes} min registrada${idleText}.`,
          tone: 'ok',
          action: askStatus
            ? {
                label: 'Marcar como Jogando',
                run: () => {
                  window.electronAPI
                    ?.setGameLog(played.id, { ...played.log, status: 'playing', startedOn: played.log?.startedOn ?? new Date().toISOString().slice(0, 10) })
                    .then((updated) => useLibraryStore.getState().upsertGameLocal(updated))
                    .catch((err) => useUiStore.getState().showNotice({ text: ipcErrorMessage(err), tone: 'warn' }));
                  dismissNotice();
                }
              }
            : undefined
        });
      } else {
        showNotice({ text: `${title}: sessão menor que 15 s, não contabilizada.`, tone: 'warn' });
      }
    });
    return () => unsubscribe?.();
  }, []);

  // Lista de conquistas que chegou depois (procura em segundo plano)
  useEffect(() => {
    return window.electronAPI?.onAchievementsUpdated((gameId) => {
      const ui = useUiStore.getState();
      if (gameId === ui.selectedGameId) ui.bumpAchievements();
    });
  }, []);

  // Capturas tiradas pela tecla durante o jogo
  useEffect(() => {
    return window.electronAPI?.onScreenshotTaken((result) => {
      const ui = useUiStore.getState();
      ui.bumpScreenshots();
      ui.showNotice(
        result.warning
          ? { text: `${result.gameTitle}: ${result.warning}`, tone: 'warn' }
          : { text: `${result.gameTitle}: captura salva em ${result.width}x${result.height}.`, tone: 'ok' }
      );
    });
  }, []);

  // Backup automático de saves ao encerrar a sessão
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onBackupEvent((event) => {
      const { showNotice } = useUiStore.getState();
      const title = titleOf(event.gameId);
      if (event.state === 'error') {
        showNotice({ text: `${title}: backup dos saves falhou (${event.message})`, tone: 'warn' });
      } else if (event.state === 'done' && event.record) {
        const where = event.record.driveFileId ? 'neste PC e no Google Drive' : 'neste PC';
        showNotice({
          text: `${title}: saves salvos ${where}.${event.record.driveError ? ' (envio ao Drive falhou)' : ''}`,
          tone: event.record.driveError ? 'warn' : 'ok'
        });
      }
    });
    return () => unsubscribe?.();
  }, []);

  // Artes baixadas em segundo plano (SteamGridDB) chegam jogo a jogo
  useEffect(() => {
    // O scan da abertura envia a biblioteca inteira: agrupa para renderizar uma vez só
    const pending = new Map<string, Game>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = window.electronAPI?.onGameUpdated((game) => {
      pending.set(game.id, game);
      timer ??= setTimeout(() => {
        timer = undefined;
        useLibraryStore.getState().upsertGamesLocal([...pending.values()]);
        pending.clear();
      }, GAME_UPDATE_BATCH_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  // Conta Lazulium: "Fulano começou a jogar X" (com o app em foco; fora dele vira notificação do Windows)
  useEffect(() => {
    return window.electronAPI?.onFriendPlaying((text) => {
      useUiStore.getState().showNotice({
        text,
        tone: 'ok',
        action: { label: 'Ver amigos', run: () => useUiStore.getState().setView('friends') }
      });
    });
  }, []);

  // Notificação de atualização baixada e pronta para instalar
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onUpdateReady((info) => {
      useUiStore.getState().showNotice({
        text: `Lazulium ${info.version} pronto para instalar.`,
        tone: 'ok',
        action: {
          label: 'Reiniciar agora',
          run: () => {
            void window.electronAPI?.quitAndInstallUpdate();
          }
        }
      });
    });
    return () => unsubscribe?.();
  }, []);
}
