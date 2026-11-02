import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipc';
import { db } from './database/db';
import { playtimeService } from './services/tracker/playtime.service';
import { backupService } from './services/cloudsync/backup.service';
import { registerMediaProtocol, registerMediaScheme } from './services/metadata/media-cache.service';
import { registerScreenshotRoots } from './services/metadata/screenshots.service';
import { scanLibraries } from './services/scanners';
import { artworkService } from './services/metadata/artwork.service';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import {
  HIDDEN_LAUNCH_ARG,
  destroyTray,
  getMainWindow,
  setQuitting,
  setupAppIdentity,
  shouldCloseToTray,
  showMainWindow,
  startApp
} from './app-shell';

// Envios ao Drive que falharam (ex: sem internet) são refeitos pouco depois de abrir
const PENDING_UPLOAD_RETRY_DELAY_MS = 20_000;

// Testes silenciosos usam outra pasta de dados: não tocam no banco do usuário e não
// esbarram na trava de instância única (que traria a janela dele para a frente)
if (process.env.LAZULIUM_SILENT === '1' && process.env.LAZULIUM_USER_DATA) {
  app.setPath('userData', process.env.LAZULIUM_USER_DATA);
}

// Uma instância só: abrir o atalho de novo traz a janela existente (inclusive da bandeja)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Esquema das artes em cache local (precisa ser registrado antes do app ficar pronto)
  registerMediaScheme();
  setupAppIdentity();

  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    // Initialize local database
    await db.init();
    registerMediaProtocol();
    registerScreenshotRoots();
    playtimeService.recoverInterruptedSessions();

    // Register all typed IPC channels
    registerIpcHandlers(getMainWindow);

    startApp(process.argv.includes(HIDDEN_LAUNCH_ARG));
    // Horas da Steam (localconfig.vdf) e jogos da Riot/Xbox atualizados a cada abertura (leituras rápidas);
    // a janela recebe os jogos atualizados
    scanLibraries(['steam', 'riot', 'xbox'])
      .then((result) => {
        for (const game of result.games) getMainWindow()?.webContents.send(IPC_CHANNELS.LIBRARY_GAME_UPDATED, game);
        // Jogos novos sem capa (ex: Riot, Xbox) buscam artes no SteamGridDB em segundo plano
        artworkService.enqueueMissing();
      })
      .catch((err) => console.warn('[Startup] Sincronização da Steam falhou:', (err as Error).message));
    setTimeout(() => void backupService.retryPendingUploads(), PENDING_UPLOAD_RETRY_DELAY_MS);

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) showMainWindow();
    });
  });

  // Contabiliza sessões em andamento e encerra o worker de processos
  app.on('before-quit', () => {
    setQuitting();
    playtimeService.shutdown();
    destroyTray();
  });

  // Com "minimizar para a bandeja" o app segue vivo sem janela (rastreador e backups)
  app.on('window-all-closed', () => {
    if (!shouldCloseToTray() && process.platform !== 'darwin') {
      app.quit();
    }
  });
}
