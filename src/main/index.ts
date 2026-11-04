import { wishlistService } from './services/metadata/wishlist.service';
import { screenshotCaptureService } from './services/metadata/screenshot-capture.service';
import { profileService } from './services/profile/profile.service';
import { app, BrowserWindow, session } from 'electron';
import { registerIpcHandlers } from './ipc';
import { db } from './database/db';
import { playtimeService } from './services/tracker/playtime.service';
import { backupService } from './services/cloudsync/backup.service';
import { migrateMediaCache, registerMediaProtocol, registerMediaScheme } from './services/metadata/media-cache.service';
import { registerScreenshotRoots } from './services/metadata/screenshots.service';
import { scanLibraries } from './services/scanners';
import { setupFileLogging } from './logger';
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

// Log em arquivo (userData/logs) para diagnóstico: depois de definir a pasta de dados
setupFileLogging();

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

  const SAVES_SWEEP_DELAY_MS = 90_000; // Depois que a abertura e os scans terminaram

  app.whenReady().then(async () => {
    // Content-Security-Policy injetada nos cabeçalhos HTTP (no dev libera HMR/WebSocket e inline do Vite)
    const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL'];
    const cspDirectives = isDev
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: lazulium-media:; media-src 'self' https://*.steamstatic.com lazulium-media:; font-src 'self' data:; connect-src 'self' https: ws:;"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: lazulium-media:; media-src 'self' https://*.steamstatic.com lazulium-media:; font-src 'self' data:; connect-src 'self' https:;";

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [cspDirectives]
          }
        });
      } else {
        callback({ responseHeaders: details.responseHeaders });
      }
    });

    // Initialize local database
    await db.init();
    migrateMediaCache();
    const repairedArtwork = artworkService.repairMissingMedia();
    registerMediaProtocol();
    registerScreenshotRoots();
    playtimeService.recoverInterruptedSessions();

    // Register all typed IPC channels
    registerIpcHandlers(getMainWindow);

    startApp(process.argv.includes(HIDDEN_LAUNCH_ARG));
    // Horas da Steam (localconfig.vdf) e jogos da Riot/Xbox atualizados a cada abertura (leituras rápidas);
    // a janela recebe os jogos atualizados
    // Biblioteca vazia (primeira execução): a interface já faz o scan completo
    if (db.getGames().length > 0) {
      scanLibraries(['steam', 'riot', 'xbox'])
        .then((result) => {
          for (const game of result.games) getMainWindow()?.webContents.send(IPC_CHANNELS.LIBRARY_GAME_UPDATED, game);
          // Jogos novos sem capa (ex: Riot, Xbox) buscam artes no SteamGridDB em segundo plano
          artworkService.enqueueMissing();
          profileService.syncInBackground();
          wishlistService.syncInBackground();
          artworkService.enqueueMissing(repairedArtwork);
        })
        .catch((err) => console.warn('[Startup] Sincronização da Steam falhou:', (err as Error).message));
    }
    setTimeout(() => void backupService.retryPendingUploads(), PENDING_UPLOAD_RETRY_DELAY_MS);
    setTimeout(() => void backupService.autoBackupSweep(), SAVES_SWEEP_DELAY_MS);

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) showMainWindow();
    });
  });

  // Contabiliza sessões em andamento e encerra o worker de processos
  app.on('before-quit', () => {
    screenshotCaptureService.stop();
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
