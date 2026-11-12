import { app, BrowserWindow, session } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { registerIpcHandlers, sendToRenderer } from './ipc';
import { db } from './database/db';
import { setupFileLogging } from './logger';
import { applySecurityPolicies } from './security';
import { playtimeService } from './services/tracker/playtime.service';
import { backupService } from './services/cloudsync/backup.service';
import { migrateMediaCache, registerMediaProtocol, registerMediaScheme } from './services/metadata/media-cache.service';
import { registerScreenshotRoots } from './services/metadata/screenshots.service';
import { screenshotCaptureService } from './services/metadata/screenshot-capture.service';
import { artworkService } from './services/metadata/artwork.service';
import { wishlistService } from './services/metadata/wishlist.service';
import { profileService } from './services/profile/profile.service';
import { scanLibrariesWithChanges } from './services/scanners';
import { updaterService } from './services/updater/updater.service';
import { socialService, socialServerUrl } from './services/social/social.service';
import { epicAccountService } from './services/accounts/epic-account.service';
import {
  HIDDEN_LAUNCH_ARG,
  afterLibraryServed,
  destroyTray,
  getMainWindow,
  setQuitting,
  setSessionEndHandler,
  setupAppIdentity,
  shouldCloseToTray,
  showMainWindow,
  startApp
} from './app-shell';

// Envios ao Drive que falharam (ex: sem internet) são refeitos pouco depois de abrir
const PENDING_UPLOAD_RETRY_DELAY_MS = 20_000;
// Varredura diária de saves: depois que a abertura e os scans terminaram
const SAVES_SWEEP_DELAY_MS = 90_000;
// O trabalho de abertura espera a biblioteca aparecer; aberto na bandeja, espera no máximo isto
const STARTUP_WORK_MAX_WAIT_MS = 5_000;
// Folga para a primeira tela terminar de desenhar antes de ler Steam/Riot/Xbox
const STARTUP_WORK_SETTLE_MS = 400;

// Testes silenciosos usam outra pasta de dados: não tocam no banco do usuário e não
// esbarram na trava de instância única (que traria a janela dele para a frente)
if (process.env.LAZULIUM_SILENT === '1' && process.env.LAZULIUM_USER_DATA) {
  app.setPath('userData', process.env.LAZULIUM_USER_DATA);
}

// Log em arquivo (userData/logs) para diagnóstico: depois de definir a pasta de dados
setupFileLogging();

const startupTimers: NodeJS.Timeout[] = [];

// Horas da Steam (localconfig.vdf) e jogos da Riot/Xbox atualizados a cada abertura (leituras rápidas),
// depois que a biblioteca já está na tela. Só os jogos que mudaram são reenviados à janela.
async function runStartupSync(hadGames: boolean, repairedArtwork: string[]): Promise<void> {
  // Biblioteca vazia (primeira execução): a interface já faz o scan completo
  if (!hadGames) return;
  await afterLibraryServed(STARTUP_WORK_MAX_WAIT_MS);
  await new Promise((resolve) => setTimeout(resolve, STARTUP_WORK_SETTLE_MS));
  try {
    const { changed } = await scanLibrariesWithChanges(['steam', 'riot', 'xbox', 'battlenet', 'ea', 'ubisoft']);
    for (const game of changed) sendToRenderer(IPC_CHANNELS.LIBRARY_GAME_UPDATED, game);
    console.log(`[Startup] Sincronização da abertura: ${changed.length} jogo(s) atualizados`);
  } catch (err) {
    console.warn('[Startup] Sincronização da Steam falhou:', (err as Error).message);
  }
  // Jogos novos sem capa (ex: Riot, Xbox) buscam artes no SteamGridDB em segundo plano
  artworkService.enqueueMissing();
  artworkService.enqueueMissing(repairedArtwork);
  profileService.syncInBackground();
  wishlistService.syncInBackground();
}

// Contabiliza sessões em andamento, encerra o worker de processos e grava o que estiver pendente
let shutDown = false;
function shutdown(): void {
  if (shutDown) return;
  shutDown = true;
  for (const timer of startupTimers) clearTimeout(timer);
  screenshotCaptureService.stop();
  playtimeService.shutdown();
  db.flush();
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
    applySecurityPolicies();

    // Content-Security-Policy injetada nos cabeçalhos HTTP (no dev libera HMR/WebSocket e inline do Vite).
    // A moldura só aceita o servidor social em uso (127.0.0.1 só quando os testes apontam o app para um servidor local).
    const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL'];
    const socialOrigin = new URL(socialServerUrl()).origin;
    const base = [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: https: lazulium-media:",
      "media-src 'self' https://*.steamstatic.com lazulium-media:",
      "font-src 'self' data:",
      `frame-src ${socialOrigin}`,
      "worker-src 'none'"
    ];
    const cspDirectives = (
      isDev
        ? [...base, "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "connect-src 'self' ws: http://localhost:* https:"]
        : // A interface não faz pedidos de rede: tudo passa pelo processo principal
          [...base, "script-src 'self'", "style-src 'self' 'unsafe-inline'", "connect-src 'self'"]
    ).join('; ');

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // A vitrine de um amigo (moldura do servidor social) traz a própria política, mais restrita: não sobrescrever
      const socialFrame = details.resourceType === 'subFrame' && details.url.startsWith(`${socialOrigin}/`);
      if ((details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') && !socialFrame) {
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

    await db.init();
    migrateMediaCache();
    const repairedArtwork = artworkService.repairMissingMedia();
    registerMediaProtocol();
    registerScreenshotRoots();
    playtimeService.recoverInterruptedSessions();
    playtimeService.startExternalTracking();

    registerIpcHandlers(getMainWindow);
    setSessionEndHandler(shutdown);
    updaterService.init();
    socialService.init();
    epicAccountService.init();

    const hadGames = db.getGames().length > 0;
    startApp(process.argv.includes(HIDDEN_LAUNCH_ARG));
    void runStartupSync(hadGames, repairedArtwork);

    backupService.migrateConsent();
    startupTimers.push(
      setTimeout(() => void backupService.retryPendingUploads().catch((err) => console.warn('[Startup] Reenvio ao Drive falhou:', (err as Error).message)), PENDING_UPLOAD_RETRY_DELAY_MS),
      setTimeout(() => void backupService.autoBackupSweep().catch((err) => console.warn('[Startup] Varredura de saves falhou:', (err as Error).message)), SAVES_SWEEP_DELAY_MS)
    );

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) showMainWindow();
    });
  });

  app.on('before-quit', () => {
    setQuitting();
    shutdown();
    destroyTray();
  });

  // Última garantia: nada pendente fica só na memória
  app.on('will-quit', () => db.flush());
  process.on('exit', () => db.flush());

  // Com "minimizar para a bandeja" o app segue vivo sem janela (rastreador e backups)
  app.on('window-all-closed', () => {
    if (!shouldCloseToTray() && process.platform !== 'darwin') {
      app.quit();
    }
  });
}

export { generateShortcutAppId, serializeBinaryVdf, parseBinaryVdf, addGameToSteam, removeGameFromSteam } from './services/steam/steam-shortcut-writer.service';
